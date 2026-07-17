import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Returns Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (and potentially transformed) data.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Returns Express middleware that validates req.params against a Zod schema.
 * On success, replaces req.params with the parsed data.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details });
      return;
    }
    req.params = result.data as any;
    next();
  };
}

/**
 * Returns Express middleware that validates req.query against a Zod schema.
 * On success, sets req.validatedQuery with the parsed data.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details });
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
