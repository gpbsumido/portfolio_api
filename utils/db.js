const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Function to add a gallery item
async function addGalleryItem({ text, description, imageUrl, date, user_sub }) {
    if (!text || !description || !imageUrl || !date) {
        throw new Error("Missing required fields: title, description, imageUrl, date");
    }

    const result = await pool.query(
        'INSERT INTO gallery (title, description, image_url, date, user_sub) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [text, description, imageUrl, date, user_sub]
    );

    return result.rows[0];
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
    if (!entry || !entry.patientSetting || !entry.interaction || !entry.date || !userSub) {
        throw new Error("Invalid entry data or missing user sub");
    }

    let entryId;
    if (entry.id) {
        // Update existing journal entry
        await pool.query(
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
                userSub
            ]
        );
        entryId = entry.id;
    } else {
        // Insert new journal entry
        entryId = uuidv4();
        await pool.query(
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
                userSub
            ]
        );
        entry.id = entryId;
    }

    // If feedback text is provided, create a feedback entry
    if (entry.feedbackText) {
        await addFeedback({
            text: entry.feedbackText,
            rotation: entry.rotation,
            journal_entry_id: entryId,
            user_sub: userSub
        });
    }

    // Fetch the complete entry with any associated feedback
    const completeEntry = await getMedJournalEntryById(entryId, userSub);
    return completeEntry;
}

// Function to delete a med journal entry by ID
async function deleteMedJournalEntry(id, userSub) {
    if (!id || !userSub) {
        throw new Error("Missing ID or user sub for deletion");
    }

    // First delete any associated feedback entries
    await pool.query('DELETE FROM feedback WHERE journal_entry_id = $1', [id]);

    // Then delete the journal entry
    await pool.query('DELETE FROM med_journal WHERE id = $1 AND user_sub = $2', [id, userSub]);
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
            feedback: feedback_text ? [{
                text: feedback_text,
                rotation: feedback_rotation
            }] : []
        };
    }
    return null;
}

// Function to fetch med journal entries with pagination
async function getMedJournalEntriesWithPagination(pageNumber, limitNumber, userSub, searchTerm, rotation) {
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
    return rows.map(row => ({
        ...row,
        feedback: row.feedback_array || []
    }));
}

// Function to fetch feedback with pagination and optional rotation filter
async function getFeedbackWithPagination(pageNumber, limitNumber, rotation, userSub, searchTerm) {
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
        feedback: rows.map(row => ({
            id: row.id,
            text: row.text,
            rotation: row.rotation,
            journal_entry_id: row.journal_entry_id,
            journal: row.journal_entry_id ? {
                id: row.journal_id,
                patientSetting: row.patientSetting,
                interaction: row.interaction,
                canmedsRoles: row.canmedsRoles ? (typeof row.canmedsRoles === 'string' ? JSON.parse(row.canmedsRoles) : row.canmedsRoles) : [],
                learningObjectives: row.learningObjectives ? (typeof row.learningObjectives === 'string' ? JSON.parse(row.learningObjectives) : row.learningObjectives) : [],
                rotation: row.journal_rotation,
                date: row.date,
                location: row.location,
                hospital: row.hospital,
                doctor: row.doctor,
                whatIDidWell: row.whatIDidWell,
                whatICouldImprove: row.whatICouldImprove
            } : null
        })),
        totalCount
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
async function updateFeedback(id, { text, rotation, journal_entry_id, user_sub }) {
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

module.exports = {
    addGalleryItem,
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
};