import { describe, test, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fieldOpsRoutes from './routes.js';

function createApp() {
  const app = express();
  app.use('/api/field-ops', fieldOpsRoutes);
  return app;
}

let server: Server | undefined;
afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

async function openStream(query = '') {
  server = createApp().listen(0);
  const { port } = server.address() as AddressInfo;
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${port}/api/field-ops/stream${query}`,
    { signal: controller.signal },
  );
  return { response, stop: () => controller.abort() };
}

describe('GET /api/field-ops/snapshot', () => {
  test('returns the current tracks and alerts, never cached', async () => {
    const res = await request(createApp()).get('/api/field-ops/snapshot');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.tracks.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(typeof res.body.serverTimeMs).toBe('number');
  });
});

describe('GET /api/field-ops/stream', () => {
  test('answers as an event stream that is never cached', async () => {
    const { response, stop } = await openStream();
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-cache');
    stop();
  });

  test('sends a reconnect hint and an update straight away, so the console never starts blank', async () => {
    const { response, stop } = await openStream();
    if (!response.body) throw new Error('stream has no body');
    const { value } = await response.body.getReader().read();
    const firstChunk = new TextDecoder().decode(value);
    expect(firstChunk).toContain('retry:');
    expect(firstChunk).toContain('event: update');
    expect(firstChunk).toContain('"tracks"');
    stop();
  });
});
