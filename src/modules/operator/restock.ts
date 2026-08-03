// ---------------------------------------------------------------------------
// Operator module — pure restock-session helpers
//
// A restock used to be "set current_stock = capacity", which could not express
// the two things that actually cost an operator money: stock that walked out as
// expiry or damage, and a shelf that disagreed with what the system believed.
//
// These helpers turn a session's lines into the numbers the review step and the
// activity feed need. Pure, so the arithmetic is testable without a database.
// ---------------------------------------------------------------------------

export const REMOVAL_REASONS = ['expired', 'damaged', 'other'] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export type CountStatus = 'matches-expected' | 'correction' | 'not-counted';

/** The shape both the DB row and an in-flight draft satisfy. */
export type RestockLineInput = {
  itemId: string;
  expectedQty: number;
  countedQty: number | null;
  added: number;
  removed: number;
  removalReason: string | null;
};

export type RestockSummary = {
  itemsTouched: number;
  added: number;
  removed: number;
  corrections: number;
  notCounted: number;
  removedByReason: Record<string, number>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * What a slot holds once the session is applied.
 *
 * The counted quantity wins when there is one, because someone physically
 * looked at the shelf. A null count means they skipped it and the system's
 * expectation carries. Note the null check rather than a falsy check: a counted
 * zero is an empty shelf someone verified, not a missing answer.
 */
export function resultingStock(
  line: Pick<
    RestockLineInput,
    'expectedQty' | 'countedQty' | 'added' | 'removed'
  >,
  capacity: number,
): number {
  const base = line.countedQty ?? line.expectedQty;
  return clamp(base + line.added - line.removed, 0, Math.max(capacity, 0));
}

/** How a line's count relates to what the system expected. */
export function countStatusOf(
  line: Pick<RestockLineInput, 'expectedQty' | 'countedQty'>,
): CountStatus {
  if (line.countedQty === null || line.countedQty === undefined) {
    return 'not-counted';
  }
  return line.countedQty === line.expectedQty
    ? 'matches-expected'
    : 'correction';
}

/** Rolls a session's lines up into the review-step and audit-feed numbers. */
export function summarizeSession(
  lines: readonly RestockLineInput[],
): RestockSummary {
  const removedByReason: Record<string, number> = {};
  let added = 0;
  let removed = 0;
  let corrections = 0;
  let notCounted = 0;

  for (const line of lines) {
    added += line.added;
    removed += line.removed;

    const status = countStatusOf(line);
    if (status === 'correction') corrections += 1;
    if (status === 'not-counted') notCounted += 1;

    if (line.removed > 0 && line.removalReason) {
      removedByReason[line.removalReason] =
        (removedByReason[line.removalReason] ?? 0) + line.removed;
    }
  }

  return {
    itemsTouched: lines.length,
    added,
    removed,
    corrections,
    notCounted,
    removedByReason,
  };
}

/**
 * The activity-feed line for a completed session.
 *
 * Deliberately names the removal reasons. "Restocked 6 items" tells an operator
 * nothing; "-5 (3 expired, 2 damaged)" is the sentence they need to see when
 * they are working out where the margin went.
 */
export function describeSession(summary: RestockSummary): string {
  if (summary.itemsTouched === 0) return 'Restock completed with no changes';

  const parts: string[] = [
    `Restocked ${summary.itemsTouched} item${summary.itemsTouched === 1 ? '' : 's'}`,
  ];

  if (summary.added > 0) parts.push(`+${summary.added}`);

  if (summary.removed > 0) {
    const reasons = Object.entries(summary.removedByReason)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(', ');
    parts.push(reasons ? `-${summary.removed} (${reasons})` : `-${summary.removed}`);
  }

  if (summary.corrections > 0) {
    parts.push(
      `${summary.corrections} correction${summary.corrections === 1 ? '' : 's'}`,
    );
  }

  if (summary.notCounted > 0) parts.push(`${summary.notCounted} not counted`);

  return parts.join(', ');
}
