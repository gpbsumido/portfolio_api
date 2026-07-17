// ---------------------------------------------------------------------------
// Follows module — shared TypeScript types
// ---------------------------------------------------------------------------

export interface FollowRow {
  id: string;
  follower_sub: string;
  following_sub: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface FollowRequestItem {
  id: string;
  status: string;
  created_at: Date;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FollowListItem {
  id: string;
  status: string;
  created_at: Date;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FollowRequestsResponse {
  requests: FollowRequestItem[];
}

export interface FollowingResponse {
  following: FollowListItem[];
}

export interface FollowersResponse {
  followers: FollowListItem[];
}
