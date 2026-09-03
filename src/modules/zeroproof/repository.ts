// ---------------------------------------------------------------------------
// ZeroProof wallets — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import {
  type ZeroproofBet,
  type ZeroproofEvent,
  type ZeroproofWallet,
  zeroproofAccoladeAwards,
  zeroproofBets,
  zeroproofEvents,
  zeroproofLedgerEntries,
  zeroproofOddsSnapshots,
  zeroproofReferralClicks,
  zeroproofWallets,
} from '../../config/drizzle/schema.js';
import { ConflictError } from '../../shared/errors/index.js';
import {
  depositLines,
  deriveBalanceCents,
  refundPrincipalLines,
  settlementLines,
  stakeLines,
  yieldLines,
} from './ledger.js';
import { canAfford } from './placement.js';
import type { MarketKey, NormalizedOutcome, NormalizedResult } from './providers/types.js';
import type { Grade } from './settlement.js';
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

/** An event by the vendor's id — the settler's entry point. */
export async function getEventByProviderKey(providerKey: string): Promise<ZeroproofEvent | undefined> {
  const rows = await db
    .select()
    .from(zeroproofEvents)
    .where(eq(zeroproofEvents.providerKey, providerKey))
    .limit(1);
  return rows[0];
}

/** The still-open bets on an event — what the settler grades. */
export async function getOpenBetsForEvent(eventId: string): Promise<ZeroproofBet[]> {
  return db
    .select()
    .from(zeroproofBets)
    .where(and(eq(zeroproofBets.eventId, eventId), eq(zeroproofBets.status, 'open')));
}

/** Every bet the caller has placed, newest first — full rows for the DTO. */
export async function getBetsForUser(userSub: string): Promise<ZeroproofBet[]> {
  const wallets = await db
    .select({ id: zeroproofWallets.id })
    .from(zeroproofWallets)
    .where(eq(zeroproofWallets.userSub, userSub));
  if (wallets.length === 0) return [];
  return db
    .select()
    .from(zeroproofBets)
    .where(
      inArray(
        zeroproofBets.walletId,
        wallets.map((w) => w.id),
      ),
    )
    .orderBy(desc(zeroproofBets.placedAt));
}

/** The closing line: the latest snapshot for a market taken before kickoff. */
export async function getClosingSnapshot(
  eventId: string,
  market: MarketKey,
  commenceTime: Date,
): Promise<{ outcomes: NormalizedOutcome[] } | null> {
  const rows = await db
    .select({ outcomes: zeroproofOddsSnapshots.outcomes })
    .from(zeroproofOddsSnapshots)
    .where(
      and(
        eq(zeroproofOddsSnapshots.eventId, eventId),
        eq(zeroproofOddsSnapshots.market, market),
        lte(zeroproofOddsSnapshots.fetchedAt, commenceTime),
      ),
    )
    .orderBy(desc(zeroproofOddsSnapshots.fetchedAt))
    .limit(1);
  return rows[0] ?? null;
}

interface SettleBetInput {
  bet: Pick<ZeroproofBet, 'id' | 'walletId' | 'stakeCents' | 'oddsAmerican'>;
  grade: Grade;
  closingOdds: number | null;
  clv: number | null;
}

/**
 * Settle one bet: stamp its grade, closing line and CLV, and write the payout
 * ledger — all in one transaction, so a bet is never marked graded without its
 * money moving.
 */
export async function settleBet(input: SettleBetInput): Promise<void> {
  const { bet, grade, closingOdds, clv } = input;
  await db.transaction(async (tx) => {
    await tx
      .update(zeroproofBets)
      .set({
        status: grade,
        settledAt: new Date(),
        closingOddsAmerican: closingOdds,
        clv: clv != null ? String(clv) : null,
      })
      .where(eq(zeroproofBets.id, bet.id));

    await tx.insert(zeroproofLedgerEntries).values(
      settlementLines(grade, bet.stakeCents, bet.oddsAmerican).map((line) => ({
        walletId: bet.walletId,
        betId: bet.id,
        kind: line.kind,
        account: line.account,
        amountCents: line.amountCents,
      })),
    );
  });
}

/** Record the final result and close the event to further betting. */
export async function markEventFinal(eventId: string, result: NormalizedResult): Promise<void> {
  await db
    .update(zeroproofEvents)
    .set({ status: 'final', result, updatedAt: new Date() })
    .where(eq(zeroproofEvents.id, eventId));
}

/**
 * Wallets whose term is up and haven't been refunded yet. A busted wallet still
 * qualifies — bust archives the record, it doesn't forfeit the deposit.
 */
export async function getMaturedWallets(
  now: Date,
): Promise<Pick<ZeroproofWallet, 'id' | 'mode' | 'principalCents' | 'status'>[]> {
  return db
    .select({
      id: zeroproofWallets.id,
      mode: zeroproofWallets.mode,
      principalCents: zeroproofWallets.principalCents,
      status: zeroproofWallets.status,
    })
    .from(zeroproofWallets)
    .where(and(lte(zeroproofWallets.lockEnd, now), inArray(zeroproofWallets.status, ['active', 'busted'])));
}

/** Refund the principal and close the wallet — the ledger pair and the status flip share one transaction. */
export async function refundWallet(walletId: string, principalCents: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(zeroproofLedgerEntries).values(
      refundPrincipalLines(principalCents).map((line) => ({
        walletId,
        kind: line.kind,
        account: line.account,
        amountCents: line.amountCents,
      })),
    );
    await tx.update(zeroproofWallets).set({ status: 'refunded' }).where(eq(zeroproofWallets.id, walletId));
  });
}

/** Active challenge wallets whose derived balance has hit zero — ready to bust. */
export async function getBustableChallengeWallets(): Promise<{ id: string }[]> {
  const wallets = await db
    .select({ id: zeroproofWallets.id })
    .from(zeroproofWallets)
    .where(and(eq(zeroproofWallets.mode, 'challenge'), eq(zeroproofWallets.status, 'active')));
  if (wallets.length === 0) return [];

  const ids = wallets.map((w) => w.id);
  const entries = await db
    .select({ walletId: zeroproofLedgerEntries.walletId, account: zeroproofLedgerEntries.account, amountCents: zeroproofLedgerEntries.amountCents })
    .from(zeroproofLedgerEntries)
    .where(inArray(zeroproofLedgerEntries.walletId, ids));

  return wallets.filter((w) => deriveBalanceCents(entries.filter((e) => e.walletId === w.id)) <= 0);
}

/** Archive a busted challenge wallet. Betting is already blocked by the placement gate. */
export async function bustWallet(walletId: string): Promise<void> {
  await db.update(zeroproofWallets).set({ status: 'busted' }).where(eq(zeroproofWallets.id, walletId));
}

const SETTLED_STATUSES = ['won', 'lost', 'push', 'void'];

interface SettledBetRow {
  status: string;
  stakeCents: number;
  oddsAmerican: number;
  clv: string | null;
  settledAt: Date | null;
  /** Present on the per-user query (accolades group by wallet); absent on the leaderboard scan. */
  walletId?: string;
}

/** A user's settled bets across all their wallets — the raw material for stats. */
export async function getSettledBetsForUser(userSub: string): Promise<SettledBetRow[]> {
  return db
    .select({
      walletId: zeroproofBets.walletId,
      status: zeroproofBets.status,
      stakeCents: zeroproofBets.stakeCents,
      oddsAmerican: zeroproofBets.oddsAmerican,
      clv: zeroproofBets.clv,
      settledAt: zeroproofBets.settledAt,
    })
    .from(zeroproofBets)
    .innerJoin(zeroproofWallets, eq(zeroproofBets.walletId, zeroproofWallets.id))
    .where(and(eq(zeroproofWallets.userSub, userSub), inArray(zeroproofBets.status, SETTLED_STATUSES)));
}

/** Every user's settled bets, grouped — the leaderboard scans this. */
export async function getSettledBetsByUser(): Promise<{ userSub: string; bets: SettledBetRow[] }[]> {
  const rows = await db
    .select({
      userSub: zeroproofWallets.userSub,
      status: zeroproofBets.status,
      stakeCents: zeroproofBets.stakeCents,
      oddsAmerican: zeroproofBets.oddsAmerican,
      clv: zeroproofBets.clv,
      settledAt: zeroproofBets.settledAt,
    })
    .from(zeroproofBets)
    .innerJoin(zeroproofWallets, eq(zeroproofBets.walletId, zeroproofWallets.id))
    .where(inArray(zeroproofBets.status, SETTLED_STATUSES));

  const byUser = new Map<string, SettledBetRow[]>();
  for (const { userSub, ...bet } of rows) {
    const list = byUser.get(userSub);
    if (list) list.push(bet);
    else byUser.set(userSub, [bet]);
  }
  return [...byUser].map(([userSub, bets]) => ({ userSub, bets }));
}

/** Record an attributed outbound click to a partner sportsbook. */
export async function logReferralClick(input: { userSub: string | null; partner: string }): Promise<void> {
  await db.insert(zeroproofReferralClicks).values({ userSub: input.userSub, partner: input.partner });
}

/** The accolades a user has earned, oldest first. */
export async function getAwardedAccolades(
  userSub: string,
): Promise<{ accoladeId: string; awardedAt: Date }[]> {
  return db
    .select({
      accoladeId: zeroproofAccoladeAwards.accoladeId,
      awardedAt: zeroproofAccoladeAwards.awardedAt,
    })
    .from(zeroproofAccoladeAwards)
    .where(eq(zeroproofAccoladeAwards.userSub, userSub))
    .orderBy(asc(zeroproofAccoladeAwards.awardedAt));
}

/** Award accolades idempotently — a badge already held is left untouched. */
export async function awardAccolades(userSub: string, accoladeIds: string[]): Promise<void> {
  if (accoladeIds.length === 0) return;
  await db
    .insert(zeroproofAccoladeAwards)
    .values(accoladeIds.map((accoladeId) => ({ userSub, accoladeId })))
    .onConflictDoNothing({
      target: [zeroproofAccoladeAwards.userSub, zeroproofAccoladeAwards.accoladeId],
    });
}

/** Accrue simulated float yield to the house account. */
export async function accrueYield(amountCents: number): Promise<void> {
  await db.insert(zeroproofLedgerEntries).values(
    yieldLines(amountCents).map((line) => ({
      kind: line.kind,
      account: line.account,
      amountCents: line.amountCents,
    })),
  );
}

export interface HouseSummary {
  /** The company's net position: won stakes + yield − paid profits. */
  houseCents: number;
  /** The escrow float: negative because escrow holds a liability to return deposits. */
  escrowCents: number;
  /** Of the house position, how much is accrued yield. */
  yieldCents: number;
  referralClicks: number;
}

function sumByAccount(account: string) {
  return db
    .select({ total: sql<number>`coalesce(sum(${zeroproofLedgerEntries.amountCents}), 0)` })
    .from(zeroproofLedgerEntries)
    .where(eq(zeroproofLedgerEntries.account, account));
}

/** The "how much did we make" numbers, derived from the ledger. */
export async function houseSummary(): Promise<HouseSummary> {
  const [[house], [escrow], [yieldRow], [clicks]] = await Promise.all([
    sumByAccount('house'),
    sumByAccount('escrow'),
    db
      .select({ total: sql<number>`coalesce(sum(${zeroproofLedgerEntries.amountCents}), 0)` })
      .from(zeroproofLedgerEntries)
      .where(and(eq(zeroproofLedgerEntries.account, 'house'), eq(zeroproofLedgerEntries.kind, 'yield'))),
    db.select({ count: sql<number>`count(*)` }).from(zeroproofReferralClicks),
  ]);
  return {
    houseCents: Number(house.total),
    escrowCents: Number(escrow.total),
    yieldCents: Number(yieldRow.total),
    referralClicks: Number(clicks.count),
  };
}
