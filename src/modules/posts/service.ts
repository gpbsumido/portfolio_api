// ---------------------------------------------------------------------------
// Posts module — service layer (owns transaction lifecycle)
// ---------------------------------------------------------------------------

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
import { createModuleLogger } from '../../shared/utils/logger.js';
import { ValidationError } from '../../shared/errors/AppError.js';
import * as repo from './repository.js';
import type { PostRow, MediaRow } from './types.js';

const log = createModuleLogger('posts');

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

/**
 * Create a photo post with media files, wrapped in a database transaction.
 * Handles image/video processing, S3 uploads, and media row insertion.
 */
export async function createPhotoPost(
  userSub: string,
  caption: string | null,
  files: Express.Multer.File[],
): Promise<PostRow & { media: MediaRow[] }> {
  const { pool } = await import('../../config/database.js');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const post = await repo.insertPhotoPost(userSub, caption);
    const postId = post.id;

    const mediaRows: MediaRow[] = [];
    for (let i = 0; i < files.length; i++) {
      const fileBuffer = files[i].buffer;
      const detected = await fileTypeFromBuffer(fileBuffer.slice(0, 4100));

      if (detected && ALLOWED_VIDEO_MIME.has(detected.mime)) {
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
    return { ...post, media: mediaRows };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete a post and clean up its S3 media (best-effort).
 */
export async function deletePostWithMedia(
  postId: string,
  userSub: string,
): Promise<void> {
  const mediaKeys = await repo.getMediaS3Keys(postId);
  const rowCount = await repo.deletePost(postId, userSub);

  if (rowCount === 0) {
    const { NotFoundError } = await import('../../shared/errors/AppError.js');
    throw new NotFoundError('Post not found');
  }

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
}
