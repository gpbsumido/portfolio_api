// ---------------------------------------------------------------------------
// Search module — service
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type { SearchResponse } from './types.js';

/**
 * Search public accounts and public posts for a query. An empty query returns
 * empty results without touching the DB.
 */
export async function search(q: string): Promise<SearchResponse> {
  const trimmed = q.trim();
  if (trimmed.length === 0) return { users: [], posts: [] };

  const [users, posts] = await Promise.all([
    repo.searchUsers(trimmed),
    repo.searchPosts(trimmed),
  ]);
  return { users, posts };
}
