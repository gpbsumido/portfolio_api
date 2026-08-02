// ---------------------------------------------------------------------------
// Operator module — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import type {
  OperatorActivityEvent,
  OperatorAlert,
  OperatorInventoryItem,
  OperatorPromotion,
  OperatorRestockLine,
  OperatorRestockSession,
  OperatorStore,
} from '../../config/drizzle/schema.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { buildBuckets, roundCents, windowStart } from './analytics.js';
import { assembleFleetSummary } from './fleet-summary.js';
import * as repo from './repository.js';
import { comparePerformance, promotionStatus } from './promotions.js';
import { countStatusOf } from './restock.js';
import {
  type CompleteSessionInput,
  type PlanogramUpdateInput,
  type PromotionInput,
  type RestockInput,
  type RestockLineInputBody,
  salesGranularitySchema,
  timeZoneSchema,
} from './schemas.js';
import { FALLBACK_ZONE, resolveStoreTimezone } from './timezone.js';
import type {
  ActivityEventDto,
  AlertDto,
  FleetSalesAnalyticsDto,
  InventoryItemDto,
  PlanogramBox,
  PromotionDto,
  RestockLineDto,
  RestockSessionDto,
  SalesGranularity,
  StoreDto,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const log = createModuleLogger('operator');

const DEFAULT_ACTOR = 'operator@smartstore.example';
const QUICK_FILL_ACTOR = 'operator@smartstore.example';
const QUICK_FILL_NOTE = 'Quick fill to capacity (no physical count)';

const ONLINE_PING_MS = 30_000; // ~30s ago -> "strong signal"
const STALE_PING_MS = 7 * 60_000; // 7min ago -> the degraded/offline demo tier

/**
 * The stored last_ping is static seed data; a real device reports continuously.
 * To keep the freshness indicators meaningful (online reads as a strong recent
 * signal, degraded/offline reads as stale) instead of every store aging into
 * "offline" as time passes since the seed, synthesize a recent ping per read
 * from the store's status. Mirrors the demo's previous in-memory behavior.
 */
function freshLastPing(status: string): string {
  const offset = status === 'online' ? ONLINE_PING_MS : STALE_PING_MS;
  return new Date(Date.now() - offset).toISOString();
}

function param(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0];
  return val ?? '';
}

/** Resolve the granularity query param, defaulting to month on anything odd. */
function resolveGranularity(raw: string): SalesGranularity {
  const parsed = salesGranularitySchema.safeParse(raw);
  return parsed.success ? parsed.data : 'month';
}

/**
 * Resolve the tz query param.
 *
 * Absent means UTC, which is what every bucket already resolved to, so a client
 * that has not been updated sees exactly what it saw before. Present but bogus
 * is a 400 rather than a silent fallback: a wrong zone shifts every boundary in
 * the response, and a chart that is quietly hours out is worse than an error.
 */
function resolveZone(raw: string): string {
  if (!raw) return FALLBACK_ZONE;

  const parsed = timeZoneSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`unknown IANA time zone: ${raw}`);
  }
  return parsed.data;
}

function toStoreDto(row: OperatorStore): StoreDto {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    province: row.province,
    timezone: resolveStoreTimezone(row),
    status: row.status,
    temperature: row.temperature,
    uptime: row.uptime,
    revenue24h: row.revenue24h,
    lastPing: freshLastPing(row.status),
  };
}

function toPromotionDto(row: OperatorPromotion, now: Date): PromotionDto {
  return {
    id: row.id,
    storeId: row.storeId,
    productName: row.productName,
    percent: row.percent,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    // Derived per read, never stored, so it cannot go stale between cron runs.
    status: promotionStatus(row, now),
  };
}

function toSessionDto(row: OperatorRestockSession): RestockSessionDto {
  return {
    id: row.id,
    storeId: row.storeId,
    startedAt: (row.startedAt ?? new Date()).toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    actor: row.actor,
    notes: row.notes,
  };
}

/**
 * The count status is derived here rather than stored, so it can never drift
 * from the counted/expected pair it describes.
 */
function toLineDto(row: OperatorRestockLine): RestockLineDto {
  return {
    id: row.id,
    sessionId: row.sessionId,
    itemId: row.itemId,
    expectedQty: row.expectedQty,
    countedQty: row.countedQty,
    added: row.added,
    removed: row.removed,
    removalReason: row.removalReason,
    resultingStock: row.resultingStock,
    countStatus: countStatusOf(row),
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

  /**
   * POST /api/operator/stores/:storeId/restock — the one-tap fill.
   *
   * Kept, because turning a bulk "top everything up" into a six-step wizard
   * would be a worse product. But it no longer writes inventory directly: it
   * opens a session, records a line per item, and completes it, so quick-fill
   * leaves the same audit trail as a walked shelf. One write path, no bypass.
   *
   * The response shape is unchanged for the existing client.
   */
  async restock(req: Request, res: Response, next: NextFunction) {
    try {
      const storeId = param(req.params.storeId);
      const { itemIds } = req.body as RestockInput;

      const store = await repo.getStore(storeId);
      if (!store) throw new NotFoundError('store not found');

      const inventory = await repo.listInventory(storeId);
      const wanted = new Set(itemIds);
      const targets = inventory.filter((row) => wanted.has(row.id));

      const session = await repo.openSession(storeId, QUICK_FILL_ACTOR);
      for (const target of targets) {
        await repo.upsertLine(session.id, target.id, {
          expectedQty: target.currentStock,
          // Not counted: nobody looked at the shelf, they pressed a button.
          countedQty: null,
          added: Math.max(target.capacity - target.currentStock, 0),
          removed: 0,
          removalReason: null,
        });
      }

      const applied = await repo.completeSession(session.id, QUICK_FILL_NOTE);
      if (!applied) throw new NotFoundError('restock session not found');

      res.json({
        items: applied.items.map(toInventoryDto),
        activity: toActivityDto(applied.activity),
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/operator/stores/:storeId/restock-sessions — open a session. */
  async openRestockSession(req: Request, res: Response, next: NextFunction) {
    try {
      const storeId = param(req.params.storeId);
      const store = await repo.getStore(storeId);
      if (!store) throw new NotFoundError('store not found');

      const session = await repo.openSession(storeId, DEFAULT_ACTOR);
      res.status(201).json({ session: toSessionDto(session) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/stores/:storeId/restock-sessions — history. */
  async listRestockSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const sessions = await repo.listSessions(param(req.params.storeId));
      res.json({ sessions: sessions.map(toSessionDto) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/restock-sessions/:sessionId — session plus lines. */
  async getRestockSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = param(req.params.sessionId);
      const session = await repo.getSession(sessionId);
      if (!session) throw new NotFoundError('restock session not found');

      const lines = await repo.listSessionLines(sessionId);
      res.json({
        session: toSessionDto(session),
        lines: lines.map(toLineDto),
      });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/operator/restock-sessions/:sessionId/lines/:itemId. */
  async putRestockLine(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = param(req.params.sessionId);
      const session = await repo.getSession(sessionId);
      if (!session) throw new NotFoundError('restock session not found');
      if (session.completedAt) {
        throw new ConflictError('restock session is already complete');
      }

      const body = req.body as RestockLineInputBody;
      const line = await repo.upsertLine(sessionId, param(req.params.itemId), {
        expectedQty: body.expectedQty,
        countedQty: body.countedQty,
        added: body.added,
        removed: body.removed,
        removalReason: body.removalReason,
      });

      res.json({ line: toLineDto(line) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/operator/restock-sessions/:sessionId/complete.
   *
   * A second completion is a 409 rather than a no-op. A double submit from a
   * phone with a flaky connection is the likeliest failure here, and applying
   * the adds and removes twice would silently corrupt the shelf.
   */
  async completeRestockSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const sessionId = param(req.params.sessionId);
      const session = await repo.getSession(sessionId);
      if (!session) throw new NotFoundError('restock session not found');
      if (session.completedAt) {
        throw new ConflictError('restock session is already complete');
      }

      const { notes } = req.body as CompleteSessionInput;
      const applied = await repo.completeSession(sessionId, notes);
      if (!applied) throw new NotFoundError('restock session not found');

      res.json({
        session: toSessionDto(applied.session),
        lines: applied.lines.map(toLineDto),
        items: applied.items.map(toInventoryDto),
        activity: toActivityDto(applied.activity),
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

  /** GET /api/operator/stores/:storeId/promotions — with derived status. */
  async listPromotions(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await repo.listPromotions(param(req.params.storeId));
      const now = new Date();
      res.json({ promotions: rows.map((row) => toPromotionDto(row, now)) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/operator/stores/:storeId/promotions — schedule one.
   *
   * Emits a price-update activity event. That type has been in the enum since
   * the beginning with a label, a colour and an icon, and nothing has ever
   * created one. This is the write path it was waiting for.
   */
  async createPromotion(req: Request, res: Response, next: NextFunction) {
    try {
      const storeId = param(req.params.storeId);
      const store = await repo.getStore(storeId);
      if (!store) throw new NotFoundError('store not found');

      const body = req.body as PromotionInput;
      const promotion = await repo.insertPromotion({
        storeId,
        productName: body.productName,
        percent: body.percent,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        actor: DEFAULT_ACTOR,
      });

      const target = body.productName ?? 'every product';
      await repo.insertActivity({
        storeId,
        type: 'price-update',
        description: `Scheduled ${body.percent}% off ${target}`,
        actor: DEFAULT_ACTOR,
      });

      res
        .status(201)
        .json({ promotion: toPromotionDto(promotion, new Date()) });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/operator/promotions/:promotionId/end — stop it now. */
  async endPromotion(req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      // Ended, not deleted: the history is the point of persisting these.
      const ended = await repo.endPromotion(param(req.params.promotionId), now);
      if (!ended) throw new NotFoundError('promotion not found');

      res.json({ promotion: toPromotionDto(ended, now) });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/operator/promotions/:promotionId/performance.
   *
   * A before-and-after, not attribution. The response carries both raw totals so
   * the client can show them rather than only a headline delta.
   */
  async promotionPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const promotion = await repo.getPromotion(param(req.params.promotionId));
      if (!promotion) throw new NotFoundError('promotion not found');

      const now = new Date();
      const windowStart = promotion.startsAt;
      const windowEnd = promotion.endsAt ?? now;
      const span = windowEnd.getTime() - windowStart.getTime();
      const sales = await repo.salesInWindow(
        promotion.storeId,
        new Date(windowStart.getTime() - span),
        windowEnd,
      );

      const comparison = comparePerformance(
        promotion,
        sales,
        windowStart,
        windowEnd,
      );

      res.json({
        promotion: toPromotionDto(promotion, now),
        ...comparison,
        note: 'Comparison against the equal-length period before this promotion. It is not a claim that the promotion caused the difference.',
      });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/stores/:storeId/planogram — the shelf layout. */
  async getPlanogram(req: Request, res: Response, next: NextFunction) {
    try {
      const boxes = await repo.getPlanogram(param(req.params.storeId));
      res.json({ slots: boxes });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/operator/stores/:storeId/planogram — rearrange or re-sync. */
  async updatePlanogram(req: Request, res: Response, next: NextFunction) {
    try {
      const storeId = param(req.params.storeId);
      const body = req.body as PlanogramUpdateInput;

      let boxes: PlanogramBox[];
      if ('boxes' in body) {
        boxes = await repo.setPlanogram(storeId, body.boxes);
      } else {
        const current = await repo.getPlanogram(storeId);
        const updated = current.map((box) =>
          box.itemId === body.resyncItemId
            ? { ...box, sensorMatch: true }
            : box,
        );
        boxes = await repo.setPlanogram(storeId, updated);
      }

      res.json({ slots: boxes });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/fleet-summary — aggregated per-store health + trend. */
  async fleetSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const timeZone = resolveZone(param(req.query.tz as string));
      const now = new Date();
      const since = new Date(now.getTime() - DAY_MS);
      const [stores, alertStats, inventoryStats, trend] = await Promise.all([
        repo.listStores(),
        repo.alertStatsByStore(),
        repo.inventoryStatsByStore(),
        repo.alertHourlyTrend(since, timeZone),
      ]);
      res.json(
        assembleFleetSummary(
          stores,
          alertStats,
          inventoryStats,
          trend,
          now,
          timeZone,
        ),
      );
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/operator/sales-analytics — fleet-wide sales, aggregated in SQL. */
  async salesAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const granularity = resolveGranularity(param(req.query.granularity as string));
      const timeZone = resolveZone(param(req.query.tz as string));
      const now = new Date();
      const since = windowStart(granularity, now, timeZone);

      const startedAt = Date.now();
      const [periodRows, storeRows] = await Promise.all([
        repo.salesByPeriod(granularity, since, timeZone),
        repo.salesByStore(since),
      ]);
      // The efficiency win we moved here for: two grouped queries, not a full
      // table scan summed in the app. Surface the timing for the dev-thoughts.
      log.info(
        { granularity, timeZone, ms: Date.now() - startedAt, periods: periodRows.length },
        'fleet sales analytics aggregated in SQL',
      );

      const buckets = buildBuckets(granularity, periodRows, now, timeZone);
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
