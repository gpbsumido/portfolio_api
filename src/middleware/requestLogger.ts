import pinoHttp from 'pino-http';
import { logger } from '../shared/utils/logger.js';

/**
 * Pino-http middleware that auto-logs request/response with timing.
 * Includes userId when the request is authenticated.
 */
export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  customProps: (req) => ({
    userId: (req as any).auth?.payload?.sub ?? undefined,
  }),
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, _res, err) =>
    `${req.method} ${req.url} failed: ${err.message}`,
});
