// ---------------------------------------------------------------------------
// Operator module — request schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';

import { REMOVAL_REASONS } from './restock.js';
import { isValidTimeZone } from './timezone.js';

export const salesGranularitySchema = z.enum(['day', 'week', 'month', 'year']);

export type SalesGranularityInput = z.infer<typeof salesGranularitySchema>;

/**
 * An IANA zone the runtime actually knows. Unlike `granularity`, which falls
 * back silently, a bad zone is rejected: every bucket boundary depends on it, so
 * a typo would quietly shift a whole chart by hours rather than fail loudly.
 */
export const timeZoneSchema = z
  .string()
  .refine(isValidTimeZone, { message: 'unknown IANA time zone' });

export const storeIdParamSchema = z.object({
  storeId: z.string().uuid(),
});

export const alertIdParamSchema = z.object({
  alertId: z.string().uuid(),
});

export const restockBodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export type RestockInput = z.infer<typeof restockBodySchema>;

// ---------------------------------------------------------------------------
// Restock sessions
// ---------------------------------------------------------------------------

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid(),
});

export const sessionLineParamSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * Constrained rather than free text. "How much did we lose to expiry last
 * month" is the question this whole feature exists to answer, and free text
 * cannot be aggregated.
 */
export const removalReasonSchema = z.enum(REMOVAL_REASONS);

/**
 * A slot's line. `countedQty` is nullable and that is load-bearing: null means
 * the restocker skipped counting, which is a recorded decision.
 *
 * The refine enforces the one rule the schema alone cannot: taking stock off a
 * shelf always needs a reason, because an unexplained removal is
 * indistinguishable from theft.
 */
export const restockLineSchema = z
  .object({
    expectedQty: z.number().int().min(0),
    countedQty: z.number().int().min(0).nullable().default(null),
    added: z.number().int().min(0).default(0),
    removed: z.number().int().min(0).default(0),
    removalReason: removalReasonSchema.nullable().default(null),
  })
  .refine((line) => line.removed === 0 || line.removalReason !== null, {
    message: 'removalReason is required when removing stock',
    path: ['removalReason'],
  });

export type RestockLineInputBody = z.infer<typeof restockLineSchema>;

export const completeSessionSchema = z.object({
  notes: z.string().max(2000).nullable().default(null),
});

export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export const promotionIdParamSchema = z.object({
  promotionId: z.string().uuid(),
});

/**
 * Percent is bounded 1-90: zero is not a promotion and anything approaching 100
 * is a giveaway that is far likelier to be a typo than an intention.
 */
export const promotionBodySchema = z
  .object({
    productName: z.string().min(1).nullable().default(null),
    percent: z.number().int().min(1).max(90),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().default(null),
  })
  .refine(
    (p) => p.endsAt === null || Date.parse(p.endsAt) > Date.parse(p.startsAt),
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  );

export type PromotionInput = z.infer<typeof promotionBodySchema>;

export const planogramBoxSchema = z.object({
  itemId: z.string().uuid().nullable(),
  sensorMatch: z.boolean(),
});

/** A planogram update is either the whole new layout or a single-slot re-sync. */
export const planogramUpdateSchema = z.union([
  z.object({ boxes: z.array(planogramBoxSchema) }),
  z.object({ resyncItemId: z.string().uuid() }),
]);

export type PlanogramUpdateInput = z.infer<typeof planogramUpdateSchema>;
