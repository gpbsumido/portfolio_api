import { MemoryStore, type Store } from 'express-rate-limit';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('rate-limit-store');

/**
 * Where rate-limit counters live.
 *
 * The default MemoryStore is per-process, and this app runs on Fly with
 * `auto_stop_machines = "stop"` and `min_machines_running = 0`. So every cold
 * start resets every counter, and pacing requests around scale-to-zero gets you
 * an effectively unlimited quota; scaling to N instances multiplies each limit
 * by N at the same time. The counters are real locally and mostly decorative in
 * production, which is the worst of both -- it looks protected.
 *
 * A shared Redis store fixes both. It is optional: with no REDIS_URL the
 * limiters fall back to MemoryStore, so a fresh clone, CI and local dev keep
 * working unchanged. In production the absence is logged, because "the limiter
 * is weaker than it looks" should not be silent.
 */
/** Boot must never block on Redis being reachable. */
const CONNECT_TIMEOUT_MS = 3_000;

let cachedStore: Store | undefined;
let initialised = false;

export async function createRateLimitStore(): Promise<Store | undefined> {
  if (initialised) return cachedStore;
  initialised = true;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      log.warn(
        'REDIS_URL is not set; rate limits are per-instance and reset on every cold start',
      );
    }
    return undefined;
  }

  try {
    const [{ createClient }, { default: RedisStore }] = await Promise.all([
      import('redis'),
      import('rate-limit-redis'),
    ]);

    const client = createClient({
      url,
      socket: {
        connectTimeout: CONNECT_TIMEOUT_MS,
        // Without a bound the client retries forever, and the await below never
        // settles -- so an unreachable Redis hangs startup instead of degrading
        // to in-memory limits. Give up and let the catch handle it.
        reconnectStrategy: (retries: number) =>
          retries > 2 ? false : Math.min((retries + 1) * 200, 1000),
      },
    });
    client.on('error', (err: unknown) => {
      // Do not throw: a Redis blip must not take request handling down. The
      // store degrades, the app keeps serving.
      log.error({ err }, 'redis client error');
    });

    // Belt and braces: connectTimeout covers the socket, this covers the whole
    // handshake, so boot can never block on Redis.
    await Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('redis connect timed out')),
          CONNECT_TIMEOUT_MS,
        ).unref(),
      ),
    ]);

    cachedStore = new RedisStore({
      prefix: 'rl:',
      sendCommand: (...args: string[]) => client.sendCommand(args),
    }) as unknown as Store;

    log.info('rate limiting backed by redis');
    return cachedStore;
  } catch (err) {
    // Falling back is deliberate. A limiter that is weaker than intended is bad;
    // an API that refuses to boot because Redis is briefly unreachable is worse.
    log.error({ err }, 'redis store unavailable, falling back to in-memory limits');
    return undefined;
  }
}

/** Test seam: forget any cached store so a suite can exercise both paths. */
export function resetRateLimitStoreForTests(): void {
  cachedStore = undefined;
  initialised = false;
}

/**
 * A Store that can be constructed synchronously but resolves its backend
 * asynchronously.
 *
 * The limiters are module-level constants, built at import time, while
 * connecting to Redis is async. Rather than restructure boot around that, this
 * proxy delegates each call to whichever store settled — Redis if it connected,
 * an in-process MemoryStore otherwise. Requests arriving during the first few
 * milliseconds are counted by the fallback and then counting moves; for a
 * per-minute window that is immaterial.
 */
export function lazyRateLimitStore(): Store {
  const fallback = new MemoryStore();
  let resolved: Store | undefined;

  const backend = createRateLimitStore()
    .then((store) => {
      resolved = store ?? fallback;
      return resolved;
    })
    .catch(() => {
      resolved = fallback;
      return fallback;
    });

  const current = () => resolved ?? backend;

  return {
    init(options) {
      fallback.init?.(options);
      void backend.then((store) => store.init?.(options));
    },
    async increment(key) {
      const store = await current();
      return store.increment(key);
    },
    async decrement(key) {
      const store = await current();
      return store.decrement(key);
    },
    async resetKey(key) {
      const store = await current();
      return store.resetKey(key);
    },
    async resetAll() {
      const store = await current();
      return store.resetAll?.();
    },
  } as Store;
}
