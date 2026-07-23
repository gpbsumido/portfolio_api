// ---------------------------------------------------------------------------
// Replies module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './service.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('replies');

const idSchema = z.string().uuid('post id must be a uuid');
const MAX_BATCH = 100;

function first(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val ?? '');
}

export class RepliesController {
  /** POST /api/replies/:postId — add a reply (body validated upstream) */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const postId = idSchema.parse(first(req.params.postId));
      const userSub = (req as any).auth.payload.sub as string;
      const content = (req.body as { content: string }).content;
      const reply = await service.createReply(userSub, postId, content);
      res.status(201).json(reply);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/replies/:postId — the thread for a post */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const postId = idSchema.parse(first(req.params.postId));
      const replies = await service.listReplies(postId);
      res.json({ replies });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/replies?ids=a,b,c — reply counts per post */
  async batch(req: Request, res: Response, next: NextFunction) {
    try {
      const ids = first(req.query.ids as string | string[] | undefined)
        .split(',')
        .map((s) => s.trim())
        .filter((id) => idSchema.safeParse(id).success)
        .slice(0, MAX_BATCH);
      const counts = await service.counts(ids);
      res.json({ counts });
    } catch (err) {
      log.error({ err }, 'failed to load reply counts');
      next(err);
    }
  }
}
