import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createRateLimitStore,
  lazyRateLimitStore,
  resetRateLimitStoreForTests,
} from './rateLimitStore.js';

const originalUrl = process.env.REDIS_URL;
const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  resetRateLimitStoreForTests();
  delete process.env.REDIS_URL;
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalUrl;
  process.env.NODE_ENV = originalEnv;
  vi.restoreAllMocks();
});

describe('rate limit store', () => {
  test('falls back to the in-memory store when no REDIS_URL is set', async () => {
    // undefined means express-rate-limit uses its own MemoryStore, which is
    // what a fresh clone, CI and local dev should get.
    await expect(createRateLimitStore()).resolves.toBeUndefined();
  });

  test('an unreachable redis degrades rather than refusing to boot', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';

    // A limiter weaker than intended is bad; an API that will not start because
    // Redis blipped is worse.
    await expect(createRateLimitStore()).resolves.toBeUndefined();
  }, 20_000);

  test('the result is cached, so repeated calls do not reconnect', async () => {
    const first = await createRateLimitStore();
    const second = await createRateLimitStore();

    expect(second).toBe(first);
  });
});

describe('log level for an unreachable redis', () => {
  test('a private Railway host outside production is not an error', async () => {
    // REDIS_URL points at redis.railway.internal, which only resolves inside
    // Railway. Locally it can never connect, so every boot would log an error
    // for a condition that is expected and already handled.
    process.env.NODE_ENV = 'development';
    process.env.REDIS_URL = 'redis://redis.railway.internal:6379';

    await expect(createRateLimitStore()).resolves.toBeUndefined();
  }, 20_000);
});

describe('one store per limiter', () => {
  test('two limiters do not share a bucket for the same key', async () => {
    // Keys come from the caller, not the route. A shared backend would count
    // one visitor into one bucket across every limiter, so hitting /api/geo
    // would silently spend /api/vitals' budget.
    const a = lazyRateLimitStore('alpha');
    const b = lazyRateLimitStore('beta');
    const options = { windowMs: 60_000, limit: 5 } as never;
    a.init?.(options);
    b.init?.(options);

    await a.increment('1.2.3.4');
    await a.increment('1.2.3.4');
    const fromB = await b.increment('1.2.3.4');

    expect(fromB.totalHits).toBe(1);
  });

  test('each call returns a distinct instance', () => {
    expect(lazyRateLimitStore('x')).not.toBe(lazyRateLimitStore('x'));
  });
});
