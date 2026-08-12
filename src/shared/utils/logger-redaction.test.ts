import { describe, test, expect } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACT_PATHS } from './logger.js';
import { redactedReqSerializer } from '../../middleware/requestLogger.js';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SUPERSECRETPAYLOAD.sig';
const COOKIE = 'appSession=deadbeefsecret';
const SERVICE_TOKEN = 'op-service-token-secret';

function captureLog(fn: (log: pino.Logger) => void): string {
  let out = '';
  const sink = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const log = pino({ redact: { paths: REDACT_PATHS, remove: true } }, sink);
  fn(log);
  return out;
}

describe('log redaction', () => {
  test('a request log carries no bearer token, cookie, or service token', () => {
    const out = captureLog((log) => {
      log.warn({
        req: {
          method: 'POST',
          url: '/api/feature-flags/pocket-tcg',
          headers: {
            authorization: `Bearer ${TOKEN}`,
            cookie: COOKIE,
            'x-flags-token': SERVICE_TOKEN,
            'x-operator-service-token': SERVICE_TOKEN,
            'user-agent': 'vitest',
          },
        },
      });
    });

    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(COOKIE);
    expect(out).not.toContain(SERVICE_TOKEN);
    // non-sensitive context must survive, or the logs stop being useful
    expect(out).toContain('vitest');
  });

  test('a set-cookie response header is not logged', () => {
    const out = captureLog((log) => {
      log.error({ res: { headers: { 'set-cookie': COOKIE } } });
    });

    expect(out).not.toContain(COOKIE);
  });

  test('the req serializer emits only method, url and id', () => {
    const serialized = redactedReqSerializer({
      method: 'GET',
      url: '/api/calendar/events?token=leak',
      id: 'req-1',
      headers: { authorization: `Bearer ${TOKEN}` },
      remoteAddress: '1.2.3.4',
    } as never);

    expect(Object.keys(serialized).sort()).toEqual(['id', 'method', 'url']);
    expect(JSON.stringify(serialized)).not.toContain(TOKEN);
  });
});
