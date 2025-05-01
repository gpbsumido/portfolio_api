const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Function to add a gallery item
async function addGalleryItem({ text, description, imageUrl, date }) {
    if (!text || !description || !imageUrl || !date) {
        throw new Error("Missing required fields: title, description, imageUrl, date");
    }

    const result = await pool.query(
        'INSERT INTO gallery (title, description, image_url, date) VALUES ($1, $2, $3, $4) RETURNING *',
        [text, description, imageUrl, date]
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
async function saveOrUpdateMedJournalEntry(entry) {
    if (!entry || !entry.patientsetting || !entry.interaction || !entry.date) {
        throw new Error("Invalid entry data");
    }

    if (entry.id) {
        // Update existing entry
        await pool.query(
            `UPDATE med_journal 
             SET patientSetting = $1, interaction = $2, canmedsRoles = $3, learningObjectives = $4, 
                 rotation = $5, date = $6, location = $7, hospital = $8, doctor = $9 
             WHERE id = $10`,
            [
                entry.patientsetting,
                entry.interaction,
                JSON.stringify(entry.canmedsRoles),
                JSON.stringify(entry.learningObjectives),
                entry.rotation,
                entry.date,
                entry.location,
                entry.hospital,
                entry.doctor,
                entry.id,
            ]
        );
    } else {
        // Insert new entry
        const newId = uuidv4();
        await pool.query(
            `INSERT INTO med_journal 
             (id, patientSetting, interaction, canmedsRoles, learningObjectives, rotation, date, location, hospital, doctor) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                newId,
                entry.patientsetting,
                entry.interaction,
                JSON.stringify(entry.canmedsRoles),
                JSON.stringify(entry.learningObjectives),
                entry.rotation,
                entry.date,
                entry.location,
                entry.hospital,
                entry.doctor,
            ]
        );
        entry.id = newId;
    }

    return entry;
}

// Function to delete a med journal entry by ID
async function deleteMedJournalEntry(id) {
    if (!id) {
        throw new Error("Missing ID for deletion");
    }

    await pool.query('DELETE FROM med_journal WHERE id = $1', [id]);
}

// Function to fetch a med journal entry by ID
async function getMedJournalEntryById(id) {
    if (!id) {
        throw new Error("Missing ID for fetching entry");
    }

    const { rows } = await pool.query('SELECT * FROM med_journal WHERE id = $1', [id]);
    return rows[0]; // Return the fetched entry
}

// Function to fetch med journal entries with pagination
async function getMedJournalEntriesWithPagination(pageNumber, limitNumber) {
    const offset = (pageNumber - 1) * limitNumber;

    const query = `
        SELECT *
        FROM med_journal
        ORDER BY date DESC
        LIMIT $1 OFFSET $2;
    `;
    const values = [limitNumber, offset];

    const { rows } = await pool.query(query, values);
    return rows; // Return the list of med journal entries
}

module.exports = {
    addGalleryItem,
    deleteGalleryItem,
    getGalleryItems,
    saveOrUpdateMedJournalEntry,
    deleteMedJournalEntry,
    getMedJournalEntryById,
    getMedJournalEntriesWithPagination,
};
