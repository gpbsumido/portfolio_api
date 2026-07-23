// ---------------------------------------------------------------------------
// Notifications module — types
// ---------------------------------------------------------------------------

export type NotificationType = 'like' | 'reply' | 'repost' | 'follow';

export interface NotificationActor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface NotificationItem {
  type: NotificationType;
  actor: NotificationActor;
  /** The post the action was on, or null for follows. */
  post_id: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread_count: number;
}
