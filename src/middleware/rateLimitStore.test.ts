import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createRateLimitStore,
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
