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
  };
}

async function getCalendarEvents(userSub, start, end, cardId, cardName) {
  const values = [userSub];
  const needsCardJoin = cardId || cardName;

  let query = `
    SELECT DISTINCT ce.*
    FROM calendar_events ce
    ${needsCardJoin ? "JOIN event_cards ec ON ec.event_id = ce.id" : ""}
    WHERE ce.user_sub = $1
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
    "SELECT * FROM calendar_events WHERE id = $1 AND user_sub = $2",
    [id, userSub],
  );
  return rows[0] ? toCalendarEvent(rows[0]) : null;
}

/**
 * Creates a new calendar event for the authenticated user.
 *
 * @param {{ title: string, description?: string, startDate: string, endDate: string, allDay?: boolean, color?: string }} fields
 * @param {string} userSub
 * @returns {Promise<Object>} the newly created row
 */
async function createCalendarEvent(
  { title, description, startDate, endDate, allDay = false, color = "#3b82f6" },
  userSub,
) {
  const id = uuidv4();

  const { rows } = await pool.query(
    `INSERT INTO calendar_events (id, title, description, start_date, end_date, all_day, color, user_sub)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, title, description || null, startDate, endDate, allDay, color, userSub],
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

  // always bump updated_at
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
 * Deletes a calendar event by ID. Only the owner can delete it.
 *
 * @param {string} id
 * @param {string} userSub
 * @returns {Promise<Object|null>} the deleted row, or null if not found
 */
async function deleteCalendarEvent(id, userSub) {
  const { rows } = await pool.query(
    "DELETE FROM calendar_events WHERE id = $1 AND user_sub = $2 RETURNING *",
    [id, userSub],
  );

  return rows[0] ? toCalendarEvent(rows[0]) : null;
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
};
