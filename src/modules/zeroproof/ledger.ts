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
 * Return the locked principal at term end. Paid from escrow (which held the
 * deposit) regardless of the wallet's record — the no-loss guarantee. In a
 * real-money system this is the payout rail returning the deposit, not an
 * addition to the bettable bankroll; here escrow → user models "deposit back".
 */
export function refundPrincipalLines(principalCents: number): LedgerLine[] {
  return [
    { account: 'user', kind: 'refund', amountCents: principalCents },
    { account: 'escrow', kind: 'refund', amountCents: -principalCents },
  ];
}

/** American odds → decimal payout multiplier (stake included). */
export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/**
 * The ledger lines that settle a graded bet. A win returns the stake from escrow
 * and pays profit from the house; a loss moves the held stake escrow → house; a
 * push or void refunds the stake. Every set nets to zero.
 */
export function settlementLines(
  grade: 'won' | 'lost' | 'push' | 'void',
  stakeCents: number,
  oddsAmerican: number,
): LedgerLine[] {
  if (grade === 'won') {
    const profitCents = Math.round(stakeCents * (americanToDecimal(oddsAmerican) - 1));
    return [
      { account: 'user', kind: 'payout', amountCents: stakeCents },
      { account: 'escrow', kind: 'payout', amountCents: -stakeCents },
      { account: 'user', kind: 'payout', amountCents: profitCents },
      { account: 'house', kind: 'payout', amountCents: -profitCents },
    ];
  }
  if (grade === 'lost') {
    return [
      { account: 'escrow', kind: 'payout', amountCents: -stakeCents },
      { account: 'house', kind: 'payout', amountCents: stakeCents },
    ];
  }
  return [
    { account: 'user', kind: 'refund', amountCents: stakeCents },
    { account: 'escrow', kind: 'refund', amountCents: -stakeCents },
  ];
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
