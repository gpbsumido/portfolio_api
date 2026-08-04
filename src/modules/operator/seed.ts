// ---------------------------------------------------------------------------
// Operator module — the seeder (shared by the CLI and the cron job)
//
// Wipes and re-inserts the operator demo dataset in one transaction, from the
// pure builder in seed-data.ts. Both `pnpm seed:operator` and the scheduled
// re-seed job call this, so the two can never drift.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { db } from '../../config/drizzle/index.js';
import {
  operatorActivity,
  operatorAlerts,
  operatorInventory,
  operatorPlanograms,
  operatorRestockLines,
  operatorRestockSessions,
  operatorSales,
  operatorStores,
} from '../../config/drizzle/schema.js';
import { buildOperatorSeed } from './seed-data.js';

export type SeedCounts = {
  stores: number;
  inventory: number;
  alerts: number;
  activity: number;
  sales: number;
  planograms: number;
  restockSessions: number;
  restockLines: number;
};

/** Wipes and re-inserts the operator demo dataset. Safe to re-run. */
export async function seedOperator(now: Date = new Date()): Promise<SeedCounts> {
  const data = buildOperatorSeed(randomUUID, now);

  await db.transaction(async (tx) => {
    // Delete children before parents (FK order), then re-insert parent-first.
    await tx.delete(operatorPlanograms);
    await tx.delete(operatorSales);
    await tx.delete(operatorActivity);
    await tx.delete(operatorAlerts);
    await tx.delete(operatorRestockLines);
    await tx.delete(operatorRestockSessions);
    await tx.delete(operatorInventory);
    await tx.delete(operatorStores);

    if (data.stores.length) await tx.insert(operatorStores).values(data.stores);
    if (data.inventory.length)
      await tx.insert(operatorInventory).values(data.inventory);
    // Sessions before lines: a line references its session and an inventory item.
    if (data.restockSessions.length)
      await tx.insert(operatorRestockSessions).values(data.restockSessions);
    if (data.restockLines.length)
      await tx.insert(operatorRestockLines).values(data.restockLines);
    if (data.alerts.length) await tx.insert(operatorAlerts).values(data.alerts);
    if (data.activity.length)
      await tx.insert(operatorActivity).values(data.activity);
    if (data.sales.length) await tx.insert(operatorSales).values(data.sales);
    if (data.planograms.length)
      await tx.insert(operatorPlanograms).values(data.planograms);
  });

  return {
    stores: data.stores.length,
    inventory: data.inventory.length,
    alerts: data.alerts.length,
    activity: data.activity.length,
    sales: data.sales.length,
    planograms: data.planograms.length,
    restockSessions: data.restockSessions.length,
    restockLines: data.restockLines.length,
  };
}
