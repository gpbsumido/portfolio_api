// ---------------------------------------------------------------------------
// Posts module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('posts');
import path from 'path';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, S3_BUCKET, CDN_BASE } from '../../config/s3.js';
import {
  type ProcessedImage,
  type ProcessedVideo,
  processImage,
  processVideo,
  ALLOWED_VIDEO_MIME,
} from '../../shared/utils/mediaProcessor.js';
import * as repo from './repository.js';
import type { MediaRow } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Express 5 params can be string | string[] */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

async function s3Upload(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const up = new Upload({
    client: s3,
    params: {
      Bucket: S3_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
  });
  await up.done();
  return `${CDN_BASE}/${key}`;
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
// We inline-import the JS schema to avoid duplicating the definition.
// eslint-disable-next-line @typescript-eslint/no-var-requires
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

      const client = await (await import('../../config/database.js')).pool.connect();
      try {
        await client.query('BEGIN');

        const post = await repo.insertPhotoPost(sub, caption);
        const postId = post.id;

        const mediaRows: MediaRow[] = [];
        for (let i = 0; i < files.length; i++) {
          const fileBuffer = files[i].buffer;
          const detected = await fileTypeFromBuffer(
            fileBuffer.slice(0, 4100),
          );

          if (detected && ALLOWED_VIDEO_MIME.has(detected.mime)) {
            // ── video file ─────────────────────────────────────────────────
            let vidProcessed: ProcessedVideo;
            try {
              vidProcessed = await processVideo(fileBuffer);
            } catch (vidErr: any) {
              await client.query('ROLLBACK');
              log.error({ err: vidErr }, 'video processing failed');
              throw new ValidationError('Failed to process video');
            }

            const { thumbBuffer, width, height, duration } = vidProcessed;
            const videoKey = `posts/${postId}/${i}_video${path.extname(files[i].originalname) || '.mp4'}`;
            const thumbKey = `posts/${postId}/${i}_thumb.webp`;

            const [videoUrl, thumbUrl] = await Promise.all([
              s3Upload(fileBuffer, videoKey, detected.mime),
              s3Upload(thumbBuffer, thumbKey, 'image/webp'),
            ]);

            const mediaRow = await repo.insertMediaRow(postId, {
              s3Key: videoKey,
              url: videoUrl,
              width,
              height,
              position: i,
              blurDataUrl: '',
              mediaType: 'video',
              thumbnailUrl: thumbUrl,
              duration,
            });
            mediaRows.push(mediaRow);
          } else {
            // ── image file ─────────────────────────────────────────────────
            let processed: ProcessedImage;
            try {
              processed = await processImage(fileBuffer);
            } catch (imgErr: any) {
              await client.query('ROLLBACK');
              throw new ValidationError(imgErr.message);
            }

            const { fullBuffer, thumbBuffer, blurDataUrl, width, height } =
              processed;
            const fullKey = `posts/${postId}/${i}_full.webp`;
            const thumbKey = `posts/${postId}/${i}_thumb.webp`;

            const [fullUrl, thumbUrl] = await Promise.all([
              s3Upload(fullBuffer, fullKey, 'image/webp'),
              s3Upload(thumbBuffer, thumbKey, 'image/webp'),
            ]);

            const mediaRow = await repo.insertMediaRow(postId, {
              s3Key: fullKey,
              url: fullUrl,
              width: width ?? 0,
              height: height ?? 0,
              position: i,
              blurDataUrl,
              mediaType: 'image',
              thumbnailUrl: thumbUrl,
            });
            mediaRows.push(mediaRow);
          }
        }

        await client.query('COMMIT');
        return res.status(201).json({ ...post, media: mediaRows });
      } catch (err: any) {
        await client.query('ROLLBACK');
        if (err instanceof ValidationError) {
          next(err);
        } else {
          log.error({ err }, 'POST / photo failed');
          next(err);
        }
        return;
      } finally {
        client.release();
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
      // Grab S3 keys before delete
      const mediaKeys = await repo.getMediaS3Keys(id);

      const rowCount = await repo.deletePost(id, sub);
      if (rowCount === 0) {
        throw new NotFoundError('Post not found');
      }

      // Best-effort S3 cleanup
      if (mediaKeys.length > 0) {
        await Promise.allSettled(
          mediaKeys.flatMap(({ s3_key }) => [
            s3.send(
              new DeleteObjectCommand({ Bucket: S3_BUCKET!, Key: s3_key }),
            ),
            s3.send(
              new DeleteObjectCommand({
                Bucket: S3_BUCKET!,
                Key: s3_key.replace('_full.webp', '_thumb.webp'),
              }),
            ),
          ]),
        );
      }

      res.status(204).end();
    } catch (err: any) {
      next(err);
    }
  }
}
