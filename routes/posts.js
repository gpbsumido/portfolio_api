const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { fromBuffer: fileTypeFromBuffer } = require('file-type');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const upsertUser = require('../middleware/upsertUser');
const { makeUserRateLimiter } = require('../utils/rateLimiter');
const { validateBody } = require('../middleware/validateBody');
const { createPost } = require('../schemas');

const postsLimiter = makeUserRateLimiter(20, 60 * 60 * 1000); // 20/hr

const router = express.Router();

// ── S3 ────────────────────────────────────────────────────────────────────────
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
});

async function s3Upload(buffer, key, contentType) {
  const up = new Upload({
    client: s3,
    params: {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
  });
  await up.done();
  return `${process.env.CDN_BASE_URL}/${key}`;
}

// ── Multer ────────────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
}).array('files', MAX_FILES);

// Promisify multer so we can catch MulterError inside the route handler
function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// ── Image processing ──────────────────────────────────────────────────────────
async function processImage(buffer) {
  // 1. Validate MIME from magic bytes (not the header)
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw Object.assign(new Error('Unsupported image type'), { status: 400 });
  }

  // 2. Full-size: max 1080px wide, WebP, strip EXIF via .rotate() then withMetadata(false)
  const fullBuffer = await sharp(buffer)
    .rotate()                                    // auto-orient from EXIF
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

  // 4. Blur placeholder: 20px wide WebP → base64 data URL
  const blurBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 20 })
    .webp({ quality: 20 })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

  return { fullBuffer, thumbBuffer, blurDataUrl, width, height };
}

// ── POST /api/posts ───────────────────────────────────────────────────────────
router.post('/', checkJwt, postsLimiter, upsertUser, async (req, res) => {
  // Run multer first so req.body and req.files are populated for both types
  try {
    await runMulter(req, res);
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Each file must be 10 MB or smaller' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `Maximum ${MAX_FILES} files allowed` });
    }
    return res.status(400).json({ error: err.message });
  }

  // ── Zod validation (after multer so req.body is populated) ──────────────────
  const parseResult = createPost.safeParse(req.body);
  if (!parseResult.success) {
    const details = parseResult.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({ error: 'Validation failed', details });
  }
  const validated = parseResult.data;

  const sub = req.auth.payload.sub;
  const { type, caption } = validated;

  // ── text post ──────────────────────────────────────────────────────────────
  if (type === 'text') {
    const { content } = validated;
    try {
      const { rows } = await pool.query(
        `INSERT INTO posts (user_sub, type, content)
         VALUES ($1, $2, $3)
         RETURNING id, user_sub, type, caption, content, created_at, updated_at`,
        [sub, 'text', content],
      );
      return res.status(201).json({ ...rows[0], media: [] });
    } catch (err) {
      console.error('[posts] POST / text error:', err.message);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }

  // ── photo post ─────────────────────────────────────────────────────────────
  if (type === 'photo') {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required for a photo post' });
    }
    if (files.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 files allowed' });
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');

      // Insert post row first to get the UUID for S3 keys
      const { rows: postRows } = await db.query(
        `INSERT INTO posts (user_sub, type, caption)
         VALUES ($1, 'photo', $2)
         RETURNING id, user_sub, type, caption, content, created_at, updated_at`,
        [sub, caption?.trim() || null],
      );
      const post = postRows[0];
      const postId = post.id;

      // Process and upload each file in order
      const mediaRows = [];
      for (let i = 0; i < files.length; i++) {
        let processed;
        try {
          processed = await processImage(files[i].buffer);
        } catch (imgErr) {
          await db.query('ROLLBACK');
          return res.status(imgErr.status || 400).json({ error: imgErr.message });
        }

        const { fullBuffer, thumbBuffer, blurDataUrl, width, height } = processed;
        const fullKey  = `posts/${postId}/${i}_full.webp`;
        const thumbKey = `posts/${postId}/${i}_thumb.webp`;

        const [fullUrl, thumbUrl] = await Promise.all([
          s3Upload(fullBuffer,  fullKey,  'image/webp'),
          s3Upload(thumbBuffer, thumbKey, 'image/webp'),
        ]);

        const { rows: mediaInsert } = await db.query(
          `INSERT INTO post_media (post_id, s3_key, url, width, height, position, blur_data_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, s3_key, url, width, height, position, blur_data_url, created_at`,
          [postId, fullKey, fullUrl, width, height, i, blurDataUrl],
        );

        // Store thumb info as extra fields (not persisted separately — no thumb table yet)
        mediaRows.push({ ...mediaInsert[0], thumb_url: thumbUrl, thumb_s3_key: thumbKey });
      }

      await db.query('COMMIT');
      return res.status(201).json({ ...post, media: mediaRows });
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('[posts] POST / photo error:', err.message);
      return res.status(500).json({ error: 'Failed to create post' });
    } finally {
      db.release();
    }
  }

  return res.status(400).json({ error: 'type must be "text" or "photo"' });
});

// ── GET /api/posts/user/:username ─────────────────────────────────────────────
router.get('/user/:username', async (req, res) => {
  const { username } = req.params;
  const { cursor } = req.query;
  const LIMIT = 20;

  let cursorDate = null;
  if (cursor) {
    cursorDate = new Date(cursor);
    if (isNaN(cursorDate.getTime())) {
      return res.status(400).json({ error: 'Invalid cursor' });
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.caption,
         p.content,
         p.created_at,
         p.updated_at,
         up.username,
         up.display_name,
         up.avatar_url
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       WHERE up.username = $1
         AND ($2::timestamptz IS NULL OR p.created_at < $2)
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [username, cursorDate ? cursorDate.toISOString() : null, LIMIT + 1],
    );

    const hasMore = rows.length > LIMIT;
    const posts = hasMore ? rows.slice(0, LIMIT) : rows;
    const nextCursor = hasMore ? posts[posts.length - 1].created_at.toISOString() : null;

    res.json({ posts, nextCursor });
  } catch (err) {
    console.error('[posts] GET /user/:username error:', err.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// ── GET /api/posts/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: postRows } = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.caption,
         p.content,
         p.created_at,
         p.updated_at,
         up.username,
         up.display_name,
         up.avatar_url
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       WHERE p.id = $1`,
      [id],
    );
    if (!postRows.length) return res.status(404).json({ error: 'Post not found' });

    const { rows: mediaRows } = await pool.query(
      `SELECT id, s3_key, url, width, height, position, blur_data_url, created_at
       FROM post_media
       WHERE post_id = $1
       ORDER BY position ASC`,
      [id],
    );

    res.json({ ...postRows[0], media: mediaRows });
  } catch (err) {
    console.error('[posts] GET /:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// ── DELETE /api/posts/:id ─────────────────────────────────────────────────────
router.delete('/:id', checkJwt, async (req, res) => {
  const sub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    // Grab S3 keys before the delete so we can clean up the files.
    // Full keys are stored; thumbnail keys share the same path but end in _thumb.webp.
    const { rows: mediaRows } = await pool.query(
      `SELECT s3_key FROM post_media WHERE post_id = $1`,
      [id],
    );

    const { rowCount } = await pool.query(
      `DELETE FROM posts WHERE id = $1 AND user_sub = $2`,
      [id, sub],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Best-effort S3 cleanup — don't let a failed delete block the 204.
    // The DB row is the source of truth; S3 orphans are a storage leak, not a data leak.
    if (mediaRows.length > 0) {
      const bucket = process.env.AWS_S3_BUCKET_NAME;
      await Promise.allSettled(
        mediaRows.flatMap(({ s3_key }) => [
          s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3_key })),
          s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3_key.replace('_full.webp', '_thumb.webp') })),
        ]),
      );
    }

    res.status(204).end();
  } catch (err) {
    console.error('[posts] DELETE /:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;
