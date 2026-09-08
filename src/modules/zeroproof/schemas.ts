import { z } from 'zod';

/** Season or Challenge. Challenge is a fixed-$100 mode; Season takes any deposit. */
export const walletModeSchema = z.enum(['season', 'challenge']);

/**
 * POST /api/zeroproof/wallets. `depositCents` is honored for Season (with a $20
 * minimum enforced in the service, where the mode is known); Challenge ignores
 * it and is forced to $100.
 */
export const openWalletSchema = z.object({
  mode: walletModeSchema,
  depositCents: z.number().int().positive().optional(),
});

export type OpenWalletInput = z.infer<typeof openWalletSchema>;

/** The betting markets we take. */
export const marketSchema = z.enum(['h2h', 'spread', 'total']);

/** POST /api/zeroproof/bets. Ids are opaque strings; the DB lookups validate them. */
export const placeBetSchema = z.object({
  walletId: z.string().min(1),
  eventId: z.string().min(1),
  market: marketSchema,
  selection: z.string().min(1).max(120),
  stakeCents: z.number().int().positive(),
});

export type PlaceBetInput = z.infer<typeof placeBetSchema>;

/** How a league ends: first to a target, or highest balance at a deadline. */
export const winConditionSchema = z.enum(['threshold', 'timeline']);

/** Who can find and join a league. */
export const visibilitySchema = z.enum(['public', 'invite']);

/**
 * POST /api/zeroproof/leagues. Cross-field rules (target above the bankroll, a
 * future deadline, member bounds) are enforced in the service via
 * `validateLeagueRules`, where every field is known. `endsAt` is an ISO string.
 */
export const createLeagueSchema = z.object({
  name: z.string().min(1).max(80),
  visibility: visibilitySchema,
  startingBankrollCents: z.number().int().positive(),
  maxMembers: z.number().int().positive(),
  winCondition: winConditionSchema,
  thresholdCents: z.number().int().positive().optional(),
  endsAt: z.string().datetime().optional(),
  // Optional ESPN binding — set all three to restrict the league to one ESPN
  // fantasy league's matchups. The service enforces all-or-nothing.
  espnGame: z.string().min(1).max(8).optional(),
  espnLeagueId: z.string().min(1).max(40).optional(),
  espnSeason: z.string().regex(/^\d{4}$/).optional(),
});

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

/** POST /api/zeroproof/leagues/:id/join. A code is required only for invite leagues. */
export const joinLeagueSchema = z.object({
  joinCode: z.string().min(1).max(40).optional(),
});

export type JoinLeagueInput = z.infer<typeof joinLeagueSchema>;

/** POST /api/zeroproof/espn-leagues (admin) — register a league for ingestion. */
export const addEspnLeagueSchema = z.object({
  // ESPN game code: ffl (football), fba (basketball), flb (baseball), fhl (hockey).
  game: z.string().regex(/^[a-z]{3}$/),
  leagueId: z.string().min(1).max(40),
  season: z.string().regex(/^\d{4}$/),
  label: z.string().max(80).optional(),
});

export type AddEspnLeagueInput = z.infer<typeof addEspnLeagueSchema>;
