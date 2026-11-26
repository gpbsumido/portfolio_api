import { Router } from 'express';
import { simulateFieldOps } from './sim.js';

const NORMAL_TICK_MS = 1_000;
const LOW_BANDWIDTH_TICK_MS = 5_000;
// Closed on purpose before a proxy or serverless limit; EventSource reconnects on its own.
const STREAM_LIFETIME_MS = 55_000;
const RECONNECT_DELAY_MS = 2_000;

const router = Router();

/** The whole fake picture right now. */
router.get('/snapshot', (_req, res) => {
  res.set('Cache-Control', 'no-store').json(simulateFieldOps(Date.now()));
});

/** Server-sent updates. `?rate=low` slows them to one every 5s. */
router.get('/stream', (req, res) => {
  const tickMs =
    req.query.rate === 'low' ? LOW_BANDWIDTH_TICK_MS : NORMAL_TICK_MS;

  res.set({
    'Content-Type': 'text/event-stream',
    // no-transform keeps the compression middleware from buffering the stream.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const sendUpdate = (prefix = '') => {
    res.write(
      `${prefix}event: update\ndata: ${JSON.stringify(simulateFieldOps(Date.now()))}\n\n`,
    );
  };
  sendUpdate(`retry: ${RECONNECT_DELAY_MS}\n`);

  const tickTimer = setInterval(sendUpdate, tickMs);
  const lifetimeTimer = setTimeout(() => res.end(), STREAM_LIFETIME_MS);
  res.on('close', () => {
    clearInterval(tickTimer);
    clearTimeout(lifetimeTimer);
  });
});

export default router;
