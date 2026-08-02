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
  operatorPlanograms,
  type OperatorRestockLine,
  type OperatorRestockSession,
  operatorRestockLines,
  operatorRestockSessions,
  operatorSales,
  operatorStores,
} from '../../config/drizzle/schema.js';
import { describeSession, resultingStock, summarizeSession } from './restock.js';
import type { PlanogramBox, SalesGranularity } from './types.js';

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
  timeZone: string,
): Promise<PeriodRow[]> {
  // The three-argument date_trunc(field, source, zone) is Postgres 16 and this
  // project runs 15, so we do the round trip by hand: shift the timestamptz into
  // local wall clock, truncate there, shift the result back to an instant.
  const period = sql<Date>`date_trunc(${granularity}, ${operatorSales.occurredAt} AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}`;
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

// ---------------------------------------------------------------------------
// Planogram
// ---------------------------------------------------------------------------

export async function getPlanogram(storeId: string): Promise<PlanogramBox[]> {
  const rows = await db
    .select({ boxes: operatorPlanograms.boxes })
    .from(operatorPlanograms)
    .where(eq(operatorPlanograms.storeId, storeId))
    .limit(1);
  return rows[0]?.boxes ?? [];
}

/** Replaces a store's planogram layout, creating the row if needed. */
export async function setPlanogram(
  storeId: string,
  boxes: PlanogramBox[],
): Promise<PlanogramBox[]> {
  const [row] = await db
    .insert(operatorPlanograms)
    .values({ storeId, boxes })
    .onConflictDoUpdate({
      target: operatorPlanograms.storeId,
      set: { boxes, updatedAt: new Date() },
    })
    .returning({ boxes: operatorPlanograms.boxes });
  return row.boxes;
}

// ---------------------------------------------------------------------------
// Fleet summary aggregations — grouped in SQL, one query per axis
// ---------------------------------------------------------------------------

export type AlertStatRow = {
  storeId: string;
  unacked: number;
  critical: number;
  warning: number;
};

export async function alertStatsByStore(): Promise<AlertStatRow[]> {
  const notAck = sql`not ${operatorAlerts.acknowledged}`;
  return db
    .select({
      storeId: operatorAlerts.storeId,
      unacked: sql<number>`count(*) filter (where ${notAck})::int`,
      critical: sql<number>`count(*) filter (where ${notAck} and ${operatorAlerts.severity} = 'critical')::int`,
      warning: sql<number>`count(*) filter (where ${notAck} and ${operatorAlerts.severity} = 'warning')::int`,
    })
    .from(operatorAlerts)
    .groupBy(operatorAlerts.storeId);
}

export type InventoryStatRow = {
  storeId: string;
  avgFill: number;
  lowStock: number;
  itemCount: number;
};

export async function inventoryStatsByStore(): Promise<InventoryStatRow[]> {
  const fill = sql`(${operatorInventory.currentStock}::float / nullif(${operatorInventory.capacity}, 0))`;
  return db
    .select({
      storeId: operatorInventory.storeId,
      avgFill: sql<number>`coalesce(avg(${fill}), 0)::float8`,
      lowStock: sql<number>`count(*) filter (where ${fill} < 0.2)::int`,
      itemCount: sql<number>`count(*)::int`,
    })
    .from(operatorInventory)
    .groupBy(operatorInventory.storeId);
}

// ---------------------------------------------------------------------------
// Restock sessions
//
// Inventory is never written directly any more. Lines accumulate while the
// restocker works the shelf, and completeSession is the one place that touches
// operator_inventory -- in a single transaction, so a phone that drops signal
// mid-restock leaves either nothing applied or all of it.
// ---------------------------------------------------------------------------

export async function openSession(
  storeId: string,
  actor: string,
): Promise<OperatorRestockSession> {
  const [row] = await db
    .insert(operatorRestockSessions)
    .values({ storeId, actor })
    .returning();
  return row;
}

export async function getSession(
  id: string,
): Promise<OperatorRestockSession | null> {
  const rows = await db
    .select()
    .from(operatorRestockSessions)
    .where(eq(operatorRestockSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSessions(
  storeId: string,
  limit = 20,
): Promise<OperatorRestockSession[]> {
  return db
    .select()
    .from(operatorRestockSessions)
    .where(eq(operatorRestockSessions.storeId, storeId))
    .orderBy(desc(operatorRestockSessions.startedAt))
    .limit(limit);
}

export async function listSessionLines(
  sessionId: string,
): Promise<OperatorRestockLine[]> {
  return db
    .select()
    .from(operatorRestockLines)
    .where(eq(operatorRestockLines.sessionId, sessionId));
}

export type RestockLineValues = {
  expectedQty: number;
  countedQty: number | null;
  added: number;
  removed: number;
  removalReason: string | null;
};

/**
 * Upsert one slot's line. Keyed on (session_id, item_id) so a restocker tapping
 * the same slot repeatedly updates one row instead of growing the table.
 */
export async function upsertLine(
  sessionId: string,
  itemId: string,
  values: RestockLineValues,
): Promise<OperatorRestockLine> {
  const [row] = await db
    .insert(operatorRestockLines)
    .values({ sessionId, itemId, ...values })
    .onConflictDoUpdate({
      target: [operatorRestockLines.sessionId, operatorRestockLines.itemId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export type CompletedSession = {
  session: OperatorRestockSession;
  lines: OperatorRestockLine[];
  items: OperatorInventoryItem[];
  activity: OperatorActivityEvent;
};

/**
 * Apply a session: derive each item's resulting stock from its own line, write
 * it, freeze the derived value on the line, close the session and log one
 * activity event. All inside one transaction.
 */
export async function completeSession(
  sessionId: string,
  notes: string | null,
): Promise<CompletedSession | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(operatorRestockSessions)
      .where(eq(operatorRestockSessions.id, sessionId))
      .limit(1);
    if (!session) return null;

    const lines = await tx
      .select()
      .from(operatorRestockLines)
      .where(eq(operatorRestockLines.sessionId, sessionId));

    const itemIds = lines.map((line) => line.itemId);
    const stock =
      itemIds.length > 0
        ? await tx
            .select()
            .from(operatorInventory)
            .where(inArray(operatorInventory.id, itemIds))
        : [];
    const capacityOf = new Map(stock.map((row) => [row.id, row.capacity]));

    const applied: OperatorInventoryItem[] = [];
    const frozen: OperatorRestockLine[] = [];

    for (const line of lines) {
      const resulting = resultingStock(line, capacityOf.get(line.itemId) ?? 0);

      const [item] = await tx
        .update(operatorInventory)
        .set({ currentStock: resulting, lastRestocked: new Date() })
        .where(eq(operatorInventory.id, line.itemId))
        .returning();
      if (item) applied.push(item);

      const [updatedLine] = await tx
        .update(operatorRestockLines)
        .set({ resultingStock: resulting })
        .where(eq(operatorRestockLines.id, line.id))
        .returning();
      frozen.push(updatedLine ?? line);
    }

    const [activity] = await tx
      .insert(operatorActivity)
      .values({
        storeId: session.storeId,
        type: 'restock',
        description: describeSession(summarizeSession(frozen)),
        actor: session.actor,
      })
      .returning();

    const [closed] = await tx
      .update(operatorRestockSessions)
      .set({ completedAt: new Date(), notes })
      .where(eq(operatorRestockSessions.id, sessionId))
      .returning();

    return { session: closed, lines: frozen, items: applied, activity };
  });
}

export type AlertTrendRow = { hour: Date; count: number };

export async function alertHourlyTrend(
  since: Date,
  timeZone: string,
): Promise<AlertTrendRow[]> {
  const hour = sql<Date>`date_trunc('hour', ${operatorAlerts.occurredAt} AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}`;
  return db
    .select({ hour, count: sql<number>`count(*)::int` })
    .from(operatorAlerts)
    .where(gte(operatorAlerts.occurredAt, since))
    .groupBy(hour)
    .orderBy(hour);
}
