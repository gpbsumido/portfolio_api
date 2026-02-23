const express = require('express');
// const { checkJwt } = require('../middleware/auth');

const router = express.Router();

/*
 * Planned endpoints for /api/calendar:
 *
 * GET    /                    — list events for the authenticated user (supports ?start=&end= date range filter)
 * GET    /:id                 — get a single event by ID
 * POST   /                    — create a new event
 * PUT    /:id                 — update an existing event
 * DELETE /:id                 — delete an event
 *
 * All routes require Auth0 JWT (checkJwt). user_id is sourced from req.auth.payload.sub.
 */

module.exports = router;
