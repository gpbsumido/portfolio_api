import { z } from 'zod';

// Wire contract for POST /draft-results. Bounds keep a runaway or malicious
// client from writing an unbounded payload: a 12-team, 15-round draft is ~180
// picks and the largest plausible league (20 teams x 30 rounds) is 600, so 600
// is realistic headroom. The 100kb body limit in app.ts is the outer backstop.
const pickSchema = z.object({
  overall: z.number().int().min(0),
  teamIdx: z.number().int().min(0),
  playerId: z.string().min(1),
  name: z.string().min(1),
  pos: z.string().min(1).max(8),
  source: z.enum(['user', 'sim', 'keeper', 'espn']),
  keeper: z.boolean(),
});

const standingsSchema = z.object({
  rows: z
    .array(z.object({ teamIdx: z.number().int().min(0), starterPts: z.number() }))
    .max(64),
  myRank: z.number().int().min(1).nullable(),
});

export const resultInputSchema = z.object({
  clientDraftId: z.string().min(1).max(200),
  sport: z.string().min(1).max(16),
  numTeams: z.number().int().min(2).max(64),
  rounds: z.number().int().min(1).max(40),
  mySlot: z.number().int().min(0).max(63),
  mode: z.enum(['practice', 'companion']),
  fullySim: z.boolean(),
  humanPickCount: z.number().int().min(0).max(600),
  teamNames: z.string().max(4000),
  picks: z.array(pickSchema).min(1).max(600),
  standings: standingsSchema,
  // Manual projection tweaks (Tiers-tab +/- deltas) in effect at draft time.
  projAdjustments: z
    .array(
      z.object({
        playerId: z.string().min(1),
        name: z.string().min(1),
        pos: z.string().min(1).max(8),
        delta: z.number(),
      }),
    )
    .max(600)
    .default([]),
});

// The extension batches finished drafts and sends them in ONE request per
// 10-minute flush; the server splits the batch and upserts each.
export const resultBatchSchema = z.object({
  results: z.array(resultInputSchema).min(1).max(500),
});

export const listResultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // full=true returns the complete rows (picks + standings), for the Elite
  // "download every result" export. Default is the lightweight summary.
  full: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
});

export type ResultInputBody = z.infer<typeof resultInputSchema>;
export type ResultBatchBody = z.infer<typeof resultBatchSchema>;
export type ListResultsQuery = z.infer<typeof listResultsQuerySchema>;
