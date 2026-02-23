const express = require("express");
const db = require("../utils/db");
const { checkJwt } = require("../middleware/auth");

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

// GET /api/calendar/events?start=<ISO>&end=<ISO>&cardId=<id>&cardName=<name>
// returns events for the authenticated user with optional date range and card filters
router.get("/events", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { start, end, cardId, cardName } = req.query;

  try {
    const events = await db.getCalendarEvents(userSub, start, end, cardId, cardName);
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
// body: { title, description?, startDate, endDate, allDay?, color? }
router.post("/events", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { title, description, startDate, endDate, allDay, color } = req.body;

  if (!title || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "title, startDate, and endDate are required" });
  }

  try {
    const event = await db.createCalendarEvent(
      { title, description, startDate, endDate, allDay, color },
      userSub,
    );
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
    const deleted = await db.deleteCalendarEvent(id, userSub);

    if (!deleted) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.status(204).send();
  } catch (err) {
    console.error("DELETE /calendar/events/:id failed:", err.message);
    res.status(500).json({ error: "Failed to delete event" });
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

module.exports = router;
