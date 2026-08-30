import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Two things automating migrations did not fix.
 *
 * Running them on deploy removed the step I kept forgetting. It did nothing
 * about what is *in* them, and nothing about what happens when one fails
 * partway. These are the checks for those.
 *
 * The destructive rule is deliberately an acknowledgement rather than a ban.
 * Dropping a column is sometimes exactly right; doing it without having
 * thought about the currently deployed code is not. Writing the reason down is
 * the cheapest thing that makes it impossible to do by accident, and it turns
 * up as a line in the diff, which is where it needs to be seen.
 */
const MIGRATIONS = path.join(process.cwd(), 'src', 'migrations');

/**
 * Only `up()` matters. A `down()` that drops the column its `up()` added is
 * correct, and every migration in this repo has one, so scanning whole files
 * would flag all of them and teach everyone to ignore the check.
 */
function upRegionOf(source: string): string {
  const down = source.search(/export\s+(?:async\s+)?function\s+down\b/);
  return down === -1 ? source : source.slice(0, down);
}

const DESTRUCTIVE = [
  { name: 'dropColumn', re: /\.dropColumns?\s*\(/ },
  { name: 'dropTable', re: /\.dropTable(?:IfExists)?\s*\(/ },
  { name: 'renameColumn', re: /\.renameColumn\s*\(/ },
  { name: 'renameTable', re: /\.renameTable\s*\(/ },
  { name: 'dropPrimary/Unique/Foreign', re: /\.drop(?:Primary|Unique|Foreign)\s*\(/ },
  { name: 'raw DROP', re: /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT)\b/i },
  { name: 'TRUNCATE', re: /\bTRUNCATE\b/i },
  { name: 'DELETE FROM', re: /\bDELETE\s+FROM\b/i },
  { name: 'column type change', re: /\bALTER\s+COLUMN\b[\s\S]{0,80}?\bTYPE\b/i },
  { name: 'SET NOT NULL', re: /\bSET\s+NOT\s+NULL\b/i },
  { name: 'notNullable().alter()', re: /notNullable\s*\(\s*\)[\s\S]{0,60}?\.alter\s*\(/ },
];

function destructiveOpsIn(source: string): string[] {
  const up = upRegionOf(source);
  return DESTRUCTIVE.filter((d) => d.re.test(up)).map((d) => d.name);
}

/** A reason, not a checkbox. Twenty characters is enough to stop "// DESTRUCTIVE: yes". */
const ACKNOWLEDGED = /\/\/\s*DESTRUCTIVE:\s*\S.{19,}/;

function isAcknowledged(source: string): boolean {
  return ACKNOWLEDGED.test(source);
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ name: f, source: readFileSync(path.join(MIGRATIONS, f), 'utf8') }));

const ADDS_A_COLUMN = `
export async function up(knex) {
  await knex.schema.alterTable('todos', (t) => { t.text('note'); });
}
export async function down(knex) {
  await knex.schema.alterTable('todos', (t) => { t.dropColumn('note'); });
}`;

const DROPS_A_COLUMN = `
export async function up(knex) {
  await knex.schema.alterTable('todos', (t) => { t.dropColumn('detail'); });
}
export async function down(knex) {}`;

describe('spotting a destructive migration', () => {
  test('a drop in up() is destructive', () => {
    expect(destructiveOpsIn(DROPS_A_COLUMN)).toContain('dropColumn');
  });

  test('the same drop in down() is not, because that is what down is for', () => {
    expect(destructiveOpsIn(ADDS_A_COLUMN)).toEqual([]);
  });

  test('raw SQL counts too, not just the knex builder', () => {
    const raw = `export async function up(knex) {
      await knex.raw('ALTER TABLE todos DROP COLUMN detail');
    }`;
    expect(destructiveOpsIn(raw)).toContain('raw DROP');
  });

  test('tightening a column is destructive even though nothing is dropped', () => {
    const tighten = `export async function up(knex) {
      await knex.raw('ALTER TABLE todos ALTER COLUMN title SET NOT NULL');
    }`;
    // Every existing row that does not satisfy it fails the deploy, and every
    // running instance that writes without it starts erroring.
    expect(destructiveOpsIn(tighten)).toContain('SET NOT NULL');
  });
});

describe('acknowledging one', () => {
  test('a reason counts', () => {
    expect(
      isAcknowledged('// DESTRUCTIVE: drops legacy_token, unused since 4.2.0 and empty in production'),
    ).toBe(true);
  });

  test('a bare marker does not', () => {
    expect(isAcknowledged('// DESTRUCTIVE: yes')).toBe(false);
  });
});

describe('the migrations on disk', () => {
  test('every destructive migration says why', () => {
    const unacknowledged = files
      .filter((f) => destructiveOpsIn(f.source).length > 0 && !isAcknowledged(f.source))
      .map((f) => `${f.name} (${destructiveOpsIn(f.source).join(', ')})`);

    // If this fails, the fix is usually not the comment. Expand first: add the
    // new thing, ship the code that stops using the old thing, drop it in a
    // later release. Only when that genuinely does not apply, write the reason.
    expect(unacknowledged).toEqual([]);
  });

  test('none of them opt out of running in a transaction', () => {
    // Postgres has transactional DDL and knex uses it per migration unless it
    // is told not to. CONCURRENTLY is the usual reason someone turns it off,
    // and it trades a failed deploy for a half-built index.
    const optedOut = files
      .filter((f) => /disableTransactions|CONCURRENTLY/i.test(f.source))
      .map((f) => f.name);
    expect(optedOut).toEqual([]);
  });

  test('the knexfile does not disable them globally', () => {
    const knexfile = readFileSync(path.join(process.cwd(), 'knexfile.ts'), 'utf8');
    expect(knexfile).not.toMatch(/disableTransactions\s*:\s*true/);
  });

  test('found the migrations it claims to be checking', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test('no two migrations share a sequence number', () => {
    // 025_check_in and 025_draft_adjustments both landed on develop from
    // branches cut at the same time, and nothing here noticed. Knex keys the
    // migrations table on the filename, so both still ran -- but their order
    // relative to each other was decided by alphabetical chance rather than by
    // the number that is supposed to mean it.
    //
    // Catching a collision here, before anything runs, is the cheap fix. The
    // expensive one is renaming afterwards: knex validates that every recorded
    // migration still exists on disk, so a rename makes it refuse to run
    // anything at all -- "the migration directory is corrupt, the following
    // files are missing". Fixing that needs a hand-written
    // `UPDATE knex_migrations SET name = ...` against the affected database.
    //
    // That is not hypothetical. Renaming 025_check_in to 027_check_in was
    // checked against production, where it had not run, and shipped -- and it
    // broke staging on the next deploy, because staging tracks develop and had
    // already run it. "It has not been released" is the wrong question. The
    // right one is whether ANY environment has run it, staging included.
    const numbers = readdirSync(MIGRATIONS)
      .filter((f) => /^\d{3}_/.test(f))
      .map((f) => f.slice(0, 3));
    const duplicated = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    expect([...new Set(duplicated)]).toEqual([]);
  });

  test('the directory holds migrations and nothing else', () => {
    // Knex requires every file in here as a migration. This test started life
    // inside src/migrations, and knex duly tried to load it, importing vitest
    // outside the test runner and taking `pnpm migrate` down with it — a
    // failure with nothing to do with any migration. Anything that is not a
    // migration lives somewhere else.
    const notMigrations = readdirSync(MIGRATIONS).filter((f) => !/^\d{3}_[a-z0-9_]+\.ts$/.test(f));
    expect(notMigrations).toEqual([]);
  });
});
