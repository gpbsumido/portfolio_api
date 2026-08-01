/**
 * Seeds the operator tables with the demo dataset.
 *
 *   pnpm seed:operator
 *
 * Wipes and re-inserts the operator_* tables, so it is safe to re-run. The data
 * itself comes from the pure builder in src/modules/operator/seed-data.ts.
 */

import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { Pool } from 'pg';
import { buildOperatorSeed } from '../../src/modules/operator/seed-data.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function seed(): Promise<void> {
  const data = buildOperatorSeed(randomUUID, new Date());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'TRUNCATE operator_planograms, operator_sales, operator_activity, operator_alerts, operator_inventory, operator_stores RESTART IDENTITY CASCADE',
    );

    for (const s of data.stores) {
      await client.query(
        `INSERT INTO operator_stores
           (id, name, location, province, status, temperature, uptime, revenue_24h, last_ping)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          s.id,
          s.name,
          s.location,
          s.province,
          s.status,
          s.temperature,
          s.uptime,
          s.revenue24h,
          s.lastPing,
        ],
      );
    }

    for (const i of data.inventory) {
      await client.query(
        `INSERT INTO operator_inventory
           (id, store_id, product_name, category, current_stock, capacity, price, last_restocked)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          i.id,
          i.storeId,
          i.productName,
          i.category,
          i.currentStock,
          i.capacity,
          i.price,
          i.lastRestocked,
        ],
      );
    }

    for (const a of data.alerts) {
      await client.query(
        `INSERT INTO operator_alerts
           (id, store_id, severity, category, message, occurred_at, acknowledged)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [a.id, a.storeId, a.severity, a.category, a.message, a.occurredAt, a.acknowledged],
      );
    }

    for (const e of data.activity) {
      await client.query(
        `INSERT INTO operator_activity
           (id, store_id, type, description, occurred_at, actor)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [e.id, e.storeId, e.type, e.description, e.occurredAt, e.actor],
      );
    }

    for (const sale of data.sales) {
      await client.query(
        `INSERT INTO operator_sales
           (id, store_id, product_name, category, unit_price, quantity, total, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          sale.id,
          sale.storeId,
          sale.productName,
          sale.category,
          sale.unitPrice,
          sale.quantity,
          sale.total,
          sale.occurredAt,
        ],
      );
    }

    for (const p of data.planograms) {
      await client.query(
        'INSERT INTO operator_planograms (store_id, boxes) VALUES ($1, $2)',
        [p.storeId, JSON.stringify(p.boxes)],
      );
    }

    await client.query('COMMIT');
    console.log(
      `Seeded operator: ${data.stores.length} stores, ${data.inventory.length} items, ${data.alerts.length} alerts, ${data.activity.length} activity, ${data.sales.length} sales, ${data.planograms.length} planograms.`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    pool.end();
    process.exit(1);
  });
