import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json';

/**
 * Whatever version package.json is on has to be written down.
 *
 * This file fell nine versions behind without anything failing: the log
 * stopped at 4.2.1 while the service shipped 4.11.1, and every release in
 * between exists only as a version bump in a diff. Nothing read the file, so
 * nothing noticed. paul-explore lost its changelog the same way and carries
 * this same guard now.
 *
 * This is deliberately the weakest useful check. It cannot tell whether an
 * entry is any good, only that the version bump and the note about it happen
 * together rather than the second one being left for later, which is where it
 * gets lost.
 */
const changelog = (): string =>
  readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8');

/** Versions the changelog documents, in the order it lists them. */
const documented = (source: string): string[] =>
  [...source.matchAll(/^## .*version (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);

describe('changelog', () => {
  it('has an entry for the version package.json is on', () => {
    expect(documented(changelog())).toContain(pkg.version);
  });

  it('gives that entry something to say', () => {
    const source = changelog();
    const start = source.indexOf(`version ${pkg.version}`);
    const next = source.indexOf('\n## ', start);
    const body = source.slice(start, next === -1 ? undefined : next);

    expect(
      body.split('\n').filter((l) => l.trim().startsWith('- ')).length,
    ).toBeGreaterThan(0);
  });

  it('gives each version exactly one heading', () => {
    const counts = new Map<string, number>();
    for (const v of documented(changelog())) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const repeated = [...counts]
      .filter(([, n]) => n > 1)
      .map(([version]) => version);

    expect(repeated).toEqual([]);
  });

  it('actually reads versions out, so a rotted regex fails rather than passes', () => {
    expect(documented('## 2026-08-15 - version 4.11.2\n\n- a note\n')).toEqual([
      '4.11.2',
    ]);
    expect(documented('## not a version heading\n')).toEqual([]);
  });
});
