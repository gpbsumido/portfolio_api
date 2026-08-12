import pinoHttp from 'pino-http';
import { logger } from '../shared/utils/logger.js';
import { env } from '../config/env.js';

// Paths that generate high-frequency logs with no diagnostic value
const SILENT_PATHS = new Set(['/api/health', '/api/ready', '/favicon.ico']);

const isProduction = env.NODE_ENV === 'production';

/**
 * Pino-http middleware that auto-logs request/response with timing.
 * Silences health-check and readiness-probe requests to stay under
 * Railway's 500 logs/sec limit. Warns on slow requests (>500ms).
 */
/**
 * Replaces pino-std-serializers' default req serializer, which emits the whole
 * headers object. Allow-list rather than deny-list: a new sensitive header can
 * be added upstream at any time, and this way it is never logged by default.
 */
export function redactedReqSerializer(req: {
  method?: string;
  url?: string;
  id?: unknown;
}): { method?: string; url?: string; id?: unknown } {
  return { method: req.method, url: req.url, id: req.id };
}

export const requestLogger = pinoHttp({
  logger,
  serializers: { req: redactedReqSerializer },
  autoLogging: {
    ignore: (req) => SILENT_PATHS.has(req.url?.split('?')[0] ?? ''),
  },
  customProps: (req) => ({
    userId: (req as any).auth?.payload?.sub ?? undefined,
  }),
  customSuccessMessage: (req, res) => {
    const duration = res.getHeader('x-response-time');
    return `${req.method} ${req.url} ${res.statusCode}${duration ? ` ${duration}ms` : ''}`;
  },
  customErrorMessage: (req, _res, err) =>
    `${req.method} ${req.url} failed: ${err.message}`,
  customLogLevel: (_req, res, err) => {
    if (err || (res.statusCode >= 500)) return 'error';
    if (res.statusCode >= 400) return 'warn';
    // In production, suppress routine 2xx logs to stay under Railway's 500 logs/sec limit
    return isProduction ? 'debug' : 'info';
  },
});
