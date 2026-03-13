const express = require("express");
const db = require("../utils/db");
const { pool } = require("../config/database");
const { checkJwt } = require("../middleware/auth");
const upsertUser = require("../middleware/upsertUser");
const {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  stopWatchByCalId,
  createDedicatedCalendar,
  registerWatch,
} = require("../utils/googleCalendar");
const { getValidAccessToken } = require("../utils/googleToken");

const rateLimit = require("express-rate-limit");

const router = express.Router();

// 20 invite attempts per minute per user sub (falls back to IP if sub is unavailable)
const inviteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.auth?.payload?.sub ?? req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many invite requests. Please wait a minute." },
});

// all calendar routes require a valid Auth0 token
router.use(checkJwt);
// seed the users table from the JWT so sharing invite-by-email lookup works
router.use(upsertUser);

// log JWT errors
router.use((err, req, res, next) => {
  if (err.status === 401 || err.status === 403) {
    console.error(
      `[calendar API] JWT error on ${req.method} ${req.path} —`,
      err.code ?? err.message,
      "| audience expected:",
      process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
    );
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
});

// GET /api/calendar/events?start=<ISO>&end=<ISO>&cardId=<id>&cardName=<name>&calendarId=<uuid>
// returns events for the authenticated user with optional date range, card, and calendar filters
router.get("/events", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { start, end, cardId, cardName, calendarId } = req.query;

  try {
    const events = await db.getCalendarEvents(userSub, start, end, cardId, cardName, calendarId);
    res.json({ events });
  } catch (err) {
    console.error("GET /calendar/events failed:", err.message);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// GET /api/calendar/events/:id
// returns a single event — 404 if it doesn't exist or belongs to someone else
router.get("/events/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const event = await db.getCalendarEventById(id, userSub);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ event });
  } catch (err) {
    console.error("GET /calendar/events/:id failed:", err.message);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// POST /api/calendar/events
// body: { title, description?, startDate, endDate, allDay?, color?, calendarId? }
router.post("/events", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { title, description, startDate, endDate, allDay, color, calendarId } = req.body;

  if (!title || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "title, startDate, and endDate are required" });
  }

  try {
    const event = await db.createCalendarEvent(
      { title, description, startDate, endDate, allDay, color, calendarId },
      userSub,
    );

    // push to Google after the DB write. the calendar's syncMode determines
    // which Google Calendar to target (or whether to skip entirely).
    // if the sync fails the event is still saved -- the DB write is the source of truth.
    // getCalendarForMutation returns the owner's calendar row regardless of whether
    // the acting user is the owner or an editor, so Google credentials are always correct.
    try {
      const calendar = await db.getCalendarForMutation(event.calendarId, userSub, 'editor');
      let googleEventId;
      if (calendar?.syncMode === "push") {
        googleEventId = await createGoogleEvent(userSub, event, "primary");
      } else if (calendar?.syncMode === "two_way" && calendar.googleCalId) {
        googleEventId = await createGoogleEvent(userSub, event, calendar.googleCalId);
      }
      if (googleEventId) await db.setEventGoogleId(event.id, googleEventId, userSub);
    } catch (syncErr) {
      console.error("POST /calendar/events Google sync failed:", syncErr.message);
    }

    res.status(201).json({ event });
  } catch (err) {
    console.error("POST /calendar/events failed:", err.message);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// PUT /api/calendar/events/:id
// partial update — only send the fields you want to change
router.put("/events/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;
  const fields = req.body;

  if (!fields || Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "No fields provided to update" });
  }

  try {
    const event = await db.updateCalendarEvent(id, fields, userSub);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // sync the change to Google if this event has been pushed there before.
    // pass the full updated event so Google gets the current state, not just the diff.
    // the calendar's syncMode tells us which Google Calendar to target.
    try {
      const calendar = await db.getCalendarForMutation(event.calendarId, userSub, 'editor');
      if (calendar?.syncMode === "push") {
        await updateGoogleEvent(userSub, event.googleEventId, event, "primary");
      } else if (calendar?.syncMode === "two_way" && calendar.googleCalId) {
        await updateGoogleEvent(userSub, event.googleEventId, event, calendar.googleCalId);
      }
    } catch (syncErr) {
      console.error("PUT /calendar/events/:id Google sync failed:", syncErr.message);
    }

    res.json({ event });
  } catch (err) {
    console.error("PUT /calendar/events/:id failed:", err.message);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// DELETE /api/calendar/events/:id
router.delete("/events/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    // fetch the event first so we have calendarId available after deletion
    const existing = await db.getCalendarEventById(id, userSub);

    if (!existing) {
      return res.status(404).json({ error: "Event not found" });
    }

    await db.deleteCalendarEvent(id, userSub);

    // clean up Google after the DB row is gone. the calendar's syncMode tells
    // us which Google Calendar to delete from.
    try {
      const calendar = await db.getCalendarForMutation(existing.calendarId, userSub, 'editor');
      if (calendar?.syncMode === "push") {
        await deleteGoogleEvent(userSub, existing.googleEventId, "primary");
      } else if (calendar?.syncMode === "two_way" && calendar.googleCalId) {
        await deleteGoogleEvent(userSub, existing.googleEventId, calendar.googleCalId);
      }
    } catch (syncErr) {
      console.error("DELETE /calendar/events/:id Google sync failed:", syncErr.message);
    }

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /calendar/events/:id failed:", err.message);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// ---------------------------------------------------------------------------
// Calendars — /api/calendar/calendars
// ---------------------------------------------------------------------------

/**
 * GET /api/calendar/calendars
 * Returns all calendars for the authenticated user.
 */
router.get("/calendars", async (req, res) => {
  const userSub = req.auth.payload.sub;

  try {
    const calendars = await db.getCalendars(userSub);
    res.json({ calendars });
  } catch (err) {
    console.error("GET /calendar/calendars failed:", err.message);
    res.status(500).json({ error: "Failed to fetch calendars" });
  }
});

/**
 * POST /api/calendar/calendars
 * Creates a new calendar for the user.
 * Body: { name, color?, syncMode? }
 */
router.post("/calendars", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { name, color, syncMode } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const calendar = await db.createCalendar({ name, color, syncMode }, userSub);
    res.status(201).json({ calendar });
  } catch (err) {
    console.error("POST /calendar/calendars failed:", err.message);
    res.status(500).json({ error: "Failed to create calendar" });
  }
});

/**
 * PUT /api/calendar/calendars/:id
 * Partial update -- only send the fields you want to change.
 * Accepted fields: name, color, syncMode, googleCalId, googleCalName.
 */
router.put("/calendars/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;
  const { name, color, syncMode, googleCalId, googleCalName } = req.body;
  const fields = { name, color, syncMode, googleCalId, googleCalName };

  // strip undefined so updateCalendar's presence-check works correctly
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "No fields provided to update" });
  }

  try {
    const owned = await db.getCalendarForMutation(id, userSub, 'owner');
    if (!owned) return res.status(403).json({ error: 'Not authorized' });

    const calendar = await db.updateCalendar(id, fields, userSub);

    if (!calendar) {
      return res.status(404).json({ error: "Calendar not found" });
    }

    res.json({ calendar });
  } catch (err) {
    console.error("PUT /calendar/calendars/:id failed:", err.message);
    res.status(500).json({ error: "Failed to update calendar" });
  }
});

/**
 * DELETE /api/calendar/calendars/:id
 * Deletes the calendar and cascade-deletes its events (via FK).
 * If the calendar had a linked Google Calendar, we stop the watch channel first.
 * We do NOT delete the Google Calendar itself -- the user may want to keep it.
 */
router.delete("/calendars/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const calendar = await db.getCalendarForMutation(id, userSub, 'owner');

    if (!calendar) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // stop the watch channel before deleting so Google stops sending notifications
    // for an ID we no longer have a record for. non-fatal if it fails.
    if (calendar.googleCalId) {
      try {
        await stopWatchByCalId(userSub, calendar.googleCalId);
      } catch (watchErr) {
        console.error("DELETE /calendar/calendars/:id -- stopWatchByCalId failed:", watchErr.message);
      }
    }

    await db.deleteCalendar(id, userSub);
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /calendar/calendars/:id failed:", err.message);
    res.status(500).json({ error: "Failed to delete calendar" });
  }
});

/**
 * POST /api/calendar/calendars/:id/connect-google
 * Creates a dedicated Google Calendar for the calendar row and registers a
 * push notification channel. Idempotent: if googleCalId is already set, returns
 * the existing calendar without creating a duplicate.
 */
router.post("/calendars/:id/connect-google", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const calendar = await db.getCalendarForMutation(id, userSub, 'owner');

    if (!calendar) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // already connected -- return as-is so the frontend can call this safely
    if (calendar.googleCalId) {
      return res.json({ calendar });
    }

    const token = await getValidAccessToken(userSub);
    const { calId, calName } = await createDedicatedCalendar(token, calendar.name);

    const updated = await db.updateCalendar(id, { googleCalId: calId, googleCalName: calName }, userSub);

    // register the watch channel after saving the calId so registerWatch can
    // look up the calendar row by google_cal_id to store channel info
    try {
      await registerWatch(userSub, calId);
    } catch (watchErr) {
      console.error("POST /calendar/calendars/:id/connect-google -- registerWatch failed:", watchErr.message);
      // non-fatal: the calendar is linked to Google, sync just won't push until
      // the cron renewal next runs or the user triggers a reconnect
    }

    res.json({ calendar: updated });
  } catch (err) {
    console.error("POST /calendar/calendars/:id/connect-google failed:", err.message);
    res.status(500).json({ error: "Failed to connect Google Calendar" });
  }
});

/**
 * DELETE /api/calendar/calendars/:id/google
 * Stops the Google Calendar push channel and unlinks the Google Calendar from
 * this row. Resets sync_mode to 'push' so events keep syncing to Google primary.
 * Does not delete the Google Calendar itself -- the user may want to keep it.
 */
router.delete("/calendars/:id/google", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const calendar = await db.getCalendarForMutation(id, userSub, 'owner');

    if (!calendar) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // stop the watch channel before we null out the google_cal_id, since
    // stopWatchByCalId looks up the channel by google_cal_id
    if (calendar.googleCalId) {
      try {
        await stopWatchByCalId(userSub, calendar.googleCalId);
      } catch (watchErr) {
        console.error("DELETE /calendar/calendars/:id/google -- stopWatchByCalId failed:", watchErr.message);
      }
    }

    const updated = await db.updateCalendar(
      id,
      { googleCalId: null, googleCalName: null, syncMode: "push" },
      userSub,
    );

    res.json({ calendar: updated });
  } catch (err) {
    console.error("DELETE /calendar/calendars/:id/google failed:", err.message);
    res.status(500).json({ error: "Failed to disconnect Google Calendar" });
  }
});

// ---------------------------------------------------------------------------
// Sharing — /api/calendar/calendars/:id/members
// ---------------------------------------------------------------------------

/**
 * GET /api/calendar/calendars/:id/members
 * Returns the owner entry (synthesized) plus all members.
 * Accessible by the owner or any member.
 */
router.get("/calendars/:id/members", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: calendarId } = req.params;

  try {
    // allow owner or any member — a single union check
    const { rows } = await pool.query(
      `SELECT 1 FROM calendars        WHERE id = $1 AND user_sub = $2
       UNION
       SELECT 1 FROM calendar_members WHERE calendar_id = $1 AND user_sub = $2`,
      [calendarId, userSub],
    );
    if (rows.length === 0) return res.status(403).json({ error: "Not authorized" });

    const calRow = await pool.query(
      "SELECT * FROM calendars WHERE id = $1",
      [calendarId],
    );
    const cal = calRow.rows[0];
    if (!cal) return res.status(404).json({ error: "Calendar not found" });

    const ownerUser = await db.getUserBySub(cal.user_sub);
    const ownerEntry = {
      id: null,
      userSub: cal.user_sub,
      email: ownerUser?.email ?? null,
      role: "owner",
    };

    const members = await db.getCalendarMembers(calendarId);
    res.json({ members: [ownerEntry, ...members] });
  } catch (err) {
    console.error("GET /calendar/calendars/:id/members failed:", err.message);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

/**
 * POST /api/calendar/calendars/:id/members
 * Invites a user by email. Owner-only. Rate-limited to 20/min.
 * Body: { email, role? }
 */
router.post("/calendars/:id/members", inviteRateLimit, async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: calendarId } = req.params;
  const { email, role = "editor" } = req.body;

  if (!email) return res.status(400).json({ error: "email is required" });
  if (!["editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "role must be editor or viewer" });
  }

  try {
    const cal = await db.getCalendarForMutation(calendarId, userSub, "owner");
    if (!cal) return res.status(403).json({ error: "Not authorized" });

    const target = await db.getUserByEmail(email);
    // generic message — never reveal whether the email is registered or not
    if (!target) return res.status(404).json({ error: "No account found for that email address." });
    if (target.sub === userSub) {
      return res.status(400).json({ error: "You cannot share a calendar with yourself." });
    }

    const member = await db.addCalendarMember(calendarId, target.sub, role, userSub);
    res.status(201).json({ member });
  } catch (err) {
    console.error("POST /calendar/calendars/:id/members failed:", err.message);
    res.status(500).json({ error: "Failed to invite member" });
  }
});

/**
 * PUT /api/calendar/calendars/:id/members/:memberSub
 * Updates the role of an existing member. Owner-only.
 * Body: { role }
 */
router.put("/calendars/:id/members/:memberSub", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: calendarId, memberSub } = req.params;
  const { role } = req.body;

  if (!["editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "role must be editor or viewer" });
  }

  try {
    const cal = await db.getCalendarForMutation(calendarId, userSub, "owner");
    if (!cal) return res.status(403).json({ error: "Not authorized" });

    const member = await db.updateCalendarMemberRole(calendarId, memberSub, role, userSub);
    if (!member) return res.status(404).json({ error: "Member not found" });

    res.json({ member });
  } catch (err) {
    console.error("PUT /calendar/calendars/:id/members/:memberSub failed:", err.message);
    res.status(500).json({ error: "Failed to update member role" });
  }
});

/**
 * DELETE /api/calendar/calendars/:id/members/:memberSub
 * Removes a member. Owner-only.
 */
router.delete("/calendars/:id/members/:memberSub", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: calendarId, memberSub } = req.params;

  try {
    const cal = await db.getCalendarForMutation(calendarId, userSub, "owner");
    if (!cal) return res.status(403).json({ error: "Not authorized" });

    const removed = await db.removeCalendarMember(calendarId, memberSub, userSub);
    if (!removed) return res.status(404).json({ error: "Member not found" });

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /calendar/calendars/:id/members/:memberSub failed:", err.message);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// ---------------------------------------------------------------------------
// Card sub-routes — /api/calendar/events/:id/cards
// :id      = calendar_events UUID
// :entryId = event_cards UUID (the row, not the TCGdex card_id string)
// ---------------------------------------------------------------------------

// GET /api/calendar/events/:id/cards
router.get("/events/:id/cards", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const cards = await db.getEventCards(id, userSub);
    res.json({ cards });
  } catch (err) {
    console.error("GET /calendar/events/:id/cards failed:", err.message);
    res.status(500).json({ error: "Failed to fetch cards" });
  }
});

// POST /api/calendar/events/:id/cards
// body: { cardId, cardName, cardSetId?, cardSetName?, cardImageUrl?, quantity?, notes? }
router.post("/events/:id/cards", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: eventId } = req.params;
  const { cardId, cardName, cardSetId, cardSetName, cardImageUrl, quantity, notes } = req.body;

  if (!cardId || !cardName) {
    return res.status(400).json({ error: "cardId and cardName are required" });
  }

  try {
    const card = await db.addEventCard(
      { eventId, cardId, cardName, cardSetId, cardSetName, cardImageUrl, quantity, notes },
      userSub,
    );

    if (!card) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.status(201).json({ card });
  } catch (err) {
    console.error("POST /calendar/events/:id/cards failed:", err.message);
    res.status(500).json({ error: "Failed to add card" });
  }
});

// PUT /api/calendar/events/:id/cards/:entryId
// body: { quantity?, notes? }
router.put("/events/:id/cards/:entryId", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: eventId, entryId } = req.params;
  const fields = req.body;

  if (!fields || Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "No fields provided to update" });
  }

  try {
    const card = await db.updateEventCard(entryId, eventId, fields, userSub);

    if (!card) {
      return res.status(404).json({ error: "Card entry not found" });
    }

    res.json({ card });
  } catch (err) {
    console.error("PUT /calendar/events/:id/cards/:entryId failed:", err.message);
    res.status(500).json({ error: "Failed to update card" });
  }
});

// DELETE /api/calendar/events/:id/cards/:entryId
router.delete("/events/:id/cards/:entryId", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id: eventId, entryId } = req.params;

  try {
    const deleted = await db.deleteEventCard(entryId, eventId, userSub);

    if (!deleted) {
      return res.status(404).json({ error: "Card entry not found" });
    }

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /calendar/events/:id/cards/:entryId failed:", err.message);
    res.status(500).json({ error: "Failed to delete card" });
  }
});

// ---------------------------------------------------------------------------
// Countdowns — /api/calendar/countdowns
// ---------------------------------------------------------------------------

// GET /api/calendar/countdowns?cursor=<cursor>
// returns one page of countdowns sorted by target date ascending.
// pass the nextCursor from the previous response to get the next page.
router.get("/countdowns", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { cursor } = req.query;

  try {
    const result = await db.getCountdowns(userSub, cursor || null);
    res.json(result);
  } catch (err) {
    console.error("GET /calendar/countdowns failed:", err.message);
    res.status(500).json({ error: "Failed to fetch countdowns" });
  }
});

// GET /api/calendar/countdowns/:id
// returns a single countdown, 404 if it doesn't exist or belongs to someone else
router.get("/countdowns/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const countdown = await db.getCountdownById(id, userSub);

    if (!countdown) {
      return res.status(404).json({ error: "Countdown not found" });
    }

    res.json({ countdown });
  } catch (err) {
    console.error("GET /calendar/countdowns/:id failed:", err.message);
    res.status(500).json({ error: "Failed to fetch countdown" });
  }
});

// POST /api/calendar/countdowns
// body: { title, description?, targetDate, color? }
router.post("/countdowns", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { title, description, targetDate, color } = req.body;

  if (!title || !targetDate) {
    return res.status(400).json({ error: "title and targetDate are required" });
  }

  try {
    const countdown = await db.createCountdown(
      { title, description, targetDate, color },
      userSub,
    );
    res.status(201).json({ countdown });
  } catch (err) {
    console.error("POST /calendar/countdowns failed:", err.message);
    res.status(500).json({ error: "Failed to create countdown" });
  }
});

// PUT /api/calendar/countdowns/:id
// partial update, only send the fields you want to change
router.put("/countdowns/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;
  const fields = req.body;

  if (!fields || Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "No fields provided to update" });
  }

  try {
    const countdown = await db.updateCountdown(id, fields, userSub);

    if (!countdown) {
      return res.status(404).json({ error: "Countdown not found" });
    }

    res.json({ countdown });
  } catch (err) {
    console.error("PUT /calendar/countdowns/:id failed:", err.message);
    res.status(500).json({ error: "Failed to update countdown" });
  }
});

// DELETE /api/calendar/countdowns/:id
router.delete("/countdowns/:id", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { id } = req.params;

  try {
    const deleted = await db.deleteCountdown(id, userSub);

    if (!deleted) {
      return res.status(404).json({ error: "Countdown not found" });
    }

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /calendar/countdowns/:id failed:", err.message);
    res.status(500).json({ error: "Failed to delete countdown" });
  }
});

module.exports = router;
