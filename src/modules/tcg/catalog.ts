import { pool } from '../../config/database.js';

/**
 * The stored TCGdex catalog: reads for the API, and the upsert the cron job
 * writes through.
 *
 * Kept separate from the card-economy repository in this module because they
 * share nothing but a name — one is per-user game state, this is a public
 * mirror of someone else's reference data.
 */

export interface CatalogSet {
  id: string;
  name: string;
  logo: string | null;
  symbol: string | null;
  cardCountOfficial: number | null;
  cardCountTotal: number | null;
}

export interface CatalogSerie {
  id: string;
  name: string;
  logo: string | null;
  sets: CatalogSet[];
}

interface SerieRow {
  id: string;
  name: string;
  logo: string | null;
}

interface SetRow {
  id: string;
  serie_id: string;
  name: string;
  logo: string | null;
  symbol: string | null;
  card_count_official: number | null;
  card_count_total: number | null;
}

/**
 * The whole catalog, sets nested under their serie.
 *
 * Two queries rather than a join with client-side grouping: the catalog is a
 * few hundred rows, and this keeps the shape obvious.
 */
export async function readCatalog(): Promise<{
  series: CatalogSerie[];
  updatedAt: string | null;
}> {
  const { rows: series } = await pool.query<SerieRow>(
    `SELECT id, name, logo FROM tcg_series ORDER BY name ASC`,
  );
  const { rows: sets } = await pool.query<SetRow>(
    `SELECT id, serie_id, name, logo, symbol, card_count_official, card_count_total
       FROM tcg_sets
      ORDER BY serie_id ASC, position ASC`,
  );
  const { rows: freshness } = await pool.query<{ updated_at: string | null }>(
    `SELECT MAX(updated_at) AS updated_at FROM tcg_sets`,
  );

  const bySerie = new Map<string, CatalogSet[]>();
  for (const set of sets) {
    const list = bySerie.get(set.serie_id) ?? [];
    list.push({
      id: set.id,
      name: set.name,
      logo: set.logo,
      symbol: set.symbol,
      cardCountOfficial: set.card_count_official,
      cardCountTotal: set.card_count_total,
    });
    bySerie.set(set.serie_id, list);
  }

  return {
    series: series.map((serie) => ({
      id: serie.id,
      name: serie.name,
      logo: serie.logo,
      sets: bySerie.get(serie.id) ?? [],
    })),
    updatedAt: freshness[0]?.updated_at ?? null,
  };
}

/** One serie and its sets, as the ingest assembled them. */
export interface IngestSerie {
  id: string;
  name: string;
  logo: string | null;
  sets: {
    id: string;
    name: string;
    logo: string | null;
    symbol: string | null;
    cardCountOfficial: number | null;
    cardCountTotal: number | null;
  }[];
}

/**
 * Writes a whole catalog in one transaction.
 *
 * Upsert, never delete. A set missing from a response is far more likely to be
 * a bad response than a real deletion, and emptying this table is precisely
 * the outage this catalog exists to prevent. Doing it in one transaction means
 * a failure part-way leaves the previous catalog intact rather than half of
 * two of them.
 */
export async function writeCatalog(series: IngestSerie[]): Promise<{
  series: number;
  sets: number;
}> {
  const client = await pool.connect();
  let setCount = 0;
  try {
    await client.query('begin');
    for (const serie of series) {
      await client.query(
        `INSERT INTO tcg_series (id, name, logo, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, logo = EXCLUDED.logo, updated_at = now()`,
        [serie.id, serie.name, serie.logo],
      );

      for (const [position, set] of serie.sets.entries()) {
        await client.query(
          `INSERT INTO tcg_sets
             (id, serie_id, name, logo, symbol, card_count_official, card_count_total, position, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (id) DO UPDATE
             SET serie_id = EXCLUDED.serie_id,
                 name = EXCLUDED.name,
                 logo = EXCLUDED.logo,
                 symbol = EXCLUDED.symbol,
                 card_count_official = EXCLUDED.card_count_official,
                 card_count_total = EXCLUDED.card_count_total,
                 position = EXCLUDED.position,
                 updated_at = now()`,
          [
            set.id,
            serie.id,
            set.name,
            set.logo,
            set.symbol,
            set.cardCountOfficial,
            set.cardCountTotal,
            position,
          ],
        );
        setCount += 1;
      }
    }
    await client.query('commit');
    return { series: series.length, sets: setCount };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
