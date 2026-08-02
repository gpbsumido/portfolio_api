// ---------------------------------------------------------------------------
// Operator module — request schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';

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
