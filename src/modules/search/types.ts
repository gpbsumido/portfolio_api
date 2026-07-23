// ---------------------------------------------------------------------------
// Search module — types
// ---------------------------------------------------------------------------

export interface SearchUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SearchPost {
  id: string;
  type: string;
  content: string | null;
  caption: string | null;
  created_at: string;
  author: SearchUser;
}

export interface SearchResponse {
  users: SearchUser[];
  posts: SearchPost[];
}
