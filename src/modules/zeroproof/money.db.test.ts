import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * The money paths, executed by a real Postgres.
 *
 * Every other zeroproof test mocks the repository, so the claims in its
 * comments ("two concurrent bets can't both spend the same cents", "the settle
 * is idempotent") were about code no test ever ran. Both were wrong: the
 * balance check read the ledger without a lock, and settle and refund updated
 * by id alone, so a second call paid out again.
 *
 * These insert rows, so they only run where ALLOW_DB_WRITE_TESTS is set. CI
 * sets it against its throwaway database. A DATABASE_URL on a laptop often
 * points at the deployed one, which is why the flag is separate from it.
 */
beforeAll(() => {
  vi.doUnmock('../../config/database.js');
  vi.resetModules();
});

const canWriteToDatabase = process.env.ALLOW_DB_WRITE_TESTS === 'true' && Boolean(process.env.DATABASE_URL);

async function load() {
  const repo = await import('./repository.js');
  const { db } = await import('../../config/drizzle/index.js');
  const { zeroproofLedgerEntries } = await import('../../config/drizzle/schema.js');
  return { repo, db, zeroproofLedgerEntries };
}

async function walletAndEvent(principalCents: number) {
  const { repo, db, zeroproofLedgerEntries } = await load();
  const userSub = `auth0|money-test-${randomUUID()}`;
  const wallet = await repo.openWallet({
    userSub,
    mode: 'season',
    principalCents,
    lockStart: new Date(Date.now() - 60_000),
    lockEnd: new Date(Date.now() + 86_400_000),
  });
  const eventId = await repo.upsertEvent({
    providerKey: `money-test:${randomUUID()}`,
    sport: 'basketball_nba',
    home: 'Home',
    away: 'Away',
    commenceTime: new Date(Date.now() + 86_400_000),
  });
  const ledgerRowCount = async () =>
    (await db.select().from(zeroproofLedgerEntries).where(eq(zeroproofLedgerEntries.walletId, wallet.id))).length;
  return { repo, wallet, eventId, ledgerRowCount };
}

describe.skipIf(!canWriteToDatabase)('zeroproof money against a real database', () => {
  test('concurrent bets can only spend what the wallet holds', async () => {
    const { repo, wallet, eventId } = await walletAndEvent(1000);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.placeBet({
          walletId: wallet.id,
          eventId,
          market: 'h2h',
          selection: 'Home',
          oddsAmerican: 100,
          lineValue: null,
          stakeCents: 1000,
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  test('settling the same bet twice pays it once', async () => {
    const { repo, wallet, eventId, ledgerRowCount } = await walletAndEvent(1000);
    const placed = await repo.placeBet({
      walletId: wallet.id,
      eventId,
      market: 'h2h',
      selection: 'Home',
      oddsAmerican: 100,
      lineValue: null,
      stakeCents: 500,
    });
    if (!placed.ok) throw new Error('setup: the bet should have been placed');

    await repo.settleBet({ bet: placed.bet, grade: 'won', closingOdds: null, clv: null });
    const afterFirstSettle = await ledgerRowCount();
    await repo.settleBet({ bet: placed.bet, grade: 'won', closingOdds: null, clv: null });

    expect(await ledgerRowCount()).toBe(afterFirstSettle);
  });

  test('refunding the same wallet twice refunds it once', async () => {
    const { repo, wallet, ledgerRowCount } = await walletAndEvent(1000);

    await repo.refundWallet(wallet.id, wallet.principalCents);
    const afterFirstRefund = await ledgerRowCount();
    await repo.refundWallet(wallet.id, wallet.principalCents);

    expect(await ledgerRowCount()).toBe(afterFirstRefund);
  });
});
