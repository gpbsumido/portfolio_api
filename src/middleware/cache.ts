import type { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  body: unknown;
  statusCode: number;
  headers: Record<string, string>;
  timestamp: number;
}

const responseCache = new Map<string, CacheEntry>();

/**
 * Returns Express middleware that caches JSON responses for the given duration.
 * Cache key is derived from method + path + query string.
 *
 * @param duration - cache TTL in seconds
 */
export function cacheMiddleware(duration: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = `${req.method}:${req.originalUrl}`;
    const cached = responseCache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < duration * 1000) {
      res.set('X-Cache', 'HIT');
      for (const [h, v] of Object.entries(cached.headers)) {
        res.set(h, v);
      }
      res.status(cached.statusCode).json(cached.body);
      return;
    }

    // Intercept res.json to capture the response for caching
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Evict oldest if cache gets too large
        if (responseCache.size >= 500) {
          const oldestKey = [...responseCache.entries()].sort(
            ([, a], [, b]) => a.timestamp - b.timestamp,
          )[0][0];
          responseCache.delete(oldestKey);
        }

        responseCache.set(key, {
          body,
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json' },
          timestamp: now,
        });
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/** Invalidate all cache entries matching a prefix (e.g. 'GET:/api/nba'). */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) {
      responseCache.delete(key);
    }
  }
}

/** Clear the entire response cache. */
export function clearResponseCache(): void {
  responseCache.clear();
}
