const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const { encryptIfConfigured } = require("./tokenCrypto");

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

// maps a raw calendar_events row (snake_case) to the shape the frontend expects.
// dates are always returned as UTC ISO strings (ending in Z) so the frontend
// is responsible for converting to local time for display.
function toCalendarEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    startDate: row.start_date instanceof Date ? row.start_date.toISOString() : row.start_date,
    endDate: row.end_date instanceof Date ? row.end_date.toISOString() : row.end_date,
    allDay: row.all_day,
    color: row.color,
    calendarId: row.calendar_id ?? undefined,
    // included so route handlers can read it for Google push sync without a second query
    googleEventId: row.google_event_id ?? undefined,
  };
}

/**
 * Deletes a calendar event by ID. Only the owner can delete it.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>} the deleted row, or null if not found
 */
async function deleteCalendarEvent(id, userSub) {
  // editors on shared calendars can also delete events
  const { rows } = await pool.query(
    `DELETE FROM calendar_events
     WHERE id = $1
       AND (
         user_sub = $2
         OR EXISTS (
           SELECT 1 FROM calendar_members cm
           JOIN calendar_events ce ON ce.id = $1
           WHERE cm.calendar_id = ce.calendar_id AND cm.user_sub = $2 AND cm.role = 'editor'
         )
       )
     RETURNING *`,
    [id, userSub],
  );

  return rows[0] ? toCalendarEvent(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Google Calendar sync helpers
// ---------------------------------------------------------------------------

/**
 * Returns the google_auth row for a user, or null if they haven't connected.
 *
 * @param {string} userId - Auth0 sub
 * @returns {Promise<Object|null>}
 */
async function getGoogleAuth(userId) {
  const { rows } = await pool.query(
    "SELECT * FROM google_auth WHERE user_id = $1",
    [userId],
  );
  return rows[0] || null;
}

/**
 * Creates or updates the google_auth row for a user. Partial updates are fine,
 * any field you leave out just stays as-is (except updated_at, which always refreshes).
 *
 * @param {string} userId
 * @param {{ accessToken?: string, refreshToken?: string, tokenExpiry?: Date,
 *            googleCalId?: string, channelId?: string, resourceId?: string,
 *            channelExpiry?: Date, syncToken?: string }} fields
 */
async function upsertGoogleAuth(userId, fields) {
  const {
    accessToken: rawAccessToken,
    refreshToken: rawRefreshToken,
    tokenExpiry,
    googleCalId,
    channelId,
    resourceId,
    channelExpiry,
    syncToken,
  } = fields;

  // Encrypted at rest when TOKEN_ENCRYPTION_KEY is set. The refresh token is a
  // long-lived, offline-scope credential for the user's whole calendar, so a
  // leaked backup or replica would otherwise be permanent access.
  const accessToken =
    rawAccessToken == null ? rawAccessToken : encryptIfConfigured(rawAccessToken);
  const refreshToken =
    rawRefreshToken == null ? rawRefreshToken : encryptIfConfigured(rawRefreshToken);

  await pool.query(
    `INSERT INTO google_auth
       (user_id, access_token, refresh_token, token_expiry, google_cal_id,
        channel_id, resource_id, channel_expiry, sync_token, updated_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'primary'), $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       access_token   = COALESCE($2, google_auth.access_token),
       refresh_token  = COALESCE($3, google_auth.refresh_token),
       token_expiry   = COALESCE($4, google_auth.token_expiry),
       google_cal_id  = COALESCE($5, google_auth.google_cal_id),
       channel_id     = COALESCE($6, google_auth.channel_id),
       resource_id    = COALESCE($7, google_auth.resource_id),
       channel_expiry = COALESCE($8, google_auth.channel_expiry),
       sync_token     = COALESCE($9, google_auth.sync_token),
       updated_at     = NOW()`,
    [userId, accessToken, refreshToken, tokenExpiry, googleCalId,
     channelId, resourceId, channelExpiry, syncToken],
  );
}

/**
 * Removes the google_auth row when a user disconnects. Also clears their
 * channel info so the renewal job skips them.
 *
 * @param {string} userId
 */
async function deleteGoogleAuth(userId) {
  await pool.query("DELETE FROM google_auth WHERE user_id = $1", [userId]);
}

/**
 * Saves the watch channel details after registering a new channel with Google.
 * Called right after a successful POST to the Google watch endpoint.
 *
 * @param {string} userId
 * @param {{ channelId: string, resourceId: string, channelExpiry: Date }} info
 */
async function updateChannelInfo(userId, { channelId, resourceId, channelExpiry }) {
  await pool.query(
    `UPDATE google_auth
     SET channel_id = $2, resource_id = $3, channel_expiry = $4, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, channelId, resourceId, channelExpiry],
  );
}

/**
 * Saves the latest sync token after processing an incremental fetch from Google.
 * The token is Google's cursor, we hand it back next time to get only the delta.
 *
 * @param {string} userId
 * @param {string} syncToken
 */
async function updateSyncToken(userId, syncToken) {
  await pool.query(
    "UPDATE google_auth SET sync_token = $2, updated_at = NOW() WHERE user_id = $1",
    [userId, syncToken],
  );
}

/**
 * Finds a calendar event by its Google event ID, scoped to the user.
 * Returns the raw DB row (not toCalendarEvent) so the caller can read
 * updated_at directly for conflict resolution.
 *
 * @param {string} googleEventId
 * @param {string} userSub
 * @returns {Promise<Object|null>}
 */
async function getEventByGoogleId(googleEventId, userSub) {
  const { rows } = await pool.query(
    "SELECT * FROM calendar_events WHERE google_event_id = $1 AND user_sub = $2",
    [googleEventId, userSub],
  );
  return rows[0] || null;
}

/**
 * Updates a calendar event with data that arrived from a Google webhook.
 * Sets sync_source='google' instead of 'local' so the next user-driven
 * mutation knows to push back out rather than skip.
 *
 * Only updates the fields that Google actually tracks (title, description,
 * startDate, endDate, allDay, color). Uses the same colMap pattern as
 * updateCalendarEvent.
 *
 * @param {string} id - our UUID
 * @param {{ title?: string, description?: string, startDate?: string, endDate?: string, allDay?: boolean, color?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object|null>}
 */
async function updateCalendarEventFromWebhook(id, fields, userSub) {
  const colMap = {
    title: "title",
    description: "description",
    startDate: "start_date",
    endDate: "end_date",
    allDay: "all_day",
    color: "color",
  };

  const setClauses = [];
  const values = [];

  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      values.push(fields[key]);
      setClauses.push(`${col} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  // mark as coming from Google so the next user edit knows it needs a push
  setClauses.push(`sync_source = 'google'`);

  values.push(new Date());
  setClauses.push(`updated_at = $${values.length}`);

  values.push(id, userSub);

  const { rows } = await pool.query(
    `UPDATE calendar_events
     SET ${setClauses.join(", ")}
     WHERE id = $${values.length - 1} AND user_sub = $${values.length}
     RETURNING *`,
    values,
  );

  return rows[0] ? toCalendarEvent(rows[0]) : null;
}


// maps a raw calendars row (snake_case) to the camelCase shape the frontend expects.
// the watch channel fields (channelId etc.) live here because each two_way calendar
// has its own dedicated channel, unlike the old setup where channels were per-user.
function toCalendar(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    userSub: row.user_sub,
    googleCalId: row.google_cal_id ?? undefined,
    googleCalName: row.google_cal_name ?? undefined,
    syncMode: row.sync_mode,
    channelId: row.channel_id ?? undefined,
    resourceId: row.resource_id ?? undefined,
    channelExpiry: row.channel_expiry instanceof Date ? row.channel_expiry.toISOString() : (row.channel_expiry ?? undefined),
    syncToken: row.sync_token ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    // sharing fields — present when the UNION query is used (getCalendars)
    role: row.role ?? undefined,
    ownerSub: row.owner_sub ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

/**
 * Resolve the owner of a push channel from the channel id Google sends back.
 *
 * The webhook is necessarily unauthenticated — Google calls it, not a user — so
 * the notification has to identify itself. The channel token can't do that job:
 * it is built from the Auth0 sub and calendar id, both of which appear in
 * public responses elsewhere, so anyone can construct one. The channel id is a
 * uuid4 that only Google and this database ever see, which makes it the thing
 * worth trusting.
 *
 * Channel info lands on the calendars row when one matches, and falls back to
 * google_auth for legacy channels, so both have to be checked.
 *
 * @param {string} channelId
 * @returns {Promise<{userId: string, googleCalId: string}|null>}
 */
async function findChannelOwner(channelId) {
  const { rows } = await pool.query(
    `SELECT user_sub AS user_id, google_cal_id
       FROM calendars
      WHERE channel_id = $1
      UNION ALL
     SELECT user_id, google_cal_id
       FROM google_auth
      WHERE channel_id = $1
      LIMIT 1`,
    [channelId],
  );
  if (!rows[0]) return null;
  return { userId: rows[0].user_id, googleCalId: rows[0].google_cal_id };
}

/**
 * Looks up a calendar by its Google Calendar ID. The webhook handler uses this
 * to figure out which of our calendars a notification belongs to.
 *
 * @param {string} googleCalId
 * @param {string} userSub
 * @returns {Promise<Object|null>}
 */
async function getCalendarByGoogleCalId(googleCalId, userSub) {
  const { rows } = await pool.query(
    "SELECT * FROM calendars WHERE google_cal_id = $1 AND user_sub = $2",
    [googleCalId, userSub],
  );
  return rows[0] ? toCalendar(rows[0]) : null;
}

/**
 * Partially updates a calendar. Only the owner can modify it.
 * Pass only the fields you want to change -- everything else stays as-is.
 * Always bumps updated_at.
 *
 * @param {string} id
 * @param {{ name?: string, color?: string, syncMode?: string, googleCalId?: string,
 *           googleCalName?: string, channelId?: string, resourceId?: string,
 *           channelExpiry?: string, syncToken?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object|null>} updated row, or null if not found / not owned
 */
async function updateCalendar(id, fields, userSub) {
  const colMap = {
    name: "name",
    color: "color",
    syncMode: "sync_mode",
    googleCalId: "google_cal_id",
    googleCalName: "google_cal_name",
    channelId: "channel_id",
    resourceId: "resource_id",
    channelExpiry: "channel_expiry",
    syncToken: "sync_token",
  };

  const setClauses = [];
  const values = [];

  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      values.push(fields[key]);
      setClauses.push(`${col} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  // always bump updated_at so callers don't have to pass it explicitly
  values.push(new Date());
  setClauses.push(`updated_at = $${values.length}`);

  values.push(id, userSub);

  const { rows } = await pool.query(
    `UPDATE calendars
     SET ${setClauses.join(", ")}
     WHERE id = $${values.length - 1} AND user_sub = $${values.length}
     RETURNING *`,
    values,
  );

  return rows[0] ? toCalendar(rows[0]) : null;
}

/**
 * Inserts a calendar event that arrived from a Google webhook. Sets sync_source
 * to 'google' so any subsequent user-driven mutation knows to push back out.
 *
 * Default color and title are applied here rather than in the webhook handler
 * so this helper is safe to call without sanitizing the Google event first.
 *
 * @param {{ title?: string, description?: string, startDate: string, endDate: string, allDay?: boolean, color?: string }} fields
 * @param {string} googleEventId
 * @param {string} calendarId - UUID of our calendar row
 * @param {string} userSub
 * @returns {Promise<Object>} the newly created row
 */
async function createCalendarEventFromWebhook(fields, googleEventId, calendarId, userSub) {
  const {
    title = "",
    description,
    startDate,
    endDate,
    allDay = false,
    color = "#3b82f6",
  } = fields;

  const id = uuidv4();

  const { rows } = await pool.query(
    `INSERT INTO calendar_events
       (id, title, description, start_date, end_date, all_day, color,
        calendar_id, user_sub, google_event_id, sync_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'google')
     RETURNING *`,
    [id, title, description || null, startDate, endDate, allDay, color,
     calendarId, userSub, googleEventId],
  );

  return toCalendarEvent(rows[0]);
}

// Only what the Google Calendar sync still calls. Everything else that lived
// here (gallery, feedback, cards, countdowns, users, members, calendar CRUD) moved
// into the TypeScript modules and the copies had no callers left.
module.exports = {
  deleteCalendarEvent,
  findChannelOwner,
  getCalendarByGoogleCalId,
  updateCalendar,
  createCalendarEventFromWebhook,
  getEventByGoogleId,
  updateCalendarEventFromWebhook,
  getGoogleAuth,
  upsertGoogleAuth,
  deleteGoogleAuth,
  updateChannelInfo,
  updateSyncToken,
};
