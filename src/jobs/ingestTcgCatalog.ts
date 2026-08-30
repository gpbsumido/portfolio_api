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

import { createModuleLogger } from '../shared/utils/logger.js';
import { writeCatalog, type IngestSerie } from '../modules/tcg/catalog.js';

const log = createModuleLogger('ingest-tcg-catalog');

const API = 'https://api.tcgdex.net/v2/en';

/** Per-request ceiling, so one hanging call cannot pin the cron container. */
const REQUEST_TIMEOUT_MS = 15_000;

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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
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

  const resumes = await getJson<SerieResume[]>(`${API}/series`);
  if (!Array.isArray(resumes) || resumes.length === 0) {
    // An empty list is not a catalog with nothing in it; it is a response worth
    // distrusting. Refusing to write it keeps the last good copy.
    throw new Error('the series list came back empty');
  }

  const series: IngestSerie[] = [];
  for (const resume of resumes) {
    const detail = await getJson<SerieDetail>(
      `${API}/series/${encodeURIComponent(resume.id)}`,
    );
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
