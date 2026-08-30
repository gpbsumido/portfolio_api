import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import calendarRoutes from './modules/calendar/routes.js';
import checkInRoutes from './modules/check-in/routes.js';
import docsRoutes from './modules/docs/routes.js';
import f1Routes from './modules/f1/routes.js';
import fantasyRoutes from './modules/fantasy/routes.js';
import featureFlagsRoutes from './modules/feature-flags/routes.js';
import feedbackRoutes from './modules/feedback/routes.js';
import followsRoutes from './modules/follows/routes.js';
import forumRoutes from './modules/forum/routes.js';
import galleryRoutes from './modules/gallery/routes.js';
import geoRoutes from './modules/geo/routes.js';
import googleAuthRoutes from './modules/google-auth/routes.js';
import healthRoutes from './modules/health/routes.js';
import likesRoutes from './modules/likes/routes.js';
import medJournalRoutes from './modules/medical-journal/routes.js';
// Module routers
import nbaRoutes from './modules/nba/routes.js';
import notificationsRoutes from './modules/notifications/routes.js';
import operatorRoutes from './modules/operator/routes.js';
import postsRoutes from './modules/posts/routes.js';
import profilesRoutes from './modules/profiles/routes.js';
import referralsRoutes from './modules/referrals/routes.js';
import repliesRoutes from './modules/replies/routes.js';
import repostsRoutes from './modules/reposts/routes.js';
import searchRoutes from './modules/search/routes.js';
import tcgRoutes from './modules/tcg/routes.js';
import timelineRoutes from './modules/timeline/routes.js';
import todosRoutes from './modules/todos/routes.js';
import vitalsRoutes from './modules/vitals/routes.js';
import wallsRoutes from './modules/walls/routes.js';
import youtubeRoutes from './modules/youtube/routes.js';

export const app = express();

/**
 * Railway terminates TLS at its edge, so without this every request looks like
 * it came from the proxy and any IP-keyed rate limiter buckets the whole world
 * together. One hop, because that is what sits in front of us; trusting the
 * whole chain would let a caller spoof X-Forwarded-For and dodge the limiter.
 */
app.set('trust proxy', 1);

// ── Global middleware ─────────────────────────────────────────────────────

app.use(helmet());
// localhost is a dev convenience, not something production should accept.
const ALLOWED_ORIGINS = [
  'https://paulsumido.com',
  'https://develop.paulsumido.com',
  ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
];
// The Draft Lab extension calls /api/fantasy/adjustments from a moz-extension://
// page whose per-install origin the allowlist can't enumerate. This resource is
// non-credentialed (public reads, a custom-header token for writes, no cookie),
// so it gets a permissive CORS policy. It MUST run before the global cors below:
// otherwise the global policy answers the write preflight itself for a
// non-allowlisted origin — a 204 with no Access-Control-Allow-Origin, which the
// browser rejects — before this handler ever sees it.
app.use(
  '/api/fantasy/adjustments',
  cors({
    origin: '*',
    methods: ['GET', 'PATCH', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-draft-adj-token'],
  }),
);
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);

// ── Routes ────────────────────────────────────────────────────────────────

// Health & docs (no auth required)
app.use('/api', healthRoutes);
app.use('/api/docs', docsRoutes);

// Public routes
app.use('/api/nba', nbaRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/f1', f1Routes);
app.use('/api/fantasy', fantasyRoutes);
app.use('/api/vitals', vitalsRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/operator', operatorRoutes);
app.use('/api/tcg', tcgRoutes);
// Reads public; the PATCH write applies checkJwt internally per-route.
app.use('/api/feature-flags', featureFlagsRoutes);
app.use('/api/todos', todosRoutes);

// Signed-in routes (the module applies checkJwt to its whole router)
app.use('/api/check-in', checkInRoutes);

// Auth-aware routes (each module applies checkJwt internally per-route)
app.use('/api/calendar', calendarRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/walls', wallsRoutes);
app.use('/api/med-journal', medJournalRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/likes', likesRoutes);
app.use('/api/replies', repliesRoutes);
app.use('/api/reposts', repostsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/follows', followsRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/google', googleAuthRoutes);
app.use('/api', forumRoutes);

// ── Error handling ────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);
