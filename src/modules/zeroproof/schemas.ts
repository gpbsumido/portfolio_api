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
