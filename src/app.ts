import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import calendarRoutes from './modules/calendar/routes.js';
import chatRoutes from './modules/chat/routes.js';
import docsRoutes from './modules/docs/routes.js';
import f1Routes from './modules/f1/routes.js';
import fantasyRoutes from './modules/fantasy/routes.js';
import feedbackRoutes from './modules/feedback/routes.js';
import followsRoutes from './modules/follows/routes.js';
import forumRoutes from './modules/forum/routes.js';
import galleryRoutes from './modules/gallery/routes.js';
import geoRoutes from './modules/geo/routes.js';
import googleAuthRoutes from './modules/google-auth/routes.js';
import healthRoutes from './modules/health/routes.js';
import likesRoutes from './modules/likes/routes.js';
import notificationsRoutes from './modules/notifications/routes.js';
import medJournalRoutes from './modules/medical-journal/routes.js';
// Module routers
import nbaRoutes from './modules/nba/routes.js';
import postsRoutes from './modules/posts/routes.js';
import profilesRoutes from './modules/profiles/routes.js';
import repliesRoutes from './modules/replies/routes.js';
import repostsRoutes from './modules/reposts/routes.js';
import searchRoutes from './modules/search/routes.js';
import referralsRoutes from './modules/referrals/routes.js';
import timelineRoutes from './modules/timeline/routes.js';
import vitalsRoutes from './modules/vitals/routes.js';
import youtubeRoutes from './modules/youtube/routes.js';

export const app = express();

// ── Global middleware ─────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: ['https://paulsumido.com', 'https://develop.paulsumido.com', 'http://localhost:3000'],
  }),
);
app.use(compression());
app.use(express.json());
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

// Auth-aware routes (each module applies checkJwt internally per-route)
app.use('/api/calendar', calendarRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/med-journal', medJournalRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/chatgpt', chatRoutes);
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

app.use(errorHandler);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});
