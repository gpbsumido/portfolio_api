// ---------------------------------------------------------------------------
// OpenAPI route registrations — register endpoint metadata with the registry
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { registry } from './registry.js';

// ── Security scheme ───────────────────────────────────────────────────────

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Auth0 JWT token',
});

// ── Import module schemas ─────────────────────────────────────────────────

import {
  createEventSchema,
  updateEventSchema,
  createCalendarSchema,
  updateCalendarSchema,
  createCountdownSchema,
  updateCountdownSchema,
  addMemberSchema,
  updateMemberSchema,
  addEventCardSchema,
  updateEventCardSchema,
} from '../../modules/calendar/schemas.js';

import { createPostSchema } from '../../modules/posts/schemas.js';
import { setupProfileSchema, updateProfileSchema } from '../../modules/profiles/schemas.js';
import { followParamSchema } from '../../modules/follows/schemas.js';
import { createFeedbackSchema, updateFeedbackSchema } from '../../modules/feedback/schemas.js';
import { chatSchema, summarizeSchema } from '../../modules/chat/schemas.js';
import { ingestVitalSchema } from '../../modules/vitals/schemas.js';
import { saveEntrySchema } from '../../modules/medical-journal/schemas.js';
import { createForumPostSchema, createMarkerSchema } from '../../modules/forum/schemas.js';
import { savePicksSchema, saveResultsSchema } from '../../modules/nba/schemas.js';
import { createGalleryItemSchema } from '../../modules/gallery/schemas.js';

// ── Helper ────────────────────────────────────────────────────────────────

const errorResponse = z.object({
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

// ── Health ─────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  tags: ['Health'],
  responses: {
    200: { description: 'Service health', content: { 'application/json': { schema: z.object({ status: z.string(), uptime: z.number(), dbConnected: z.boolean(), version: z.string() }) } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/ready',
  summary: 'Readiness probe',
  tags: ['Health'],
  responses: {
    200: { description: 'Ready', content: { 'application/json': { schema: z.object({ status: z.literal('ready') }) } } },
    503: { description: 'Shutting down' },
  },
});

// ── NBA ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/nba/teams',
  summary: 'List NBA teams',
  tags: ['NBA'],
  responses: { 200: { description: 'Team list' } },
});

registry.registerPath({
  method: 'get',
  path: '/nba/teams/{teamId}/players',
  summary: 'Players on a team',
  tags: ['NBA'],
  request: { params: z.object({ teamId: z.string() }) },
  responses: { 200: { description: 'Player list' } },
});

registry.registerPath({
  method: 'put',
  path: '/nba/playoffs/picks/{season}',
  summary: 'Save bracket picks',
  tags: ['NBA'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ season: z.string() }), body: { content: { 'application/json': { schema: savePicksSchema } } } },
  responses: { 200: { description: 'Saved' }, 401: { description: 'Unauthorized' } },
});

registry.registerPath({
  method: 'put',
  path: '/nba/playoffs/results/{season}',
  summary: 'Save official results (admin)',
  tags: ['NBA'],
  request: { params: z.object({ season: z.string() }), body: { content: { 'application/json': { schema: saveResultsSchema } } } },
  responses: { 200: { description: 'Saved' }, 401: { description: 'Unauthorized' } },
});

// ── Calendar ──────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/calendar/events',
  summary: 'List calendar events',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Event list' } },
});

registry.registerPath({
  method: 'post',
  path: '/calendar/events',
  summary: 'Create a calendar event',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createEventSchema } } } },
  responses: { 201: { description: 'Created' }, 400: { description: 'Validation error' } },
});

registry.registerPath({
  method: 'put',
  path: '/calendar/events/{id}',
  summary: 'Update a calendar event',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: updateEventSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'post',
  path: '/calendar/calendars',
  summary: 'Create a calendar',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCalendarSchema } } } },
  responses: { 201: { description: 'Created' } },
});

registry.registerPath({
  method: 'put',
  path: '/calendar/calendars/{id}',
  summary: 'Update a calendar',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: updateCalendarSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'post',
  path: '/calendar/countdowns',
  summary: 'Create a countdown',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCountdownSchema } } } },
  responses: { 201: { description: 'Created' } },
});

registry.registerPath({
  method: 'put',
  path: '/calendar/countdowns/{id}',
  summary: 'Update a countdown',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: updateCountdownSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'post',
  path: '/calendar/calendars/{id}/members',
  summary: 'Add a calendar member',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: addMemberSchema } } } },
  responses: { 201: { description: 'Added' } },
});

registry.registerPath({
  method: 'put',
  path: '/calendar/calendars/{id}/members/{memberSub}',
  summary: 'Update member role',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), memberSub: z.string() }), body: { content: { 'application/json': { schema: updateMemberSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'post',
  path: '/calendar/events/{id}/cards',
  summary: 'Add an event card',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: addEventCardSchema } } } },
  responses: { 201: { description: 'Added' } },
});

registry.registerPath({
  method: 'put',
  path: '/calendar/events/{id}/cards/{entryId}',
  summary: 'Update an event card',
  tags: ['Calendar'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), entryId: z.string().uuid() }), body: { content: { 'application/json': { schema: updateEventCardSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

// ── Posts ──────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/posts',
  summary: 'Create a post (text or photo)',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createPostSchema } } } },
  responses: { 201: { description: 'Created' } },
});

registry.registerPath({
  method: 'get',
  path: '/posts/user/{username}',
  summary: 'Get posts by username',
  tags: ['Posts'],
  request: { params: z.object({ username: z.string() }) },
  responses: { 200: { description: 'Post list' } },
});

registry.registerPath({
  method: 'get',
  path: '/posts/discover',
  summary: 'Public discover feed',
  tags: ['Posts'],
  responses: { 200: { description: 'Post list' } },
});

registry.registerPath({
  method: 'delete',
  path: '/posts/{id}',
  summary: 'Delete a post',
  tags: ['Posts'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ── Profiles ──────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/profiles/setup',
  summary: 'Set up a new profile',
  tags: ['Profiles'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: setupProfileSchema } } } },
  responses: { 201: { description: 'Profile created' }, 409: { description: 'Username taken' } },
});

registry.registerPath({
  method: 'put',
  path: '/profiles/me',
  summary: 'Update own profile',
  tags: ['Profiles'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: updateProfileSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

registry.registerPath({
  method: 'get',
  path: '/profiles/me',
  summary: 'Get own profile',
  tags: ['Profiles'],
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Profile' } },
});

// ── Follows ───────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/follows/{username}',
  summary: 'Follow a user',
  tags: ['Follows'],
  security: [{ bearerAuth: [] }],
  request: { params: followParamSchema },
  responses: { 200: { description: 'Follow request sent' }, 409: { description: 'Already following' } },
});

// ── Timeline ──────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/timeline',
  summary: 'Get timeline feed',
  tags: ['Timeline'],
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Timeline items' } },
});

// ── Feedback ──────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/feedback',
  summary: 'Create feedback entry',
  tags: ['Feedback'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createFeedbackSchema } } } },
  responses: { 201: { description: 'Created' } },
});

registry.registerPath({
  method: 'put',
  path: '/feedback/{id}',
  summary: 'Update feedback entry',
  tags: ['Feedback'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }), body: { content: { 'application/json': { schema: updateFeedbackSchema } } } },
  responses: { 200: { description: 'Updated' } },
});

// ── Chat ──────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/chatgpt',
  summary: 'Send a chat message',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: chatSchema } } } },
  responses: { 200: { description: 'Chat response' } },
});

registry.registerPath({
  method: 'post',
  path: '/chatgpt/summarize',
  summary: 'Summarize text',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: summarizeSchema } } } },
  responses: { 200: { description: 'Summary' } },
});

// ── Vitals ─────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/vitals',
  summary: 'Ingest a web vital metric',
  tags: ['Vitals'],
  request: { body: { content: { 'application/json': { schema: ingestVitalSchema } } } },
  responses: { 204: { description: 'Accepted' } },
});

registry.registerPath({
  method: 'get',
  path: '/vitals/summary',
  summary: 'Get vitals summary',
  tags: ['Vitals'],
  responses: { 200: { description: 'Summary data' } },
});

// ── Medical Journal ───────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/med-journal/save-entry',
  summary: 'Save a journal entry',
  tags: ['Medical Journal'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: saveEntrySchema } } } },
  responses: { 200: { description: 'Saved' } },
});

// ── Gallery ───────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/gallery',
  summary: 'Upload a gallery item',
  tags: ['Gallery'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'multipart/form-data': { schema: z.object({ file: z.any(), text: z.string(), description: z.string(), date: z.string().optional() }) } } } },
  responses: { 201: { description: 'Created' } },
});

registry.registerPath({
  method: 'get',
  path: '/gallery',
  summary: 'List gallery items',
  tags: ['Gallery'],
  responses: { 200: { description: 'Gallery items' } },
});

// ── Forum ─────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/postforum',
  summary: 'Create a forum post',
  tags: ['Forum'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createForumPostSchema } } } },
  responses: { 201: { description: 'Created' } },
});

registry.registerPath({
  method: 'post',
  path: '/markers',
  summary: 'Create a map marker',
  tags: ['Forum'],
  request: { body: { content: { 'application/json': { schema: createMarkerSchema } } } },
  responses: { 201: { description: 'Created' } },
});

// ── YouTube ───────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/youtube',
  summary: 'Get recent YouTube videos',
  tags: ['YouTube'],
  request: { query: z.object({ channel_id: z.string() }) },
  responses: { 200: { description: 'Video list' } },
});

// ── F1 ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/f1/qualifying/{year}/{round}',
  summary: 'Get F1 qualifying data',
  tags: ['F1'],
  request: { params: z.object({ year: z.string(), round: z.string() }) },
  responses: { 200: { description: 'Qualifying data' } },
});

// ── Geo ───────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get',
  path: '/geo',
  summary: 'Get geolocation from IP',
  tags: ['Geo'],
  responses: { 200: { description: 'Location data' } },
});
