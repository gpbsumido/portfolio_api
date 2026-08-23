// ---------------------------------------------------------------------------
// Fantasy TCG economy — service (constants + thin orchestration over the repo)
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type { PulledCardInput } from './schemas.js';

/** What a pack costs, and the daily grant. Server-authoritative. */
export const PACK_COST = 100;
export const DAILY_GRANT = 500;

/** How many pulls a collection read returns at most. */
const COLLECTION_LIMIT = 500;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getWallet(userSub: string) {
  return repo.getWallet(userSub);
}

export function claimDaily(userSub: string) {
  return repo.claimDaily(userSub, todayUtc(), DAILY_GRANT);
}

export function openPack(userSub: string, cards: PulledCardInput[]) {
  return repo.openPack(userSub, PACK_COST, cards);
}

export function getCollection(userSub: string) {
  return repo.listPulls(userSub, COLLECTION_LIMIT);
}
