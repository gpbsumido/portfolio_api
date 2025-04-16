const cache = new Map();
const CACHE_TTL = 3600; // 1 hour in seconds

const getCachedData = async (key, fetchFn) => {
    const cached = cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL * 1000) {
        return cached.data;
    }

    const data = await fetchFn();
    cache.set(key, {
        data,
        timestamp: now
    });

    return data;
};

module.exports = { getCachedData }; 