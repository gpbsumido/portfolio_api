// ---------------------------------------------------------------------------
// Search module — Drizzle ORM repository
//
// ILIKE-based for now (works on any Postgres, no extensions or new columns).
// A pg_trgm GIN index on usernames and a tsvector column on post text would
// speed this up at scale; noted as a follow-up.
// ---------------------------------------------------------------------------

import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../config/drizzle/index.js';
import { posts, userProfiles } from '../../config/drizzle/schema.js';
import type { SearchPost, SearchUser } from './types.js';

/** Public accounts whose username or display name matches the query. */
export async function searchUsers(
  q: string,
  limit = 10,
): Promise<SearchUser[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      username: userProfiles.username,
      display_name: userProfiles.displayName,
      avatar_url: userProfiles.avatarUrl,
    })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.isPublic, true),
        or(
          ilike(userProfiles.username, pattern),
          ilike(userProfiles.displayName, pattern),
        ),
      ),
    )
    .limit(limit);
  return rows;
}

type PostSearchRow = {
  id: string;
  type: string;
  content: string | null;
  caption: string | null;
  created_at: Date;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Public posts whose text or caption matches the query, newest first. */
export async function searchPosts(
  q: string,
  limit = 20,
): Promise<SearchPost[]> {
  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: posts.id,
      type: posts.type,
      content: posts.content,
      caption: posts.caption,
      created_at: posts.createdAt,
      username: userProfiles.username,
      display_name: userProfiles.displayName,
      avatar_url: userProfiles.avatarUrl,
    })
    .from(posts)
    .innerJoin(userProfiles, eq(userProfiles.userSub, posts.userSub))
    .where(
      and(
        eq(userProfiles.isPublic, true),
        or(ilike(posts.content, pattern), ilike(posts.caption, pattern)),
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  return (rows as PostSearchRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    caption: r.caption,
    created_at: r.created_at.toISOString(),
    author: {
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
    },
  }));
}
