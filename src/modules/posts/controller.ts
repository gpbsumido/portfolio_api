// ---------------------------------------------------------------------------
// Posts module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, S3_BUCKET, CDN_BASE } from '../../config/s3.js';
import {
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
  async createPost(req: Request, res: Response, _next: NextFunction) {
    // Run multer first so req.body and req.files are populated
    try {
      await runMulter(req, res);
    } catch (err: any) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res
          .status(400)
          .json({ error: `Maximum ${MAX_FILES} files allowed` });
      }
      return res.status(400).json({ error: err.message });
    }

    // Zod validation (after multer so req.body is populated)
    const parseResult = createPostSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details });
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
        console.error('[posts] POST / text error:', err.message);
        return res.status(500).json({ error: 'Failed to create post' });
      }
    }

    // ── photo post ─────────────────────────────────────────────────────────
    if (type === 'photo') {
      const caption = validated.caption?.trim() || null;
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res
          .status(400)
          .json({ error: 'At least one file is required for a media post' });
      }
      if (files.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 files allowed' });
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
            let vidProcessed;
            try {
              vidProcessed = await processVideo(fileBuffer);
            } catch (vidErr: any) {
              await client.query('ROLLBACK');
              console.error(
                '[posts] video processing error:',
                vidErr.message,
              );
              return res
                .status(400)
                .json({ error: 'Failed to process video' });
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
            let processed;
            try {
              processed = await processImage(fileBuffer);
            } catch (imgErr: any) {
              await client.query('ROLLBACK');
              return res
                .status(imgErr.status || 400)
                .json({ error: imgErr.message });
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
        console.error('[posts] POST / photo error:', err.message);
        return res.status(500).json({ error: 'Failed to create post' });
      } finally {
        client.release();
      }
    }

    return res.status(400).json({ error: 'type must be "text" or "photo"' });
  }

  /** GET /api/posts/user/:username */
  async getPostsByUser(req: Request, res: Response, _next: NextFunction) {
    const username = param(req.params.username);
    const cursor = req.query.cursor as string | undefined;
    const LIMIT = 20;
    const viewerSub =
      (req as any).auth?.payload?.sub ?? null;

    let cursorDate: string | null = null;
    if (cursor) {
      const d = new Date(cursor);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      cursorDate = d.toISOString();
    }

    try {
      // Check visibility
      const profile = await repo.getProfileVisibility(username);
      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
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
      console.error('[posts] GET /user/:username error:', err.message);
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  }

  /** GET /api/posts/discover */
  async discover(req: Request, res: Response, _next: NextFunction) {
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
      console.error('[posts] GET /discover error:', err.message);
      res.status(500).json({ error: 'Failed to fetch discover posts' });
    }
  }

  /** GET /api/posts/:id */
  async getById(req: Request, res: Response, _next: NextFunction) {
    const id = param(req.params.id);
    try {
      const postRow = await repo.getPostById(id);
      if (!postRow) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const mediaRows = await repo.getPostMediaByPostId(id);

      const { sub, username, display_name, avatar_url, ...postData } = postRow;
      res.json({
        ...postData,
        author: { sub, username, display_name, avatar_url },
        media: mediaRows,
      });
    } catch (err: any) {
      console.error('[posts] GET /:id error:', err.message);
      res.status(500).json({ error: 'Failed to fetch post' });
    }
  }

  /** DELETE /api/posts/:id */
  async deleteById(req: Request, res: Response, _next: NextFunction) {
    const sub = (req as any).auth.payload.sub as string;
    const id = param(req.params.id);

    try {
      // Grab S3 keys before delete
      const mediaKeys = await repo.getMediaS3Keys(id);

      const rowCount = await repo.deletePost(id, sub);
      if (rowCount === 0) {
        return res.status(404).json({ error: 'Post not found' });
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
      console.error('[posts] DELETE /:id error:', err.message);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  }
}
