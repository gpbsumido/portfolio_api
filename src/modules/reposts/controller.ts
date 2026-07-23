// ---------------------------------------------------------------------------
// Reposts module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './service.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('reposts');

const idSchema = z.string().uuid('post id must be a uuid');
const MAX_BATCH = 100;

function first(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val ?? '');
}

export class RepostsController {
  /** POST /api/reposts/:postId — repost */
  async repost(req: Request, res: Response, next: NextFunction) {
    try {
      const postId = idSchema.parse(first(req.params.postId));
      const userSub = (req as any).auth.payload.sub as string;
      await service.repost(userSub, postId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/reposts/:postId — undo a repost */
  async unrepost(req: Request, res: Response, next: NextFunction) {
    try {
      const postId = idSchema.parse(first(req.params.postId));
      const userSub = (req as any).auth.payload.sub as string;
      await service.unrepost(userSub, postId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/reposts?ids=a,b,c — counts + reposted-by-me per post */
  async batch(req: Request, res: Response, next: NextFunction) {
    try {
      const ids = first(req.query.ids as string | string[] | undefined)
        .split(',')
        .map((s) => s.trim())
        .filter((id) => idSchema.safeParse(id).success)
        .slice(0, MAX_BATCH);
      const userSub = (req as any).auth?.payload?.sub ?? null;
      const reposts = await service.summaries(ids, userSub);
      res.json({ reposts });
    } catch (err) {
      log.error({ err }, 'failed to load repost summaries');
      next(err);
    }
  }
}
