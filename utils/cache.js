const cache = new Map();
const CACHE_TTL = {
  SHORT: 300,    // 5 minutes in seconds
  MEDIUM: 3600,  // 1 hour in seconds
  LONG: 86400    // 1 day in seconds
};

const MAX_CACHE_SIZE = 1000; // Maximum number of items in cache

const getCachedData = async (key, fetchFn, ttl = CACHE_TTL.MEDIUM) => {
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.timestamp < ttl * 1000) {
    return cached.data;
  }

  const data = await fetchFn();
  
  // Implement LRU-like cleanup if cache gets too large
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = [...cache.entries()]
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
    cache.delete(oldestKey);
  }

  cache.set(key, {
    data,
    timestamp: now
  });

  return data;
};

const invalidateCache = (key) => {
  cache.delete(key);
};

const clearCache = () => {
  cache.clear();
};

module.exports = { 
  getCachedData, 
  invalidateCache, 
  clearCache,
  CACHE_TTL 
}; 