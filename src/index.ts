/**
 * Portfolio API — Entry Point
 *
 * Architecture:
 * - Routes:        thin HTTP layer — parse request, call controller, send response
 * - Controllers:   orchestrate service calls, handle HTTP concerns (status codes, headers)
 * - Services:      pure business logic, no HTTP or DB awareness
 * - Repositories:  data access, one per persistence boundary
 *
 * Lifecycle:
 * - Startup:       validate env → connect pools → bind HTTP
 * - Shutdown:      SIGTERM/SIGINT → stop accepting → drain in-flight → close pools → exit
 */

import { env } from './config/env.js';
import { logger } from './shared/utils/logger.js';
import { setupGracefulShutdown } from './shared/utils/shutdown.js';
import { app } from './app.js';

// ── Start server ──────────────────────────────────────────────────────────

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});

setupGracefulShutdown(server);
