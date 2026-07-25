// ---------------------------------------------------------------------------
// Notifications module — service
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type {
  NotificationItem,
  NotificationsResponse,
} from './types.js';

/**
 * The recipient's notifications, each flagged with whether they've seen it, plus
 * an unread count. An event is "seen" if it isn't newer than the last time they
 * viewed the list; if they've never viewed it, everything is unread.
 */
export async function list(
  recipientSub: string,
): Promise<NotificationsResponse> {
  const [events, seenAt] = await Promise.all([
    repo.listEvents(recipientSub),
    repo.getSeenAt(recipientSub),
  ]);

  const notifications: NotificationItem[] = events.map((e) => ({
    ...e,
    seen: seenAt ? new Date(e.created_at) <= seenAt : false,
  }));

  const unread_count = notifications.filter((n) => !n.seen).length;

  return { notifications, unread_count };
}

/** Mark all current notifications as seen. */
export async function markSeen(recipientSub: string): Promise<void> {
  await repo.setSeenAt(recipientSub, new Date());
}
