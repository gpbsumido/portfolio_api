// ---------------------------------------------------------------------------
// Posts module — shared TypeScript types
// ---------------------------------------------------------------------------

export interface PostAuthor {
  sub: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface MediaItem {
  id: string;
  s3_key: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
  blur_data_url: string | null;
  media_type: string;
  thumbnail_url: string | null;
  duration: number | null;
  created_at: string;
}

export interface PostResponse {
  id: string;
  type: string;
  caption: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  author: PostAuthor;
  media: MediaItem[];
}

export interface PostsListResponse {
  posts: PostResponse[];
  nextCursor: string | null;
}

export interface DiscoverPostsResponse {
  posts: PostResponse[];
}

/** Raw row returned by the text post INSERT ... RETURNING */
export interface PostRow {
  id: string;
  user_sub: string;
  type: string;
  caption: string | null;
  content: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Raw row returned by the post_media INSERT ... RETURNING */
export interface MediaRow {
  id: string;
  s3_key: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
  blur_data_url: string | null;
  media_type: string;
  thumbnail_url: string | null;
  duration: number | null;
  created_at: Date;
}
