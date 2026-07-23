// ---------------------------------------------------------------------------
// Likes module — types
// ---------------------------------------------------------------------------

/** Like count and whether the current user liked a single post. */
export interface LikeSummary {
  post_id: string;
  count: number;
  liked: boolean;
}

export interface LikesResponse {
  likes: LikeSummary[];
}
