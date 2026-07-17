// ---------------------------------------------------------------------------
// Profiles module — Express controller
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('profiles');
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { Upload } from '@aws-sdk/lib-storage';
import { s3, S3_BUCKET, CDN_BASE } from '../../config/s3.js';
import { z } from 'zod';
import * as repo from './repository.js';

// ── Helpers ────────────────────────────────────────────────────────────────

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

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// ── Multer for avatar ──────────────────────────────────────────────────────

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('avatar');

// ── Zod schemas ────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(50, 'display_name must be 50 characters or fewer')
    .optional(),
  bio: z
    .string()
    .trim()
    .max(160, 'bio must be 160 characters or fewer')
    .optional(),
  avatar_url: z
    .union([z.string().url('avatar_url must be a valid URL'), z.literal('')])
    .optional(),
  is_public: z.boolean().optional(),
});

const setupProfileSchema = z.object({
  username: z
    .string({ required_error: 'username is required' })
    .regex(
      /^[a-z0-9_]{3,30}$/,
      'username must be 3-30 characters: lowercase letters, numbers, and underscores only',
    ),
  display_name: z
    .string()
    .trim()
    .max(50, 'display_name must be 50 characters or fewer')
    .optional(),
  bio: z
    .string()
    .trim()
    .max(160, 'bio must be 160 characters or fewer')
    .optional(),
  avatar_url: z
    .union([z.string().url('avatar_url must be a valid URL'), z.literal('')])
    .optional(),
});

// ── Controller ─────────────────────────────────────────────────────────────

export class ProfilesController {
  /** POST /api/profiles/me/avatar */
  async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    // Run multer
    await new Promise<void>((resolve, reject) => {
      avatarUpload(req as any, res as any, (err: any) => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
          return reject(new ValidationError('Avatar must be 10 MB or smaller'));
        }
        if (err) {
          return reject(new ValidationError(err.message));
        }
        resolve();
      });
    });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new ValidationError('No file provided');

    const sub = (req as any).auth.payload.sub as string;

    const detected = await fileTypeFromBuffer(file.buffer).catch(() => null);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new ValidationError('Unsupported image type');
    }

    let avatarBuffer: Buffer;
    try {
      avatarBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: 200, height: 200, fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (err: any) {
      log.error({ err }, 'avatar sharp error');
      throw new ValidationError('Failed to process image');
    }

    const safeKey = sub.replace(/[^a-zA-Z0-9_\-|]/g, '_');
    const key = `avatars/${safeKey}/avatar.webp`;

    let avatarUrl: string;
    try {
      avatarUrl = await s3Upload(avatarBuffer, key, 'image/webp');
    } catch (err: any) {
      log.error({ err }, 'avatar S3 upload failed');
      next(err);
      return;
    }

    try {
      const row = await repo.updateAvatarUrl(sub, avatarUrl);
      if (!row) throw new NotFoundError('Profile not set up yet');
      res.json(row);
    } catch (err: any) {
      next(err);
    }
  }

  /** GET /api/profiles/me */
  async getMe(req: Request, res: Response, next: NextFunction) {
    const sub = (req as any).auth.payload.sub as string;
    try {
      const profile = await repo.getOwnProfile(sub);
      if (!profile)
        throw new NotFoundError('Profile not set up yet');
      res.json(profile);
    } catch (err: any) {
      next(err);
    }
  }

  /** PUT /api/profiles/me */
  async updateMe(req: Request, res: Response, next: NextFunction) {
    const parseResult = updateProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }

    const sub = (req as any).auth.payload.sub as string;
    const { display_name, bio, avatar_url, is_public } = parseResult.data;

    try {
      const wasPublic = await repo.getIsPublic(sub);
      if (wasPublic === null)
        throw new NotFoundError('Profile not set up yet');
      const wasPrivate = !wasPublic;

      const row = await repo.updateProfile(sub, {
        display_name,
        bio,
        avatar_url,
        is_public,
      });
      if (!row) throw new NotFoundError('Profile not set up yet');

      // auto-accept follows if switching to public
      if (wasPrivate && row.is_public) {
        await repo.autoAcceptPendingFollows(sub);
      }

      res.json(row);
    } catch (err: any) {
      next(err);
    }
  }

  /** POST /api/profiles/setup */
  async setup(req: Request, res: Response, next: NextFunction) {
    const parseResult = setupProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }

    const sub = (req as any).auth.payload.sub as string;
    const { username, display_name, bio, avatar_url } = parseResult.data;

    try {
      const row = await repo.createProfile(sub, {
        username,
        display_name: display_name ?? null,
        bio: bio ?? null,
        avatar_url: avatar_url ?? null,
      });
      res.status(201).json(row);
    } catch (err: any) {
      if (err.code === '23505') {
        const detail: string = err.detail ?? '';
        if (detail.includes('user_sub')) {
          throw new ConflictError('Profile already set up');
        }
        throw new ConflictError('Username already taken');
      }
      log.error({ err }, 'POST /setup failed');
      next(err);
    }
  }

  /** GET /api/profiles/discover */
  async discover(req: Request, res: Response, next: NextFunction) {
    const limit = 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    try {
      const rows = await repo.discoverProfiles(limit, offset);
      res.json({
        accounts: rows,
        offset,
        limit,
        hasMore: rows.length === limit,
      });
    } catch (err: any) {
      log.error({ err }, 'GET /discover failed');
      next(err);
    }
  }

  /** GET /api/profiles/:username */
  async getByUsername(req: Request, res: Response, next: NextFunction) {
    const username = param(req.params.username);
    if (!USERNAME_RE.test(username)) {
      throw new ValidationError('Invalid username format');
    }

    const viewerSub =
      (req as any).auth?.payload?.sub ?? null;

    try {
      const profile = await repo.getPublicProfile(username, viewerSub);
      if (!profile)
        throw new NotFoundError('Profile not found');

      const isOwn = viewerSub && viewerSub === profile.user_sub;

      res.json({
        ...profile,
        follow_status:
          isOwn || !viewerSub ? null : (profile.follow_status ?? 'none'),
      });
    } catch (err: any) {
      next(err);
    }
  }
}
