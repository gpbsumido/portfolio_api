// ---------------------------------------------------------------------------
// ZeroProof wallets — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  zeroproofEvents,
  zeroproofLedgerEntries,
  zeroproofOddsSnapshots,
  zeroproofWallets,
} from '../../config/drizzle/schema.js';
import { ConflictError } from '../../shared/errors/index.js';
import { depositLines, deriveBalanceCents } from './ledger.js';
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
