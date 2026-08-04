import { describe, expect, test } from 'vitest';
import { buildOperatorSeed } from './seed-data.js';

// One inventory row per product, per store.
const PRODUCTS_PER_STORE = 6;

function counterUuid() {
  let n = 0;
  return () => `id-${String(++n).padStart(4, '0')}`;
}

const NOW = new Date('2026-08-01T12:00:00.000Z');

describe('buildOperatorSeed', () => {
  test('produces the expected counts', () => {
    const seed = buildOperatorSeed(counterUuid(), NOW);
    expect(seed.stores).toHaveLength(6);
    expect(seed.inventory).toHaveLength(36); // 6 stores x 6 items
    // Alerts are derived from each store's own inventory and temperature now,
    // so the count follows the data rather than being a fixed four per store.
    // Every store still raises the door-ajar event, so there is at least one.
    expect(seed.alerts.length).toBeGreaterThanOrEqual(seed.stores.length);
    expect(seed.alerts.length).toBeLessThanOrEqual(
      seed.stores.length * (PRODUCTS_PER_STORE + 2),
    );
    expect(seed.activity).toHaveLength(36); // 6 x 6
    expect(seed.sales).toHaveLength(360); // 6 x 60
    expect(seed.planograms).toHaveLength(6);
  });

  test('marks the third store degraded', () => {
    const seed = buildOperatorSeed(counterUuid(), NOW);
    expect(seed.stores[2].status).toBe('degraded');
    expect(seed.stores.filter((s) => s.status === 'degraded')).toHaveLength(1);
  });

  test('links every child row to a real store', () => {
    const seed = buildOperatorSeed(counterUuid(), NOW);
    const storeIds = new Set(seed.stores.map((s) => s.id));
    for (const row of [
      ...seed.inventory,
      ...seed.alerts,
      ...seed.activity,
      ...seed.sales,
    ]) {
      expect(storeIds.has(row.storeId)).toBe(true);
    }
  });

  test('planogram boxes reference the store’s own items or are empty', () => {
    const seed = buildOperatorSeed(counterUuid(), NOW);
    for (const plan of seed.planograms) {
      const storeItemIds = new Set(
        seed.inventory
          .filter((i) => i.storeId === plan.storeId)
          .map((i) => i.id),
      );
      for (const box of plan.boxes) {
        if (box.itemId !== null) {
          expect(storeItemIds.has(box.itemId)).toBe(true);
        }
      }
      // padded to full shelves plus a spare empty shelf
      expect(plan.boxes.some((b) => b.itemId === null)).toBe(true);
    }
  });

  test('spreads sales across more than a year', () => {
    const seed = buildOperatorSeed(counterUuid(), NOW);
    const times = seed.sales.map((s) => s.occurredAt.getTime());
    const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
    expect(spanDays).toBeGreaterThan(365);
  });

  test('is deterministic for the same inputs', () => {
    const a = buildOperatorSeed(counterUuid(), NOW);
    const b = buildOperatorSeed(counterUuid(), NOW);
    expect(a).toEqual(b);
  });
});

describe('alerts agree with the data they describe', () => {
  const seed = buildOperatorSeed(counterUuid(), NOW);

  /**
   * Alerts used to be a fixed list stamped onto every store, so a full shelf
   * still reported "Turkey Club Sandwich out of stock" and a store at 4C still
   * warned it had reached 8.2C. Anyone comparing two tabs saw the contradiction.
   */
  test('an out-of-stock alert names a product that is actually at zero', () => {
    const outOfStock = seed.alerts.filter((a) =>
      a.message.includes('out of stock'),
    );

    for (const alert of outOfStock) {
      const product = alert.message.replace(' out of stock', '');
      const item = seed.inventory.find(
        (i) => i.storeId === alert.storeId && i.productName === product,
      );
      expect(item, `${product} in ${alert.storeId}`).toBeDefined();
      expect(item?.currentStock).toBe(0);
    }
  });

  test('a low-stock alert names a product that is actually low', () => {
    const low = seed.alerts.filter((a) => a.message.includes('stock below'));

    for (const alert of low) {
      const product = alert.message.replace(/ stock below \d+%$/, '');
      const item = seed.inventory.find(
        (i) => i.storeId === alert.storeId && i.productName === product,
      );
      expect(item).toBeDefined();
      const ratio = (item?.currentStock ?? 0) / (item?.capacity ?? 1);
      expect(ratio).toBeLessThan(0.2);
      expect(item?.currentStock).toBeGreaterThan(0);
    }
  });

  test('every genuinely empty slot has an alert raised for it', () => {
    const empty = seed.inventory.filter((i) => i.currentStock === 0);

    for (const item of empty) {
      const raised = seed.alerts.some(
        (a) =>
          a.storeId === item.storeId &&
          a.message === `${item.productName} out of stock`,
      );
      expect(raised, `${item.productName} in ${item.storeId}`).toBe(true);
    }
  });

  test('only a store that is actually warm warns about temperature', () => {
    for (const store of seed.stores) {
      const warned = seed.alerts.some(
        (a) => a.storeId === store.id && a.category === 'temperature-warning',
      );
      expect(warned, `${store.name} at ${store.temperature}C`).toBe(
        store.temperature > 7,
      );
    }
  });

  test('the temperature alert quotes the reading the store reports', () => {
    for (const store of seed.stores.filter((s) => s.temperature > 7)) {
      const alert = seed.alerts.find(
        (a) => a.storeId === store.id && a.category === 'temperature-warning',
      );
      expect(alert?.message).toContain(store.temperature.toFixed(1));
    }
  });

  test('seeds completed restock sessions so the shrink report has data', () => {
    // Two sessions per store, all completed.
    expect(seed.restockSessions).toHaveLength(seed.stores.length * 2);
    expect(seed.restockSessions.every((s) => s.completedAt !== null)).toBe(true);
    expect(seed.restockLines.length).toBeGreaterThan(0);
    // Every line references a real session and a real inventory item.
    const sessionIds = new Set(seed.restockSessions.map((s) => s.id));
    const itemIds = new Set(seed.inventory.map((i) => i.id));
    for (const line of seed.restockLines) {
      expect(sessionIds.has(line.sessionId)).toBe(true);
      expect(itemIds.has(line.itemId)).toBe(true);
    }
  });

  test('the seeded counts include unexplained shrink to reconcile', () => {
    // At least one counted line short of expected, with no removal reason: the
    // exact signal the shrink report exists to surface. Without it the live
    // endpoint would render an honest but empty page.
    const shrink = seed.restockLines.filter(
      (l) =>
        l.countedQty !== null && l.countedQty < l.expectedQty && l.removed === 0,
    );
    expect(shrink.length).toBeGreaterThan(0);
  });
});
