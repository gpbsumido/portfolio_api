import type { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  body: unknown;
  statusCode: number;
  headers: Record<string, string>;
  timestamp: number;
  etag: string;
  tags: string[];
}

interface CacheOptions {
  ttl: number;
  tags?: string[];
  varyByUser?: boolean;
}

const responseCache = new Map<string, CacheEntry>();
const tagIndex = new Map<string, Set<string>>();

/** Simple non-crypto string hash (djb2). */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function evictEntry(key: string): void {
  const entry = responseCache.get(key);
  if (entry) {
    for (const tag of entry.tags) {
      const keys = tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) tagIndex.delete(tag);
      }
    }
    responseCache.delete(key);
  }
}

function evictOldest(): void {
  const oldestKey = [...responseCache.entries()].sort(
    ([, a], [, b]) => a.timestamp - b.timestamp,
  )[0][0];
  evictEntry(oldestKey);
}

/**
 * Returns Express middleware that caches JSON responses.
 *
 * Accepts either a plain number (TTL in seconds, backwards-compatible) or
 * a CacheOptions object with ttl, optional tags, and varyByUser flag.
 */
export function cacheMiddleware(options: number | CacheOptions) {
  const opts: CacheOptions =
    typeof options === 'number' ? { ttl: options } : options;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const authReq = req as Request & {
      auth?: { payload?: { sub?: string } };
    };
    const userSuffix =
      opts.varyByUser && authReq.auth
        ? `:${authReq.auth.payload?.sub ?? 'anon'}`
        : '';
    const key = `${req.method}:${req.originalUrl}${userSuffix}`;
    const cached = responseCache.get(key);
    const now = Date.now();

    // Cache-Control header
    const visibility = opts.varyByUser ? 'private' : 'public';
    res.set('Cache-Control', `${visibility}, max-age=${opts.ttl}`);

    if (cached && now - cached.timestamp < opts.ttl * 1000) {
      // ETag: check If-None-Match
      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        res.set('X-Cache', 'HIT');
        res.set('ETag', cached.etag);
        res.status(304).end();
        return;
      }

      res.set('X-Cache', 'HIT');
      res.set('ETag', cached.etag);
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
          evictOldest();
        }

        const etag = `"${hashString(JSON.stringify(body))}"`;
        const tags = opts.tags ?? [];

        responseCache.set(key, {
          body,
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json' },
          timestamp: now,
          etag,
          tags,
        });

        for (const tag of tags) {
          let keys = tagIndex.get(tag);
          if (!keys) {
            keys = new Set();
            tagIndex.set(tag, keys);
          }
          keys.add(key);
        }

        res.set('ETag', etag);
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
      evictEntry(key);
    }
  }
}

/** Invalidate all response cache entries matching a tag. */
export function invalidateResponseCacheByTag(tag: string): void {
  const keys = tagIndex.get(tag);
  if (!keys) return;
  for (const key of keys) {
    responseCache.delete(key);
  }
  tagIndex.delete(tag);
}

/** Clear the entire response cache. */
export function clearResponseCache(): void {
  responseCache.clear();
  tagIndex.clear();
}
