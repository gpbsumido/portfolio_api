// ---------------------------------------------------------------------------
// Timeline module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';

const LIMIT = 20;

export class TimelineController {
  /** GET /api/timeline */
  async getTimeline(req: Request, res: Response, _next: NextFunction) {
    const sub = (req as any).auth.payload.sub as string;
    const cursor = req.query.cursor as string | undefined;

    let cursorDate: string;
    if (cursor) {
      const d = new Date(cursor);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid cursor' });
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
      console.error('[timeline] GET / error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch timeline' });
    }
  }
}
