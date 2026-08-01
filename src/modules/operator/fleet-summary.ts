// ---------------------------------------------------------------------------
// Operator module — pure fleet-summary assembly
//
// The three grouped SQL queries (alerts by store, inventory by store, alert
// hourly trend) come back sparse; these fold them into the dashboard's
// summary shape. Pure and clock-injectable so the rollup is testable.
// ---------------------------------------------------------------------------

import type {
  AlertStatRow,
  AlertTrendRow,
  InventoryStatRow,
} from './repository.js';
import type {
  AlertTrendBucketDto,
  FleetSummaryDto,
  StoreSummaryDto,
} from './types.js';

const TREND_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

/** Fills the sparse hourly alert counts into the last 24 UTC-hour buckets. */
export function fillAlertTrend(
  rows: readonly AlertTrendRow[],
  now: Date,
): AlertTrendBucketDto[] {
  const byHour = new Map<string, number>();
  for (const row of rows) {
    byHour.set(new Date(row.hour).toISOString().slice(0, 13), row.count);
  }

  const currentHour = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
  );

  const buckets: AlertTrendBucketDto[] = [];
  for (let i = TREND_HOURS - 1; i >= 0; i--) {
    const at = new Date(currentHour - i * HOUR_MS);
    const key = at.toISOString().slice(0, 13);
    buckets.push({
      hour: `${String(at.getUTCHours()).padStart(2, '0')}:00`,
      count: byHour.get(key) ?? 0,
    });
  }
  return buckets;
}

/**
 * Folds the per-store alert and inventory stats plus the alert trend into the
 * dashboard's fleet-summary shape: one summary row per store, fleet-wide
 * totals, and the 24-hour alert trend.
 */
export function assembleFleetSummary(
  stores: readonly { id: string }[],
  alertStats: readonly AlertStatRow[],
  inventoryStats: readonly InventoryStatRow[],
  trendRows: readonly AlertTrendRow[],
  now: Date,
): FleetSummaryDto {
  const alertMap = new Map(alertStats.map((a) => [a.storeId, a]));
  const invMap = new Map(inventoryStats.map((i) => [i.storeId, i]));

  const summaries: StoreSummaryDto[] = stores.map((store) => {
    const alerts = alertMap.get(store.id);
    const inventory = invMap.get(store.id);
    return {
      storeId: store.id,
      alertCount: alerts?.unacked ?? 0,
      inventoryHealth: Math.round((inventory?.avgFill ?? 0) * 100),
      hasCritical: (alerts?.critical ?? 0) > 0,
      hasWarning: (alerts?.warning ?? 0) > 0,
    };
  });

  let criticalAlerts = 0;
  let warningAlerts = 0;
  for (const a of alertStats) {
    criticalAlerts += a.critical;
    warningAlerts += a.warning;
  }

  let totalRatio = 0;
  let totalItems = 0;
  let lowStockItems = 0;
  for (const i of inventoryStats) {
    totalRatio += i.avgFill * i.itemCount;
    totalItems += i.itemCount;
    lowStockItems += i.lowStock;
  }

  return {
    summaries,
    fleetStats: {
      criticalAlerts,
      warningAlerts,
      lowStockItems,
      avgInventoryHealth:
        totalItems > 0 ? Math.round((totalRatio / totalItems) * 100) : 0,
    },
    alertTrend: fillAlertTrend(trendRows, now),
  };
}
