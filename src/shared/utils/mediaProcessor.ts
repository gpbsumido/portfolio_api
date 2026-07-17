// ---------------------------------------------------------------------------
// Media processing utilities — image & video
// ---------------------------------------------------------------------------

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';

ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);

export { ALLOWED_IMAGE_MIME, ALLOWED_VIDEO_MIME };

export interface ProcessedImage {
  fullBuffer: Buffer;
  thumbBuffer: Buffer;
  blurDataUrl: string;
  width: number | undefined;
  height: number | undefined;
}

export interface ProcessedVideo {
  thumbBuffer: Buffer;
  width: number;
  height: number;
  duration: number;
}

export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  // 1. Validate MIME from magic bytes (not the header)
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_IMAGE_MIME.has(detected.mime)) {
    const err = new Error('Unsupported image type') as Error & { status: number };
    err.status = 400;
    throw err;
  }

  if (buffer.length > 10 * 1024 * 1024) {
    const err = new Error('Each image must be 10 MB or smaller') as Error & { status: number };
    err.status = 400;
    throw err;
  }

  // 2. Full-size: max 1080px wide, WebP, strip EXIF via .rotate() then withMetadata(false)
  const fullBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 1080, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const { width, height } = await sharp(fullBuffer).metadata();

  // 3. Thumbnail: 320px wide WebP
  const thumbBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  // 4. Blur placeholder: 20px wide WebP -> base64 data URL
  const blurBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 20 })
    .webp({ quality: 20 })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

  return { fullBuffer, thumbBuffer, blurDataUrl, width, height };
}

export async function processVideo(buffer: Buffer): Promise<ProcessedVideo> {
  const tmpId = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(os.tmpdir(), `${tmpId}_input`);
  const thumbPath = path.join(os.tmpdir(), `${tmpId}_thumb.jpg`);

  await fs.promises.writeFile(inputPath, buffer);

  try {
    // Probe for dimensions and duration
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: Error | null, data: any) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = metadata.streams.find(
      (s: any) => s.codec_type === 'video',
    );
    const width: number = videoStream?.width ?? 0;
    const height: number = videoStream?.height ?? 0;
    const duration: number = parseFloat(metadata.format?.duration ?? 0);

    // Extract a thumbnail frame at 1s (or halfway through for very short clips)
    const seekTime = Math.min(1, duration / 2);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(seekTime)
        .frames(1)
        .output(thumbPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const thumbJpeg = await fs.promises.readFile(thumbPath);

    // Resize thumbnail to 640px wide WebP
    const thumbBuffer = await sharp(thumbJpeg)
      .resize({ width: 640, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    return { thumbBuffer, width, height, duration };
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(inputPath),
      fs.promises.unlink(thumbPath).catch(() => {}),
    ]);
  }
}
