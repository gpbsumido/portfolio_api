import { describe, test, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { attachFieldOpsSocket } from './socket.js';

let server: Server | undefined;
afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

function startServer() {
  server = createServer();
  attachFieldOpsSocket(server);
  server.listen(0);
  return (server.address() as AddressInfo).port;
}

function openSocket(query = '', origin = 'http://localhost:3000') {
  const port = startServer();
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/field-ops/socket${query}`,
    { origin },
  );
  const frames: { sequence: number; snapshot: { tracks: unknown[] } }[] = [];
  socket.on('message', (data) => frames.push(JSON.parse(data.toString())));
  return { socket, frames };
}

async function waitForFrames(frames: unknown[], count: number) {
  const deadline = Date.now() + 3_000;
  while (frames.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('field ops socket', () => {
  test('sends the current frame as soon as it connects', async () => {
    const { socket, frames } = openSocket();
    await waitForFrames(frames, 1);
    socket.close();
    expect(frames[0].sequence).toBeGreaterThan(0);
    expect(frames[0].snapshot.tracks.length).toBeGreaterThan(0);
  });

  test('replays every second missed since the last sequence, in order', async () => {
    const sinceSequence = Math.floor(Date.now() / 1000) - 5;
    const { socket, frames } = openSocket(`?since=${sinceSequence}`);
    await waitForFrames(frames, 5);
    socket.close();
    const sequences = frames.slice(0, 5).map((frame) => frame.sequence);
    expect(sequences).toEqual([1, 2, 3, 4, 5].map((n) => sinceSequence + n));
  });

  test('replays at most 60 frames however long the client was away', async () => {
    const { socket, frames } = openSocket('?since=1');
    await waitForFrames(frames, 60);
    socket.close();
    const nowSequence = Math.floor(Date.now() / 1000);
    expect(frames[0].sequence).toBeGreaterThanOrEqual(nowSequence - 60);
    expect(frames.length).toBeLessThanOrEqual(61);
  });

  test('refuses a handshake from an origin that is not allowed', async () => {
    const { socket } = openSocket('', 'https://evil.example.com');
    const statusCode = await new Promise((resolve) => {
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode));
      socket.on('error', () => {});
    });
    expect(statusCode).toBe(403);
  });
});
