const express = require("express");
const db = require("../utils/db");
const { fetchIncrementalEvents } = require("../utils/googleCalendar");

const router = express.Router();

// reverse color map: Google colorId back to our hex values.
// used when applying Google-side color changes to our events.
const GOOGLE_COLOR_TO_HEX = {
  "9": "#6366f1",  // blueberry
  "11": "#f43f5e", // tomato
  "6": "#f97316",  // tangerine
  "5": "#eab308",  // banana
  "10": "#22c55e", // sage
  "7": "#06b6d4",  // peacock
  "3": "#8b5cf6",  // grape
  "4": "#ec4899",  // flamingo
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

  try {
    const auth = await db.getGoogleAuth(userId);
    if (!auth) return;

    const { items, nextSyncToken } = await fetchIncrementalEvents(
      userId,
      auth.sync_token,
    );

    // save the new sync token before processing items so if we crash partway
    // through we don't re-process the same batch on the next notification.
    await db.updateSyncToken(userId, nextSyncToken);

    for (const item of items) {
      // look up by google_event_id scoped to this user.
      // if we don't have it, it's a foreign event and we skip it.
      const existing = await db.getEventByGoogleId(item.id, userId);
      if (!existing) continue;

      if (item.status === "cancelled") {
        await db.deleteCalendarEvent(existing.id, userId);
        continue;
      }

      // last-write wins: if Google's timestamp is newer, apply the change.
      // if ours is newer it means the user just edited it here and the webhook
      // is stale -- our version is already correct, skip it.
      const googleUpdated = new Date(item.updated);
      const ourUpdated = new Date(existing.updated_at);

      if (googleUpdated <= ourUpdated) continue;

      const fields = fromGoogleEvent(item);
      if (Object.keys(fields).length > 0) {
        await db.updateCalendarEventFromWebhook(existing.id, fields, userId);
      }
    }
  } catch (err) {
    // log but don't throw, the 200 is already sent
    console.error("[googleWebhook] Error processing notification:", err.message);
  }
});

module.exports = router;
