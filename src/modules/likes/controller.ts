// ---------------------------------------------------------------------------
// Likes module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './service.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('likes');

const idSchema = z.string().uuid('post id must be a uuid');

/** Cap batch lookups so a huge id list can't hammer the DB. */
const MAX_BATCH = 100;

function first(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val ?? '');
}

export class LikesController {
  /** POST /api/likes/:postId — like a post */
  async like(req: Request, res: Response, next: NextFunction) {
    try {
      const postId = idSchema.parse(first(req.params.postId));
      const userSub = (req as any).auth.payload.sub as string;
      await service.like(userSub, postId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/likes/:postId — remove your like */
  async unlike(req: Request, res: Response, next: NextFunction) {
    try {
      const postId = idSchema.parse(first(req.params.postId));
      const userSub = (req as any).auth.payload.sub as string;
      await service.unlike(userSub, postId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/likes?ids=a,b,c — counts + liked-by-me for a batch of posts */
  async batch(req: Request, res: Response, next: NextFunction) {
    try {
      const raw = first(req.query.ids as string | string[] | undefined);
      const ids = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_BATCH);

      // Ignore anything that isn't a uuid rather than failing the whole batch.
      const valid = ids.filter((id) => idSchema.safeParse(id).success);
      const userSub = (req as any).auth?.payload?.sub ?? null;

      const likes = await service.summaries(valid, userSub);
      res.json({ likes });
    } catch (err) {
      log.error({ err }, 'failed to load like summaries');
      next(err);
    }
  }
}
