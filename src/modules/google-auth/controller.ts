import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('google-auth');
import {
  db,
  registerWatch,
  stopWatch,
  fetchIncrementalEvents,
  ALLOWED_ORIGINS,
  buildState,
  verifyState,
  fromGoogleEvent,
  processExistingItem,
} from './service.js';

// Per-user webhook queue
const userQueues = new Map<string, Promise<void>>();

function enqueueForUser(userId: string, fn: () => Promise<void>): Promise<void> {
  const prev = userQueues.get(userId) ?? Promise.resolve();
  const curr = prev
    .then(() => fn())
    .catch((err: Error) => {
      log.error({ err, userId }, 'webhook handler error');
    });
  userQueues.set(userId, curr);
  curr.finally(() => {
    if (userQueues.get(userId) === curr) userQueues.delete(userId);
  });
  return curr;
}

export class GoogleAuthController {
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = (req as any).auth.payload.sub as string;
    try {
      const auth = await db.getGoogleAuth(userId);
      if (auth) {
        res.json({ connected: true, googleCalId: auth.google_cal_id });
      } else {
        res.json({ connected: false });
      }
    } catch (err: any) {
      next(err);
    }
  }

  async getAuthUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).auth.payload.sub as string;
      const origin = req.query.origin as string | undefined;

      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        throw new ValidationError('Missing or invalid origin');
      }

      const state = buildState(userId, origin);
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        redirect_uri: env.GOOGLE_REDIRECT_URI!,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    } catch (err: any) {
      next(err);
    }
  }

  async handleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { code, state, error } = req.query as Record<string, string>;

    const parsed = verifyState(state);
    const origin = parsed?.origin ?? env.FRONTEND_URL;

    if (error) {
      log.warn({ error }, 'OAuth denied by user');
      res.redirect(`${origin}/settings?gcal=denied`);
      return;
    }

    if (!parsed) {
      log.warn('invalid state param in callback');
      return next(new ValidationError('Invalid state parameter'));
    }

    const { userId } = parsed;

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_REDIRECT_URI!,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        log.error({ body }, 'token exchange failed');
        res.redirect(`${origin}/settings?gcal=error`);
        return;
      }

      const { access_token, refresh_token, expires_in } = await tokenRes.json();
      const tokenExpiry = new Date(Date.now() + expires_in * 1000);

      await db.upsertGoogleAuth(userId, {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiry,
      });

      try {
        await registerWatch(userId);
      } catch (watchErr: any) {
        log.error({ err: watchErr }, 'registerWatch failed after connect');
      }

      res.redirect(`${origin}/settings?gcal=connected`);
    } catch (err: any) {
      log.error({ err }, 'callback error');
      res.redirect(`${origin}/settings?gcal=error`);
    }
  }

  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = (req as any).auth.payload.sub as string;
    try {
      try {
        await stopWatch(userId);
      } catch (watchErr: any) {
        log.warn({ err: watchErr }, 'stopWatch failed on disconnect');
      }
      await db.deleteGoogleAuth(userId);
      res.sendStatus(204);
    } catch (err: any) {
      next(err);
    }
  }

  async handleWebhook(req: Request, res: Response, _next: NextFunction): Promise<void> {
    // respond immediately so Google doesn't time out
    res.sendStatus(200);

    const channelToken = req.headers['x-goog-channel-token'] as string | undefined;
    const resourceState = req.headers['x-goog-resource-state'] as string | undefined;

    if (!channelToken) return;
    if (resourceState === 'sync') return;

    const colonIdx = channelToken.indexOf(':');
    const userId = colonIdx !== -1 ? channelToken.slice(0, colonIdx) : channelToken;
    const googleCalId = colonIdx !== -1 ? channelToken.slice(colonIdx + 1) : null;

    enqueueForUser(userId, async () => {
      if (googleCalId) {
        const calendar = await db.getCalendarByGoogleCalId(googleCalId, userId);
        if (!calendar) {
          log.info({ googleCalId, userId }, 'orphaned channel');
          return;
        }

        const { items, nextSyncToken } = await fetchIncrementalEvents(
          userId,
          calendar.syncToken,
          googleCalId,
        );
        log.info({ count: items.length, userId, googleCalId }, 'webhook items received');

        await db.updateCalendar(calendar.id, { syncToken: nextSyncToken }, userId);

        for (const item of items) {
          const existing = await db.getEventByGoogleId(item.id, userId);

          if (!existing) {
            if (calendar.syncMode !== 'two_way') {
              log.info({ itemId: item.id }, 'skipping item: calendar is not two_way');
              continue;
            }
            if (item.status === 'cancelled') continue;
            const fields = fromGoogleEvent(item);
            log.info({ itemId: item.id, calendarId: calendar.id }, 'importing new event');
            await db.createCalendarEventFromWebhook(fields, item.id, calendar.id, userId);
            continue;
          }

          await processExistingItem(item, userId, existing);
        }
      } else {
        const auth = await db.getGoogleAuth(userId);
        if (!auth) return;

        const { items, nextSyncToken } = await fetchIncrementalEvents(userId, auth.sync_token);
        log.info({ count: items.length, userId }, 'incremental fetch items received');

        await db.updateSyncToken(userId, nextSyncToken);

        for (const item of items) {
          const existing = await db.getEventByGoogleId(item.id, userId);
          if (!existing) {
            log.info({ itemId: item.id, status: item.status }, 'skipping item: not in our DB');
            continue;
          }
          await processExistingItem(item, userId, existing);
        }
      }
    });
  }
}
