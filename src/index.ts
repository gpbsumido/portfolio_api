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
 *   See src/shared/utils/shutdown.ts for setupGracefulShutdown()
 */

export {};
