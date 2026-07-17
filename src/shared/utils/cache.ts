interface CacheEntry<T> {
  data: T;
  timestamp: number;
  tags: string[];
}

const cache = new Map<string, CacheEntry<unknown>>();
const tagIndex = new Map<string, Set<string>>();

export const CACHE_TTL = {
  SHORT: 300, // 5 minutes — vitals, geo
  MEDIUM: 900, // 15 minutes — youtube RSS
  LONG: 3600, // 1 hour — nba, f1, fantasy
  DAY: 86400, // 1 day
} as const;

const MAX_CACHE_SIZE = 1000;

export async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM,
  tags: string[] = [],
): Promise<T> {
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.timestamp < ttl * 1000) {
    return cached.data as T;
  }

  const data = await fetchFn();

  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = [...cache.entries()].sort(
      ([, a], [, b]) => a.timestamp - b.timestamp,
    )[0][0];
    evictEntry(oldestKey);
  }

  cache.set(key, { data, timestamp: now, tags });

  for (const tag of tags) {
    let keys = tagIndex.get(tag);
    if (!keys) {
      keys = new Set();
      tagIndex.set(tag, keys);
    }
    keys.add(key);
  }

  return data;
}

function evictEntry(key: string): void {
  const entry = cache.get(key);
  if (entry) {
    for (const tag of entry.tags) {
      const keys = tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) tagIndex.delete(tag);
      }
    }
    cache.delete(key);
  }
}

export function invalidateCache(key: string): void {
  evictEntry(key);
}

export function invalidateCacheByTag(tag: string): void {
  const keys = tagIndex.get(tag);
  if (!keys) return;
  for (const key of keys) {
    cache.delete(key);
  }
  tagIndex.delete(tag);
}

export function clearCache(): void {
  cache.clear();
  tagIndex.clear();
}
