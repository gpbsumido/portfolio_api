import { describe, test, expect } from 'vitest';
import {
  judge,
  formatReport,
  formatAmount,
  type Budget,
  type Measurement,
} from './dependencyWeight.js';

/**
 * The compare-and-report half of the dependency weight guard.
 *
 * The measuring half shells out to a real `pnpm install --prod` and walks a
 * tree of 14k files, which is not something a unit test should do — it is slow,
 * it needs a network-warm store, and it would be testing pnpm rather than this
 * repo. So the arithmetic and the wording live here as pure functions and get
 * fed fixtures, and the script is the thin IO shell around them.
 *
 * The wording is under test on purpose. A guard that fails with "budget
 * exceeded" and no numbers sends you off to re-measure by hand before you can
 * even tell whether it is close or catastrophic, which is exactly the moment
 * someone raises the budget to make it stop.
 */
const budget = (over: Partial<Budget> = {}): Budget => ({
  name: 'installBytes',
  limit: 500_000_000,
  unit: 'bytes',
  why: 'because',
  ...over,
});

const measurement = (over: Partial<Measurement> = {}): Measurement => ({
  name: 'installBytes',
  actual: 463_441_615,
  ...over,
});

describe('judge', () => {
  test('passes a measurement under its budget', () => {
    const [verdict] = judge({
      budgets: [budget()],
      measurements: [measurement()],
    });

    expect(verdict.withinBudget).toBe(true);
    expect(verdict.over).toBe(0);
  });

  test('fails a measurement over its budget and reports the overage', () => {
    const [verdict] = judge({
      budgets: [budget({ limit: 400_000_000 })],
      measurements: [measurement({ actual: 463_441_615 })],
    });

    expect(verdict.withinBudget).toBe(false);
    expect(verdict.over).toBe(63_441_615);
  });

  test('treats exactly the budget as within it', () => {
    const [verdict] = judge({
      budgets: [budget({ limit: 500_000_000 })],
      measurements: [measurement({ actual: 500_000_000 })],
    });

    expect(verdict.withinBudget).toBe(true);
    expect(verdict.over).toBe(0);
  });

  test('carries the budget through so the report can name it', () => {
    const [verdict] = judge({
      budgets: [budget({ name: 'packageCount', limit: 360, unit: 'count' })],
      measurements: [measurement({ name: 'packageCount', actual: 333 })],
    });

    expect(verdict).toMatchObject({
      name: 'packageCount',
      actual: 333,
      limit: 360,
      unit: 'count',
    });
  });

  test('judges every budget, not just the first', () => {
    const verdicts = judge({
      budgets: [
        budget(),
        budget({ name: 'packageCount', limit: 360, unit: 'count' }),
      ],
      measurements: [
        measurement(),
        measurement({ name: 'packageCount', actual: 400 }),
      ],
    });

    expect(verdicts.map((v) => v.withinBudget)).toEqual([true, false]);
  });

  /**
   * A budget nobody measured has to be loud. Silently skipping it is how a
   * guard keeps reporting green after the thing it watches stopped being
   * collected — the failure mode where the check outlives its own input.
   */
  test('refuses a budget that nothing measured', () => {
    expect(() =>
      judge({
        budgets: [budget(), budget({ name: 'packageCount', unit: 'count' })],
        measurements: [measurement()],
      }),
    ).toThrow(/packageCount/);
  });
});

describe('formatAmount', () => {
  test('renders bytes as MiB with the raw count kept', () => {
    expect(formatAmount(463_441_615, 'bytes')).toBe(
      '441.97 MiB (463,441,615 bytes)',
    );
  });

  test('renders a count as a plain number', () => {
    expect(formatAmount(333, 'count')).toBe('333');
  });
});

describe('formatReport', () => {
  test('names the budget, the actual and the overage when one is blown', () => {
    const report = formatReport(
      judge({
        budgets: [budget({ limit: 400_000_000 })],
        measurements: [measurement({ actual: 463_441_615 })],
      }),
    );

    expect(report).toContain('installBytes');
    expect(report).toContain('381.47 MiB (400,000,000 bytes)');
    expect(report).toContain('441.97 MiB (463,441,615 bytes)');
    expect(report).toContain('60.50 MiB (63,441,615 bytes)');
  });

  test('says how much room is left when everything passes', () => {
    const report = formatReport(
      judge({ budgets: [budget()], measurements: [measurement()] }),
    );

    expect(report).toContain('installBytes');
    expect(report).toContain('34.86 MiB (36,558,385 bytes)');
  });

  test('reports a passing budget and a blown one in the same run', () => {
    const report = formatReport(
      judge({
        budgets: [
          budget(),
          budget({ name: 'packageCount', limit: 360, unit: 'count' }),
        ],
        measurements: [
          measurement(),
          measurement({ name: 'packageCount', actual: 400 }),
        ],
      }),
    );

    expect(report).toContain('installBytes');
    expect(report).toContain('packageCount');
    expect(report).toContain('40');
  });
});
