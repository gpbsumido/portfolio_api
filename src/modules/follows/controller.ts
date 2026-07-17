// ---------------------------------------------------------------------------
// Follows module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as repo from './repository.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const usernameParamSchema = z.object({
  username: z
    .string()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      'username must be 3-30 characters: lowercase letters, numbers, and underscores only',
    ),
});

// ── Controller ─────────────────────────────────────────────────────────────

export class FollowsController {
  /** POST /api/follows/:username — send follow request */
  async follow(req: Request, res: Response, _next: NextFunction) {
    const parseResult = usernameParamSchema.safeParse({
      username: param(req.params.username),
    });
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }

    const followerSub = (req as any).auth.payload.sub as string;
    const { username } = parseResult.data;

    try {
      const target = await repo.getTargetByUsername(username);
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      const { user_sub: followingSub, is_public } = target;

      if (followerSub === followingSub) {
        return res.status(400).json({ error: 'Cannot follow yourself' });
      }

      const status = is_public ? 'accepted' : 'pending';
      const row = await repo.insertFollow(followerSub, followingSub, status);
      return res.status(201).json(row);
    } catch (err: any) {
      if (err.code === '23505') {
        return res
          .status(409)
          .json({ error: 'Follow request already exists' });
      }
      console.error('[follows] POST /:username error:', err.message);
      return res
        .status(500)
        .json({ error: 'Failed to send follow request' });
    }
  }

  /** PUT /api/follows/:id/accept */
  async accept(req: Request, res: Response, _next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;
    const id = param(req.params.id);

    try {
      const row = await repo.acceptFollow(id, followingSub);
      if (!row) {
        return res
          .status(404)
          .json({ error: 'Follow request not found' });
      }
      return res.json(row);
    } catch (err: any) {
      console.error('[follows] PUT /:id/accept error:', err.message);
      return res
        .status(500)
        .json({ error: 'Failed to accept follow request' });
    }
  }

  /** PUT /api/follows/:id/reject */
  async reject(req: Request, res: Response, _next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;
    const id = param(req.params.id);

    try {
      const row = await repo.rejectFollow(id, followingSub);
      if (!row) {
        return res
          .status(404)
          .json({ error: 'Follow request not found' });
      }
      return res.json(row);
    } catch (err: any) {
      console.error('[follows] PUT /:id/reject error:', err.message);
      return res
        .status(500)
        .json({ error: 'Failed to reject follow request' });
    }
  }

  /** DELETE /api/follows/:username */
  async unfollow(req: Request, res: Response, _next: NextFunction) {
    const parseResult = usernameParamSchema.safeParse({
      username: param(req.params.username),
    });
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
    }

    const followerSub = (req as any).auth.payload.sub as string;
    const { username } = parseResult.data;

    try {
      const followingSub = await repo.getTargetSubByUsername(username);
      if (!followingSub) {
        return res.status(404).json({ error: 'User not found' });
      }

      const rowCount = await repo.deleteFollow(followerSub, followingSub);
      if (rowCount === 0) {
        return res
          .status(404)
          .json({ error: 'Follow relationship not found' });
      }
      return res.status(204).end();
    } catch (err: any) {
      console.error('[follows] DELETE /:username error:', err.message);
      return res.status(500).json({ error: 'Failed to unfollow user' });
    }
  }

  /** GET /api/follows/requests */
  async getRequests(req: Request, res: Response, _next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;

    try {
      const rows = await repo.getPendingRequests(followingSub);
      return res.json({ requests: rows });
    } catch (err: any) {
      console.error('[follows] GET /requests error:', err.message);
      return res
        .status(500)
        .json({ error: 'Failed to fetch follow requests' });
    }
  }

  /** GET /api/follows/following */
  async getFollowing(req: Request, res: Response, _next: NextFunction) {
    const followerSub = (req as any).auth.payload.sub as string;

    try {
      const rows = await repo.getFollowing(followerSub);
      return res.json({ following: rows });
    } catch (err: any) {
      console.error('[follows] GET /following error:', err.message);
      return res
        .status(500)
        .json({ error: 'Failed to fetch following list' });
    }
  }

  /** GET /api/follows/followers */
  async getFollowers(req: Request, res: Response, _next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;

    try {
      const rows = await repo.getFollowers(followingSub);
      return res.json({ followers: rows });
    } catch (err: any) {
      console.error('[follows] GET /followers error:', err.message);
      return res
        .status(500)
        .json({ error: 'Failed to fetch followers list' });
    }
  }
}
