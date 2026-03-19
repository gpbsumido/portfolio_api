const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { fileTypeFromBuffer } = require('file-type');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { pool } = require('../config/database');
const { checkJwt } = require('../middleware/auth');
const upsertUser = require('../middleware/upsertUser');
const { validateBody } = require('../middleware/validateBody');
const { updateProfile, setupProfile } = require('../schemas');

const router = express.Router();

// ── S3 (shared with posts) ────────────────────────────────────────────────────
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

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('avatar');

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// POST /api/profiles/me/avatar — upload and replace profile avatar
router.post('/me/avatar', checkJwt, upsertUser, (req, res, next) => {
  avatarUpload(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Avatar must be 10 MB or smaller' });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const sub = req.auth.payload.sub;

  const detected = await fileTypeFromBuffer(req.file.buffer).catch(() => null);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  let avatarBuffer;
  try {
    // 200px square, auto-orient, strip EXIF, WebP
    avatarBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 200, height: 200, fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.error('[profiles] avatar sharp error:', err.message);
    return res.status(400).json({ error: 'Failed to process image' });
  }

  // Use the sub as the key so re-uploading replaces the old file
  const safeKey = sub.replace(/[^a-zA-Z0-9_\-|]/g, '_');
  const key = `avatars/${safeKey}/avatar.webp`;

  let avatarUrl;
  try {
    avatarUrl = await s3Upload(avatarBuffer, key, 'image/webp');
  } catch (err) {
    console.error('[profiles] avatar S3 upload error:', err.message);
    return res.status(500).json({ error: 'Failed to upload avatar' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE user_profiles
       SET avatar_url = $2
       WHERE user_sub = $1
       RETURNING user_sub, username, display_name, bio, avatar_url`,
      [sub, avatarUrl],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not set up yet' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] avatar DB update error:', err.message);
    res.status(500).json({ error: 'Failed to save avatar URL' });
  }
});

// GET /api/profiles/me — own profile (must come before /:username)
router.get('/me', checkJwt, upsertUser, async (req, res) => {
  const sub = req.auth.payload.sub;
  try {
    const { rows } = await pool.query(
      `SELECT user_sub, username, display_name, bio, avatar_url, created_at, updated_at
       FROM user_profiles
       WHERE user_sub = $1`,
      [sub],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not set up yet' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] GET /me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profiles/me — update own profile fields
router.put('/me', checkJwt, upsertUser, validateBody(updateProfile), async (req, res) => {
  const sub = req.auth.payload.sub;
  const { display_name, bio, avatar_url } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE user_profiles
       SET display_name = COALESCE($2, display_name),
           bio          = COALESCE($3, bio),
           avatar_url   = COALESCE($4, avatar_url)
       WHERE user_sub = $1
       RETURNING user_sub, username, display_name, bio, avatar_url, created_at, updated_at`,
      [sub, display_name ?? null, bio ?? null, avatar_url ?? null],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not set up yet' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] PUT /me error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/profiles/setup — create initial profile
router.post('/setup', checkJwt, upsertUser, validateBody(setupProfile), async (req, res) => {
  const sub = req.auth.payload.sub;
  const { username, display_name, bio, avatar_url } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_profiles (user_sub, username, display_name, bio, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_sub, username, display_name, bio, avatar_url, created_at, updated_at`,
      [sub, username, display_name ?? null, bio ?? null, avatar_url ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation — could be user_sub (already set up) or username (taken)
      const detail = err.detail ?? '';
      if (detail.includes('user_sub')) {
        return res.status(409).json({ error: 'Profile already set up' });
      }
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('[profiles] POST /setup error:', err.message);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// GET /api/profiles/:username — public profile
router.get('/:username', async (req, res) => {
  const { username } = req.params;
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Invalid username format' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         p.user_sub,
         p.username,
         p.display_name,
         p.bio,
         p.avatar_url,
         p.created_at,
         0::int AS post_count,
         0::int AS follower_count,
         0::int AS following_count
       FROM user_profiles p
       WHERE p.username = $1`,
      [username],
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[profiles] GET /:username error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
