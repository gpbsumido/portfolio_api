import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
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
      console.error(`[googleWebhook] handler error for ${userId}:`, err.message);
    });
  userQueues.set(userId, curr);
  curr.finally(() => {
    if (userQueues.get(userId) === curr) userQueues.delete(userId);
  });
  return curr;
}

export class GoogleAuthController {
  async getStatus(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const userId = (req as any).auth.payload.sub as string;
    try {
      const auth = await db.getGoogleAuth(userId);
      if (auth) {
        res.json({ connected: true, googleCalId: auth.google_cal_id });
      } else {
        res.json({ connected: false });
      }
    } catch (err: any) {
      console.error('[google] GET /auth/status failed:', err.message);
      res.status(500).json({ error: 'Failed to check connection status' });
    }
  }

  async getAuthUrl(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const userId = (req as any).auth.payload.sub as string;
    const origin = req.query.origin as string | undefined;

    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      res.status(400).json({ error: 'Missing or invalid origin' });
      return;
    }

    try {
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
      console.error('[google] GET /auth/url failed:', err.message);
      res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
  }

  async handleCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { code, state, error } = req.query as Record<string, string>;

    const parsed = verifyState(state);
    const origin = parsed?.origin ?? env.FRONTEND_URL;

    if (error) {
      console.warn('[google] OAuth denied by user:', error);
      res.redirect(`${origin}/settings?gcal=denied`);
      return;
    }

    if (!parsed) {
      console.warn('[google] Invalid state param in callback');
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
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
        console.error('[google] Token exchange failed:', body);
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
        console.error('[google] registerWatch failed after connect:', watchErr.message);
      }

      res.redirect(`${origin}/settings?gcal=connected`);
    } catch (err: any) {
      console.error('[google] Callback error:', err.message);
      res.redirect(`${origin}/settings?gcal=error`);
    }
  }

  async disconnect(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const userId = (req as any).auth.payload.sub as string;
    try {
      try {
        await stopWatch(userId);
      } catch (watchErr: any) {
        console.warn('[google] stopWatch failed on disconnect:', watchErr.message);
      }
      await db.deleteGoogleAuth(userId);
      res.sendStatus(204);
    } catch (err: any) {
      console.error('[google] DELETE /auth/disconnect failed:', err.message);
      res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
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
          console.log(`[googleWebhook] orphaned channel for googleCalId=${googleCalId} userId=${userId}`);
          return;
        }

        const { items, nextSyncToken } = await fetchIncrementalEvents(
          userId,
          calendar.syncToken,
          googleCalId,
        );
        console.log(`[googleWebhook] ${items.length} item(s) for ${userId} calId=${googleCalId}`);

        await db.updateCalendar(calendar.id, { syncToken: nextSyncToken }, userId);

        for (const item of items) {
          const existing = await db.getEventByGoogleId(item.id, userId);

          if (!existing) {
            if (calendar.syncMode !== 'two_way') {
              console.log(`[googleWebhook] skipping ${item.id}: calendar is not two_way`);
              continue;
            }
            if (item.status === 'cancelled') continue;
            const fields = fromGoogleEvent(item);
            console.log(`[googleWebhook] importing new event ${item.id} into calendar ${calendar.id}`);
            await db.createCalendarEventFromWebhook(fields, item.id, calendar.id, userId);
            continue;
          }

          await processExistingItem(item, userId, existing);
        }
      } else {
        const auth = await db.getGoogleAuth(userId);
        if (!auth) return;

        const { items, nextSyncToken } = await fetchIncrementalEvents(userId, auth.sync_token);
        console.log(`[googleWebhook] ${items.length} item(s) from incremental fetch for ${userId}`);

        await db.updateSyncToken(userId, nextSyncToken);

        for (const item of items) {
          const existing = await db.getEventByGoogleId(item.id, userId);
          if (!existing) {
            console.log(`[googleWebhook] skipping item ${item.id} (status=${item.status}): not in our DB`);
            continue;
          }
          await processExistingItem(item, userId, existing);
        }
      }
    });
  }
}
