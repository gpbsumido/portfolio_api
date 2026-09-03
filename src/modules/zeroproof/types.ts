// ---------------------------------------------------------------------------
// ZeroProof wallets — types and DTOs
// ---------------------------------------------------------------------------

import type { ZeroproofWallet } from '../../config/drizzle/schema.js';

export type WalletMode = 'season' | 'challenge';
export type WalletStatus = 'active' | 'busted' | 'refunded';

/** A wallet row plus its derived bettable balance. */
export type WalletWithBalance = ZeroproofWallet & { balanceCents: number };

export interface WalletDto {
  id: string;
  mode: string;
  /** The locked deposit, refunded in full at lock_end. */
  principalCents: number;
  /** The bettable bankroll, derived from the ledger. */
  balanceCents: number;
  lockStart: string;
  lockEnd: string;
  status: string;
  createdAt: string;
}
