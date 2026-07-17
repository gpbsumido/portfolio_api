import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock database
vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  checkDatabaseHealth: vi.fn(),
}));

// Mock Drizzle
vi.mock('../../config/drizzle/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

// Mock auth
vi.mock('../../config/auth.js', () => ({
  checkJwt: (_req: any, _res: any, next: any) => {
    _req.auth = { payload: { sub: 'auth0|test-user', email: 'test@example.com' } };
    next();
  },
  optionalCheckJwt: (_req: any, _res: any, next: any) => next(),
}));

// Mock upsertUser
vi.mock('../../middleware/upsertUser.js', () => ({
  upsertUser: (_req: any, _res: any, next: any) => next(),
}));

// Mock S3
vi.mock('../../config/s3.js', () => ({
  s3: {},
  S3_BUCKET: 'test-bucket',
  CDN_BASE: 'https://cdn.test.com',
}));

// Mock logger
vi.mock('../../shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { pool } from '../../config/database.js';
import { db } from '../../config/drizzle/index.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import profilesRoutes from './routes.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/profiles', profilesRoutes);
  app.use(errorHandler);
  return app;
}

describe('Profiles endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/profiles/me', () => {
    test('returns profile when it exists', async () => {
      const mockProfile = {
        user_sub: 'auth0|test-user',
        username: 'testuser',
        display_name: 'Test User',
        bio: 'A test bio',
        avatar_url: null,
        is_public: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      vi.mocked(db.limit).mockResolvedValueOnce([mockProfile]);

      const app = createApp();
      const res = await request(app).get('/api/profiles/me');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        username: 'testuser',
        display_name: 'Test User',
      });
    });

    test('returns 404 when profile not set up', async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([]);

      const app = createApp();
      const res = await request(app).get('/api/profiles/me');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFoundError');
    });
  });

  describe('POST /api/profiles/setup', () => {
    test('creates profile with valid username', async () => {
      const mockProfile = {
        user_sub: 'auth0|test-user',
        username: 'newuser',
        display_name: null,
        bio: null,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      vi.mocked(db.returning).mockResolvedValueOnce([mockProfile]);

      const app = createApp();
      const res = await request(app)
        .post('/api/profiles/setup')
        .send({ username: 'newuser' });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe('newuser');
    });

    test('rejects invalid username format', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/profiles/setup')
        .send({ username: 'AB' });

      expect(res.status).toBe(400);
    });

    test('rejects username with spaces', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/profiles/setup')
        .send({ username: 'has spaces' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/profiles/discover', () => {
    test('returns paginated public profiles', async () => {
      const mockProfiles = [
        { username: 'user1', display_name: 'User One', avatar_url: null, post_count: 5, follower_count: 10 },
        { username: 'user2', display_name: 'User Two', avatar_url: null, post_count: 3, follower_count: 2 },
      ];
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: mockProfiles,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app).get('/api/profiles/discover');

      expect(res.status).toBe(200);
      expect(res.body.accounts).toHaveLength(2);
      expect(res.body).toHaveProperty('offset', 0);
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('hasMore', false);
    });
  });

  describe('GET /api/profiles/:username', () => {
    test('returns public profile', async () => {
      const mockProfile = {
        user_sub: 'auth0|other',
        username: 'someone',
        display_name: 'Someone',
        bio: 'hi',
        avatar_url: null,
        is_public: true,
        created_at: new Date().toISOString(),
        post_count: 3,
        follower_count: 1,
        following_count: 5,
        follow_status: null,
      };
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [mockProfile],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app).get('/api/profiles/someone');

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('someone');
      expect(res.body).toHaveProperty('follow_status');
    });

    test('returns 404 for nonexistent profile', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const app = createApp();
      const res = await request(app).get('/api/profiles/nobody');

      expect(res.status).toBe(404);
    });

    // Note: invalid username validation throws outside try/catch in the controller.
    // Express 4 doesn't catch unhandled async throws — this is a known gap
    // that will be resolved when migrating to Express 5.
  });
});
