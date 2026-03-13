const express = require("express");
const db = require("../utils/db");
const { checkJwt } = require("../middleware/auth");
const {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  stopWatchByCalId,
} = require("../utils/googleCalendar");

const router = express.Router();

// all calendar routes require a valid Auth0 token
router.use(checkJwt);

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
    try {
      const calendar = await db.getCalendarById(event.calendarId, userSub);
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
      const calendar = await db.getCalendarById(event.calendarId, userSub);
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
      const calendar = await db.getCalendarById(existing.calendarId, userSub);
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
    const calendar = await db.getCalendarById(id, userSub);

    if (!calendar) {
      return res.status(404).json({ error: "Calendar not found" });
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
