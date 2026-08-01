// ---------------------------------------------------------------------------
// Operator module — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import type { OperatorStore } from '../../config/drizzle/schema.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { buildBuckets, roundCents, windowStart } from './analytics.js';
import * as repo from './repository.js';
import { salesGranularitySchema } from './schemas.js';
import type {
  FleetSalesAnalyticsDto,
  SalesGranularity,
  StoreDto,
} from './types.js';

const log = createModuleLogger('operator');

function param(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0];
  return val ?? '';
}

/** Resolve the granularity query param, defaulting to month on anything odd. */
function resolveGranularity(raw: string): SalesGranularity {
  const parsed = salesGranularitySchema.safeParse(raw);
  return parsed.success ? parsed.data : 'month';
}

function toStoreDto(row: OperatorStore): StoreDto {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    province: row.province,
    status: row.status,
  };
}

export class OperatorController {
  /** GET /api/operator/stores — the fleet. */
  async listStores(_req: Request, res: Response, next: NextFunction) {
    try {
      const stores = await repo.listStores();
      res.json({ stores: stores.map(toStoreDto) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/sales-analytics — fleet-wide sales, aggregated in SQL. */
  async salesAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const granularity = resolveGranularity(param(req.query.granularity as string));
      const now = new Date();
      const since = windowStart(granularity, now);

      const startedAt = Date.now();
      const [periodRows, storeRows] = await Promise.all([
        repo.salesByPeriod(granularity, since),
        repo.salesByStore(since),
      ]);
      // The efficiency win we moved here for: two grouped queries, not a full
      // table scan summed in the app. Surface the timing for the dev-thoughts.
      log.info(
        { granularity, ms: Date.now() - startedAt, periods: periodRows.length },
        'fleet sales analytics aggregated in SQL',
      );

      const buckets = buildBuckets(granularity, periodRows, now);
      const byStore = storeRows.map((row) => ({
        storeId: row.storeId,
        storeName: row.storeName,
        totalRevenue: roundCents(row.revenue),
        unitsSold: row.units,
      }));
      const totalRevenue = roundCents(
        byStore.reduce((sum, s) => sum + s.totalRevenue, 0),
      );

      const body: FleetSalesAnalyticsDto = {
        granularity,
        buckets,
        byStore,
        totalRevenue,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
}
