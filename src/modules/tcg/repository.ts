// ---------------------------------------------------------------------------
// Fantasy TCG economy — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { desc, eq } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { type CardPull, cardPulls, cardWallets } from '../../config/drizzle/schema.js';
import type { PulledCardInput } from './schemas.js';

export async function getWallet(
  userSub: string,
): Promise<{ balance: number; lastClaimDate: string | null }> {
  const rows = await db.select().from(cardWallets).where(eq(cardWallets.userSub, userSub)).limit(1);
  const row = rows[0];
  return row ? { balance: row.balance, lastClaimDate: row.lastClaimDate } : { balance: 0, lastClaimDate: null };
}

/**
 * Grant the daily coins once per UTC day. Idempotent: a second call on the same
 * day is a no-op that returns the unchanged balance. Runs in a transaction so a
 * double-tap can't double-grant.
 */
export async function claimDaily(
  userSub: string,
  today: string,
  grant: number,
): Promise<{ claimed: boolean; balance: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(cardWallets).where(eq(cardWallets.userSub, userSub)).limit(1);
    const current = rows[0];
    if (!current) {
      await tx.insert(cardWallets).values({ userSub, balance: grant, lastClaimDate: today });
      return { claimed: true, balance: grant };
    }
    if (current.lastClaimDate === today) return { claimed: false, balance: current.balance };
    const balance = current.balance + grant;
    await tx
      .update(cardWallets)
      .set({ balance, lastClaimDate: today, updatedAt: new Date() })
      .where(eq(cardWallets.userSub, userSub));
    return { claimed: true, balance };
  });
}

/**
 * Debit the pack cost and record the pulled cards atomically. Returns ok:false
 * (with the current balance) when the wallet can't afford it, so the caller can
 * answer 402 rather than record a pack nobody paid for.
 */
export async function openPack(
  userSub: string,
  cost: number,
  cards: PulledCardInput[],
): Promise<{ ok: boolean; balance: number; added: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(cardWallets).where(eq(cardWallets.userSub, userSub)).limit(1);
    const balance = rows[0]?.balance ?? 0;
    if (!rows[0]) await tx.insert(cardWallets).values({ userSub, balance: 0 });
    if (balance < cost) return { ok: false, balance, added: 0 };

    const newBalance = balance - cost;
    await tx
      .update(cardWallets)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(cardWallets.userSub, userSub));
    await tx.insert(cardPulls).values(
      cards.map((c) => ({
        userSub,
        cardId: c.id,
        sport: c.sport,
        playerId: c.playerId,
        playerName: c.playerName,
        points: Math.round(c.points),
        rarity: c.rarity,
        periodId: c.periodId,
        title: c.title,
        subtitle: c.subtitle,
        imageUrl: c.imageUrl,
        opponent: c.opponent ?? null,
        home: c.home ?? null,
      })),
    );
    return { ok: true, balance: newBalance, added: cards.length };
  });
}

export async function listPulls(userSub: string, limit: number): Promise<CardPull[]> {
  return db
    .select()
    .from(cardPulls)
    .where(eq(cardPulls.userSub, userSub))
    .orderBy(desc(cardPulls.pulledAt))
    .limit(limit);
}
