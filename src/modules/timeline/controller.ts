// ---------------------------------------------------------------------------
// Timeline module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('timeline');

const LIMIT = 20;

export class TimelineController {
  /** GET /api/timeline */
  async getTimeline(req: Request, res: Response, next: NextFunction) {
    const sub = (req as any).auth.payload.sub as string;
    const cursor = req.query.cursor as string | undefined;

    let cursorDate: string;
    if (cursor) {
      const d = new Date(cursor);
      if (isNaN(d.getTime())) {
        throw new ValidationError('Invalid cursor');
      }
      cursorDate = d.toISOString();
    } else {
      cursorDate = new Date().toISOString();
    }

    try {
      const rows = await repo.getTimeline(sub, cursorDate, LIMIT);

      const hasMore = rows.length > LIMIT;
      const rawPosts = hasMore ? rows.slice(0, LIMIT) : rows;
      const nextCursor = hasMore
        ? rawPosts[rawPosts.length - 1].created_at.toISOString()
        : null;
      const posts = rawPosts.map(
        ({
          sub: s,
          username,
          display_name,
          avatar_url,
          ...post
        }: any) => ({
          ...post,
          author: { sub: s, username, display_name, avatar_url },
        }),
      );

      return res.json({ posts, nextCursor });
    } catch (err: any) {
      log.error({ err }, 'GET / failed');
      next(err);
    }
  }
}
