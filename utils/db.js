const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

// Function to add a gallery item
async function addGalleryItem({ text, description, imageUrl, date, user_sub }) {
  if (!text || !description || !imageUrl || !date) {
    throw new Error(
      "Missing required fields: title, description, imageUrl, date",
    );
  }

  const result = await pool.query(
    "INSERT INTO gallery (title, description, image_url, date, user_sub) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [text, description, imageUrl, date, user_sub],
  );

  return result.rows[0];
}

// Function to get a single gallery item by ID
async function getGalleryItemById(id) {
  if (!id) {
    throw new Error("Missing ID");
  }

  const { rows } = await pool.query("SELECT * FROM gallery WHERE id = $1", [
    id,
  ]);
  return rows[0] || null;
}

// Function to delete a gallery item by ID
async function deleteGalleryItem(id) {
  if (!id) {
    throw new Error("Missing ID for deletion");
  }

  const query = `
        DELETE FROM gallery
        WHERE id = $1
        RETURNING *;
    `;
  const values = [id];

  const { rows } = await pool.query(query, values);
  return rows[0]; // Return the deleted record
}

// Function to get gallery items with pagination
async function getGalleryItems(pageNumber, limitNumber) {
  const offset = (pageNumber - 1) * limitNumber;

  const query = `
        SELECT *
        FROM gallery
        ORDER BY date DESC
        LIMIT $1 OFFSET $2;
    `;
  const values = [limitNumber, offset];

  const { rows } = await pool.query(query, values);
  return rows; // Return the list of gallery items
}

// Function to save or update a med journal entry
async function saveOrUpdateMedJournalEntry(entry, userSub) {
  if (
    !entry ||
    !entry.patientSetting ||
    !entry.interaction ||
    !entry.date ||
    !userSub
  ) {
    throw new Error("Invalid entry data or missing user sub");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let entryId;
    if (entry.id) {
      // Update existing journal entry
      await client.query(
        `UPDATE med_journal
               SET "patientSetting" = $1, "interaction" = $2, "canmedsRoles" = $3, "learningObjectives" = $4,
                   "rotation" = $5, "date" = $6, "location" = $7, "hospital" = $8, "doctor" = $9,
                   "whatIDidWell" = $10, "whatICouldImprove" = $11
               WHERE "id" = $12 AND "user_sub" = $13`,
        [
          entry.patientSetting,
          entry.interaction,
          JSON.stringify(entry.canmedsRoles),
          JSON.stringify(entry.learningObjectives),
          entry.rotation,
          entry.date,
          entry.location,
          entry.hospital,
          entry.doctor,
          entry.whatIDidWell,
          entry.whatICouldImprove,
          entry.id,
          userSub,
        ],
      );
      entryId = entry.id;
    } else {
      // Insert new journal entry
      entryId = uuidv4();
      await client.query(
        `INSERT INTO med_journal
               ("id", "patientSetting", "interaction", "canmedsRoles", "learningObjectives", "rotation", "date", "location", "hospital", "doctor",
                "whatIDidWell", "whatICouldImprove", "user_sub")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          entryId,
          entry.patientSetting,
          entry.interaction,
          JSON.stringify(entry.canmedsRoles),
          JSON.stringify(entry.learningObjectives),
          entry.rotation,
          entry.date,
          entry.location,
          entry.hospital,
          entry.doctor,
          entry.whatIDidWell,
          entry.whatICouldImprove,
          userSub,
        ],
      );
      entry.id = entryId;
    }

    // If feedback text is provided, create a feedback entry within the same transaction
    if (entry.feedbackText) {
      const feedbackId = uuidv4();
      await client.query(
        `INSERT INTO feedback (id, text, rotation, journal_entry_id, user_sub)
               VALUES ($1, $2, $3, $4, $5)`,
        [feedbackId, entry.feedbackText, entry.rotation, entryId, userSub],
      );
    }

    await client.query("COMMIT");

    const completeEntry = await getMedJournalEntryById(entryId, userSub);
    return completeEntry;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Function to delete a med journal entry by ID
async function deleteMedJournalEntry(id, userSub) {
  if (!id || !userSub) {
    throw new Error("Missing ID or user sub for deletion");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM feedback WHERE journal_entry_id = $1", [id]);
    await client.query("DELETE FROM med_journal WHERE id = $1 AND user_sub = $2", [id, userSub]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Function to fetch a med journal entry by ID
async function getMedJournalEntryById(id, userSub) {
  if (!id || !userSub) {
    throw new Error("Missing ID or user sub for fetching entry");
  }

  const query = `
        SELECT 
            mj.*,
            f.text as feedback_text,
            f.rotation as feedback_rotation
        FROM med_journal mj
        LEFT JOIN feedback f ON f.journal_entry_id = mj.id
        WHERE mj.id = $1 AND mj.user_sub = $2;
    `;
  const values = [id, userSub];

  const { rows } = await pool.query(query, values);
  if (rows[0]) {
    const { feedback_text, feedback_rotation, ...entry } = rows[0];
    return {
      ...entry,
      feedback: feedback_text
        ? [
            {
              text: feedback_text,
              rotation: feedback_rotation,
            },
          ]
        : [],
    };
  }
  return null;
}

// Function to fetch med journal entries with pagination
async function getMedJournalEntriesWithPagination(
  pageNumber,
  limitNumber,
  userSub,
  searchTerm,
  rotation,
) {
  if (!userSub) {
    throw new Error("Missing user sub for fetching entries");
  }

  const offset = (pageNumber - 1) * limitNumber;

  // Base query with search conditions
  let query = `
        SELECT 
            mj.*,
            json_agg(
                CASE 
                    WHEN f.id IS NOT NULL THEN 
                        json_build_object(
                            'id', f.id,
                            'text', f.text,
                            'rotation', f.rotation
                        )
                    ELSE NULL
                END
            ) FILTER (WHERE f.id IS NOT NULL) as feedback_array
        FROM med_journal mj
        LEFT JOIN feedback f ON f.journal_entry_id = mj.id
        WHERE mj.user_sub = $3
    `;
  const values = [limitNumber, offset, userSub];

  // Add rotation filter if provided
  if (rotation) {
    query += ` AND mj."rotation" = $${values.length + 1}`;
    values.push(rotation);
  }

  // Add search conditions if searchTerm is provided
  if (searchTerm) {
    query += `
            AND (
                LOWER(mj."rotation") LIKE LOWER($${values.length + 1})
                OR LOWER(mj."hospital") LIKE LOWER($${values.length + 1})
                OR LOWER(mj."doctor") LIKE LOWER($${values.length + 1})
                OR LOWER(mj."location") LIKE LOWER($${values.length + 1})
                OR LOWER(mj."canmedsRoles"::text) LIKE LOWER($${values.length + 1})
                OR LOWER(mj."learningObjectives"::text) LIKE LOWER($${values.length + 1})
            )
        `;
    values.push(`%${searchTerm}%`);
  }

  query += `
        GROUP BY mj.id
        ORDER BY mj.date DESC
        LIMIT $1 OFFSET $2;
    `;

  const { rows } = await pool.query(query, values);

  // Format the entries with feedback
  return rows.map((row) => ({
    ...row,
    feedback: row.feedback_array || [],
  }));
}

// Function to fetch feedback with pagination and optional rotation filter
async function getFeedbackWithPagination(
  pageNumber,
  limitNumber,
  rotation,
  userSub,
  searchTerm,
) {
  if (!userSub) {
    throw new Error("Missing user sub for fetching feedback");
  }

  const offset = (pageNumber - 1) * limitNumber;

  // First get the total count
  let countQuery = `
        SELECT COUNT(*) as total
        FROM feedback
        WHERE user_sub = $1
    `;
  const countValues = [userSub];
  if (rotation) {
    countQuery += ` AND rotation = $2`;
    countValues.push(rotation);
  }
  if (searchTerm) {
    countQuery += ` AND (
            LOWER(text) LIKE LOWER($${countValues.length + 1})
            OR LOWER(rotation) LIKE LOWER($${countValues.length + 1})
        )`;
    countValues.push(`%${searchTerm}%`);
  }
  const { rows: countRows } = await pool.query(countQuery, countValues);
  const totalCount = parseInt(countRows[0].total);

  // Then get the paginated results
  let query = `
        SELECT 
            f.*,
            mj."id" as journal_id,
            mj."patientSetting",
            mj."interaction",
            mj."canmedsRoles",
            mj."learningObjectives",
            mj."rotation" as journal_rotation,
            mj."date",
            mj."location",
            mj."hospital",
            mj."doctor",
            mj."whatIDidWell",
            mj."whatICouldImprove"
        FROM feedback f
        LEFT JOIN med_journal mj ON f.journal_entry_id = mj.id
        WHERE f.user_sub = $1
    `;
  const values = [userSub];

  if (rotation) {
    query += ` AND f.rotation = $2`;
    values.push(rotation);
  }
  if (searchTerm) {
    query += ` AND (
            LOWER(f.text) LIKE LOWER($${values.length + 1})
            OR LOWER(f.rotation) LIKE LOWER($${values.length + 1})
        )`;
    values.push(`%${searchTerm}%`);
  }

  query += `
        ORDER BY f.id ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2};
    `;
  values.push(limitNumber, offset);

  const { rows } = await pool.query(query, values);

  // Format the feedback entries
  return {
    feedback: rows.map((row) => ({
      id: row.id,
      text: row.text,
      rotation: row.rotation,
      journal_entry_id: row.journal_entry_id,
      journal: row.journal_entry_id
        ? {
            id: row.journal_id,
            patientSetting: row.patientSetting,
            interaction: row.interaction,
            canmedsRoles: row.canmedsRoles
              ? typeof row.canmedsRoles === "string"
                ? JSON.parse(row.canmedsRoles)
                : row.canmedsRoles
              : [],
            learningObjectives: row.learningObjectives
              ? typeof row.learningObjectives === "string"
                ? JSON.parse(row.learningObjectives)
                : row.learningObjectives
              : [],
            rotation: row.journal_rotation,
            date: row.date,
            location: row.location,
            hospital: row.hospital,
            doctor: row.doctor,
            whatIDidWell: row.whatIDidWell,
            whatICouldImprove: row.whatICouldImprove,
          }
        : null,
    })),
    totalCount,
  };
}

// Function to add feedback
async function addFeedback({ text, rotation, journal_entry_id, user_sub }) {
  if (!text || !rotation || !user_sub) {
    throw new Error("Missing required fields: text, rotation, user_sub");
  }

  const id = uuidv4();
  const query = `
        INSERT INTO feedback (id, text, rotation, journal_entry_id, user_sub)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
  const values = [id, text, rotation, journal_entry_id || null, user_sub];

  const { rows } = await pool.query(query, values);
  return rows[0]; // Return the newly created feedback
}

// Function to update feedback by ID
async function updateFeedback(
  id,
  { text, rotation, journal_entry_id, user_sub },
) {
  if (!id || !text || !rotation || !user_sub) {
    throw new Error("Missing required fields: id, text, rotation, user_sub");
  }

  const query = `
        UPDATE feedback
        SET text = $1, rotation = $2, journal_entry_id = $3
        WHERE id = $4 AND user_sub = $5
        RETURNING *;
    `;
  const values = [text, rotation, journal_entry_id || null, id, user_sub];

  const { rows } = await pool.query(query, values);
  if (rows.length === 0) {
    throw new Error("Feedback not found or unauthorized");
  }
  return rows[0]; // Return the updated feedback
}

// Function to delete feedback by ID
async function deleteFeedback(id) {
  if (!id) {
    throw new Error("Missing ID for deletion");
  }

  const query = `
        DELETE FROM feedback
        WHERE id = $1
        RETURNING *;
    `;
  const values = [id];

  const { rows } = await pool.query(query, values);
  return rows[0]; // Return the deleted feedback
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

/**
 * Fetches all calendar events for a user, with an optional date range filter.
 *
 * @param {string} userSub - Auth0 sub (user identifier)
 * @param {string} [start] - ISO datetime string; only return events ending on or after this
 * @param {string} [end]   - ISO datetime string; only return events starting on or before this
 * @returns {Promise<Array>}
 */
// maps a raw calendar_events row (snake_case) to the shape the frontend expects.
// dates are always returned as UTC ISO strings (ending in Z) so the frontend
// is responsible for converting to local time for display.
function toEventCard(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    cardId: row.card_id,
    cardName: row.card_name,
    cardSetId: row.card_set_id ?? undefined,
    cardSetName: row.card_set_name ?? undefined,
    cardImageUrl: row.card_image_url ?? undefined,
    quantity: row.quantity,
    notes: row.notes ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

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

async function getCalendarEvents(userSub, start, end, cardId, cardName, calendarId) {
  const values = [userSub];
  const needsCardJoin = cardId || cardName;

  // LEFT JOIN calendar_members so members can see events on shared calendars.
  // Using a join instead of a correlated subquery lets the planner use
  // idx_calendar_members_calendar in a single pass.
  let query = `
    SELECT DISTINCT ce.*
    FROM calendar_events ce
    ${needsCardJoin ? "JOIN event_cards ec ON ec.event_id = ce.id" : ""}
    LEFT JOIN calendar_members cm
      ON cm.calendar_id = ce.calendar_id AND cm.user_sub = $1
    WHERE (ce.user_sub = $1 OR cm.user_sub IS NOT NULL)
  `;

  if (start) {
    values.push(start);
    query += ` AND ce.end_date >= $${values.length}`;
  }
  if (end) {
    values.push(end);
    query += ` AND ce.start_date <= $${values.length}`;
  }
  if (cardId) {
    values.push(cardId);
    query += ` AND ec.card_id = $${values.length}`;
  }
  if (cardName) {
    values.push(`%${cardName}%`);
    query += ` AND ec.card_name ILIKE $${values.length}`;
  }
  if (calendarId) {
    values.push(calendarId);
    query += ` AND ce.calendar_id = $${values.length}`;
  }

  query += " ORDER BY ce.start_date ASC";

  const { rows } = await pool.query(query, values);
  return rows.map(toCalendarEvent);
}

/**
 * Fetches a single calendar event by ID, scoped to the requesting user.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>}
 */
async function getCalendarEventById(id, userSub) {
  const { rows } = await pool.query(
    `SELECT ce.*
     FROM   calendar_events ce
     LEFT JOIN calendar_members cm
       ON cm.calendar_id = ce.calendar_id AND cm.user_sub = $2
     WHERE  ce.id = $1 AND (ce.user_sub = $2 OR cm.user_sub IS NOT NULL)`,
    [id, userSub],
  );
  return rows[0] ? toCalendarEvent(rows[0]) : null;
}

/**
 * Creates a new calendar event for the authenticated user.
 *
 * If calendarId is not provided we fall back to the user's oldest calendar
 * (the "Personal" calendar created during migration) so existing callers
 * don't need to be updated all at once.
 *
 * @param {{ title: string, description?: string, startDate: string, endDate: string, allDay?: boolean, color?: string, calendarId?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object>} the newly created row
 */
async function createCalendarEvent(
  { title, description, startDate, endDate, allDay = false, color = "#3b82f6", calendarId },
  userSub,
) {
  const id = uuidv4();

  // resolve the target calendar -- use the provided id or fall back to the
  // user's first calendar so we always have a non-null calendar_id
  let resolvedCalendarId = calendarId;
  if (!resolvedCalendarId) {
    const { rows: calRows } = await pool.query(
      "SELECT id FROM calendars WHERE user_sub = $1 ORDER BY created_at ASC LIMIT 1",
      [userSub],
    );
    resolvedCalendarId = calRows[0]?.id ?? null;
  }

  const { rows } = await pool.query(
    `INSERT INTO calendar_events (id, title, description, start_date, end_date, all_day, color, calendar_id, user_sub)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [id, title, description || null, startDate, endDate, allDay, color, resolvedCalendarId, userSub],
  );

  return toCalendarEvent(rows[0]);
}

/**
 * Partially updates a calendar event. Only the owner can modify it.
 * Accepts a subset of fields — anything not passed is left as-is.
 *
 * @param {string} id
 * @param {{ title?: string, description?: string, startDate?: string, endDate?: string, allDay?: boolean, color?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object|null>} updated row, or null if not found / not owned
 */
async function updateCalendarEvent(id, fields, userSub) {
  // map frontend camelCase to the actual column names
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

  // always reset sync_source to 'local' on a user-driven update, so the
  // outbound Google push fires even if the event last arrived via webhook.
  setClauses.push(`sync_source = 'local'`);

  // always bump updated_at
  values.push(new Date());
  setClauses.push(`updated_at = $${values.length}`);

  // editors on shared calendars can also update events — join membership
  values.push(id, userSub);
  const idIdx = values.length - 1;
  const subIdx = values.length;

  const { rows } = await pool.query(
    `UPDATE calendar_events ce
     SET ${setClauses.join(", ")}
     FROM (
       SELECT ce2.id
       FROM   calendar_events ce2
       LEFT JOIN calendar_members cm
         ON cm.calendar_id = ce2.calendar_id AND cm.user_sub = $${subIdx} AND cm.role = 'editor'
       WHERE  ce2.id = $${idIdx}
         AND  (ce2.user_sub = $${subIdx} OR cm.user_sub IS NOT NULL)
     ) AS allowed
     WHERE ce.id = allowed.id
     RETURNING ce.*`,
    values,
  );

  return rows[0] ? toCalendarEvent(rows[0]) : null;
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
    accessToken,
    refreshToken,
    tokenExpiry,
    googleCalId,
    channelId,
    resourceId,
    channelExpiry,
    syncToken,
  } = fields;

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

/**
 * Stores the Google event ID on one of our events after a successful push.
 * We use this later to look up the event when Google sends us a webhook.
 *
 * @param {string} eventId - our UUID
 * @param {string} googleEventId - the id Google assigned
 * @param {string} userSub
 */
async function setEventGoogleId(eventId, googleEventId, userSub) {
  await pool.query(
    "UPDATE calendar_events SET google_event_id = $1 WHERE id = $2 AND user_sub = $3",
    [googleEventId, eventId, userSub],
  );
}

/**
 * Clears the google_event_id from our event row after Google confirms a delete,
 * or when we need to unlink for any reason.
 *
 * @param {string} googleEventId
 * @param {string} userSub
 */
async function clearEventGoogleId(googleEventId, userSub) {
  await pool.query(
    "UPDATE calendar_events SET google_event_id = NULL WHERE google_event_id = $1 AND user_sub = $2",
    [googleEventId, userSub],
  );
}

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Upserts a users row from Auth0 JWT claims. Called by upsertUser middleware.
 *
 * @param {string} sub   - Auth0 sub claim
 * @param {string} email - Auth0 email claim
 */
async function upsertUser(sub, email) {
  await pool.query(
    `INSERT INTO users (sub, email, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
    [sub, email],
  );
}

/**
 * Returns the users row for a given sub, or null.
 *
 * @param {string} sub
 * @returns {Promise<Object|null>}
 */
async function getUserBySub(sub) {
  const { rows } = await pool.query('SELECT * FROM users WHERE sub = $1', [sub]);
  return rows[0] ?? null;
}

/**
 * Returns the users row for a given email, or null.
 * Used to resolve an invite email to a sub before inserting a calendar_members row.
 *
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Calendar members
// ---------------------------------------------------------------------------

/**
 * Maps a raw calendar_members row (with a joined email column) to camelCase.
 *
 * @param {Object} row
 * @returns {{ id: string, calendarId: string, userSub: string, email: string,
 *             role: string, invitedBy: string|null, createdAt: string }}
 */
function toCalendarMember(row) {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    userSub: row.user_sub,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/**
 * Returns all members of a calendar in creation order.
 * Does NOT perform an ownership check — the route layer is responsible
 * for verifying the caller is the owner or a member before calling this.
 *
 * @param {string} calendarId
 * @returns {Promise<Array>}
 */
async function getCalendarMembers(calendarId) {
  const { rows } = await pool.query(
    `SELECT cm.*, u.email
     FROM   calendar_members cm
     JOIN   users u ON u.sub = cm.user_sub
     WHERE  cm.calendar_id = $1
     ORDER BY cm.created_at ASC`,
    [calendarId],
  );
  return rows.map(toCalendarMember);
}

/**
 * Adds (or updates the role of) a calendar member. Uses a single CTE to return
 * the email without a second round-trip.
 *
 * @param {string} calendarId
 * @param {string} userSub      - the sub of the user being invited
 * @param {string} role         - 'editor' or 'viewer'
 * @param {string} invitedBySub - the sub of the user sending the invite
 * @returns {Promise<Object>} the inserted/updated toCalendarMember row
 */
async function addCalendarMember(calendarId, userSub, role, invitedBySub) {
  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO calendar_members (id, calendar_id, user_sub, role, invited_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (calendar_id, user_sub) DO UPDATE
         SET role = EXCLUDED.role, updated_at = NOW()
       RETURNING *
     )
     SELECT ins.*, u.email
     FROM   ins
     JOIN   users u ON u.sub = ins.user_sub`,
    [calendarId, userSub, role, invitedBySub],
  );
  return toCalendarMember(rows[0]);
}

/**
 * Updates the role of an existing calendar member. Owner-gated via EXISTS.
 *
 * @param {string} calendarId
 * @param {string} memberSub
 * @param {string} role     - 'editor' or 'viewer'
 * @param {string} ownerSub
 * @returns {Promise<Object|null>}
 */
async function updateCalendarMemberRole(calendarId, memberSub, role, ownerSub) {
  const { rows } = await pool.query(
    `UPDATE calendar_members SET role = $1, updated_at = NOW()
     WHERE  calendar_id = $2 AND user_sub = $3
     AND EXISTS (SELECT 1 FROM calendars WHERE id = $2 AND user_sub = $4)
     RETURNING *`,
    [role, calendarId, memberSub, ownerSub],
  );
  if (!rows[0]) return null;
  // fetch email for the mapper
  const user = await getUserBySub(memberSub);
  return toCalendarMember({ ...rows[0], email: user?.email ?? null });
}

/**
 * Removes a calendar member. Owner-gated via EXISTS.
 *
 * @param {string} calendarId
 * @param {string} memberSub
 * @param {string} ownerSub
 * @returns {Promise<Object|null>}
 */
async function removeCalendarMember(calendarId, memberSub, ownerSub) {
  const { rows } = await pool.query(
    `DELETE FROM calendar_members
     WHERE  calendar_id = $1 AND user_sub = $2
     AND EXISTS (SELECT 1 FROM calendars WHERE id = $1 AND user_sub = $3)
     RETURNING *`,
    [calendarId, memberSub, ownerSub],
  );
  if (!rows[0]) return null;
  const user = await getUserBySub(memberSub);
  return toCalendarMember({ ...rows[0], email: user?.email ?? null });
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
 * Returns all calendars for a user in creation order (oldest first).
 *
 * @param {string} userSub
 * @returns {Promise<Array>}
 */
/**
 * Returns all calendars the user owns or is a member of, in creation order.
 * Each row carries a `role` field ('owner' | 'editor' | 'viewer'). Shared
 * calendars also include `ownerSub` and `ownerEmail` from the owner's users row.
 *
 * @param {string} userSub
 * @returns {Promise<Array>}
 */
async function getCalendars(userSub) {
  const { rows } = await pool.query(
    `SELECT c.*, 'owner' AS role, NULL AS owner_sub, NULL AS owner_email
     FROM   calendars c
     WHERE  c.user_sub = $1
     UNION ALL
     SELECT c.*, cm.role, c.user_sub AS owner_sub, u.email AS owner_email
     FROM   calendars c
     JOIN   calendar_members cm ON cm.calendar_id = c.id AND cm.user_sub = $1
     JOIN   users u ON u.sub = c.user_sub
     ORDER  BY created_at ASC`,
    [userSub],
  );
  return rows.map(toCalendar);
}

/**
 * Fetches a single calendar by its UUID. Returns null if it doesn't exist
 * or belongs to a different user.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>}
 */
async function getCalendarById(id, userSub) {
  const { rows } = await pool.query(
    "SELECT * FROM calendars WHERE id = $1 AND user_sub = $2",
    [id, userSub],
  );
  return rows[0] ? toCalendar(rows[0]) : null;
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
 * Single choke-point for write authorization on calendars and their events.
 *
 * requiredRole:
 *   'owner'  — calendar settings, sharing management, delete calendar.
 *              Only the calendar's user_sub passes.
 *   'editor' — event create/update/delete.
 *              The owner and any calendar_members row with role='editor' pass.
 *
 * Returns the calendar row (via toCalendar, without role/ownerSub/ownerEmail)
 * or null when the caller is not authorized. Route handlers treat null as 403/404.
 *
 * @param {string} calendarId
 * @param {string} userSub
 * @param {'owner'|'editor'} requiredRole
 * @returns {Promise<Object|null>}
 */
async function getCalendarForMutation(calendarId, userSub, requiredRole) {
  let query;
  if (requiredRole === 'owner') {
    query = 'SELECT * FROM calendars WHERE id = $1 AND user_sub = $2';
  } else {
    query = `SELECT c.* FROM calendars c
             WHERE  c.id = $1
             AND (
               c.user_sub = $2
               OR EXISTS (
                 SELECT 1 FROM calendar_members
                 WHERE calendar_id = $1 AND user_sub = $2 AND role = 'editor'
               )
             )`;
  }
  const { rows } = await pool.query(query, [calendarId, userSub]);
  return rows[0] ? toCalendar(rows[0]) : null;
}

/**
 * Creates a new calendar for the authenticated user.
 *
 * @param {{ name: string, color?: string, syncMode?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object>} the newly created row
 */
async function createCalendar({ name, color = "#3b82f6", syncMode = "none" }, userSub) {
  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO calendars (id, name, color, user_sub, sync_mode)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, name, color, userSub, syncMode],
  );
  return toCalendar(rows[0]);
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
 * Deletes a calendar by ID. Only the owner can delete it.
 * Events belonging to the calendar cascade-delete via the FK constraint.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>} the deleted row, or null if not found
 */
async function deleteCalendar(id, userSub) {
  const { rows } = await pool.query(
    "DELETE FROM calendars WHERE id = $1 AND user_sub = $2 RETURNING *",
    [id, userSub],
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

// ---------------------------------------------------------------------------
// Event cards (TCG card ↔ calendar event junction)
// ---------------------------------------------------------------------------

/**
 * Returns all cards linked to an event. Verifies ownership via join.
 */
async function getEventCards(eventId, userSub) {
  const { rows } = await pool.query(
    `SELECT ec.*
     FROM event_cards ec
     JOIN calendar_events ce ON ce.id = ec.event_id
     WHERE ec.event_id = $1 AND ce.user_sub = $2
     ORDER BY ec.created_at ASC`,
    [eventId, userSub],
  );
  return rows.map(toEventCard);
}

/**
 * Adds a card to an event. Returns null if the event doesn't exist or isn't owned by userSub.
 */
async function addEventCard(
  { eventId, cardId, cardName, cardSetId, cardSetName, cardImageUrl, quantity, notes },
  userSub,
) {
  const { rows: owned } = await pool.query(
    "SELECT id FROM calendar_events WHERE id = $1 AND user_sub = $2",
    [eventId, userSub],
  );
  if (owned.length === 0) return null;

  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO event_cards
       (id, event_id, card_id, card_name, card_set_id, card_set_name, card_image_url, quantity, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      eventId,
      cardId,
      cardName,
      cardSetId || null,
      cardSetName || null,
      cardImageUrl || null,
      quantity ?? 1,
      notes || null,
    ],
  );
  return rows[0] ? toEventCard(rows[0]) : null;
}

/**
 * Updates quantity and/or notes on an event_cards row.
 * entryId is the event_cards UUID (not the TCGdex card_id).
 * Ownership is enforced via join to calendar_events.
 */
async function updateEventCard(entryId, eventId, fields, userSub) {
  const colMap = { quantity: "quantity", notes: "notes" };
  const setClauses = [];
  const values = [];

  for (const [key, col] of Object.entries(colMap)) {
    if (key in fields) {
      values.push(fields[key]);
      setClauses.push(`${col} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  values.push(entryId, eventId, userSub);

  const { rows } = await pool.query(
    `UPDATE event_cards ec
     SET ${setClauses.join(", ")}
     FROM calendar_events ce
     WHERE ec.id = $${values.length - 2}
       AND ec.event_id = $${values.length - 1}
       AND ec.event_id = ce.id
       AND ce.user_sub = $${values.length}
     RETURNING ec.*`,
    values,
  );
  return rows[0] ? toEventCard(rows[0]) : null;
}

/**
 * Removes a card entry from an event. Ownership enforced via join.
 */
async function deleteEventCard(entryId, eventId, userSub) {
  const { rows } = await pool.query(
    `DELETE FROM event_cards ec
     USING calendar_events ce
     WHERE ec.id = $1
       AND ec.event_id = $2
       AND ec.event_id = ce.id
       AND ce.user_sub = $3
     RETURNING ec.*`,
    [entryId, eventId, userSub],
  );
  return rows[0] ? toEventCard(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Countdowns
// ---------------------------------------------------------------------------

// Maps a raw countdowns row to the shape the frontend expects.
// target_date comes back from pg as a "YYYY-MM-DD" string (pg does not parse
// DATE columns into Date objects, unlike TIMESTAMP), so we can use it as-is.
function toCountdown(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    targetDate: row.target_date,
    color: row.color,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/** Number of countdowns returned per page. */
const COUNTDOWN_PAGE_SIZE = 50;

/**
 * Returns one page of countdowns for a user, sorted by target date ascending
 * so the nearest countdown always comes first.
 *
 * Uses a composite cursor (target_date, id) for stable keyset pagination.
 * Inserts and deletes between pages don't shift items the way OFFSET-based
 * pagination would. Cursor format is "YYYY-MM-DD__<uuid>" (double underscore
 * separates the two parts; the date portion uses single hyphens).
 *
 * Fetches COUNTDOWN_PAGE_SIZE + 1 rows and returns hasMore = true when the
 * extra row exists, so callers know whether to show a "load more" button
 * without a separate COUNT query.
 *
 * @param {string} userSub - Auth0 sub
 * @param {string|null} [cursor] - opaque cursor returned by the previous page
 * @returns {Promise<{ countdowns: Array, nextCursor: string|null }>}
 */
async function getCountdowns(userSub, cursor = null) {
  const limit = COUNTDOWN_PAGE_SIZE;
  const values = [userSub];
  let query;

  if (cursor) {
    // cursor = "YYYY-MM-DD__<uuid>"; split on first double-underscore
    const sep = cursor.indexOf("__");
    const cursorDate = cursor.slice(0, sep);
    const cursorId = cursor.slice(sep + 2);
    values.push(cursorDate, cursorId, limit + 1);
    query = `
      SELECT * FROM countdowns
      WHERE user_sub = $1
        AND (target_date > $2 OR (target_date = $2 AND id > $3))
      ORDER BY target_date ASC, id ASC
      LIMIT $4
    `;
  } else {
    values.push(limit + 1);
    query = `
      SELECT * FROM countdowns
      WHERE user_sub = $1
      ORDER BY target_date ASC, id ASC
      LIMIT $2
    `;
  }

  const { rows } = await pool.query(query, values);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(toCountdown);

  // build the next cursor from the raw row (before toCountdown) so we get
  // the original target_date string and id without any transformation
  const nextCursor = hasMore
    ? `${rows[limit - 1].target_date}__${rows[limit - 1].id}`
    : null;

  return { countdowns: page, nextCursor };
}

/**
 * Fetches a single countdown by ID. Returns null if it doesn't exist
 * or belongs to a different user.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>}
 */
async function getCountdownById(id, userSub) {
  const { rows } = await pool.query(
    "SELECT * FROM countdowns WHERE id = $1 AND user_sub = $2",
    [id, userSub],
  );
  return rows[0] ? toCountdown(rows[0]) : null;
}

/**
 * Creates a new countdown for the authenticated user.
 *
 * @param {{ title: string, description?: string, targetDate: string, color?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object>} the newly created row
 */
async function createCountdown({ title, description, targetDate, color = "#6366f1" }, userSub) {
  const id = uuidv4();

  const { rows } = await pool.query(
    `INSERT INTO countdowns (id, title, description, target_date, color, user_sub)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, title, description || null, targetDate, color, userSub],
  );

  return toCountdown(rows[0]);
}

/**
 * Partially updates a countdown. Only the owner can modify it.
 * Pass only the fields you want to change, everything else stays as-is.
 *
 * @param {string} id
 * @param {{ title?: string, description?: string, targetDate?: string, color?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object|null>} the updated row, or null if not found
 */
async function updateCountdown(id, fields, userSub) {
  const colMap = {
    title: "title",
    description: "description",
    targetDate: "target_date",
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

  values.push(id, userSub);

  const { rows } = await pool.query(
    `UPDATE countdowns
     SET ${setClauses.join(", ")}
     WHERE id = $${values.length - 1} AND user_sub = $${values.length}
     RETURNING *`,
    values,
  );

  return rows[0] ? toCountdown(rows[0]) : null;
}

/**
 * Deletes a countdown by ID. Only the owner can delete it.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>} the deleted row, or null if not found
 */
async function deleteCountdown(id, userSub) {
  const { rows } = await pool.query(
    "DELETE FROM countdowns WHERE id = $1 AND user_sub = $2 RETURNING *",
    [id, userSub],
  );
  return rows[0] ? toCountdown(rows[0]) : null;
}

module.exports = {
  addGalleryItem,
  getGalleryItemById,
  deleteGalleryItem,
  getGalleryItems,
  saveOrUpdateMedJournalEntry,
  deleteMedJournalEntry,
  getMedJournalEntryById,
  getMedJournalEntriesWithPagination,
  getFeedbackWithPagination,
  addFeedback,
  updateFeedback,
  deleteFeedback,
  getCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getEventCards,
  addEventCard,
  updateEventCard,
  deleteEventCard,
  getCountdowns,
  getCountdownById,
  createCountdown,
  updateCountdown,
  deleteCountdown,
  upsertUser,
  getUserBySub,
  getUserByEmail,
  getCalendarMembers,
  addCalendarMember,
  updateCalendarMemberRole,
  removeCalendarMember,
  getCalendars,
  getCalendarById,
  getCalendarByGoogleCalId,
  getCalendarForMutation,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  createCalendarEventFromWebhook,
  getEventByGoogleId,
  updateCalendarEventFromWebhook,
  getGoogleAuth,
  upsertGoogleAuth,
  deleteGoogleAuth,
  updateChannelInfo,
  updateSyncToken,
  setEventGoogleId,
  clearEventGoogleId,
};
