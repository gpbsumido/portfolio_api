// ---------------------------------------------------------------------------
// ZeroProof wallets — service (deposit rules, lock term, thin orchestration)
// ---------------------------------------------------------------------------

import { ValidationError } from '../../shared/errors/index.js';
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
