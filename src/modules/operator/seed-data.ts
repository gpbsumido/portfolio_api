// ---------------------------------------------------------------------------
// Operator module — demo seed data
//
// Pure builder for the operator demo dataset, mirroring the shape the
// paul-explore factories produce. Deterministic given (uuid, now) so the seed
// is reproducible and the builder is unit-testable; the runner in
// scripts/operator/seed.ts inserts what this returns.
// ---------------------------------------------------------------------------

import { REMOVAL_REASONS, resultingStock } from './restock.js';
import type { PlanogramBox } from './types.js';

const SHELF_WIDTH = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Historical restock sessions so the shrink report has counts to reconcile
// against on a fresh seed. Mirrors paul-explore's buildRestockHistory: a couple
// of completed sessions per store, each walking a few slots through a shortfall,
// a reasoned removal, a skipped count and a clean count, scaled per store so the
// fleet has a real worst-first ranking.
const HISTORY_SESSION_DAYS = [4, 11] as const;
const HISTORY_SLOTS_PER_SESSION = 6;

const STORE_DEFS = [
  { name: 'Lobby Fridge - Building A', location: 'Building A, Floor 1', province: 'ON' },
  { name: 'Break Room Cooler - Floor 3', location: 'Building A, Floor 3', province: 'BC' },
  { name: 'Cafeteria Unit - Building B', location: 'Building B, Floor 1', province: 'AB' },
  { name: 'Gym Vending - Rec Center', location: 'Rec Center, Ground Floor', province: 'QC' },
  { name: 'Parking Garage Kiosk - Level P2', location: 'Parking Garage, Level P2', province: 'ON' },
  { name: 'Reception Snacks - Main Lobby', location: 'Main Lobby', province: 'BC' },
] as const;

const PRODUCTS = [
  { name: 'Coca-Cola 355ml', category: 'beverages', price: 2.5, capacity: 12 },
  { name: 'Sparkling Water 500ml', category: 'beverages', price: 1.75, capacity: 15 },
  { name: 'Turkey Club Sandwich', category: 'food', price: 6.99, capacity: 8 },
  { name: 'Greek Yogurt Cup', category: 'dairy', price: 3.25, capacity: 10 },
  { name: 'Mixed Nuts 100g', category: 'snacks', price: 4.5, capacity: 20 },
  { name: 'Energy Bar', category: 'snacks', price: 2.99, capacity: 24 },
] as const;

/**
 * Alerts are derived from each store's own data rather than stamped on from a
 * fixed list.
 *
 * They used to be a constant four, identical for every store, which meant a
 * store with a full shelf still reported "Turkey Club Sandwich out of stock"
 * and a store sitting at 4C still warned that it had reached 8.2C. Anyone
 * comparing the alerts tab against the inventory tab saw the contradiction
 * immediately, which is a bad look for a dashboard whose whole pitch is that
 * the data is real.
 */
const LOW_STOCK_RATIO = 0.2;
const TEMPERATURE_THRESHOLD_C = 7;

const ACTIVITY_DEFS = [
  { type: 'restock', description: 'Restocked 12 units of Coca-Cola 355ml' },
  { type: 'maintenance', description: 'Cleaned condenser coils' },
  { type: 'alert-acknowledged', description: 'Acknowledged low-stock alert for Energy Bar' },
  { type: 'price-update', description: 'Seasonal pricing applied to 5 items' },
  { type: 'status-change', description: 'Store status changed from online to degraded' },
  { type: 'restock', description: 'Full restock completed - 47 items added' },
] as const;

const ACTOR = 'operator@smartstore.example';

export type SeedStore = {
  id: string;
  name: string;
  location: string;
  province: string;
  status: string;
  temperature: number;
  uptime: number;
  revenue24h: number;
  lastPing: Date;
};

export type SeedInventoryItem = {
  id: string;
  storeId: string;
  productName: string;
  category: string;
  currentStock: number;
  capacity: number;
  price: number;
  lastRestocked: Date;
};

export type SeedAlert = {
  id: string;
  storeId: string;
  severity: string;
  category: string;
  message: string;
  occurredAt: Date;
  acknowledged: boolean;
};

export type SeedActivity = {
  id: string;
  storeId: string;
  type: string;
  description: string;
  occurredAt: Date;
  actor: string;
};

export type SeedSale = {
  id: string;
  storeId: string;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  total: number;
  occurredAt: Date;
};

export type SeedPlanogram = { storeId: string; boxes: PlanogramBox[] };

export type SeedRestockSession = {
  id: string;
  storeId: string;
  startedAt: Date;
  completedAt: Date;
  actor: string;
  notes: string | null;
};

export type SeedRestockLine = {
  id: string;
  sessionId: string;
  itemId: string;
  expectedQty: number;
  countedQty: number | null;
  added: number;
  removed: number;
  removalReason: string | null;
  resultingStock: number | null;
};

export type OperatorSeed = {
  stores: SeedStore[];
  inventory: SeedInventoryItem[];
  alerts: SeedAlert[];
  activity: SeedActivity[];
  sales: SeedSale[];
  planograms: SeedPlanogram[];
  restockSessions: SeedRestockSession[];
  restockLines: SeedRestockLine[];
};

/** Deterministic 0..1 pseudo-random from an integer seed (so the seed is stable). */
function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const SALES_PER_STORE = 60;
const SALES_SPAN_DAYS = 540;

/**
 * Builds the full demo dataset. `uuid` supplies ids (inject a counter in tests
 * for determinism), and `now` anchors every timestamp.
 */
export function buildOperatorSeed(
  uuid: () => string,
  now: Date,
): OperatorSeed {
  const nowMs = now.getTime();
  const seed: OperatorSeed = {
    stores: [],
    inventory: [],
    alerts: [],
    activity: [],
    sales: [],
    planograms: [],
    restockSessions: [],
    restockLines: [],
  };

  STORE_DEFS.forEach((def, storeIndex) => {
    const degraded = storeIndex === 2;
    const storeId = uuid();
    const temperature = degraded
      ? 8.4
      : Number((3 + rand(storeIndex) * 2).toFixed(1));
    seed.stores.push({
      id: storeId,
      name: def.name,
      location: def.location,
      province: def.province,
      status: degraded ? 'degraded' : 'online',
      temperature,
      uptime: degraded ? 72.3 : Number((97 + rand(storeIndex + 1) * 3).toFixed(1)),
      revenue24h: Number((80 + rand(storeIndex + 2) * 160).toFixed(2)),
      lastPing: new Date(nowMs - (degraded ? 7 * 60 * 1000 : 30 * 1000)),
    });

    // Inventory — one of each product, with varied stock.
    const itemIds: string[] = [];
    PRODUCTS.forEach((product, p) => {
      const id = uuid();
      itemIds.push(id);
      const fill = rand(storeIndex * 10 + p);
      seed.inventory.push({
        id,
        storeId,
        productName: product.name,
        category: product.category,
        currentStock: Math.round(fill * product.capacity),
        capacity: product.capacity,
        price: product.price,
        lastRestocked: new Date(nowMs - (12 + rand(p) * 48) * 60 * 60 * 1000),
      });
    });

    // Alerts, derived from what this store's inventory and sensors actually say.
    const storeInventory = seed.inventory.filter((i) => i.storeId === storeId);
    let alertIndex = 0;
    const pushAlert = (
      severity: string,
      category: string,
      message: string,
    ): void => {
      seed.alerts.push({
        id: uuid(),
        storeId,
        severity,
        category,
        message,
        occurredAt: new Date(
          nowMs - rand(storeIndex + alertIndex++) * 24 * 60 * 60 * 1000,
        ),
        acknowledged: false,
      });
    };

    for (const item of storeInventory) {
      const ratio = item.capacity > 0 ? item.currentStock / item.capacity : 0;
      if (item.currentStock === 0) {
        pushAlert('critical', 'low-stock', `${item.productName} out of stock`);
      } else if (ratio < LOW_STOCK_RATIO) {
        pushAlert(
          'warning',
          'low-stock',
          `${item.productName} stock below ${Math.round(LOW_STOCK_RATIO * 100)}%`,
        );
      }
    }

    if (temperature > TEMPERATURE_THRESHOLD_C) {
      pushAlert(
        'warning',
        'temperature-warning',
        `Internal temperature reached ${temperature.toFixed(1)}C (threshold ${TEMPERATURE_THRESHOLD_C}C)`,
      );
    }

    // A transient event rather than a claim about current state, so it does not
    // contradict anything the other tabs show.
    pushAlert('info', 'door-ajar', 'Door open for more than 60 seconds');

    // Activity feed.
    ACTIVITY_DEFS.forEach((event, e) => {
      seed.activity.push({
        id: uuid(),
        storeId,
        type: event.type,
        description: event.description,
        occurredAt: new Date(nowMs - (e + rand(e)) * 12 * 60 * 60 * 1000),
        actor: ACTOR,
      });
    });

    // Sales spread across ~18 months so every analytics range has data.
    for (let s = 0; s < SALES_PER_STORE; s++) {
      const product = PRODUCTS[s % PRODUCTS.length];
      const quantity = 1 + Math.floor(rand(storeIndex * 100 + s) * 3);
      const daysAgo = SALES_SPAN_DAYS * ((s + rand(s)) / SALES_PER_STORE);
      seed.sales.push({
        id: uuid(),
        storeId,
        productName: product.name,
        category: product.category,
        unitPrice: product.price,
        quantity,
        total: Number((product.price * quantity).toFixed(2)),
        occurredAt: new Date(nowMs - daysAgo * MS_PER_DAY),
      });
    }

    // Planogram: items in order, padded to full shelves plus one spare shelf.
    const boxes: PlanogramBox[] = itemIds.map((itemId, i) => ({
      itemId,
      sensorMatch: (storeIndex + i) % 5 !== 0,
    }));
    const targetLen =
      (Math.ceil(boxes.length / SHELF_WIDTH) + 1) * SHELF_WIDTH;
    while (boxes.length < targetLen) {
      boxes.push({ itemId: null, sensorMatch: true });
    }
    seed.planograms.push({ storeId, boxes });

    // Historical completed restock sessions, so the shrink report reconciles
    // real counts against the live backend rather than an empty page.
    const covered = storeInventory.slice(0, HISTORY_SLOTS_PER_SESSION);
    HISTORY_SESSION_DAYS.forEach((daysAgo, sessionIdx) => {
      const sessionId = uuid();
      const completedMs = nowMs - daysAgo * MS_PER_DAY;
      seed.restockSessions.push({
        id: sessionId,
        storeId,
        startedAt: new Date(completedMs - 20 * 60 * 1000),
        completedAt: new Date(completedMs),
        actor: 'Field tech',
        notes: null,
      });

      covered.forEach((item, i) => {
        const expectedQty = Math.max(2, Math.round(item.capacity * 0.5));
        const bucket = (i + sessionIdx) % 4;

        let countedQty: number | null = expectedQty;
        let removed = 0;
        let removalReason: string | null = null;

        if (bucket === 0) {
          // Unexplained shrink, scaled per store for a real worst-first ranking.
          const missing = Math.min(expectedQty, 1 + storeIndex + (i % 2));
          countedQty = Math.max(0, expectedQty - missing);
        } else if (bucket === 1) {
          removed = 1 + (i % 2);
          removalReason = REMOVAL_REASONS[i % REMOVAL_REASONS.length];
        } else if (bucket === 2) {
          countedQty = null;
        }

        const added = Math.max(0, item.capacity - expectedQty);
        seed.restockLines.push({
          id: uuid(),
          sessionId,
          itemId: item.id,
          expectedQty,
          countedQty,
          added,
          removed,
          removalReason,
          resultingStock: resultingStock(
            { expectedQty, countedQty, added, removed },
            item.capacity,
          ),
        });
      });
    });
  });

  return seed;
}
