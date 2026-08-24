import { z } from 'zod';

/** Card rarities, matching the paul-explore generator. */
export const raritySchema = z.enum(['common', 'uncommon', 'rare', 'sir']);
export const sportSchema = z.enum(['nba', 'wnba', 'nfl']);

/**
 * A card in a pack. The BFF generates these from real ESPN data and draws the
 * pack server-side, so this is trusted server-to-server input — the shape is
 * validated, but the contents aren't re-derived here.
 */
export const pulledCardSchema = z.object({
  id: z.string().min(1).max(120),
  playerId: z.number().int(),
  playerName: z.string().min(1).max(120),
  points: z.number(),
  rarity: raritySchema,
  sport: sportSchema,
  periodId: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  subtitle: z.string().min(1).max(120),
  imageUrl: z.string().url().max(500),
  opponent: z.string().max(12).optional(),
  home: z.boolean().optional(),
});

/** POST /api/tcg/packs/open — the drawn pack. Cost is server-authoritative. */
export const openPackSchema = z.object({
  cards: z.array(pulledCardSchema).min(1).max(20),
});

export type PulledCardInput = z.infer<typeof pulledCardSchema>;
export type OpenPackInput = z.infer<typeof openPackSchema>;
