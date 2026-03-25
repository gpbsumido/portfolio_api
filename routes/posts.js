const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { fromBuffer: fileTypeFromBuffer } = require("file-type");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { pool } = require("../config/database");
const { checkJwt, optionalCheckJwt } = require("../middleware/auth");
const upsertUser = require("../middleware/upsertUser");
const { makeUserRateLimiter } = require("../utils/rateLimiter");
const { validateBody } = require("../middleware/validateBody");
const { createPost } = require("../schemas");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

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
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);
const MAX_FILES = 10;
// 200 MB limit covers both images (10 MB validated per-file in handler) and videos
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
}).array("files", MAX_FILES);

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
  if (!detected || !ALLOWED_IMAGE_MIME.has(detected.mime)) {
    throw Object.assign(new Error("Unsupported image type"), { status: 400 });
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw Object.assign(new Error("Each image must be 10 MB or smaller"), {
      status: 400,
    });
  }

  // 2. Full-size: max 1080px wide, WebP, strip EXIF via .rotate() then withMetadata(false)
  const fullBuffer = await sharp(buffer)
    .rotate() // auto-orient from EXIF
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
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString("base64")}`;

  return { fullBuffer, thumbBuffer, blurDataUrl, width, height };
}

// ── Video processing ──────────────────────────────────────────────────────────
async function processVideo(buffer) {
  const tmpId = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `${tmpId}_input`);
  const thumbPath = path.join(os.tmpdir(), `${tmpId}_thumb.jpg`);

  await fs.promises.writeFile(inputPath, buffer);

  try {
    // Probe for dimensions and duration
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = metadata.streams.find((s) => s.codec_type === "video");
    const width = videoStream?.width ?? 0;
    const height = videoStream?.height ?? 0;
    const duration = parseFloat(metadata.format?.duration ?? 0);

    // Extract a thumbnail frame at 1s (or halfway through for very short clips)
    const seekTime = Math.min(1, duration / 2);
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(seekTime)
        .frames(1)
        .output(thumbPath)
        .on("end", resolve)
        .on("error", reject)
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

// ── POST /api/posts ───────────────────────────────────────────────────────────
router.post("/", checkJwt, postsLimiter, upsertUser, async (req, res) => {
  // Run multer first so req.body and req.files are populated for both types
  try {
    await runMulter(req, res);
  } catch (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large" });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: `Maximum ${MAX_FILES} files allowed` });
    }
    return res.status(400).json({ error: err.message });
  }

  // ── Zod validation (after multer so req.body is populated) ──────────────────
  const parseResult = createPost.safeParse(req.body);
  if (!parseResult.success) {
    const details = parseResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return res.status(400).json({ error: "Validation failed", details });
  }
  const validated = parseResult.data;

  const sub = req.auth.payload.sub;
  const { type, caption } = validated;

  // ── text post ──────────────────────────────────────────────────────────────
  if (type === "text") {
    const { content } = validated;
    try {
      const { rows } = await pool.query(
        `INSERT INTO posts (user_sub, type, content)
         VALUES ($1, $2, $3)
         RETURNING id, user_sub, type, caption, content, created_at, updated_at`,
        [sub, "text", content],
      );
      return res.status(201).json({ ...rows[0], media: [] });
    } catch (err) {
      console.error("[posts] POST / text error:", err.message);
      return res.status(500).json({ error: "Failed to create post" });
    }
  }

  // ── photo post (photos and/or videos mixed) ───────────────────────────────
  if (type === "photo") {
    const files = req.files || [];
    if (files.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one file is required for a media post" });
    }
    if (files.length > 10) {
      return res.status(400).json({ error: "Maximum 10 files allowed" });
    }

    const db = await pool.connect();
    try {
      await db.query("BEGIN");

      // Insert post row first to get the UUID for S3 keys
      const { rows: postRows } = await db.query(
        `INSERT INTO posts (user_sub, type, caption)
         VALUES ($1, 'photo', $2)
         RETURNING id, user_sub, type, caption, content, created_at, updated_at`,
        [sub, caption?.trim() || null],
      );
      const post = postRows[0];
      const postId = post.id;

      // Process and upload each file — images through processImage, videos through processVideo
      const mediaRows = [];
      for (let i = 0; i < files.length; i++) {
        const fileBuffer = files[i].buffer;
        const detected = await fileTypeFromBuffer(fileBuffer.slice(0, 4100));

        if (detected && ALLOWED_VIDEO_MIME.has(detected.mime)) {
          // ── video file ────────────────────────────────────────────────────
          let vidProcessed;
          try {
            vidProcessed = await processVideo(fileBuffer);
          } catch (vidErr) {
            await db.query("ROLLBACK");
            console.error("[posts] video processing error:", vidErr.message);
            return res.status(400).json({ error: "Failed to process video" });
          }

          const { thumbBuffer, width, height, duration } = vidProcessed;
          const videoKey = `posts/${postId}/${i}_video${path.extname(files[i].originalname) || ".mp4"}`;
          const thumbKey = `posts/${postId}/${i}_thumb.webp`;

          const [videoUrl, thumbUrl] = await Promise.all([
            s3Upload(fileBuffer, videoKey, detected.mime),
            s3Upload(thumbBuffer, thumbKey, "image/webp"),
          ]);

          const { rows: mediaInsert } = await db.query(
            `INSERT INTO post_media
               (post_id, s3_key, url, width, height, position, blur_data_url, media_type, thumbnail_url, duration)
             VALUES ($1, $2, $3, $4, $5, $6, '', 'video', $7, $8)
             RETURNING id, s3_key, url, width, height, position, blur_data_url, media_type, thumbnail_url, duration, created_at`,
            [postId, videoKey, videoUrl, width, height, i, thumbUrl, duration],
          );
          mediaRows.push(mediaInsert[0]);
        } else {
          // ── image file ────────────────────────────────────────────────────
          let processed;
          try {
            processed = await processImage(fileBuffer);
          } catch (imgErr) {
            await db.query("ROLLBACK");
            return res
              .status(imgErr.status || 400)
              .json({ error: imgErr.message });
          }

          const { fullBuffer, thumbBuffer, blurDataUrl, width, height } =
            processed;
          const fullKey = `posts/${postId}/${i}_full.webp`;
          const thumbKey = `posts/${postId}/${i}_thumb.webp`;

          const [fullUrl, thumbUrl] = await Promise.all([
            s3Upload(fullBuffer, fullKey, "image/webp"),
            s3Upload(thumbBuffer, thumbKey, "image/webp"),
          ]);

          const { rows: mediaInsert } = await db.query(
            `INSERT INTO post_media
               (post_id, s3_key, url, width, height, position, blur_data_url, media_type, thumbnail_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'image', $8)
             RETURNING id, s3_key, url, width, height, position, blur_data_url, media_type, thumbnail_url, duration, created_at`,
            [postId, fullKey, fullUrl, width, height, i, blurDataUrl, thumbUrl],
          );
          mediaRows.push(mediaInsert[0]);
        }
      }

      await db.query("COMMIT");
      return res.status(201).json({ ...post, media: mediaRows });
    } catch (err) {
      await db.query("ROLLBACK");
      console.error("[posts] POST / photo error:", err.message);
      return res.status(500).json({ error: "Failed to create post" });
    } finally {
      db.release();
    }
  }

  return res.status(400).json({ error: 'type must be "text" or "photo"' });
});

// ── GET /api/posts/user/:username ─────────────────────────────────────────────
router.get("/user/:username", optionalCheckJwt, async (req, res) => {
  const { username } = req.params;
  const { cursor } = req.query;
  const LIMIT = 20;
  const viewerSub = req.auth?.payload?.sub ?? null;

  let cursorDate = null;
  if (cursor) {
    cursorDate = new Date(cursor);
    if (isNaN(cursorDate.getTime())) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
  }

  try {
    // Check visibility: private accounts only show posts to accepted followers
    const { rows: profileRows } = await pool.query(
      `SELECT user_sub, is_public FROM user_profiles WHERE username = $1`,
      [username],
    );
    if (!profileRows.length) {
      return res.status(404).json({ error: "User not found" });
    }
    const { user_sub: targetSub, is_public } = profileRows[0];

    if (!is_public && viewerSub !== targetSub) {
      if (viewerSub) {
        const { rowCount } = await pool.query(
          `SELECT 1 FROM follows
           WHERE follower_sub = $1 AND following_sub = $2 AND status = 'accepted'`,
          [viewerSub, targetSub],
        );
        if (rowCount === 0) {
          return res.json({ posts: [], nextCursor: null });
        }
      } else {
        // Unauthenticated viewer cannot see private account posts
        return res.json({ posts: [], nextCursor: null });
      }
    }

    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.caption,
         p.content,
         p.created_at,
         p.updated_at,
         p.user_sub AS sub,
         up.username,
         up.display_name,
         up.avatar_url,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id',            pm.id,
               's3_key',        pm.s3_key,
               'url',           pm.url,
               'width',         pm.width,
               'height',        pm.height,
               'position',      pm.position,
               'blur_data_url', pm.blur_data_url,
               'media_type',    pm.media_type,
               'thumbnail_url', pm.thumbnail_url,
               'duration',      pm.duration,
               'created_at',    pm.created_at
             ) ORDER BY pm.position ASC
           ) FILTER (WHERE pm.id IS NOT NULL),
           '[]'
         ) AS media
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       LEFT JOIN post_media pm ON pm.post_id = p.id
       WHERE up.username = $1
         AND ($2::timestamptz IS NULL OR p.created_at < $2)
       GROUP BY p.id, up.username, up.display_name, up.avatar_url
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [username, cursorDate ? cursorDate.toISOString() : null, LIMIT + 1],
    );

    const hasMore = rows.length > LIMIT;
    const rawPosts = hasMore ? rows.slice(0, LIMIT) : rows;
    const nextCursor = hasMore
      ? rawPosts[rawPosts.length - 1].created_at.toISOString()
      : null;
    const posts = rawPosts.map(
      ({ sub, username: u, display_name, avatar_url, ...post }) => ({
        ...post,
        author: { sub, username: u, display_name, avatar_url },
      }),
    );

    res.json({ posts, nextCursor });
  } catch (err) {
    console.error("[posts] GET /user/:username error:", err.message);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// ── GET /api/posts/discover ───────────────────────────────────────────────────
// Returns recent photo posts from public accounts. Guest-accessible.
router.get("/discover", optionalCheckJwt, async (req, res) => {
  const LIMIT = 30;
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.type,
         p.caption,
         p.content,
         p.created_at,
         p.user_sub AS sub,
         up.username,
         up.display_name,
         up.avatar_url,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id',            pm.id,
               'url',           pm.url,
               'width',         pm.width,
               'height',        pm.height,
               'position',      pm.position,
               'blur_data_url', pm.blur_data_url,
               'media_type',    pm.media_type,
               'thumbnail_url', pm.thumbnail_url,
               'duration',      pm.duration
             ) ORDER BY pm.position ASC
           ) FILTER (WHERE pm.id IS NOT NULL),
           '[]'
         ) AS media
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       LEFT JOIN post_media pm ON pm.post_id = p.id
       WHERE up.is_public = true
       GROUP BY p.id, up.username, up.display_name, up.avatar_url
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [LIMIT],
    );

    const posts = rows.map(
      ({ sub, username, display_name, avatar_url, ...post }) => ({
        ...post,
        author: { sub, username, display_name, avatar_url },
      }),
    );

    res.json({ posts });
  } catch (err) {
    console.error("[posts] GET /discover error:", err.message);
    res.status(500).json({ error: "Failed to fetch discover posts" });
  }
});

// ── GET /api/posts/:id ────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
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
         p.user_sub AS sub,
         up.username,
         up.display_name,
         up.avatar_url
       FROM posts p
       JOIN user_profiles up ON up.user_sub = p.user_sub
       WHERE p.id = $1`,
      [id],
    );
    if (!postRows.length)
      return res.status(404).json({ error: "Post not found" });

    const { rows: mediaRows } = await pool.query(
      `SELECT id, s3_key, url, width, height, position, blur_data_url,
              media_type, thumbnail_url, duration, created_at
       FROM post_media
       WHERE post_id = $1
       ORDER BY position ASC`,
      [id],
    );

    const { sub, username, display_name, avatar_url, ...postData } =
      postRows[0];
    res.json({
      ...postData,
      author: { sub, username, display_name, avatar_url },
      media: mediaRows,
    });
  } catch (err) {
    console.error("[posts] GET /:id error:", err.message);
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

// ── DELETE /api/posts/:id ─────────────────────────────────────────────────────
router.delete("/:id", checkJwt, async (req, res) => {
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
      return res.status(404).json({ error: "Post not found" });
    }

    // Best-effort S3 cleanup — don't let a failed delete block the 204.
    // The DB row is the source of truth; S3 orphans are a storage leak, not a data leak.
    if (mediaRows.length > 0) {
      const bucket = process.env.AWS_S3_BUCKET_NAME;
      await Promise.allSettled(
        mediaRows.flatMap(({ s3_key }) => [
          s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3_key })),
          s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: s3_key.replace("_full.webp", "_thumb.webp"),
            }),
          ),
        ]),
      );
    }

    res.status(204).end();
  } catch (err) {
    console.error("[posts] DELETE /:id error:", err.message);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

module.exports = router;
