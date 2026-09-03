import { describe, test, expect } from 'vitest';
import {
  depositLines,
  deriveBalanceCents,
  linesNetToZero,
  settlementLines,
  stakeLines,
} from './ledger.js';

// The ledger is the hardest-to-reverse decision in ZeroProof: every money
// movement is a set of double-entry lines that net to zero, and a wallet's
// balance is never stored, only derived from those lines. These pure invariants
// are what let the fake-money MVP upgrade to real money without a rewrite.
describe('double-entry ledger', () => {
  test('a deposit nets to zero across accounts', () => {
    const lines = depositLines(10000);

    expect(linesNetToZero(lines)).toBe(true);
    expect(lines).toContainEqual({ account: 'user', kind: 'deposit', amountCents: 10000 });
    expect(lines).toContainEqual({ account: 'escrow', kind: 'deposit', amountCents: -10000 });
  });

  test('the invariant rejects any set of lines that does not sum to zero', () => {
    expect(linesNetToZero([{ amountCents: 10000 }, { amountCents: -10000 }])).toBe(true);
    expect(linesNetToZero([{ amountCents: 10000 }, { amountCents: -9999 }])).toBe(false);
  });

  test('a stake moves money from the user to escrow and nets to zero', () => {
    const lines = stakeLines(2500);

    expect(linesNetToZero(lines)).toBe(true);
    expect(lines).toContainEqual({ account: 'user', kind: 'stake', amountCents: -2500 });
    expect(lines).toContainEqual({ account: 'escrow', kind: 'stake', amountCents: 2500 });
  });

  test('balance is derived from the user-account lines only', () => {
    const lines = [
      { account: 'user', amountCents: 10000 }, // deposit
      { account: 'escrow', amountCents: -10000 },
      { account: 'user', amountCents: -2500 }, // a stake leaves the bettable bankroll
      { account: 'escrow', amountCents: 2500 },
    ] as const;

    // 10000 - 2500 = 7500; the escrow lines never touch the user's bankroll.
    expect(deriveBalanceCents(lines)).toBe(7500);
  });
});

describe('settlement ledger lines', () => {
  test('a win returns the stake and pays profit, all netting to zero', () => {
    // 2500 at +100 (even money) → stake back + 2500 profit = +5000 to the user.
    const lines = settlementLines('won', 2500, 100);
    expect(linesNetToZero(lines)).toBe(true);
    expect(deriveBalanceCents(lines)).toBe(5000);
  });

  test('a loss sends the stake to the house — nothing back to the user', () => {
    const lines = settlementLines('lost', 2500, 100);
    expect(linesNetToZero(lines)).toBe(true);
    // Stake already left at placement; a loss just moves escrow → house.
    expect(deriveBalanceCents(lines)).toBe(0);
  });

  test('a push refunds the stake exactly', () => {
    const lines = settlementLines('push', 2500, -110);
    expect(linesNetToZero(lines)).toBe(true);
    expect(deriveBalanceCents(lines)).toBe(2500);
  });
});
