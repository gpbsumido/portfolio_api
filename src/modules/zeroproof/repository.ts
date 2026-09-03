// ---------------------------------------------------------------------------
// ZeroProof wallets — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  type ZeroproofBet,
  type ZeroproofWallet,
  zeroproofBets,
  zeroproofEvents,
  zeroproofLedgerEntries,
  zeroproofOddsSnapshots,
  zeroproofWallets,
} from '../../config/drizzle/schema.js';
import { ConflictError } from '../../shared/errors/index.js';
import { depositLines, deriveBalanceCents, stakeLines } from './ledger.js';
import { canAfford } from './placement.js';
import type { MarketKey, NormalizedOutcome } from './providers/types.js';
import type { EventWithLines, WalletMode, WalletWithBalance } from './types.js';

interface OpenWalletInput {
  userSub: string;
  mode: WalletMode;
  principalCents: number;
  lockStart: Date;
  lockEnd: Date;
}

/**
 * Open a wallet and record its deposit in one transaction: the wallet row plus
 * the deposit's double-entry ledger pair. Refuses a second active wallet of the
 * same mode (the DB's partial unique index is the backstop against a race).
 */
export async function openWallet(input: OpenWalletInput): Promise<WalletWithBalance> {
  return db.transaction(async (tx) => {
    const active = await tx
      .select({ id: zeroproofWallets.id })
      .from(zeroproofWallets)
      .where(
        and(
          eq(zeroproofWallets.userSub, input.userSub),
          eq(zeroproofWallets.mode, input.mode),
          eq(zeroproofWallets.status, 'active'),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      throw new ConflictError(`You already have an active ${input.mode} wallet`);
    }

    const [wallet] = await tx
      .insert(zeroproofWallets)
      .values({
        userSub: input.userSub,
        mode: input.mode,
        principalCents: input.principalCents,
        lockStart: input.lockStart,
        lockEnd: input.lockEnd,
      })
      .returning();

    await tx.insert(zeroproofLedgerEntries).values(
      depositLines(input.principalCents).map((line) => ({
        walletId: wallet.id,
        kind: line.kind,
        account: line.account,
        amountCents: line.amountCents,
      })),
    );

    return { ...wallet, balanceCents: input.principalCents };
  });
}

/** The caller's wallets, newest first, each with its derived bettable balance. */
export async function listWallets(userSub: string): Promise<WalletWithBalance[]> {
  const wallets = await db
    .select()
    .from(zeroproofWallets)
    .where(eq(zeroproofWallets.userSub, userSub))
    .orderBy(desc(zeroproofWallets.createdAt));
  if (wallets.length === 0) return [];

  const ids = wallets.map((w) => w.id);
  const entries = await db
    .select({
      walletId: zeroproofLedgerEntries.walletId,
      account: zeroproofLedgerEntries.account,
      amountCents: zeroproofLedgerEntries.amountCents,
    })
    .from(zeroproofLedgerEntries)
    .where(inArray(zeroproofLedgerEntries.walletId, ids));

  return wallets.map((w) => ({
    ...w,
    balanceCents: deriveBalanceCents(entries.filter((e) => e.walletId === w.id)),
  }));
}

interface UpsertEventInput {
  providerKey: string;
  sport: string;
  home: string;
  away: string;
  commenceTime: Date;
}

/** Insert an event or refresh a known one (matched on provider_key). Returns our id. */
export async function upsertEvent(input: UpsertEventInput): Promise<string> {
  const [row] = await db
    .insert(zeroproofEvents)
    .values({
      providerKey: input.providerKey,
      sport: input.sport,
      home: input.home,
      away: input.away,
      commenceTime: input.commenceTime,
    })
    .onConflictDoUpdate({
      target: zeroproofEvents.providerKey,
      set: {
        home: input.home,
        away: input.away,
        commenceTime: input.commenceTime,
        updatedAt: new Date(),
      },
    })
    .returning({ id: zeroproofEvents.id });
  return row.id;
}

interface InsertSnapshotInput {
  eventId: string;
  market: MarketKey;
  outcomes: NormalizedOutcome[];
  fetchedAt?: Date;
}

/** Append one market's lines. Snapshots are never overwritten. */
export async function insertSnapshot(input: InsertSnapshotInput): Promise<void> {
  await db.insert(zeroproofOddsSnapshots).values({
    eventId: input.eventId,
    market: input.market,
    outcomes: input.outcomes,
    ...(input.fetchedAt ? { fetchedAt: input.fetchedAt } : {}),
  });
}

/**
 * Upcoming events (kickoff still ahead) with the latest snapshot per market.
 * Served straight from the DB, so user traffic never touches the vendor.
 */
export async function listUpcomingEventsWithLines(): Promise<EventWithLines[]> {
  const events = await db
    .select()
    .from(zeroproofEvents)
    .where(and(eq(zeroproofEvents.status, 'upcoming'), gt(zeroproofEvents.commenceTime, new Date())))
    .orderBy(asc(zeroproofEvents.commenceTime));
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  const snapshots = await db
    .select()
    .from(zeroproofOddsSnapshots)
    .where(inArray(zeroproofOddsSnapshots.eventId, ids))
    .orderBy(desc(zeroproofOddsSnapshots.fetchedAt));

  return events.map((event) => {
    const seen = new Set<string>();
    const markets = [];
    // Snapshots come newest-first, so the first row per market is the latest line.
    for (const snap of snapshots) {
      if (snap.eventId !== event.id || seen.has(snap.market)) continue;
      seen.add(snap.market);
      markets.push({ market: snap.market, fetchedAt: snap.fetchedAt, outcomes: snap.outcomes });
    }
    return {
      id: event.id,
      sport: event.sport,
      home: event.home,
      away: event.away,
      commenceTime: event.commenceTime,
      status: event.status,
      markets,
    };
  });
}

/** A single wallet by id, for ownership and lock-window checks. */
export async function getWalletById(walletId: string): Promise<ZeroproofWallet | undefined> {
  const rows = await db.select().from(zeroproofWallets).where(eq(zeroproofWallets.id, walletId)).limit(1);
  return rows[0];
}

/** The latest snapshot for one market of an event, or null if none exists yet. */
export async function getLatestSnapshot(
  eventId: string,
  market: MarketKey,
): Promise<{ outcomes: NormalizedOutcome[]; fetchedAt: Date } | null> {
  const rows = await db
    .select({
      outcomes: zeroproofOddsSnapshots.outcomes,
      fetchedAt: zeroproofOddsSnapshots.fetchedAt,
    })
    .from(zeroproofOddsSnapshots)
    .where(and(eq(zeroproofOddsSnapshots.eventId, eventId), eq(zeroproofOddsSnapshots.market, market)))
    .orderBy(desc(zeroproofOddsSnapshots.fetchedAt))
    .limit(1);
  return rows[0] ?? null;
}

interface PlaceBetInput {
  walletId: string;
  eventId: string;
  market: MarketKey;
  selection: string;
  oddsAmerican: number;
  lineValue: number | null;
  stakeCents: number;
}

export type PlaceBetResult =
  | { ok: true; bet: ZeroproofBet }
  | { ok: false; availableCents: number };

/**
 * Debit the stake and record the bet in one transaction. The available-balance
 * floor is checked here, against the live derived balance, so two concurrent
 * bets can't both spend the same cents. Returns ok:false (with the balance) when
 * the wallet can't cover it, so the caller answers 402 rather than record a bet
 * nobody paid for.
 */
export async function placeBet(input: PlaceBetInput): Promise<PlaceBetResult> {
  return db.transaction(async (tx) => {
    const entries = await tx
      .select({ account: zeroproofLedgerEntries.account, amountCents: zeroproofLedgerEntries.amountCents })
      .from(zeroproofLedgerEntries)
      .where(eq(zeroproofLedgerEntries.walletId, input.walletId));
    const availableCents = deriveBalanceCents(entries);
    if (!canAfford(availableCents, input.stakeCents)) {
      return { ok: false, availableCents };
    }

    const [bet] = await tx
      .insert(zeroproofBets)
      .values({
        walletId: input.walletId,
        eventId: input.eventId,
        market: input.market,
        selection: input.selection,
        oddsAmerican: input.oddsAmerican,
        lineValue: input.lineValue != null ? String(input.lineValue) : null,
        stakeCents: input.stakeCents,
      })
      .returning();

    await tx.insert(zeroproofLedgerEntries).values(
      stakeLines(input.stakeCents).map((line) => ({
        walletId: input.walletId,
        betId: bet.id,
        kind: line.kind,
        account: line.account,
        amountCents: line.amountCents,
      })),
    );

    return { ok: true, bet };
  });
}
