// ---------------------------------------------------------------------------
// ZeroProof wallets — Drizzle ORM repository
// ---------------------------------------------------------------------------

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { zeroproofLedgerEntries, zeroproofWallets } from '../../config/drizzle/schema.js';
import { ConflictError } from '../../shared/errors/index.js';
import { depositLines, deriveBalanceCents } from './ledger.js';
import type { WalletMode, WalletWithBalance } from './types.js';

interface OpenWalletInput {
  userSub: string;
  mode: WalletMode;
  principalCents: number;
  lockStart: Date;
  lockEnd: Date;
}

/**
 * Open a wallet and record its deposit in one transaction: the wallet row plus
 * the deposit's double-entry ledger pair. Refuses a second active wallet of the
 * same mode (the DB's partial unique index is the backstop against a race).
 */
export async function openWallet(input: OpenWalletInput): Promise<WalletWithBalance> {
  return db.transaction(async (tx) => {
    const active = await tx
      .select({ id: zeroproofWallets.id })
      .from(zeroproofWallets)
      .where(
        and(
          eq(zeroproofWallets.userSub, input.userSub),
          eq(zeroproofWallets.mode, input.mode),
          eq(zeroproofWallets.status, 'active'),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      throw new ConflictError(`You already have an active ${input.mode} wallet`);
    }

    const [wallet] = await tx
      .insert(zeroproofWallets)
      .values({
        userSub: input.userSub,
        mode: input.mode,
        principalCents: input.principalCents,
        lockStart: input.lockStart,
        lockEnd: input.lockEnd,
      })
      .returning();

    await tx.insert(zeroproofLedgerEntries).values(
      depositLines(input.principalCents).map((line) => ({
        walletId: wallet.id,
        kind: line.kind,
        account: line.account,
        amountCents: line.amountCents,
      })),
    );

    return { ...wallet, balanceCents: input.principalCents };
  });
}

/** The caller's wallets, newest first, each with its derived bettable balance. */
export async function listWallets(userSub: string): Promise<WalletWithBalance[]> {
  const wallets = await db
    .select()
    .from(zeroproofWallets)
    .where(eq(zeroproofWallets.userSub, userSub))
    .orderBy(desc(zeroproofWallets.createdAt));
  if (wallets.length === 0) return [];

  const ids = wallets.map((w) => w.id);
  const entries = await db
    .select({
      walletId: zeroproofLedgerEntries.walletId,
      account: zeroproofLedgerEntries.account,
      amountCents: zeroproofLedgerEntries.amountCents,
    })
    .from(zeroproofLedgerEntries)
    .where(inArray(zeroproofLedgerEntries.walletId, ids));

  return wallets.map((w) => ({
    ...w,
    balanceCents: deriveBalanceCents(entries.filter((e) => e.walletId === w.id)),
  }));
}
