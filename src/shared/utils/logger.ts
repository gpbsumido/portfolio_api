import pino from 'pino';
import { env } from '../../config/env.js';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
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
