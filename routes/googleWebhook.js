const express = require("express");
const db = require("../utils/db");
const { fetchIncrementalEvents } = require("../utils/googleCalendar");

const router = express.Router();

// Per-user webhook queue. Google can fire multiple push notifications in rapid
// succession (e.g. during initial sync flood). Each notification reads and writes
// the user's sync_token, so concurrent handlers for the same user collide: the
// second fetch uses a token that was already consumed, triggers a 410 full re-sync,
// and any deletions in the batch get lost. Chaining promises per-user ensures
// only one handler runs at a time per user while still allowing different users
// to process concurrently.
const userQueues = new Map();

function enqueueForUser(userId, fn) {
  const prev = userQueues.get(userId) ?? Promise.resolve();
  const curr = prev.then(() => fn()).catch((err) => {
    console.error(`[googleWebhook] handler error for ${userId}:`, err.message);
  });
  userQueues.set(userId, curr);
  curr.finally(() => {
    if (userQueues.get(userId) === curr) userQueues.delete(userId);
  });
  return curr;
}

// reverse color map: Google colorId back to our EVENT_COLORS hex values.
// "7" (peacock) maps back to blue since both blue and teal map to peacock on the way out.
const GOOGLE_COLOR_TO_HEX = {
  "7": "#3b82f6",  // peacock   -> blue
  "10": "#10b981", // sage      -> emerald
  "5": "#f59e0b",  // banana    -> amber
  "11": "#ef4444", // tomato    -> red
  "3": "#8b5cf6",  // grape     -> violet
  "4": "#ec4899",  // flamingo  -> pink
  "6": "#f97316",  // tangerine -> orange
  "9": "#3b82f6",  // blueberry -> blue (fallback for old events)
};

/**
 * Converts a Google Calendar Event item to the field shape our DB update expects.
 * Returns only the fields that are present on the Google event, so the DB update
 * leaves anything else untouched.
 *
 * @param {Object} item - a Google Calendar Event resource
 * @returns {{ title?: string, description?: string, startDate?: string, endDate?: string, allDay?: boolean, color?: string }}
 */
function fromGoogleEvent(item) {
  const fields = {};

  if (item.summary !== undefined) fields.title = item.summary ?? "";
  if (item.description !== undefined) fields.description = item.description ?? null;

  if (item.start) {
    const allDay = Boolean(item.start.date && !item.start.dateTime);
    fields.allDay = allDay;
    fields.startDate = allDay ? item.start.date : item.start.dateTime;
    fields.endDate = allDay
      ? item.end.date
      : item.end.dateTime;
  }

  if (item.colorId !== undefined) {
    fields.color = GOOGLE_COLOR_TO_HEX[item.colorId] ?? "#6366f1";
  }

  return fields;
}

/**
 * POST /api/google/webhook
 *
 * Google pushes a notification here whenever something changes on the user's
 * primary calendar. The body is always empty -- everything useful is in the
 * headers. We respond 200 no matter what, because a 4xx or 5xx tells Google to
 * retry and eventually blacklist the channel.
 *
 * We only act on events that exist in our DB (identified by google_event_id).
 * Anything Google created on its own (Gmail RSVPs, events typed directly in
 * Google Calendar, etc.) is ignored -- we don't import foreign events.
 */
router.post("/webhook", async (req, res) => {
  // respond immediately so Google doesn't time out waiting for us
  res.sendStatus(200);

  const userId = req.headers["x-goog-channel-token"];
  const resourceState = req.headers["x-goog-resource-state"];

  if (!userId) return;

  // "sync" is Google's initial handshake ping right after channel registration.
  // there are no actual changes to process, just acknowledge it.
  if (resourceState === "sync") return;

  enqueueForUser(userId, async () => {
    const auth = await db.getGoogleAuth(userId);
    if (!auth) return;

    const { items, nextSyncToken } = await fetchIncrementalEvents(
      userId,
      auth.sync_token,
    );

    console.log(`[googleWebhook] ${items.length} item(s) from incremental fetch for ${userId}`);

    // save the new sync token before processing items so if we crash partway
    // through we don't re-process the same batch on the next notification.
    await db.updateSyncToken(userId, nextSyncToken);

    for (const item of items) {
      // look up by google_event_id scoped to this user.
      // if we don't have it, it's a foreign event and we skip it.
      const existing = await db.getEventByGoogleId(item.id, userId);
      if (!existing) {
        console.log(`[googleWebhook] skipping item ${item.id} (status=${item.status}): not in our DB`);
        continue;
      }

      if (item.status === "cancelled") {
        console.log(`[googleWebhook] deleting event ${existing.id} (google_event_id=${item.id})`);
        await db.deleteCalendarEvent(existing.id, userId);
        continue;
      }

      // last-write wins, but with a 10-second buffer. when we push an edit to
      // Google, Google fires a webhook back almost immediately and item.updated
      // ends up slightly after our updated_at (Google processes it after we write
      // to DB). without the buffer, that echo would trip the comparison and write
      // Google's version back over ours, flipping sync_source to 'google'. the
      // buffer means a Google-side change needs to be at least 10s newer than our
      // last write to be treated as a real inbound change.
      const googleUpdated = new Date(item.updated);
      const ourUpdated = new Date(existing.updated_at);
      const SYNC_BUFFER_MS = 10_000;

      if (googleUpdated <= new Date(ourUpdated.getTime() + SYNC_BUFFER_MS)) {
        console.log(`[googleWebhook] skipping update for ${existing.id}: googleUpdated=${googleUpdated.toISOString()} ourUpdated=${ourUpdated.toISOString()} (within buffer)`);
        continue;
      }

      const fields = fromGoogleEvent(item);
      if (Object.keys(fields).length > 0) {
        console.log(`[googleWebhook] updating event ${existing.id} from Google`);
        await db.updateCalendarEventFromWebhook(existing.id, fields, userId);
      }
    }
  });
});

module.exports = router;
