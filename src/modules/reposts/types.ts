// ---------------------------------------------------------------------------
// Reposts module — types
// ---------------------------------------------------------------------------

/** Repost count and whether the current user reposted a single post. */
export interface RepostSummary {
  post_id: string;
  count: number;
  reposted: boolean;
}

export interface RepostsResponse {
  reposts: RepostSummary[];
}
