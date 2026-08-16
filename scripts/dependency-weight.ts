/**
 * Measures the weight of this service's production dependency tree and checks
 * it against the budgets in ci/dependency-weight.json.
 *
 *   pnpm deps:weight
 *
 * Why weight and not a bundle budget: this service ships no browser bundle, so
 * paul-explore's gzipped first-load-JS check has nothing to measure here. What
 * costs a user on this service is cold start, because it scales to zero
 * (`fly.toml`). Install weight and package count are proxies for that — deterministic
 * ones, which is the whole reason they are the gate and boot wall-clock isn't.
 * The reasoning in full, including what this deliberately under-counts, lives
 * in the $comment of ci/dependency-weight.json.
 *
 * Everything here is IO. The arithmetic and the wording live in
 * src/shared/deploy/dependencyWeight.ts where they can be unit tested without
 * anyone having to run a real install.
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  lstatSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  judge,
  formatReport,
  type Budget,
  type Measurement,
} from '../src/shared/deploy/dependencyWeight.js';

/**
 * The machine that actually cold starts.
 *
 * Pinning this is what makes the figure comparable between a laptop and CI:
 * sharp resolves a different prebuilt libvips per platform, an 18 MiB swing
 * that has nothing to do with any change under review.
 */
const DEPLOY_TARGET = {
  os: ['linux'],
  cpu: ['x64'],
  libc: ['glibc'],
} as const;

const budgetsFile = z.object({
  budgets: z.record(
    z.string(),
    z.object({
      limit: z.number().int().positive(),
      unit: z.enum(['bytes', 'count']),
      why: z.string().min(1),
    }),
  ),
});

/**
 * Reads the committed budgets.
 *
 * @param root - Repository root.
 * @returns The budgets, in file order.
 */
function readBudgets(root: string): readonly Budget[] {
  const parsed = budgetsFile.parse(
    JSON.parse(readFileSync(join(root, 'ci', 'dependency-weight.json'), 'utf-8')),
  );

  return Object.entries(parsed.budgets).map(([name, budget]) => ({
    name,
    ...budget,
  }));
}

/**
 * Installs production dependencies only, from the committed lockfile, into a
 * throwaway directory.
 *
 * `--ignore-scripts` keeps this deterministic: ffmpeg-static's postinstall
 * pulls a binary off the network, which would make the number depend on who
 * ran it and when. The tree is therefore smaller than the deployed image by
 * about that binary, which the budget file says out loud.
 *
 * @param root - Repository root, source of package.json and the lockfile.
 * @param into - Throwaway directory to install into.
 */
function installProductionTree(root: string, into: string): void {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

  writeFileSync(
    join(into, 'package.json'),
    JSON.stringify(
      { ...manifest, pnpm: { supportedArchitectures: DEPLOY_TARGET } },
      null,
      2,
    ),
  );
  copyFileSync(join(root, 'pnpm-lock.yaml'), join(into, 'pnpm-lock.yaml'));

  execFileSync(
    'pnpm',
    ['install', '--prod', '--frozen-lockfile', '--ignore-scripts'],
    { cwd: into, stdio: 'inherit' },
  );
}

/** Every real file under a directory, following pnpm's symlinks. */
function* filesUnder(dir: string): Generator<{ key: string; size: number }> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    const link = lstatSync(path, { throwIfNoEntry: false });
    if (!link) continue;

    const resolved = link.isSymbolicLink() ? realpathSync(path) : path;
    const stats = statSync(resolved, { throwIfNoEntry: false });
    if (!stats) continue;

    if (stats.isDirectory()) {
      yield* filesUnder(resolved);
    } else {
      yield { key: `${stats.dev}:${stats.ino}`, size: stats.size };
    }
  }
}

/**
 * Total bytes of an installed tree.
 *
 * Deduplicated by inode because pnpm hardlinks every file from its global
 * store and symlinks packages into place — counting either twice would inflate
 * the figure by however aggressively pnpm happened to dedupe that day.
 *
 * @param nodeModules - The installed node_modules directory.
 * @returns Total bytes.
 */
function treeBytes(nodeModules: string): number {
  const counted = new Set<string>();
  let bytes = 0;

  for (const file of filesUnder(nodeModules)) {
    if (counted.has(file.key)) continue;
    counted.add(file.key);
    bytes += file.size;
  }

  return bytes;
}

/**
 * Resolved production packages, transitives included.
 *
 * Counted off pnpm's virtual store, so the same package resolved at two
 * versions counts twice. That is the honest count: Node resolves and loads
 * both.
 *
 * @param nodeModules - The installed node_modules directory.
 * @returns Number of resolved packages.
 */
function packageCount(nodeModules: string): number {
  return readdirSync(join(nodeModules, '.pnpm'), { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name !== 'node_modules',
  ).length;
}

const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), 'papi-deps-weight-'));

try {
  console.log(
    `Measuring production dependencies for ${DEPLOY_TARGET.os[0]}/${DEPLOY_TARGET.cpu[0]}, a proxy for cold start rather than cold start itself.\n`,
  );
  installProductionTree(root, scratch);

  const nodeModules = join(scratch, 'node_modules');
  const measurements: readonly Measurement[] = [
    { name: 'installBytes', actual: treeBytes(nodeModules) },
    { name: 'packageCount', actual: packageCount(nodeModules) },
  ];

  const verdicts = judge({ budgets: readBudgets(root), measurements });
  console.log(`\n${formatReport(verdicts)}\n`);

  const blown = verdicts.filter((verdict) => !verdict.withinBudget);
  if (blown.length > 0) {
    console.error(
      `Dependency weight over budget: ${blown.map((v) => v.name).join(', ')}. Either take the weight back out, or raise the budget in ci/dependency-weight.json in the same commit as the dependency that needed it.`,
    );
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
