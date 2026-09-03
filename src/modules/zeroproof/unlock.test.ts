import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./repository.js', () => ({
  getMaturedWallets: vi.fn(),
  refundWallet: vi.fn(),
  getBustableChallengeWallets: vi.fn(),
  bustWallet: vi.fn(),
}));

import * as repo from './repository.js';
import { bustEmptyChallengeWallets, unlockMaturedWallets } from './service.js';

beforeEach(() => vi.clearAllMocks());

describe('unlocking matured wallets', () => {
  test('refunds the principal only — whatever the record, and even after a bust', async () => {
    vi.mocked(repo.getMaturedWallets).mockResolvedValue([
      { id: 'w1', mode: 'season', principalCents: 50000, status: 'active' },
      { id: 'w2', mode: 'challenge', principalCents: 10000, status: 'busted' },
    ] as never);

    const refunded = await unlockMaturedWallets(new Date('2026-12-03T00:00:00Z'));

    // A wallet up 40% and a busted wallet both get exactly their principal back.
    expect(repo.refundWallet).toHaveBeenCalledWith('w1', 50000);
    expect(repo.refundWallet).toHaveBeenCalledWith('w2', 10000);
    expect(refunded).toBe(2);
  });

  test('does nothing when no wallet has matured (idempotent past unlock)', async () => {
    vi.mocked(repo.getMaturedWallets).mockResolvedValue([] as never);
    const refunded = await unlockMaturedWallets(new Date());
    expect(repo.refundWallet).not.toHaveBeenCalled();
    expect(refunded).toBe(0);
  });
});

describe('busting empty challenge wallets', () => {
  test('archives a challenge wallet whose balance has hit zero', async () => {
    vi.mocked(repo.getBustableChallengeWallets).mockResolvedValue([{ id: 'w3' }] as never);

    const busted = await bustEmptyChallengeWallets();

    expect(repo.bustWallet).toHaveBeenCalledWith('w3');
    expect(busted).toBe(1);
  });

  test('leaves wallets with balance alone', async () => {
    vi.mocked(repo.getBustableChallengeWallets).mockResolvedValue([] as never);
    const busted = await bustEmptyChallengeWallets();
    expect(repo.bustWallet).not.toHaveBeenCalled();
    expect(busted).toBe(0);
  });
});
