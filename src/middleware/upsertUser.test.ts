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

const sqlRun = () => vi.mocked(query).mock.calls.map((c) => String(c[0]));
const handsOverRow = (sql: string) => /UPDATE\s+users\s+SET\s+sub\b/i.test(sql);
const upsertsRow = (sql: string) => /INSERT\s+INTO\s+users\b/i.test(sql);

describe('upsertUser email ownership', () => {
  // Auth0 links logins that share a verified email into one user, so after a
  // link the same email turns up under the primary's sub. Email is unique in
  // users, and invites resolve through it, so the row has to follow.
  test('a verified login takes the email row from whichever sub held it', async () => {
    await runWith({
      sub: 'google-oauth2|100',
      [`${NS}email`]: 'linked@example.com',
      [`${NS}email_verified`]: true,
    });

    const sql = sqlRun();
    const handOver = sql.findIndex(handsOverRow);
    expect(handOver).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(query).mock.calls[handOver][1]).toEqual([
      'google-oauth2|100',
      'linked@example.com',
    ]);
    // Hand the row over first, so the upsert by sub finds it instead of
    // tripping the unique email.
    expect(handOver).toBeLessThan(sql.findIndex(upsertsRow));
  });

  test('a login through a provider I do not trust to verify email never takes the row', async () => {
    await runWith({
      sub: 'github|7',
      [`${NS}email`]: 'untrusted@example.com',
      [`${NS}email_verified`]: true,
    });

    const sql = sqlRun();
    expect(sql.some(handsOverRow)).toBe(false);
    expect(sql.some(upsertsRow)).toBe(true);
  });
});
