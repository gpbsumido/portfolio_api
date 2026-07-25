// ---------------------------------------------------------------------------
// Notifications module — types
// ---------------------------------------------------------------------------

export type NotificationType = 'like' | 'reply' | 'repost' | 'follow';

export interface NotificationActor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** A raw activity event, before per-recipient read state is applied. */
export interface NotificationEvent {
  type: NotificationType;
  actor: NotificationActor;
  /** The post the action was on, or null for follows. */
  post_id: string | null;
  created_at: string;
}

export interface NotificationItem extends NotificationEvent {
  /** True once the recipient has viewed it (created at or before their last view). */
  seen: boolean;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread_count: number;
}
