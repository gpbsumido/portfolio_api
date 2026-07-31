// ---------------------------------------------------------------------------
// Operator module — Drizzle ORM repository
//
// The point of moving off in-memory data: the fleet sales analytics are a
// single grouped SQL query per axis (by period, by store) instead of pulling
// every sale row into the app and summing there. The database does the fan-in.
// ---------------------------------------------------------------------------

import { and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  type OperatorStore,
  operatorSales,
  operatorStores,
} from '../../config/drizzle/schema.js';
import type { SalesGranularity } from './types.js';

export async function listStores(): Promise<OperatorStore[]> {
  return db.select().from(operatorStores).orderBy(operatorStores.name);
}

export type PeriodRow = { period: Date; revenue: number; units: number };

/**
 * Revenue and units bucketed by truncated period since `since`, ordered oldest
 * first. One GROUP BY, so the payload is at most a handful of rows regardless
 * of how many sales are in the window.
 */
export async function salesByPeriod(
  granularity: SalesGranularity,
  since: Date,
): Promise<PeriodRow[]> {
  const period = sql<Date>`date_trunc(${granularity}, ${operatorSales.occurredAt})`;
  return db
    .select({
      period,
      revenue: sql<number>`sum(${operatorSales.total})::float8`,
      units: sql<number>`sum(${operatorSales.quantity})::int`,
    })
    .from(operatorSales)
    .where(gte(operatorSales.occurredAt, since))
    .groupBy(period)
    .orderBy(period);
}

export type StoreTotalRow = {
  storeId: string;
  storeName: string;
  revenue: number;
  units: number;
};

/**
 * Per-store totals within the window, ranked by revenue. A left join keeps
 * stores with no sales in the window (they rank last with zero), and the sum
 * happens in SQL.
 */
export async function salesByStore(since: Date): Promise<StoreTotalRow[]> {
  const revenue = sql<number>`coalesce(sum(${operatorSales.total}), 0)::float8`;
  return db
    .select({
      storeId: operatorStores.id,
      storeName: operatorStores.name,
      revenue,
      units: sql<number>`coalesce(sum(${operatorSales.quantity}), 0)::int`,
    })
    .from(operatorStores)
    .leftJoin(
      operatorSales,
      and(
        sql`${operatorSales.storeId} = ${operatorStores.id}`,
        gte(operatorSales.occurredAt, since),
      ),
    )
    .groupBy(operatorStores.id, operatorStores.name)
    .orderBy(desc(revenue));
}
