// ---------------------------------------------------------------------------
// Notifications module — service
// ---------------------------------------------------------------------------

import * as repo from './repository.js';
import type { NotificationsResponse } from './types.js';

/**
 * The recipient's notifications plus an unread count (events newer than the
 * last time they viewed the list). If they've never viewed it, everything is
 * unread.
 */
export async function list(
  recipientSub: string,
): Promise<NotificationsResponse> {
  const [notifications, seenAt] = await Promise.all([
    repo.listEvents(recipientSub),
    repo.getSeenAt(recipientSub),
  ]);

  const unread_count = seenAt
    ? notifications.filter((n) => new Date(n.created_at) > seenAt).length
    : notifications.length;

  return { notifications, unread_count };
}

/** Mark all current notifications as seen. */
export async function markSeen(recipientSub: string): Promise<void> {
  await repo.setSeenAt(recipientSub, new Date());
}
