/**
 * The parts of the media contract that carry no weight.
 *
 * `mediaProcessor` pulls in sharp and fluent-ffmpeg at import time, which is
 * about 50ms of native module loading on every boot of a service that scales
 * to zero — paid by every request, including the overwhelming majority that
 * never touch an image. The processing functions are loaded on demand now, and
 * that only works if the things a caller needs *before* deciding to process
 * live somewhere lighter. A MIME allowlist is a Set of strings; it has no
 * business dragging a native image library in behind it.
 */

export const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);

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
