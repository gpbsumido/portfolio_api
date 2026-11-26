import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ALLOWED_ORIGINS } from '../../config/allowedOrigins.js';
import { simulateFieldOps } from './sim.js';

const SOCKET_PATH = '/api/field-ops/socket';
const NORMAL_TICK_MS = 1_000;
const LOW_BANDWIDTH_TICK_MS = 5_000;
const MAX_REPLAYED_FRAMES = 60;
const GOING_AWAY_CLOSE_CODE = 1001;

/** A frame is the picture at one whole second, and its sequence is that second. */
function sendFrame(socket: WebSocket, sequence: number) {
  socket.send(
    JSON.stringify({ sequence, snapshot: simulateFieldOps(sequence * 1000) }),
  );
}

const currentSequence = () => Math.floor(Date.now() / 1000);

/**
 * Live field ops over a WebSocket. The simulation is a pure function of the
 * clock, so replay needs no buffer: a client that reconnects with `?since=N`
 * is sent the seconds it missed (at most 60) by computing them again, then
 * gets one frame per tick. `?rate=low` slows the ticks to one every 5s.
 * Returns a function that closes every client with "going away" so they
 * reconnect, and replay, against the next instance.
 */
export function attachFieldOpsSocket(server: Server) {
  const socketServer = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    if (url.pathname !== SOCKET_PATH) return;

    if (!ALLOWED_ORIGINS.includes(request.headers.origin ?? '')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (client) => {
      const tickMs =
        url.searchParams.get('rate') === 'low'
          ? LOW_BANDWIDTH_TICK_MS
          : NORMAL_TICK_MS;
      const sinceSequence = Number(url.searchParams.get('since'));

      const newestSequence = currentSequence();
      const firstReplayedSequence = Number.isFinite(sinceSequence) && sinceSequence > 0
        ? Math.max(sinceSequence + 1, newestSequence - MAX_REPLAYED_FRAMES + 1)
        : newestSequence;
      for (let sequence = firstReplayedSequence; sequence <= newestSequence; sequence++) {
        sendFrame(client, sequence);
      }

      let lastSentSequence = newestSequence;
      const tickTimer = setInterval(() => {
        const sequence = currentSequence();
        if (sequence <= lastSentSequence) return;
        lastSentSequence = sequence;
        sendFrame(client, sequence);
      }, tickMs);
      client.on('close', () => clearInterval(tickTimer));
    });
  });

  return function closeAllClients() {
    for (const client of socketServer.clients) client.close(GOING_AWAY_CLOSE_CODE);
  };
}
