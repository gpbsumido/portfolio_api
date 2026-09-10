import type { Request, Response, NextFunction } from 'express';
import type { ZodError, ZodSchema } from 'zod';

interface FieldError {
  field: string;
  message: string;
}

/**
 * Turns a Zod failure into the API's one error shape. The top-level `error`
 * names the first bad field ("email: must be a valid email") so it reads on its
 * own in a toast, and `details` carries every field for a form to map back.
 */
function validationBody(error: ZodError) {
  const details: FieldError[] = error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
  const first = details[0];
  const summary = first
    ? first.field
      ? `${first.field}: ${first.message}`
      : first.message
    : 'Some of the details you entered are not valid';
  return {
    error: summary,
    message: summary,
    code: 'ValidationError',
    statusCode: 400,
    details,
  };
}

/**
 * Returns Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (and potentially transformed) data.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(validationBody(result.error));
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
      res.status(400).json(validationBody(result.error));
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
      res.status(400).json(validationBody(result.error));
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
