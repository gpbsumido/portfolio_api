// ---------------------------------------------------------------------------
// Replies module — types
// ---------------------------------------------------------------------------

export interface ReplyAuthor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Reply {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  author: ReplyAuthor;
}

/** Reply count for a single post, used by the batch endpoint. */
export interface ReplyCount {
  post_id: string;
  count: number;
}
