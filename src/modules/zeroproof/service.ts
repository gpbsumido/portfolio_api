// ---------------------------------------------------------------------------
// ZeroProof wallets — service (deposit rules, lock term, thin orchestration)
// ---------------------------------------------------------------------------

import { ValidationError } from '../../shared/errors/index.js';
import { fixturesProvider } from './providers/fixtures.js';
import { TheOddsApiProvider } from './providers/theOddsApi.js';
import type { OddsProvider } from './providers/types.js';
import * as repo from './repository.js';
import type { WalletMode } from './types.js';

/** Season takes any deposit at or above $20; Challenge is a fixed $100. */
export const MIN_SEASON_DEPOSIT_CENTS = 2000;
export const CHALLENGE_DEPOSIT_CENTS = 10000;

/** Every wallet locks for three months, then auto-refunds its principal. */
export const LOCK_TERM_MONTHS = 3;

/**
 * The principal a wallet opens with. Challenge is always $100; a Season deposit
 * is validated here, where the mode is known, rather than in the request schema.
 */
export function principalForMode(mode: WalletMode, depositCents?: number): number {
  if (mode === 'challenge') return CHALLENGE_DEPOSIT_CENTS;
  if (depositCents == null) {
    throw new ValidationError('A season wallet needs a deposit amount');
  }
  if (depositCents < MIN_SEASON_DEPOSIT_CENTS) {
    throw new ValidationError('A season deposit is $20 minimum');
  }
  return depositCents;
}

/** The lock window: opens now, unlocks three months out. */
export function lockWindow(now: Date): { lockStart: Date; lockEnd: Date } {
  const lockEnd = new Date(now);
  lockEnd.setMonth(lockEnd.getMonth() + LOCK_TERM_MONTHS);
  return { lockStart: now, lockEnd };
}

export function openWallet(userSub: string, mode: WalletMode, depositCents?: number) {
  const principalCents = principalForMode(mode, depositCents);
  const { lockStart, lockEnd } = lockWindow(new Date());
  return repo.openWallet({ userSub, mode, principalCents, lockStart, lockEnd });
}

export function listWallets(userSub: string) {
  return repo.listWallets(userSub);
}

/** The seed sports: daily MLB slate now, EPL weekends, NFL hype in three weeks. */
export const DEFAULT_SPORT_KEYS = ['baseball_mlb', 'soccer_epl', 'americanfootball_nfl'];

/**
 * Pull lines from a provider and write them through: each event upserted once
 * (by provider_key), each market appended as a snapshot. Returns the counts.
 */
export async function syncOdds(
  provider: OddsProvider,
  sportKeys: string[],
): Promise<{ events: number; snapshots: number }> {
  const events = await provider.getOdds(sportKeys);
  let snapshots = 0;
  for (const event of events) {
    const eventId = await repo.upsertEvent({
      providerKey: event.providerKey,
      sport: event.sport,
      home: event.home,
      away: event.away,
      commenceTime: event.commenceTime,
    });
    for (const market of event.markets) {
      await repo.insertSnapshot({ eventId, market: market.market, outcomes: market.outcomes });
      snapshots += 1;
    }
  }
  return { events: events.length, snapshots };
}

export function listEvents() {
  return repo.listUpcomingEventsWithLines();
}

/**
 * Choose the odds provider from env, explicitly — never a silent fallback that
 * would quietly turn a missing key into an empty slate. Defaults to fixtures
 * (zero credits), and the job logs which provider actually ran.
 */
export function resolveOddsProvider(): OddsProvider {
  const choice = process.env.ZEROPROOF_ODDS_PROVIDER ?? 'fixtures';
  if (choice === 'fixtures') return fixturesProvider;
  if (choice === 'the-odds-api') {
    const key = process.env.ODDS_API_KEY;
    if (!key) {
      throw new Error('ZEROPROOF_ODDS_PROVIDER=the-odds-api but ODDS_API_KEY is unset');
    }
    return new TheOddsApiProvider(key);
  }
  throw new Error(`Unknown ZEROPROOF_ODDS_PROVIDER: ${choice}`);
}

/** The sports to sync, from env (comma-separated) or the seed defaults. */
export function resolveSportKeys(): string[] {
  const raw = process.env.ZEROPROOF_SPORT_KEYS;
  if (!raw) return DEFAULT_SPORT_KEYS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
