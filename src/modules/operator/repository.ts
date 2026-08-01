// ---------------------------------------------------------------------------
// Operator module — Drizzle ORM repository
//
// The point of moving off in-memory data: the fleet sales analytics are a
// single grouped SQL query per axis (by period, by store) instead of pulling
// every sale row into the app and summing there. The database does the fan-in.
// ---------------------------------------------------------------------------

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  type OperatorActivityEvent,
  type OperatorAlert,
  type OperatorInventoryItem,
  type OperatorStore,
  operatorActivity,
  operatorAlerts,
  operatorInventory,
  operatorSales,
  operatorStores,
} from '../../config/drizzle/schema.js';
import type { SalesGranularity } from './types.js';

export async function listStores(): Promise<OperatorStore[]> {
  return db.select().from(operatorStores).orderBy(operatorStores.name);
}

export async function getStore(id: string): Promise<OperatorStore | null> {
  const rows = await db
    .select()
    .from(operatorStores)
    .where(eq(operatorStores.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listInventory(
  storeId: string,
): Promise<OperatorInventoryItem[]> {
  return db
    .select()
    .from(operatorInventory)
    .where(eq(operatorInventory.storeId, storeId))
    .orderBy(operatorInventory.productName);
}

/** Restock the given items to full capacity, returning the updated rows. */
export async function restockItems(
  storeId: string,
  itemIds: readonly string[],
): Promise<OperatorInventoryItem[]> {
  if (itemIds.length === 0) return [];
  return db
    .update(operatorInventory)
    .set({
      currentStock: sql`${operatorInventory.capacity}`,
      lastRestocked: new Date(),
    })
    .where(
      and(
        eq(operatorInventory.storeId, storeId),
        inArray(operatorInventory.id, [...itemIds]),
      ),
    )
    .returning();
}

export async function listAlerts(storeId: string): Promise<OperatorAlert[]> {
  return db
    .select()
    .from(operatorAlerts)
    .where(eq(operatorAlerts.storeId, storeId))
    .orderBy(desc(operatorAlerts.occurredAt));
}

/** Acknowledge an alert, returning the updated row (or null if unknown). */
export async function dismissAlert(id: string): Promise<OperatorAlert | null> {
  const rows = await db
    .update(operatorAlerts)
    .set({ acknowledged: true })
    .where(eq(operatorAlerts.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function listActivity(
  storeId: string,
): Promise<OperatorActivityEvent[]> {
  return db
    .select()
    .from(operatorActivity)
    .where(eq(operatorActivity.storeId, storeId))
    .orderBy(desc(operatorActivity.occurredAt));
}

export async function insertActivity(values: {
  storeId: string;
  type: string;
  description: string;
  actor?: string | null;
}): Promise<OperatorActivityEvent> {
  const [row] = await db.insert(operatorActivity).values(values).returning();
  return row;
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
