import { z } from 'zod';

// ---------------------------------------------------------------------------
// Feature-flag domain schemas — the single source of the wire contract.
//
// Ported verbatim from paul-explore's `src/lib/flags-schemas.ts` so the API and
// the console never drift: a flag has typed variations plus per-environment
// config (kill switch, targeting rules, and a weighted fallthrough rollout),
// and the audit log records every change. The engine that evaluates a flag
// against a user context lives in paul-explore; the shapes it needs live here.
// ---------------------------------------------------------------------------

/** The three environments every flag is configured in, promoted left to right. */
export const environmentSchema = z.enum(['development', 'staging', 'production']);

/** A flag is either a simple on/off toggle or a multivariate experiment. */
export const flagKindSchema = z.enum(['boolean', 'multivariate']);

/** A variation value is a JSON primitive so flags can carry config, not just booleans. */
export const variationValueSchema = z.union([z.boolean(), z.string(), z.number()]);

/** One possible value a flag can serve. `key` is stable, `name` is for humans. */
export const variationSchema = z.object({
  key: z.string(),
  name: z.string(),
  value: variationValueSchema,
});

/**
 * A single condition inside a targeting rule. All clauses in a rule are ANDed.
 * `attribute` reads from the context ("key" reads the context key itself).
 */
export const clauseSchema = z.object({
  attribute: z.string(),
  op: z.enum(['in', 'notIn', 'equals', 'contains', 'startsWith', 'endsWith']),
  values: z.array(z.string()).min(1),
});

/**
 * An ordered targeting rule. The first rule whose clauses all match wins and
 * serves its variation, short-circuiting the fallthrough.
 */
export const targetingRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  clauses: z.array(clauseSchema).min(1),
  serve: z.string(),
});

/** One slice of a weighted rollout. Weights across a rollout sum to 100. */
export const rolloutWeightSchema = z.object({
  variation: z.string(),
  weight: z.number().int().min(0).max(100),
});

/**
 * Per-environment configuration for a flag. `enabled` is the kill switch: when
 * false the flag always serves `offVariation`. When enabled, targeting rules
 * are checked in order, then the weighted `fallthrough` rollout decides the
 * rest via deterministic per-user bucketing.
 */
export const environmentConfigSchema = z.object({
  enabled: z.boolean(),
  offVariation: z.string(),
  rules: z.array(targetingRuleSchema),
  fallthrough: z.array(rolloutWeightSchema).min(1),
});

/** A feature flag and its configuration across every environment. */
export const flagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  kind: flagKindSchema,
  tags: z.array(z.string()),
  variations: z.array(variationSchema).min(2),
  createdAt: z.string().datetime(),
  environments: z.record(environmentSchema, environmentConfigSchema),
});

// ---------------------------------------------------------------------------
// Evaluation (shapes only — the engine itself lives in paul-explore)
// ---------------------------------------------------------------------------

/** The user/entity a flag is evaluated against. `key` drives sticky bucketing. */
export const evaluationContextSchema = z.object({
  key: z.string().min(1),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/** Why a flag resolved to the value it did — the explainability trail. */
export const evaluationReasonSchema = z.enum([
  'OFF',
  'RULE_MATCH',
  'FALLTHROUGH',
  'FALLTHROUGH_ROLLOUT',
]);

export const evaluationResultSchema = z.object({
  flagKey: z.string(),
  variationKey: z.string(),
  value: variationValueSchema,
  reason: evaluationReasonSchema,
  /** Zero-based index of the rule that matched, when reason is RULE_MATCH. */
  ruleIndex: z.number().int().min(0).optional(),
  /** The 0-99.99 bucket the context fell into, when a rollout decided the value. */
  bucket: z.number().min(0).lt(100).optional(),
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/** The kinds of change recorded in the audit trail. */
export const auditActionSchema = z.enum(['enabled', 'disabled', 'rollout-changed']);

/** One recorded change to a flag, newest first in the log. */
export const auditEntrySchema = z.object({
  id: z.string(),
  flagKey: z.string(),
  environment: environmentSchema,
  action: auditActionSchema,
  summary: z.string(),
  actor: z.string(),
  timestamp: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// API request shapes
// ---------------------------------------------------------------------------

/** The `:flagKey` path param on the PATCH route. */
export const flagKeyParamSchema = z.object({
  flagKey: z.string().min(1),
});

/** PATCH body for a flag's per-environment config. All fields optional. */
export const updateFlagBodySchema = z
  .object({
    environment: environmentSchema,
    enabled: z.boolean().optional(),
    fallthrough: z.array(rolloutWeightSchema).min(1).optional(),
  })
  .refine((b) => b.enabled !== undefined || b.fallthrough !== undefined, {
    message: 'Provide at least one of enabled or fallthrough',
  });

export type UpdateFlagBody = z.infer<typeof updateFlagBodySchema>;
export type FlagKeyParam = z.infer<typeof flagKeyParamSchema>;
