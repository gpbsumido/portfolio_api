import { describe, expect, test } from 'vitest';
import { buildOperatorSeed } from './seed-data.js';

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
    expect(seed.alerts).toHaveLength(24); // 6 x 4
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
