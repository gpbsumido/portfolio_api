interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export const CACHE_TTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 3600, // 1 hour
  LONG: 86400, // 1 day
} as const;

const MAX_CACHE_SIZE = 1000;

export async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM,
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
    cache.delete(oldestKey);
  }

  cache.set(key, { data, timestamp: now });
  return data;
}

export function invalidateCache(key: string): void {
  cache.delete(key);
}

export function clearCache(): void {
  cache.clear();
}
