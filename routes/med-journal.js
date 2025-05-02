const express = require('express');
const db = require('../utils/db'); // Updated path to utils/db.js
const { checkJwt, checkPermissions } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all routes in this router
router.use(checkJwt);

// Save or update an entry
router.post('/save-entry', async (req, res) => {
    const entry = req.body;
    const userSub = req.auth.payload.sub; // Updated to use payload.sub

    try {
        // If feedback text is provided, ensure it's in the correct format
        if (entry.feedbackText) {
            entry.feedback = [{
                text: entry.feedbackText,
                rotation: entry.rotation
            }];
        }
        
        const savedEntry = await db.saveOrUpdateMedJournalEntry(entry, userSub);
        res.status(200).json({ success: true, entry: savedEntry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save entry' });
    }
});

// Delete an entry
router.delete('/delete-entry/:id', async (req, res) => {
    const { id } = req.params;
    const userSub = req.auth.payload.sub; // Updated to use payload.sub

    try {
        await db.deleteMedJournalEntry(id, userSub);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

// Edit an entry (fetch entry by ID)
router.get('/edit-entry/:id', async (req, res) => {
    const { id } = req.params;
    const userSub = req.auth.payload.sub; // Updated to use payload.sub

    try {
        const entry = await db.getMedJournalEntryById(id, userSub);
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
    const { page = 1, limit = 10, searchTerm, rotation } = req.query;
    const userSub = req.auth.payload.sub;

    try {
        const entries = await db.getMedJournalEntriesWithPagination(Number(page), Number(limit), userSub, searchTerm, rotation);
        res.status(200).json({ success: true, entries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

// Example route with authentication
router.get('/', async (req, res) => {
  try {
    // The user's Auth0 ID is available in req.auth.sub
    const userId = req.auth.sub;
    res.json({ 
      message: 'Authenticated successfully!',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example route with specific permissions
router.post('/', checkPermissions(['write:med-journal']), async (req, res) => {
  try {
    const userId = req.auth.sub;
    // Your route logic here
    res.json({ 
      message: 'Entry created successfully',
      userId: userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;