// ---------------------------------------------------------------------------
// ZeroProof double-entry ledger — pure money math
// ---------------------------------------------------------------------------
//
// Every money movement is a set of lines that nets to zero across three
// accounts. The `user` account is the bettable bankroll (what the record is
// built from), `escrow` holds the locked principal, and `house` is the
// company float. Balances are never stored — always derived from the lines —
// so the fake-money MVP upgrades to real money without changing this math.

export type LedgerAccount = 'user' | 'house' | 'escrow';
export type LedgerKind = 'deposit' | 'stake' | 'payout' | 'refund' | 'yield';

export interface LedgerLine {
  account: LedgerAccount;
  kind: LedgerKind;
  amountCents: number;
}

/**
 * A simulated deposit: it credits the user's bankroll and debits escrow, which
 * holds the principal. The pair nets to zero.
 */
export function depositLines(amountCents: number): LedgerLine[] {
  return [
    { account: 'user', kind: 'deposit', amountCents },
    { account: 'escrow', kind: 'deposit', amountCents: -amountCents },
  ];
}

/**
 * A stake moves money out of the user's bankroll into escrow, where it's held
 * until the bet settles. The pair nets to zero.
 */
export function stakeLines(amountCents: number): LedgerLine[] {
  return [
    { account: 'user', kind: 'stake', amountCents: -amountCents },
    { account: 'escrow', kind: 'stake', amountCents: amountCents },
  ];
}

/**
 * The double-entry invariant: a transaction's lines must sum to zero. Callers
 * assert this before writing, so an unbalanced set never reaches the database.
 */
export function linesNetToZero(lines: readonly Pick<LedgerLine, 'amountCents'>[]): boolean {
  return lines.reduce((sum, line) => sum + line.amountCents, 0) === 0;
}

/**
 * A wallet's bettable balance is the running sum of its `user`-account lines.
 * Escrow and house lines never touch the bankroll the user bets from.
 */
export function deriveBalanceCents(
  lines: readonly { account: string; amountCents: number }[],
): number {
  return lines
    .filter((line) => line.account === 'user')
    .reduce((sum, line) => sum + line.amountCents, 0);
}
