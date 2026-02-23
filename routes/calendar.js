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

// GET /api/calendar/events?start=<ISO>&end=<ISO>
// returns events for the authenticated user, optionally filtered by date range
router.get("/events", async (req, res) => {
  const userSub = req.auth.payload.sub;
  const { start, end } = req.query;

  try {
    const events = await db.getCalendarEvents(userSub, start, end);
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

module.exports = router;
