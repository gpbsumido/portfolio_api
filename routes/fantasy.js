const express = require('express');
const { runPythonScriptQueued, MEMORY_ERROR_MESSAGES } = require('../utils/pythonQueue');
const { calculateQualifyingPoints, calculateRacePoints } = require('../utils/fantasyScoring');

// Route to calculate fantasy points for a specific race
router.get('/points/:year/:round', async (req, res, next) => {
    const { year, round } = req.params;

    try {
        const results = await runPythonScriptQueued('get_fantasy_data.py', [year, round]);

        if (results.error) {
            return res.status(500).json({ error: results.error });
        }

        const fantasyPoints = {};

        results.qualifying.forEach((qualiResult) => {
            const driver = qualiResult.driver;
            const raceResult = results.race.find((r) => r.driver === driver);
            if (!raceResult) return;

            const qualifyingPoints = calculateQualifyingPoints(qualiResult);
            const racePoints = calculateRacePoints(raceResult, qualiResult);

            fantasyPoints[driver] = {
                total: qualifyingPoints.points + racePoints.points,
                qualifying: qualifyingPoints,
                race: racePoints,
            };
        });

        res.json({
            event: results.event_info,
            points: fantasyPoints,
            unprocessed: results,
        });
    } catch (error) {
        if (error.message === MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT) {
            return res.status(503).json({
                error: 'Request timeout',
                details: 'The request took too long due to high server load.',
                suggestion: 'Please try again later',
            });
        }
        next(error);
    }
});

module.exports = router;
