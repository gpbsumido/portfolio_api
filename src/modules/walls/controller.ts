/**
 * Thin Express adapter over {@link WallsService}: it pulls the user, the wall
 * state, and the uploaded photos off the request and hands them to the service,
 * then serialises the result. All the interesting behaviour is in the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { WallsRepository } from './repository.js';
import { WallsService, type WallUpload } from './service.js';
import { processImage } from '../../shared/utils/mediaProcessor.js';
import { UnauthorizedError, ValidationError } from '../../shared/errors/AppError.js';
import type { WallState } from './types.js';

const service = new WallsService({
  repo: new WallsRepository(),
  processImage,
  now: () => new Date().toISOString(),
  idGen: () => randomUUID(),
});

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

/** The authenticated user's sub, or a 401 if the token somehow lacks one. */
function requireSub(req: Request): string {
  const sub = (req as { auth?: { payload?: { sub?: string } } }).auth?.payload?.sub;
  if (!sub) throw new UnauthorizedError('Missing user.');
  return sub;
}

/** Parse and shape-check the serialized wall state from the request body. */
function parseState(raw: string): WallState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('state must be valid JSON.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as WallState).images)
  ) {
    throw new ValidationError('state must be a wall with an images array.');
  }
  return parsed as WallState;
}

/**
 * Pair multer's uploaded files with the image they belong to.
 *
 * Correlation is by position against the `imageIds` field, not by multipart
 * field name: ids are built from filenames, and one holding a space or
 * non-ASCII character does not come back as the same string, which silently
 * broke the match and left the image pointing at a dead browser blob URL.
 */
function uploads(req: Request): WallUpload[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) return [];

  const raw = (req.body as { imageIds?: string }).imageIds;
  let ids: unknown;
  try {
    ids = raw ? JSON.parse(raw) : [];
  } catch {
    throw new ValidationError('imageIds must be valid JSON.');
  }
  if (!Array.isArray(ids) || ids.length !== files.length) {
    throw new ValidationError('imageIds must list exactly one id per uploaded photo.');
  }

  return files.map((file, index) => ({
    imageId: String(ids[index]),
    buffer: file.buffer,
    mimetype: file.mimetype,
  }));
}

export class WallsController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, state } = req.body as { name: string; state: string };
      const summary = await service.createWall(requireSub(req), {
        name,
        state: parseState(state),
        files: uploads(req),
      });
      res.status(201).json(summary);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json(await service.listWalls(requireSub(req)));
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const wall = await service.getWall(requireSub(req), param(req.params.id));
      res.status(200).json(wall);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, state } = req.body as { name?: string; state?: string };
      const summary = await service.updateWall(requireSub(req), param(req.params.id), {
        name,
        state: state ? parseState(state) : undefined,
        files: uploads(req),
      });
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await service.removeWall(requireSub(req), param(req.params.id));
      res.status(200).json({ message: 'Wall deleted.' });
    } catch (error) {
      next(error);
    }
  }
}
