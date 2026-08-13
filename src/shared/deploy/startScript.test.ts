import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The boot script is what makes a deploy migrate itself, so the thing worth
 * testing is which commands it runs and in which order — not its text.
 *
 * It runs with fake `pnpm` and `node` on PATH that record how they were
 * called, so the real ones are never involved.
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const script = path.join(repoRoot, 'scripts', 'start.sh');

let sandbox: string;

function run(env: Record<string, string> = {}) {
  const log = path.join(sandbox, 'calls.log');
  const result = spawnSync('bash', [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${path.join(sandbox, 'bin')}:${process.env.PATH}`,
      CMD_LOG: log,
      ...env,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [],
  };
}

function fakeBin(name: string, body: string) {
  const file = path.join(sandbox, 'bin', name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'start-script-'));
  writeFileSync(path.join(sandbox, 'placeholder'), '');
  spawnSync('mkdir', ['-p', path.join(sandbox, 'bin')]);
  fakeBin('pnpm', 'echo "pnpm $*" >> "$CMD_LOG"');
  fakeBin('node', 'echo "node $*" >> "$CMD_LOG"');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('the deploy boot script', () => {
  test('migrates before it starts the server', async () => {
    const { status, calls } = run();

    expect(status).toBe(0);
    // Order is the whole point: serving traffic against a schema that has not
    // been migrated is the gap this closes.
    expect(calls).toEqual(['pnpm migrate', 'node start.js']);
  });

  test('a cron container starts without migrating', async () => {
    const { status, calls } = run({ RUN_CRON: 'true' });

    // Two containers racing for the knex migration lock means one of them
    // dies, and a cron job that failed to run is worse than a later migration.
    expect(status).toBe(0);
    expect(calls).toEqual(['node start.js']);
  });

  test('a failed migration stops the server starting', async () => {
    fakeBin('pnpm', 'echo "pnpm $*" >> "$CMD_LOG"; exit 1');

    const { status, calls } = run();

    // The old deploy keeps serving. Coming up against a schema that failed to
    // migrate is the outcome worth avoiding.
    expect(status).not.toBe(0);
    expect(calls).toEqual(['pnpm migrate']);
  });
});

describe('waiting for the database', () => {
  /** A pg_isready that refuses `failures` times, then succeeds. */
  function flakyDatabase(failures: number) {
    const counter = path.join(sandbox, 'attempts');
    fakeBin(
      'pg_isready',
      `n=$(cat "${counter}" 2>/dev/null || echo 0)
       n=$((n + 1)); echo "$n" > "${counter}"
       echo "pg_isready $*" >> "$CMD_LOG"
       [ "$n" -gt ${failures} ]`,
    );
    return () => Number(readFileSync(counter, 'utf8').trim());
  }

  test('migrates once the database answers, having retried until it did', async () => {
    const attempts = flakyDatabase(2);

    const { status, calls } = run({ DATABASE_URL: 'postgres://x/y', DB_WAIT_DELAY: '0' });

    expect(status).toBe(0);
    expect(attempts()).toBe(3);
    // The retry is worth nothing if it does not then do the work.
    expect(calls.filter((c) => c === 'pnpm migrate')).toHaveLength(1);
    expect(calls.at(-1)).toBe('node start.js');
  });

  test('gives up loudly rather than hanging when it never answers', async () => {
    fakeBin('pg_isready', 'echo "pg_isready $*" >> "$CMD_LOG"; exit 1');

    const { status, calls } = run({
      DATABASE_URL: 'postgres://x/y',
      DB_WAIT_ATTEMPTS: '3',
      DB_WAIT_DELAY: '0',
    });

    // A bounded failure is diagnosable. A container that waits forever is not.
    expect(status).not.toBe(0);
    expect(calls).not.toContain('pnpm migrate');
    expect(calls).not.toContain('node start.js');
  });

  test('does not wait when there is no DATABASE_URL, so a fresh clone is unchanged', async () => {
    fakeBin('pg_isready', 'echo "pg_isready $*" >> "$CMD_LOG"; exit 1');

    const { status, calls } = run();

    expect(status).toBe(0);
    expect(calls.some((c) => c.startsWith('pg_isready'))).toBe(false);
    expect(calls).toEqual(['pnpm migrate', 'node start.js']);
  });

  test('a cron container neither waits nor migrates', async () => {
    fakeBin('pg_isready', 'echo "pg_isready $*" >> "$CMD_LOG"; exit 1');

    const { status, calls } = run({ RUN_CRON: 'true', DATABASE_URL: 'postgres://x/y' });

    expect(status).toBe(0);
    expect(calls).toEqual(['node start.js']);
  });
});
