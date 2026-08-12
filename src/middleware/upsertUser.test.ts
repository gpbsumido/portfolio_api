import { describe, test, expect, vi, beforeEach } from 'vitest';

// pool has to stay on the mock: the shared test setup's afterAll calls pool.end().
vi.mock('../config/database.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  pool: { query: vi.fn(), end: vi.fn(), on: vi.fn() },
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
}));

import { upsertUser } from './upsertUser.js';
import { query } from '../config/database.js';

const NS = 'https://paulsumido.com/';
const ATTACKER = 'auth0|attacker';

function runWith(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = { auth: { payload }, headers } as never;
  const next = vi.fn();
  return upsertUser(req, {} as never, next).then(() => next);
}

const emailsWritten = () =>
  vi.mocked(query).mock.calls.map((c) => (c[1] as unknown[])?.[1]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('upsertUser identity', () => {
  test('a client header cannot supply the email', async () => {
    await runWith({ sub: ATTACKER }, { 'x-user-email': 'victim@company.com' });

    expect(emailsWritten()).not.toContain('victim@company.com');
  });

  test('an unverified email is not trusted', async () => {
    await runWith({
      sub: ATTACKER,
      [`${NS}email`]: 'victim@company.com',
      [`${NS}email_verified`]: false,
    });

    expect(emailsWritten()).not.toContain('victim@company.com');
  });

  test('a verified namespaced claim is written', async () => {
    await runWith({
      sub: ATTACKER,
      [`${NS}email`]: 'me@example.com',
      [`${NS}email_verified`]: true,
    });

    expect(emailsWritten()).toContain('me@example.com');
  });

  test('the request continues even when no usable email is present', async () => {
    const next = await runWith({ sub: ATTACKER });

    expect(next).toHaveBeenCalledOnce();
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });
});
