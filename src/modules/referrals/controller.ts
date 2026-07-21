// ---------------------------------------------------------------------------
// Referrals module — Express controller
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Referral } from '../../config/drizzle/schema.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import * as repo from './repository.js';
import type { CreateReferralInput } from './schemas.js';
import type { ReferralDto, ReferralStats } from './types.js';

const log = createModuleLogger('referrals');

/** Base of the shareable link; the site resolves /r/:slug and records a click. */
const SITE_URL = (process.env.SITE_URL ?? 'https://paulsumido.com').replace(/\/$/, '');

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}

function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function buildUrl(slug: string): string {
  return `${SITE_URL}/r/${slug}`;
}

function hashUserAgent(ua: string | undefined): string | null {
  if (!ua) return null;
  // store a hash, not the raw UA, so the click log stays privacy-preserving
  return createHash('sha256').update(ua).digest('hex').slice(0, 64);
}

function toDto(row: Referral, clicks: number): ReferralDto {
  return {
    slug: row.slug,
    targetPath: row.targetPath,
    label: row.label,
    url: buildUrl(row.slug),
    clicks,
    createdAt: row.createdAt.toISOString(),
  };
}

export class ReferralsController {
  /** POST /api/referrals — create a shareable referral link. */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug: custom, targetPath = '/', label } = req.body as CreateReferralInput;

      if (custom) {
        const existing = await repo.findBySlug(custom);
        if (existing) throw new ConflictError('slug already taken');
      }
      const slug = custom ?? (await this.generateUniqueSlug());

      let row: Referral;
      try {
        row = await repo.insertReferral({
          slug,
          targetPath,
          label: label ?? null,
        });
      } catch (err) {
        // lost a race on a taken slug, surface it as a conflict
        if (isUniqueViolation(err)) throw new ConflictError('slug already taken');
        throw err;
      }

      log.info({ slug: row.slug }, 'referral created');
      res.status(201).json(toDto(row, 0));
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/referrals/:slug — resolve a link and its current count. */
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const slug = param(req.params.slug);
      const row = await repo.findBySlug(slug);
      if (!row) throw new NotFoundError('referral not found');
      const clicks = await repo.countClicks(row.id);
      res.json(toDto(row, clicks));
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/referrals/:slug/clicks — record a click, return the new count. */
  async click(req: Request, res: Response, next: NextFunction) {
    try {
      const slug = param(req.params.slug);
      const row = await repo.findBySlug(slug);
      if (!row) throw new NotFoundError('referral not found');
      await repo.recordClick(row.id, hashUserAgent(req.get('user-agent')));
      const clicks = await repo.countClicks(row.id);
      res.json({ slug: row.slug, targetPath: row.targetPath, clicks });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/referrals/:slug/stats — count plus a recent-click sample. */
  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const slug = param(req.params.slug);
      const row = await repo.findBySlug(slug);
      if (!row) throw new NotFoundError('referral not found');
      const [clicks, recent] = await Promise.all([
        repo.countClicks(row.id),
        repo.recentClicks(row.id),
      ]);
      const body: ReferralStats = {
        slug: row.slug,
        targetPath: row.targetPath,
        clicks,
        recent: recent.map((c) => ({ at: c.createdAt.toISOString() })),
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }

  /** Generate a slug that is not already taken, retrying a few times. */
  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = randomUUID().replace(/-/g, '').slice(0, 8);
      const existing = await repo.findBySlug(slug);
      if (!existing) return slug;
    }
    // extremely unlikely; fall back to a longer slug
    return randomUUID().replace(/-/g, '').slice(0, 16);
  }
}
