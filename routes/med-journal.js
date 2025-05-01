const express = require('express');
const db = require('../utils/db'); // Updated path to utils/db.js

const router = express.Router();

// Save or update an entry
router.post('/save-entry', async (req, res) => {
    const entry = req.body;

    try {
        const savedEntry = await db.saveOrUpdateMedJournalEntry(entry);
        res.status(200).json({ success: true, entry: savedEntry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save entry' });
    }
});

// Delete an entry
router.delete('/delete-entry/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.deleteMedJournalEntry(id);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

// Edit an entry (fetch entry by ID)
router.get('/edit-entry/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const entry = await db.getMedJournalEntryById(id);
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        res.status(200).json({ success: true, entry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch entry' });
    }
});

// Fetch entries with pagination
router.get('/entries', async (req, res) => {
    const { page = 1, limit = 10 } = req.query;

    try {
        const entries = await db.getMedJournalEntriesWithPagination(Number(page), Number(limit));
        res.status(200).json({ success: true, entries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

module.exports = router;