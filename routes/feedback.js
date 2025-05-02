const express = require('express');
const { checkJwt } = require('../middleware/auth');
const { addFeedback, updateFeedback, deleteFeedback, getFeedbackWithPagination } = require('../utils/db');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(checkJwt);

// Get feedback with pagination and optional rotation filter
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, rotation, searchTerm } = req.query;
        const userSub = req.auth.payload.sub;
        if (!userSub) {
            return res.status(401).json({ error: 'Unauthorized: No user sub found' });
        }
        const { feedback, totalCount } = await getFeedbackWithPagination(Number(page), Number(limit), rotation, userSub, searchTerm);
        res.status(200).json({ success: true, feedback, totalCount });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

// Add new feedback
router.post('/', async (req, res) => {
    try {
        const { text, rotation, journal_entry_id } = req.body;
        const userSub = req.auth.payload.sub; // Get user_sub from auth payload
        if (!text || !rotation) {
            return res.status(400).json({ error: 'Missing required fields: text, rotation' });
        }

        const feedback = await addFeedback({ text, rotation, journal_entry_id, user_sub: userSub });
        res.status(201).json({ success: true, feedback });
    } catch (error) {
        console.error('Error adding feedback:', error);
        res.status(500).json({ error: 'Failed to add feedback' });
    }
});

// Update feedback
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { text, rotation, journal_entry_id } = req.body;
        const userSub = req.auth.payload.sub; // Get user_sub from auth payload
        if (!text || !rotation) {
            return res.status(400).json({ error: 'Missing required fields: text, rotation' });
        }

        const feedback = await updateFeedback(id, { text, rotation, journal_entry_id, user_sub: userSub });
        res.status(200).json({ success: true, feedback });
    } catch (error) {
        console.error('Error updating feedback:', error);
        if (error.message === "Feedback not found or unauthorized") {
            res.status(404).json({ error: 'Feedback not found or unauthorized' });
        } else {
            res.status(500).json({ error: 'Failed to update feedback' });
        }
    }
});

// Delete feedback
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await deleteFeedback(id);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).json({ error: 'Failed to delete feedback' });
    }
});

module.exports = router; 