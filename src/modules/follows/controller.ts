// ---------------------------------------------------------------------------
// Follows module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as repo from './repository.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('follows');

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
  async follow(req: Request, res: Response, next: NextFunction) {
    const parseResult = usernameParamSchema.safeParse({
      username: param(req.params.username),
    });
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }

    const followerSub = (req as any).auth.payload.sub as string;
    const { username } = parseResult.data;

    try {
      const target = await repo.getTargetByUsername(username);
      if (!target) {
        throw new NotFoundError('User not found');
      }
      const { user_sub: followingSub, is_public } = target;

      if (followerSub === followingSub) {
        throw new ValidationError('Cannot follow yourself');
      }

      const status = is_public ? 'accepted' : 'pending';
      const row = await repo.insertFollow(followerSub, followingSub, status);
      return res.status(201).json(row);
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictError('Follow request already exists');
      }
      next(err);
    }
  }

  /** PUT /api/follows/:id/accept */
  async accept(req: Request, res: Response, next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;
    const id = param(req.params.id);

    try {
      const row = await repo.acceptFollow(id, followingSub);
      if (!row) {
        throw new NotFoundError('Follow request not found');
      }
      return res.json(row);
    } catch (err: any) {
      next(err);
    }
  }

  /** PUT /api/follows/:id/reject */
  async reject(req: Request, res: Response, next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;
    const id = param(req.params.id);

    try {
      const row = await repo.rejectFollow(id, followingSub);
      if (!row) {
        throw new NotFoundError('Follow request not found');
      }
      return res.json(row);
    } catch (err: any) {
      next(err);
    }
  }

  /** DELETE /api/follows/:username */
  async unfollow(req: Request, res: Response, next: NextFunction) {
    const parseResult = usernameParamSchema.safeParse({
      username: param(req.params.username),
    });
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }

    const followerSub = (req as any).auth.payload.sub as string;
    const { username } = parseResult.data;

    try {
      const followingSub = await repo.getTargetSubByUsername(username);
      if (!followingSub) {
        throw new NotFoundError('User not found');
      }

      const rowCount = await repo.deleteFollow(followerSub, followingSub);
      if (rowCount === 0) {
        throw new NotFoundError('Follow relationship not found');
      }
      return res.status(204).end();
    } catch (err: any) {
      next(err);
    }
  }

  /** GET /api/follows/requests */
  async getRequests(req: Request, res: Response, next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;

    try {
      const rows = await repo.getPendingRequests(followingSub);
      return res.json({ requests: rows });
    } catch (err: any) {
      log.error({ err }, 'GET /requests failed');
      next(err);
    }
  }

  /** GET /api/follows/following */
  async getFollowing(req: Request, res: Response, next: NextFunction) {
    const followerSub = (req as any).auth.payload.sub as string;

    try {
      const rows = await repo.getFollowing(followerSub);
      return res.json({ following: rows });
    } catch (err: any) {
      log.error({ err }, 'GET /following failed');
      next(err);
    }
  }

  /** GET /api/follows/followers */
  async getFollowers(req: Request, res: Response, next: NextFunction) {
    const followingSub = (req as any).auth.payload.sub as string;

    try {
      const rows = await repo.getFollowers(followingSub);
      return res.json({ followers: rows });
    } catch (err: any) {
      log.error({ err }, 'GET /followers failed');
      next(err);
    }
  }
}
