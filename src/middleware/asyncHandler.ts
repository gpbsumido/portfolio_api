import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards a rejected promise to Express's error handler.
 *
 * Express 5 does this itself, but this app runs Express 4, where a handler that
 * throws before its own try block simply never responds. The request then holds
 * a socket open until the client or proxy times out, which is trivially
 * repeatable into connection exhaustion.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
