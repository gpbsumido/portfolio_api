// Pushes a batch of draft adjustments to the API. Doubles as the template the
// daily research job uses: build `items`, POST them as one batch_date of
// pending rows. Approval happens in the extension, never here.
//
//   API_BASE=https://api.example.com \
//   DRAFT_ADJ_SERVICE_TOKEN=... \
//   tsx scripts/draft-adjustments/seed.ts [YYYY-MM-DD]
//
// The token is read from the environment — never hard-code it, never commit it.
import { ADJ_TOKEN_HEADER } from '../../src/modules/fantasy/adjustments.write-auth.js';
import { SEED_ITEMS } from './seed-data.js';

async function main(): Promise<void> {
  const base = process.env.API_BASE;
  const token = process.env.DRAFT_ADJ_SERVICE_TOKEN;
  if (!base || !token) {
    console.error('Set API_BASE and DRAFT_ADJ_SERVICE_TOKEN in the environment.');
    process.exit(1);
  }
  const batchDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const res = await fetch(`${base.replace(/\/$/, '')}/api/fantasy/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ADJ_TOKEN_HEADER]: token },
    body: JSON.stringify({ batchDate, items: SEED_ITEMS }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`POST failed ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log(`Pushed batch ${batchDate}: ${body}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
