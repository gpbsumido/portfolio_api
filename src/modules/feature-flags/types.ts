// ---------------------------------------------------------------------------
// Feature-flags module — TypeScript types derived from the Zod contract.
//
// Everything is inferred from schemas.ts so the wire format and the
// compile-time types can never disagree.
// ---------------------------------------------------------------------------

import type { z } from 'zod';
import type {
  auditActionSchema,
  auditEntrySchema,
  environmentConfigSchema,
  environmentSchema,
  flagKindSchema,
  flagSchema,
  rolloutWeightSchema,
  variationSchema,
} from './schemas.js';

export type Environment = z.infer<typeof environmentSchema>;
export type FlagKind = z.infer<typeof flagKindSchema>;
export type Variation = z.infer<typeof variationSchema>;
export type RolloutWeight = z.infer<typeof rolloutWeightSchema>;
export type EnvironmentConfig = z.infer<typeof environmentConfigSchema>;
export type Flag = z.infer<typeof flagSchema>;
export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** GET /api/feature-flags response body. */
export interface FlagsResponse {
  flags: Flag[];
  environments: Environment[];
}

/** GET /api/feature-flags/audit response body. */
export interface AuditResponse {
  audit: AuditEntry[];
}
