// ---------------------------------------------------------------------------
// Operator module — request schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const salesGranularitySchema = z.enum(['day', 'week', 'month', 'year']);

export type SalesGranularityInput = z.infer<typeof salesGranularitySchema>;

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
