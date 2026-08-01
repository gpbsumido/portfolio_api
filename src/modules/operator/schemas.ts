// ---------------------------------------------------------------------------
// Operator module — request schemas
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const salesGranularitySchema = z.enum(['day', 'week', 'month', 'year']);

export type SalesGranularityInput = z.infer<typeof salesGranularitySchema>;
