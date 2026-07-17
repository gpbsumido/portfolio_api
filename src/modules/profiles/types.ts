// ---------------------------------------------------------------------------
// Profiles module — shared TypeScript types
// ---------------------------------------------------------------------------

export interface ProfileRow {
  user_sub: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileResponse {
  user_sub: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface PublicProfileResponse {
  user_sub: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  created_at: Date;
  post_count: number;
  follower_count: number;
  following_count: number;
  follow_status: string | null;
}

export interface DiscoverAccount {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  post_count: number;
  follower_count: number;
}

export interface DiscoverResponse {
  accounts: DiscoverAccount[];
  offset: number;
  limit: number;
  hasMore: boolean;
}
