const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

// Scoring system
const POINTS_SYSTEM = {
    race: {
        positions: {
            1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
            6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
        },
        positionsGained: 1,
        positionsLost: -1,
        overtakes: 1,
        fastestLap: 10,
        driverOfTheDay: 10,
        dnf: -20,
        disqualified: -20,
    },
    qualifying: {
        Q3_appearance: 0,
        Q2_appearance: 0,
        positions: {
            1: 10, 2: 9, 3: 8, 4: 7, 5: 6,
            6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
        },
    },
    sprint: {
        positions: {
            1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1,
        },
        positionsGained: 1,
        positionsLost: -1,
        overtakes: 1,
        fastestLap: 5,
        dnf: -20,
        disqualified: -20,
    },
};

function calculateQualifyingPoints(qualifyingResult) {
    let points = 0;
    const breakdown = {};

    if (qualifyingResult.Q2) {
        points += POINTS_SYSTEM.qualifying.Q2_appearance;
        breakdown.Q2_appearance = POINTS_SYSTEM.qualifying.Q2_appearance;
    }
    if (qualifyingResult.Q3) {
        points += POINTS_SYSTEM.qualifying.Q3_appearance;
        breakdown.Q3_appearance = POINTS_SYSTEM.qualifying.Q3_appearance;
    }

    const positionPoints = POINTS_SYSTEM.qualifying.positions[qualifyingResult.position];
    if (positionPoints) {
        points += positionPoints;
        breakdown.position = positionPoints;
    }

    return { points, breakdown };
}

function calculateRacePoints(raceResult, qualifyingResult) {
    let points = 0;
    const breakdown = {};
    let ignorePosLost = false;

    const positionPoints = POINTS_SYSTEM.race.positions[raceResult.position];
    if (positionPoints !== undefined) {
        points += positionPoints;
        breakdown.position = positionPoints;
    }

    if (raceResult.fastestLap) {
        points += POINTS_SYSTEM.race.fastestLap;
        breakdown.fastestLap = POINTS_SYSTEM.race.fastestLap;
    }

    if (raceResult.driverOfTheDay) {
        points += POINTS_SYSTEM.race.driverOfTheDay;
        breakdown.driverOfTheDay = POINTS_SYSTEM.race.driverOfTheDay;
    }

    const dnfStatuses = ['DNF', 'Not Classified', 'Retired', 'Mechanical', 'Accident'];
    if (dnfStatuses.includes(raceResult.status) || (raceResult.dnf && raceResult.status !== 'Lapped')) {
        ignorePosLost = true;
        points += POINTS_SYSTEM.race.dnf;
        breakdown.dnf = POINTS_SYSTEM.race.dnf;
    }

    const positionsGained = qualifyingResult.position - raceResult.position;
    if (positionsGained > 0) {
        const gainedPoints = positionsGained * POINTS_SYSTEM.race.positionsGained;
        points += gainedPoints;
        breakdown.positionsGained = gainedPoints;
    } else if (positionsGained < 0 && !ignorePosLost) {
        const lostPoints = Math.abs(positionsGained) * POINTS_SYSTEM.race.positionsLost;
        points += lostPoints;
        breakdown.positionsLost = lostPoints;
    }

    if (raceResult.overtakes) {
        const overtakePoints = raceResult.overtakes * POINTS_SYSTEM.race.overtakes;
        points += overtakePoints;
        breakdown.overtakes = overtakePoints;
    }

    if (raceResult.status === 'Disqualified') {
        points += POINTS_SYSTEM.race.disqualified;
        breakdown.disqualified = POINTS_SYSTEM.race.disqualified;
    }

    return { points, breakdown };
}

// Route to calculate fantasy points for a specific race
router.get('/points/:year/:round', async (req, res) => {
    const { year, round } = req.params;

    const scriptPath = path.join(__dirname, '..', 'scripts', 'f1', 'get_fantasy_data.py');
    const python = spawn('python3', [scriptPath, year, round]);

    let data = '';
    let error = '';

    python.stdout.on('data', (chunk) => { data += chunk; });
    python.stderr.on('data', (chunk) => { error += chunk; });

    python.on('close', (code) => {
        if (code !== 0) {
            console.error('Fantasy data script error:', error);
            return res.status(500).json({ error: 'Error fetching race data', details: error });
        }

        let results;
        try {
            results = JSON.parse(data);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to parse race data', details: err.message });
        }

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
    });
});

module.exports = router;
