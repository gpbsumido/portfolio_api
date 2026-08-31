// ---------------------------------------------------------------------------
// Cron job: mirror the TCGdex series/sets catalog into Postgres.
//
// paul-explore used to render its series and set lists straight from TCGdex.
// That meant one page listing every series and then fetching each one, and the
// cost of that fan-out is a multiple of however slow the API happens to be. It
// timed out `next build` — 60 seconds per page, three attempts, then the whole
// export fails — and at request time it rendered an empty list which ISR then
// cached for a day, which looks exactly like data nobody has updated.
//
// Doing the fan-out here instead moves it somewhere slowness is free.
//
// Wired into the cron entrypoint (start.js) via CRON_JOB=ingest-tcg-catalog.
// Suggested schedule: daily, `0 5 * * *`.
// ---------------------------------------------------------------------------

import https from 'node:https';
import { type IngestSerie, writeCatalog } from '../modules/tcg/catalog.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('ingest-tcg-catalog');

const API = 'https://api.tcgdex.net/v2/en';

/** Per-request ceiling, so one hanging call cannot pin the cron container. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Attempts per request, and the pause between them.
 *
 * This job exists because TCGdex is unreliable, so treating the first network
 * error as final would be odd. Three attempts covers a blip; it deliberately
 * does not cover an outage, because when the API is actually down the right
 * outcome is a quick clear failure that leaves yesterday's catalog serving.
 */
const ATTEMPTS = 3;
const BACKOFF_MS = 2_000;

/**
 * Nodes to try when the address DNS hands us will not answer.
 *
 * TCGdex runs GeoDNS, and the North America record points at a node that
 * refuses connections. Their maintainer knows -- tcgdex/cards-database#2293,
 * closed with "na is experiencing outages, we cant just drop a node like that"
 * -- so this is not a blip to wait out, and everything we run from (Vercel,
 * Railway) resolves as North America.
 *
 * These are only tried after the published address has already failed, so if
 * the NA node comes back we go straight back to using it. They are a last
 * resort, not a route around their traffic management: this job makes about
 * twenty requests a day.
 *
 * IPs move. Override with TCGDEX_FALLBACK_IPS (comma separated), or set it
 * empty to switch this off entirely.
 */
const DEFAULT_FALLBACK_IPS = ['51.68.233.163', '217.182.193.43'];

function fallbackIps(): string[] {
  const configured = process.env.TCGDEX_FALLBACK_IPS;
  if (configured === undefined) return DEFAULT_FALLBACK_IPS;
  return configured
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/**
 * The fallback node that worked, remembered for the rest of the run.
 *
 * Without this every request repeats the doomed path first — three attempts
 * and two backoffs against an address already known not to answer. The first
 * real run cost 2m34s for 22 requests, almost all of it waiting to fail the
 * same way twenty-two times.
 *
 * Deliberately per-run rather than persisted: the point is to stop repeating a
 * failure we have already seen this run, not to stop checking whether TCGdex
 * has fixed its DNS. Every run starts by trying the published address again.
 */
let preferredIp: string | null = null;

/** For tests, and for the start of each run. */
export function resetPreferredNode(): void {
  preferredIp = null;
}

/** Which node the run has settled on, if any. */
export function preferredNode(): string | null {
  return preferredIp;
}

/**
 * Fetches over HTTPS with the hostname resolved to a fixed address.
 *
 * The URL's hostname still drives SNI and certificate validation -- this is
 * curl's --resolve, not a way of skipping the checks. node:https takes a
 * lookup, so this needs no new dependency.
 */
/**
 * A DNS lookup that always answers with one fixed address.
 *
 * Exported because its shape is the whole difficulty. Node calls `lookup` two
 * different ways: with `all: true` it wants an array of `{address, family}`,
 * otherwise it wants `(err, address, family)`. Since Node 20, autoSelectFamily
 * is on by default and `net.connect` asks for `all`, so answering only the
 * second way returns undefined into the socket and fails with
 * `Invalid IP address: undefined` -- which is exactly how the first production
 * run of the fallback died.
 */
export function fixedLookup(ip: string) {
  const family = ip.includes(':') ? 6 : 4;
  return (
    _hostname: string,
    options: { all?: boolean } | number | undefined,
    cb: (err: NodeJS.ErrnoException | null, ...args: never[]) => void,
  ): void => {
    if (typeof options === 'object' && options?.all) {
      (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
        { address: ip, family },
      ]);
      return;
    }
    (cb as unknown as (e: null, a: string, f: number) => void)(null, ip, family);
  };
}

function getJsonVia<T>(ip: string, url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: fixedLookup(ip) as unknown as undefined,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          reject(new Error(`answered ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (err) {
            reject(new Error(`unparseable response: ${describe(err)}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What went wrong, in a form a log line can carry. */
function describe(err: unknown): string {
  if (err instanceof Error) {
    // fetch() reports every network failure as the word "failed" and hides the
    // reason underneath, which is how a DNS problem and a refused connection
    // end up looking identical in a cron log.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message;
    return detail ? `${err.message} (${detail})` : err.message;
  }
  return String(err);
}

interface SerieResume {
  id: string;
  name?: string;
  logo?: string;
}

interface SerieDetail {
  id: string;
  name?: string;
  logo?: string;
  sets?: {
    id: string;
    name?: string;
    logo?: string;
    symbol?: string;
    cardCount?: { official?: number; total?: number };
  }[];
}

/**
 * Fetches JSON, retrying the failures worth retrying.
 *
 * A 4xx is upstream telling us the request was wrong; asking again three times
 * only makes the log longer. Network errors and 5xx get another go.
 *
 * Whatever comes out names the URL. "fetch failed" on its own -- which is all
 * Node gives you -- says nothing about which of the dozens of calls this job
 * makes gave up, or why.
 */
async function getJson<T>(url: string): Promise<T> {
  let last = '';

  // A node already proved itself this run, so go straight there rather than
  // spending three attempts and two backoffs on an address we watched fail.
  if (preferredIp !== null) {
    try {
      return await getJsonVia<T>(preferredIp, url);
    } catch (err) {
      log.warn(
        { url, ip: preferredIp, error: describe(err) },
        'preferred node stopped answering; starting over',
      );
      preferredIp = null;
    }
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as T;

      last = `answered ${res.status}`;
      if (res.status < 500) break;
    } catch (err) {
      last = describe(err);
    }

    if (attempt < ATTEMPTS) {
      log.warn({ url, attempt, error: last }, 'request failed, retrying');
      await wait(BACKOFF_MS * attempt);
    }
  }
  // The published address is not answering. Everything we run from resolves as
  // North America, where TCGdex's GeoDNS currently points at a dead node, so
  // try the ones that do answer before giving up.
  for (const ip of fallbackIps()) {
    try {
      const data = await getJsonVia<T>(ip, url);
      // Loudly, and once per run rather than once per request — but never
      // silently. A fallback that goes unmentioned turns someone else's outage
      // into our permanent configuration.
      log.warn(
        { url, ip },
        'published address unreachable; serving the rest of this run from a fallback node',
      );
      preferredIp = ip;
      return data;
    } catch (err) {
      log.warn({ url, ip, error: describe(err) }, 'fallback node failed too');
    }
  }

  throw new Error(`${url}: ${last}`);
}

/**
 * Assembles the whole catalog before writing any of it.
 *
 * If one serie cannot be fetched the run fails without touching the table, so
 * a bad afternoon upstream leaves yesterday's catalog serving rather than a
 * half-updated one.
 */
export async function ingestTcgCatalog(): Promise<void> {
  log.info('fetching the TCGdex catalog');
  // Each run re-checks the published address, so a fixed upstream is noticed.
  resetPreferredNode();
  try {
    await run();
  } catch (err) {
    // Say what was left behind, not just what broke. The catalog is untouched
    // on any failure, and a log that does not say so invites someone to go
    // looking for a half-written one.
    log.error(
      { error: describe(err) },
      'TCGdex catalog ingest failed; the stored catalog is unchanged',
    );
    throw err;
  }
}

async function run(): Promise<void> {
  const resumes = await getJson<SerieResume[]>(`${API}/series`);
  if (!Array.isArray(resumes) || resumes.length === 0) {
    // An empty list is not a catalog with nothing in it; it is a response worth
    // distrusting. Refusing to write it keeps the last good copy.
    throw new Error('the series list came back empty');
  }

  const series: IngestSerie[] = [];
  for (const resume of resumes) {
    const detail = await getJson<SerieDetail>(`${API}/series/${encodeURIComponent(resume.id)}`);
    series.push({
      id: detail.id ?? resume.id,
      name: detail.name ?? resume.name ?? resume.id,
      logo: detail.logo ?? resume.logo ?? null,
      sets: (detail.sets ?? []).map((set) => ({
        id: set.id,
        name: set.name ?? set.id,
        logo: set.logo ?? null,
        symbol: set.symbol ?? null,
        // Null rather than zero: a set that has not been detailed yet has an
        // unknown count, and rendering that as "0 cards" would be a lie.
        cardCountOfficial: set.cardCount?.official ?? null,
        cardCountTotal: set.cardCount?.total ?? null,
      })),
    });
  }

  const counts = await writeCatalog(series);
  log.info(counts, 'TCGdex catalog ingest complete');
}
