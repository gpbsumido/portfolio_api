// ---------------------------------------------------------------------------
// Posts module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('posts');
import * as repo from './repository.js';
import * as service from './service.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Express 5 params can be string | string[] */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

// ── Multer ─────────────────────────────────────────────────────────────────

const MAX_FILES = 10;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
}).array('files', MAX_FILES);

function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload(req as any, res as any, (err: any) =>
      err ? reject(err) : resolve(),
    );
  });
}

// ── Zod schema for createPost ──────────────────────────────────────────────

import { z } from 'zod';

const createPostSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z
      .string({ required_error: 'content is required' })
      .trim()
      .min(1, 'content must be at least 1 character')
      .max(500, 'content must be 500 characters or fewer'),
    caption: z
      .string()
      .trim()
      .max(2200, 'caption must be 2200 characters or fewer')
      .optional(),
  }),
  z.object({
    type: z.literal('photo'),
    caption: z
      .string()
      .trim()
      .max(2200, 'caption must be 2200 characters or fewer')
      .optional(),
  }),
]);

// ── Controller ─────────────────────────────────────────────────────────────

export class PostsController {
  /** POST /api/posts */
  async createPost(req: Request, res: Response, next: NextFunction) {
    // Run multer first so req.body and req.files are populated
    try {
      await runMulter(req, res);
    } catch (err: any) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        throw new ValidationError('File too large');
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        throw new ValidationError(`Maximum ${MAX_FILES} files allowed`);
      }
      throw new ValidationError(err.message);
    }

    // Zod validation (after multer so req.body is populated)
    const parseResult = createPostSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }
    const validated = parseResult.data;

    const sub = (req as any).auth.payload.sub as string;
    const { type } = validated;

    // ── text post ──────────────────────────────────────────────────────────
    if (type === 'text') {
      const { content } = validated;
      try {
        const row = await repo.insertTextPost(sub, content);
        return res.status(201).json({ ...row, media: [] });
      } catch (err: any) {
        log.error({ err }, 'POST / text failed');
        next(err);
        return;
      }
    }

    // ── photo post ─────────────────────────────────────────────────────────
    if (type === 'photo') {
      const caption = validated.caption?.trim() || null;
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        throw new ValidationError('At least one file is required for a media post');
      }
      if (files.length > 10) {
        throw new ValidationError('Maximum 10 files allowed');
      }

      try {
        const result = await service.createPhotoPost(sub, caption, files);
        return res.status(201).json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          next(err);
        } else {
          log.error({ err }, 'POST / photo failed');
          next(err);
        }
        return;
      }
    }

    throw new ValidationError('type must be "text" or "photo"');
  }

  /** GET /api/posts/user/:username */
  async getPostsByUser(req: Request, res: Response, next: NextFunction) {
    const username = param(req.params.username);
    const cursor = req.query.cursor as string | undefined;
    const LIMIT = 20;
    const viewerSub =
      (req as any).auth?.payload?.sub ?? null;

    let cursorDate: string | null = null;
    if (cursor) {
      const d = new Date(cursor);
      if (isNaN(d.getTime())) {
        throw new ValidationError('Invalid cursor');
      }
      cursorDate = d.toISOString();
    }

    try {
      // Check visibility
      const profile = await repo.getProfileVisibility(username);
      if (!profile) {
        throw new NotFoundError('User not found');
      }

      if (!profile.is_public && viewerSub !== profile.user_sub) {
        if (viewerSub) {
          const accepted = await repo.isAcceptedFollower(
            viewerSub,
            profile.user_sub,
          );
          if (!accepted) {
            return res.json({ posts: [], nextCursor: null });
          }
        } else {
          return res.json({ posts: [], nextCursor: null });
        }
      }

      const rows = await repo.getPostsByUsername(username, cursorDate, LIMIT);

      const hasMore = rows.length > LIMIT;
      const rawPosts = hasMore ? rows.slice(0, LIMIT) : rows;
      const nextCursor = hasMore
        ? rawPosts[rawPosts.length - 1].created_at.toISOString()
        : null;
      const formattedPosts = rawPosts.map(
        ({
          sub,
          username: u,
          display_name,
          avatar_url,
          ...post
        }: any) => ({
          ...post,
          author: { sub, username: u, display_name, avatar_url },
        }),
      );

      res.json({ posts: formattedPosts, nextCursor });
    } catch (err: any) {
      next(err);
    }
  }

  /** GET /api/posts/discover */
  async discover(req: Request, res: Response, next: NextFunction) {
    const LIMIT = 30;
    try {
      const rows = await repo.getDiscoverPosts(LIMIT);
      const formattedPosts = rows.map(
        ({ sub, username, display_name, avatar_url, ...post }: any) => ({
          ...post,
          author: { sub, username, display_name, avatar_url },
        }),
      );
      res.json({ posts: formattedPosts });
    } catch (err: any) {
      log.error({ err }, 'GET /discover failed');
      next(err);
    }
  }

  /** GET /api/posts/:id */
  async getById(req: Request, res: Response, next: NextFunction) {
    const id = param(req.params.id);
    try {
      const postRow = await repo.getPostById(id);
      if (!postRow) {
        throw new NotFoundError('Post not found');
      }

      const mediaRows = await repo.getPostMediaByPostId(id);

      const { sub, username, display_name, avatar_url, ...postData } = postRow;
      res.json({
        ...postData,
        author: { sub, username, display_name, avatar_url },
        media: mediaRows,
      });
    } catch (err: any) {
      next(err);
    }
  }

  /** DELETE /api/posts/:id */
  async deleteById(req: Request, res: Response, next: NextFunction) {
    const sub = (req as any).auth.payload.sub as string;
    const id = param(req.params.id);

    try {
      await service.deletePostWithMedia(id, sub);
      res.status(204).end();
    } catch (err: any) {
      next(err);
    }
  }
}
