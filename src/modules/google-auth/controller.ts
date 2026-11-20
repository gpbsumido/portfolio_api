import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { ALLOWED_ORIGINS } from '../../config/allowedOrigins.js';
import { ForbiddenError, ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('google-auth');
import {
  registerWatch,
  stopWatch,
  fetchIncrementalEvents,
  buildState,
  verifyState,
  fromGoogleEvent,
  processExistingItem,
  getGoogleAuth,
  upsertGoogleAuth,
  deleteGoogleAuth,
  findChannelOwner,
  getCalendarByGoogleCalId,
  updateCalendar,
  getEventByGoogleId,
  createCalendarEventFromWebhook,
  updateSyncToken,
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
      const auth = await getGoogleAuth(userId);
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

      if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
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

    if (!parsed || !code) {
      log.warn('invalid state or missing code in callback');
      return next(new ValidationError('Invalid state parameter'));
    }

    // Google sends whoever consented here, and nothing ties them to the account
    // that started the flow. So the code goes back to the frontend, and only the
    // signed-in user the state was minted for can redeem it, at /auth/confirm.
    const confirm = new URLSearchParams({ gcal: 'confirm', code, state });
    res.redirect(`${origin}/settings?${confirm}`);
  }

  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).auth.payload.sub as string;
      const { code, state } = req.body as { code: string; state: string };

      const parsed = verifyState(state);
      if (!parsed) throw new ValidationError('Invalid or expired state');
      if (parsed.userId !== userId) {
        log.warn({ userId }, 'Google connect confirmed by a different account than started it');
        throw new ForbiddenError('This Google connection was started by a different account');
      }

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
        // A used or expired code. Starting the connect again is the fix.
        throw new ValidationError('Google rejected the authorization code. Try connecting again.');
      }

      const { access_token, refresh_token, expires_in } = await tokenRes.json();
      const tokenExpiry = new Date(Date.now() + expires_in * 1000);

      await upsertGoogleAuth(userId, {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiry,
      });

      try {
        await registerWatch(userId);
      } catch (watchErr: any) {
        log.error({ err: watchErr }, 'registerWatch failed after connect');
      }

      res.json({ connected: true });
    } catch (err: any) {
      next(err);
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
      await deleteGoogleAuth(userId);
      res.sendStatus(204);
    } catch (err: any) {
      next(err);
    }
  }

  async handleWebhook(req: Request, res: Response, _next: NextFunction): Promise<void> {
    // respond immediately so Google doesn't time out
    res.sendStatus(200);

    const channelId = req.headers['x-goog-channel-id'] as string | undefined;
    const resourceState = req.headers['x-goog-resource-state'] as string | undefined;

    if (!channelId) return;
    if (resourceState === 'sync') return;

    // Identity comes from the stored channel, never from the request. The
    // channel token used to decide this, but it is built from the Auth0 sub and
    // calendar id — both of which this API publishes elsewhere — so anyone
    // could construct one and drive a sync against another user's tokens.
    const owner = await findChannelOwner(channelId);
    if (!owner) {
      log.info({ channelId }, 'notification for an unknown channel');
      return;
    }
    const { userId } = owner;
    const googleCalId = owner.googleCalId ?? null;

    enqueueForUser(userId, async () => {
      if (googleCalId) {
        const calendar = await getCalendarByGoogleCalId(googleCalId, userId);
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

        for (const item of items) {
          const existing = await getEventByGoogleId(item.id, userId);

          if (!existing) {
            if (calendar.syncMode !== 'two_way') {
              log.info({ itemId: item.id }, 'skipping item: calendar is not two_way');
              continue;
            }
            if (item.status === 'cancelled') continue;
            const fields = fromGoogleEvent(item);
            log.info({ itemId: item.id, calendarId: calendar.id }, 'importing new event');
            await createCalendarEventFromWebhook(fields, item.id, calendar.id, userId);
            continue;
          }

          await processExistingItem(item, userId, existing);
        }

        // Only once every item has landed. Saved first, a failure partway lost
        // the rest of the batch, because the next push starts from this token.
        // Replaying is safe: an imported item is found by its Google id next time.
        await updateCalendar(calendar.id, { syncToken: nextSyncToken }, userId);
      } else {
        const auth = await getGoogleAuth(userId);
        if (!auth) return;

        const { items, nextSyncToken } = await fetchIncrementalEvents(userId, auth.sync_token);
        log.info({ count: items.length, userId }, 'incremental fetch items received');

        for (const item of items) {
          const existing = await getEventByGoogleId(item.id, userId);
          if (!existing) {
            log.info({ itemId: item.id, status: item.status }, 'skipping item: not in our DB');
            continue;
          }
          await processExistingItem(item, userId, existing);
        }

        await updateSyncToken(userId, nextSyncToken);
      }
    });
  }
}
