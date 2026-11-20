import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

vi.mock('./repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repository.js')>();
  return { ...actual, insertAnalyticsEvents: vi.fn().mockResolvedValue({ accepted: 1, deduped: 0 }) };
});

import { errorHandler } from '../../middleware/errorHandler.js';
import zeroproofRouter from './routes.js';

const batch = {
  events: [
    {
      eventUuid: '11111111-1111-4111-8111-111111111111',
      name: 'page_view',
      page: '/zeroproof',
      seq: 1,
      sessionId: 'sess-1',
      anonId: 'anon-1',
      clientTs: '2026-11-19T00:00:00.000Z',
      props: {},
      appVersion: '9.2.16',
    },
  ],
};

/**
 * /track is anonymous telemetry. The schema caps a batch at 100 events, but
 * nothing capped how many batches one client could send.
 */
describe('POST /api/zeroproof/track rate limit', () => {
  test('the 121st batch in a minute from one IP gets a 429', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/zeroproof', zeroproofRouter);
    app.use(errorHandler);

    // Pinned to 127.0.0.1 for the same reason as the vitals limiter test.
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const statuses: number[] = [];
    try {
      for (let sent = 0; sent < 121; sent++) {
        statuses.push((await request(server).post('/api/zeroproof/track').send(batch)).status);
      }
    } finally {
      server.close();
    }

    expect(statuses.slice(0, 120)).not.toContain(429);
    expect(statuses[120]).toBe(429);
  });
});
