import { describe, test, expect } from 'vitest';
import { closingOddsFor, computeClv, gradeBet } from './settlement.js';

const result = (overrides: Record<string, unknown> = {}) => ({
  providerKey: 'evt-1',
  completed: true,
  home: 'Boston Red Sox',
  away: 'New York Yankees',
  homeScore: 3,
  awayScore: 5,
  ...overrides,
});

const bet = (overrides: Record<string, unknown> = {}) => ({
  market: 'h2h',
  selection: 'New York Yankees',
  lineValue: null,
  oddsAmerican: -145,
  ...overrides,
});

describe('grading a bet', () => {
  test('h2h pays the winner and busts the loser', () => {
    expect(gradeBet(bet({ selection: 'New York Yankees' }), result())).toBe('won');
    expect(gradeBet(bet({ selection: 'Boston Red Sox' }), result())).toBe('lost');
  });

  test('spread applies the handicap, and an exact cover is a push', () => {
    // Yankees win by 2 (5-3). -1.5 covers (won); -2.5 lands exactly (push); +1.5 (lost side won by 2 → lost).
    expect(gradeBet(bet({ market: 'spread', selection: 'New York Yankees', lineValue: -1.5 }), result())).toBe('won');
    expect(gradeBet(bet({ market: 'spread', selection: 'New York Yankees', lineValue: -2 }), result())).toBe('push');
    expect(gradeBet(bet({ market: 'spread', selection: 'Boston Red Sox', lineValue: 2 }), result())).toBe('push');
  });

  test('total grades over/under against the combined score', () => {
    // total = 8
    expect(gradeBet(bet({ market: 'total', selection: 'Over', lineValue: 7.5 }), result())).toBe('won');
    expect(gradeBet(bet({ market: 'total', selection: 'Under', lineValue: 7.5 }), result())).toBe('lost');
    expect(gradeBet(bet({ market: 'total', selection: 'Over', lineValue: 8 }), result())).toBe('push');
  });

  test('an event that did not complete voids the bet', () => {
    expect(gradeBet(bet(), result({ completed: false }))).toBe('void');
  });
});

describe('closing-line value', () => {
  test('a bet beats the close when its price paid more than the closing price', () => {
    // Bet -110 (decimal 1.909), closes -130 (decimal 1.769): beat the close → positive CLV.
    expect(computeClv(-110, -130)).toBeGreaterThan(0);
    // Bet -130, closes -110: worse than close → negative CLV.
    expect(computeClv(-130, -110)).toBeLessThan(0);
    // Same price closes flat.
    expect(computeClv(-110, -110)).toBe(0);
  });

  test('closingOddsFor reads the closing price for the bet selection', () => {
    const snapshot = {
      outcomes: [
        { name: 'New York Yankees', priceAmerican: -130 },
        { name: 'Boston Red Sox', priceAmerican: 110 },
      ],
    };
    expect(closingOddsFor(snapshot, 'New York Yankees')).toBe(-130);
    expect(closingOddsFor(snapshot, 'Nobody')).toBeNull();
  });
});
