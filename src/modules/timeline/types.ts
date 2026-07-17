// ---------------------------------------------------------------------------
// Timeline module — shared TypeScript types
// ---------------------------------------------------------------------------

export interface TimelinePostAuthor {
  sub: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface TimelineMediaItem {
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

export interface TimelinePost {
  id: string;
  type: string;
  caption: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  author: TimelinePostAuthor;
  media: TimelineMediaItem[];
}

export interface TimelineResponse {
  posts: TimelinePost[];
  nextCursor: string | null;
}
