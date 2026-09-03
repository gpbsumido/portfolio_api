// ---------------------------------------------------------------------------
// Cron job: ZeroProof wallet maintenance — bust and unlock.
//
// Busts challenge wallets that have hit zero, then refunds the principal of any
// wallet whose 3-month term is up (busted wallets included — bust archives the
// record, it doesn't forfeit the deposit). Both sweeps are idempotent.
//
// Wired into start.js via CRON_JOB=zeroproof-unlock.
// ---------------------------------------------------------------------------

import { pool } from '../config/database.js';
import { bustEmptyChallengeWallets, unlockMaturedWallets } from '../modules/zeroproof/service.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('zeroproof-unlock');

export async function zeroproofUnlock(): Promise<void> {
  const busted = await bustEmptyChallengeWallets();
  const refunded = await unlockMaturedWallets(new Date());
  log.info({ busted, refunded }, 'ZeroProof unlock complete');
}

// Allow `node dist/jobs/zeroproofUnlock.js` as a standalone cron invocation.
if (require.main === module) {
  zeroproofUnlock()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'ZeroProof unlock failed');
      process.exit(1);
    });
}
