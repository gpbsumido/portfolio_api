/**
 * Multipart limits for the upload routes.
 *
 * These have to live at the multer layer. The size check inside mediaProcessor
 * runs after multer has already buffered the whole request into memory, so by
 * the time it rejects anything the allocation has happened. The container is
 * 512mb (see fly.toml), so worst-case concurrent buffering is what matters
 * here, not the size of any single sensible upload.
 *
 * `files`, `fields` and `parts` matter as much as `fileSize`: without them a
 * caller sends many small parts instead of one big one and reaches the same
 * total.
 */
export const IMAGE_UPLOAD_LIMITS = {
  fileSize: 10 * 1024 * 1024,
  files: 20,
  fields: 20,
  parts: 40,
} as const;

export const VIDEO_UPLOAD_LIMITS = {
  fileSize: 25 * 1024 * 1024,
  files: 4,
  fields: 20,
  parts: 24,
} as const;
