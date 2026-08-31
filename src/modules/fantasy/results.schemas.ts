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
});

export const listResultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ResultInputBody = z.infer<typeof resultInputSchema>;
export type ListResultsQuery = z.infer<typeof listResultsQuerySchema>;
