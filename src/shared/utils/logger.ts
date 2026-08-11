import pino from 'pino';
import { env } from '../../config/env.js';

const isProduction = env.NODE_ENV === 'production';

/**
 * Header and field paths that must never reach the log store.
 *
 * pino-http binds the whole request onto the logger, and its default req
 * serializer emits every header. Since 4xx and 5xx log above the production
 * level, an unredacted setup writes live bearer tokens and service tokens into
 * log storage on every failed request. Redaction is the backstop; the req
 * serializer in requestLogger.ts is the primary control.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-flags-token"]',
  'req.headers["x-operator-service-token"]',
  'req.headers["x-user-email"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
];

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  redact: { paths: REDACT_PATHS, remove: true },
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
  base: {
    service: 'portfolio-api',
    env: env.NODE_ENV,
  },
});

/** Create a child logger scoped to a module. */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}
