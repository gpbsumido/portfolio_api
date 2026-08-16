/**
 * Production dependency weight, compared against committed budgets.
 *
 * This is the server's answer to the gzipped first-load-JS budget paul-explore
 * carries (gpbsumido/paul-explore#396). Copying that metric here would have
 * been worse than having no check at all: this service ships no browser bundle,
 * so the number would sit there going red or green for reasons unrelated to
 * anything a user experiences, and a gate nobody believes gets raised rather
 * than fixed.
 *
 * What actually costs a user here is cold start. This service scales to zero —
 * `fly.toml` sets `auto_stop_machines = "stop"` and `min_machines_running = 0`
 * — which puts a full boot on the critical path of somebody's first request,
 * and two things drive that boot: how much has to be installed and paged in,
 * and how much work happens at import time.
 *
 * Be clear about what this measures: dependency weight is a PROXY for cold
 * start, not cold start. paul-explore's budget measures the bytes a browser
 * actually waits on; this one measures a correlate of the time a container
 * actually waits on. The honest version of that difference is worth more than
 * a number that looks equivalent and isn't — so the guard gates the two
 * figures that are reproducible (install bytes, package count) and leaves boot
 * time itself to be measured by hand, because a wall clock on a shared runner
 * is noise wearing a metric's clothes.
 *
 * Reproducible means byte-identical run to run on a given host, not identical
 * everywhere: a Mac reads about 20 MiB heavier than CI does. The budget file
 * has the detail and the reason that gap is safe.
 */

/** What a budget is measured in. Bytes render as MiB, counts render bare. */
export type Unit = 'bytes' | 'count';

/** One committed budget, as it appears in `ci/dependency-weight.json`. */
export type Budget = {
  readonly name: string;
  readonly limit: number;
  readonly unit: Unit;
  readonly why: string;
};

/** One figure taken off a real production install. */
export type Measurement = {
  readonly name: string;
  readonly actual: number;
};

/** A budget and its measurement, with the arithmetic already done. */
export type Verdict = {
  readonly name: string;
  readonly actual: number;
  readonly limit: number;
  readonly unit: Unit;
  readonly over: number;
  readonly remaining: number;
  readonly withinBudget: boolean;
  readonly why: string;
};

/**
 * Pair each budget with its measurement and work out where it landed.
 *
 * Throws on a budget nothing measured, rather than skipping it. A guard that
 * quietly drops an entry when its input stops arriving keeps reporting green
 * forever, which is the one failure mode nobody goes looking for.
 *
 * @param budgets - Budgets read from the committed JSON.
 * @param measurements - Figures taken off a real production install.
 * @returns One verdict per budget, in the order the budgets were given.
 */
export const judge = ({
  budgets,
  measurements,
}: {
  readonly budgets: readonly Budget[];
  readonly measurements: readonly Measurement[];
}): readonly Verdict[] =>
  budgets.map((budget) => {
    const measured = measurements.find((m) => m.name === budget.name);
    if (!measured) {
      throw new Error(
        `Budget "${budget.name}" has no measurement. Either the measurement stopped being collected or the budget outlived what it watched.`,
      );
    }

    const difference = measured.actual - budget.limit;

    return {
      name: budget.name,
      actual: measured.actual,
      limit: budget.limit,
      unit: budget.unit,
      over: Math.max(difference, 0),
      remaining: Math.max(-difference, 0),
      withinBudget: difference <= 0,
      why: budget.why,
    };
  });

/**
 * Render an amount the way a person reads it.
 *
 * Bytes keep their raw count alongside the MiB, because the MiB figure is what
 * tells you whether it matters and the raw figure is what you paste back into
 * the budget file.
 *
 * @param amount - The figure to render.
 * @param unit - How to render it.
 * @returns A human-readable string.
 */
export const formatAmount = (amount: number, unit: Unit): string =>
  unit === 'count'
    ? amount.toLocaleString('en-US')
    : `${(amount / 1024 / 1024).toFixed(2)} MiB (${amount.toLocaleString('en-US')} bytes)`;

const line = (verdict: Verdict): string => {
  const actual = formatAmount(verdict.actual, verdict.unit);
  const limit = formatAmount(verdict.limit, verdict.unit);

  return verdict.withinBudget
    ? `PASS  ${verdict.name} — ${actual} against a budget of ${limit}, ${formatAmount(verdict.remaining, verdict.unit)} to spare`
    : `FAIL  ${verdict.name} — ${actual} against a budget of ${limit}, over by ${formatAmount(verdict.over, verdict.unit)}\n        budget exists because: ${verdict.why}`;
};

/**
 * Turn verdicts into the output the script prints.
 *
 * Every line carries the budget, the actual and the gap in both directions, so
 * a failure can be acted on without re-running anything by hand.
 *
 * @param verdicts - Verdicts from `judge`.
 * @returns The report, one entry per line.
 */
export const formatReport = (verdicts: readonly Verdict[]): string =>
  verdicts.map(line).join('\n');
