/**
 * Portfolio API — Entry Point
 *
 * Architecture:
 * - Routes:        thin HTTP layer — parse request, call controller, send response
 * - Controllers:   orchestrate service calls, handle HTTP concerns (status codes, headers)
 * - Services:      pure business logic, no HTTP or DB awareness
 * - Repositories:  data access, one per persistence boundary
 */

export {};
