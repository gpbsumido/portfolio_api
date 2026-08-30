import type { NextFunction, Request, Response } from 'express';
import { actorEmail } from '../../shared/auth/adminEmail.js';
import {
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/index.js';
import { deriveCode, PERIOD_SECONDS, secondsRemaining, verifyCode, windowAt } from './codes.js';
import * as repo from './repository.js';

/**
 * How many wrong codes one volunteer may try at one site inside one window.
 *
 * Six digits is a million values, so without a ceiling a script could walk a
 * meaningful share of them in two minutes. Five is generous for someone
 * squinting at a display across a room and useless for guessing.
 */
const MAX_FAILED_ATTEMPTS = 5;

/** The Auth0 subject of the caller, or a 401 if the token carried none. */
function requireSub(req: Request): string {
  const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub;
  if (!sub) throw new UnauthorizedError('Not signed in');
  return sub;
}

export class CheckInController {
  /** GET /api/check-in/sites */
  async listSites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sites = await repo.listSites(requireSub(req));
      res.json({
        sites: sites.map((s) => ({ id: s.id, name: s.name, periodSeconds: s.period_seconds })),
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/check-in/sites */
  async createSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.body as { name: string };
      const site = await repo.createSite(requireSub(req), name);
      res
        .status(201)
        .json({ site: { id: site.id, name: site.name, periodSeconds: site.period_seconds } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/check-in/sites/:id/code — the code to put on the display.
   *
   * Owner only, and a site you don't own reads as missing rather than
   * forbidden, so this can't be used to enumerate which ids exist.
   */
  async currentCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const site = await repo.getOwnedSite(id, requireSub(req));
      if (!site) throw new NotFoundError('Site not found');

      const now = Date.now();
      res.json({
        siteName: site.name,
        code: deriveCode(site.code_salt, windowAt(now, site.period_seconds)),
        secondsRemaining: secondsRemaining(now, site.period_seconds),
        periodSeconds: site.period_seconds,
      });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/check-in/sites/:id/arrivals — today's roster, owner only. */
  async listArrivals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const site = await repo.getOwnedSite(id, requireSub(req));
      if (!site) throw new NotFoundError('Site not found');

      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const arrivals = await repo.listArrivals(id, since);

      res.json({
        siteName: site.name,
        arrivals: arrivals.map((a) => ({
          id: a.id,
          email: a.volunteer_email,
          at: a.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/check-in/arrivals — a volunteer submitting the code on the display.
   *
   * Order matters: the attempt ceiling is checked before the code is compared,
   * so a throttled caller learns nothing about whether their guess was right.
   */
  async checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sub = requireSub(req);
      const { siteId, code } = req.body as { siteId: string; code: string };

      const site = await repo.getSite(siteId);
      if (!site) throw new NotFoundError('Site not found');

      const now = Date.now();
      const currentWindow = windowAt(now, site.period_seconds);

      const failed = await repo.failedAttempts({
        siteId,
        volunteerSub: sub,
        windowStart: currentWindow,
      });
      if (failed >= MAX_FAILED_ATTEMPTS) {
        throw new RateLimitError('Too many attempts. Wait for the next code.');
      }

      const matchedWindow = verifyCode({
        salt: site.code_salt,
        code,
        atMs: now,
        periodSeconds: site.period_seconds,
      });

      if (matchedWindow === null) {
        await repo.recordFailedAttempt({
          siteId,
          volunteerSub: sub,
          windowStart: currentWindow,
        });
        throw new ValidationError('That code is wrong or has expired');
      }

      const { arrival, created } = await repo.recordArrival({
        siteId,
        volunteerSub: sub,
        volunteerEmail: actorEmail(req),
        // The window the code belonged to, not the current one, so submitting
        // the same code twice across a rollover is still one arrival.
        windowStart: matchedWindow,
      });

      res.status(created ? 201 : 200).json({
        status: created ? 'recorded' : 'already',
        siteName: site.name,
        arrival: { id: arrival.id, at: arrival.created_at },
      });
    } catch (err) {
      next(err);
    }
  }
}

export { MAX_FAILED_ATTEMPTS, PERIOD_SECONDS };
