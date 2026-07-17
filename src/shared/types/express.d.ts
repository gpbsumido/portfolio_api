import type { ZodType } from 'zod';

declare global {
  namespace Express {
    interface Request {
      /** Populated by express-oauth2-jwt-bearer's auth() middleware. */
      auth?: {
        payload: {
          sub: string;
          email?: string;
          permissions?: string[];
          [key: string]: unknown;
        };
        header: Record<string, unknown>;
        token: string;
      };
      /** Set by validateBody middleware — the Zod-parsed body. */
      validatedBody?: unknown;
      /** Set by validateQuery middleware — the Zod-parsed query. */
      validatedQuery?: unknown;
    }
  }
}

export {};
