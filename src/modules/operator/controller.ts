// ---------------------------------------------------------------------------
// Operator module — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import type {
  OperatorActivityEvent,
  OperatorAlert,
  OperatorInventoryItem,
  OperatorStore,
} from '../../config/drizzle/schema.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { buildBuckets, roundCents, windowStart } from './analytics.js';
import * as repo from './repository.js';
import { type RestockInput, salesGranularitySchema } from './schemas.js';
import type {
  ActivityEventDto,
  AlertDto,
  FleetSalesAnalyticsDto,
  InventoryItemDto,
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
    temperature: row.temperature,
    uptime: row.uptime,
    revenue24h: row.revenue24h,
    lastPing: (row.lastPing ?? new Date()).toISOString(),
  };
}

function toInventoryDto(row: OperatorInventoryItem): InventoryItemDto {
  return {
    id: row.id,
    storeId: row.storeId,
    productName: row.productName,
    category: row.category,
    currentStock: row.currentStock,
    capacity: row.capacity,
    price: row.price,
    lastRestocked: row.lastRestocked.toISOString(),
  };
}

function toAlertDto(row: OperatorAlert): AlertDto {
  return {
    id: row.id,
    storeId: row.storeId,
    severity: row.severity,
    category: row.category,
    message: row.message,
    timestamp: row.occurredAt.toISOString(),
    acknowledged: row.acknowledged,
  };
}

function toActivityDto(row: OperatorActivityEvent): ActivityEventDto {
  return {
    id: row.id,
    storeId: row.storeId,
    type: row.type,
    description: row.description,
    timestamp: row.occurredAt.toISOString(),
    actor: row.actor ?? undefined,
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

  /** GET /api/operator/stores/:storeId — one store. */
  async getStore(req: Request, res: Response, next: NextFunction) {
    try {
      const store = await repo.getStore(param(req.params.storeId));
      if (!store) throw new NotFoundError('store not found');
      res.json({ store: toStoreDto(store) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/stores/:storeId/inventory — the store's stock. */
  async listInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await repo.listInventory(param(req.params.storeId));
      res.json({ items: items.map(toInventoryDto) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/operator/stores/:storeId/restock — restock items to capacity. */
  async restock(req: Request, res: Response, next: NextFunction) {
    try {
      const storeId = param(req.params.storeId);
      const { itemIds } = req.body as RestockInput;

      const store = await repo.getStore(storeId);
      if (!store) throw new NotFoundError('store not found');

      const items = await repo.restockItems(storeId, itemIds);
      const activity = await repo.insertActivity({
        storeId,
        type: 'restock',
        description: `Restocked ${items.length} item(s) to full capacity`,
        actor: 'operator@smartstore.example',
      });

      res.json({
        items: items.map(toInventoryDto),
        activity: toActivityDto(activity),
      });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/stores/:storeId/alerts — the store's alerts. */
  async listAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const alerts = await repo.listAlerts(param(req.params.storeId));
      res.json({ alerts: alerts.map(toAlertDto) });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/operator/alerts/:alertId/dismiss — acknowledge an alert. */
  async dismissAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const alert = await repo.dismissAlert(param(req.params.alertId));
      if (!alert) throw new NotFoundError('alert not found');
      res.json({ alert: toAlertDto(alert) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/stores/:storeId/activity — the store's activity feed. */
  async listActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const events = await repo.listActivity(param(req.params.storeId));
      res.json({ events: events.map(toActivityDto) });
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
