const express = require('express');
const router = express.Router();

// Scoring system
const POINTS_SYSTEM = {
    race: {
        positions: {
            1: 25,
            2: 18,
            3: 15,
            4: 12,
            5: 10,
            6: 8,
            7: 6,
            8: 4,
            9: 2,
            10: 1,
            11: 0,
            12: 0,
            13: 0,
            14: 0,
            15: 0,
            16: 0,
            17: 0,
            18: 0,
            19: 0,
            20: 0
        },
        positionsGained: 1, // 1 point per position gained
        positionsLost: -1, // -1 point per position lost
        overtakes: 1, // 1 point per overtake
        fastestLap: 10, // 10 points for fastest lap
        driverOfTheDay: 10, // 10 points for Driver of the Day
        dnf: -20, // -20 points for DNF/Not Classified
        disqualified: -20 // -20 points for disqualification
    },
    qualifying: {
        Q3_appearance: 0,
        Q2_appearance: 0,
        positions: {
            1: 10,
            2: 9,
            3: 8,
            4: 7,
            5: 6,
            6: 5,
            7: 4,
            8: 3,
            9: 2,
            10: 1,
        }
    },
    sprint: {
        positions: {
            1: 8,
            2: 7,
            3: 6,
            4: 5,
            5: 4,
            6: 3,
            7: 2,
            8: 1
        },
        positionsGained: 1, // 1 point per position gained
        positionsLost: -1, // -1 point per position lost
        overtakes: 1, // 1 point per overtake
        fastestLap: 5, // 5 points for fastest lap
        dnf: -20, // -20 points for DNF/Not Classified
        disqualified: -20 // -20 points for disqualification
    }
};

/**
 * Calculate qualifying points for a driver
 * @param {Object} qualifyingResult - Driver's qualifying result
 * @returns {Object} Points breakdown and total
 */
function calculateQualifyingPoints(qualifyingResult) {
    let points = 0;
    const breakdown = {};

    // Q2 and Q3 appearance points
    if (qualifyingResult.Q2) {
        points += POINTS_SYSTEM.qualifying.Q2_appearance;
        breakdown.Q2_appearance = POINTS_SYSTEM.qualifying.Q2_appearance;
    }
    if (qualifyingResult.Q3) {
        points += POINTS_SYSTEM.qualifying.Q3_appearance;
        breakdown.Q3_appearance = POINTS_SYSTEM.qualifying.Q3_appearance;
    }

    // Position points
    const qualifyingPosition = qualifyingResult.position;
    if (POINTS_SYSTEM.qualifying.positions[qualifyingPosition]) {
        points += POINTS_SYSTEM.qualifying.positions[qualifyingPosition];
        breakdown.position = POINTS_SYSTEM.qualifying.positions[qualifyingPosition];
    }

    return { points, breakdown };
}

/**
 * Calculate race points for a driver
 * @param {Object} raceResult - Driver's race result
 * @param {Object} qualifyingResult - Driver's qualifying result
 * @returns {Object} Points breakdown and total
 */
function calculateRacePoints(raceResult, qualifyingResult) {
    let points = 0;
    const breakdown = {};

    // Position points
    if (POINTS_SYSTEM.race.positions[raceResult.position] !== undefined) {
        points += POINTS_SYSTEM.race.positions[raceResult.position];
        breakdown.position = POINTS_SYSTEM.race.positions[raceResult.position];
    }

    // Fastest lap points
    if (raceResult.fastestLap) {
        points += POINTS_SYSTEM.race.fastestLap;
        breakdown.fastestLap = POINTS_SYSTEM.race.fastestLap;
    }

    // Driver of the Day points
    if (raceResult.driverOfTheDay) {
        points += POINTS_SYSTEM.race.driverOfTheDay;
        breakdown.driverOfTheDay = POINTS_SYSTEM.race.driverOfTheDay;
    }

    // DNF/Not Classified penalty
    ignorePosLost = false; // Reset ignorePosLost for
    if (raceResult.status === 'DNF' || raceResult.status === 'Not Classified' || (raceResult.dnf && raceResult.status !== 'Lapped') || raceResult.status === 'Retired' || raceResult.status === 'Mechanical' || raceResult.status === 'Accident') {
        ignorePosLost = true; // Ignore position lost points if DNF
        points += POINTS_SYSTEM.race.dnf;
        breakdown.dnf = POINTS_SYSTEM.race.dnf;
    }

    // Positions gained/lost points
    const positionsGained = qualifyingResult.position - raceResult.position;
    if (positionsGained > 0) {
        const gainedPoints = positionsGained * POINTS_SYSTEM.race.positionsGained;
        points += gainedPoints;
        breakdown.positionsGained = gainedPoints;
    } else if (positionsGained < 0 && !ignorePosLost) {
        const lostPoints = Math.abs(positionsGained) * POINTS_SYSTEM.race.positionsLost; // Ensure lost points are negative
        points += lostPoints;
        breakdown.positionsLost = lostPoints;
    }

    // Overtakes made points
    if (raceResult.overtakes) {
        const overtakePoints = raceResult.overtakes * POINTS_SYSTEM.race.overtakes;
        points += overtakePoints;
        breakdown.overtakes = overtakePoints;
    }

    // Disqualification penalty
    if (raceResult.status === 'Disqualified') {
        points += POINTS_SYSTEM.race.disqualified;
        breakdown.disqualified = POINTS_SYSTEM.race.disqualified;
    }

    return { points, breakdown };
}

/**
 * Calculate sprint points for a driver
 * @param {Object} sprintResult - Driver's sprint result
 * @returns {Object} Points breakdown and total
 */
function calculateSprintPoints(sprintResult) {
    let points = 0;
    const breakdown = {};

    // Sprint result position points
    if (POINTS_SYSTEM.sprint.positions[sprintResult.position]) {
        points += POINTS_SYSTEM.sprint.positions[sprintResult.position];
        breakdown.position = POINTS_SYSTEM.sprint.positions[sprintResult.position];
    }

    // Positions gained/lost points
    const positionsGained = sprintResult.startingPosition - sprintResult.position;
    if (positionsGained > 0) {
        const gainedPoints = positionsGained * POINTS_SYSTEM.sprint.positionsGained;
        points += gainedPoints;
        breakdown.positionsGained = gainedPoints;
    } else if (positionsGained < 0) {
        const lostPoints = positionsGained * POINTS_SYSTEM.sprint.positionsLost;
        points += lostPoints;
        breakdown.positionsLost = lostPoints;
    }

    // Overtakes made points
    if (sprintResult.overtakes) {
        const overtakePoints = sprintResult.overtakes * POINTS_SYSTEM.sprint.overtakes;
        points += overtakePoints;
        breakdown.overtakes = overtakePoints;
    }

    // Fastest lap points
    if (sprintResult.fastestLap) {
        points += POINTS_SYSTEM.sprint.fastestLap;
        breakdown.fastestLap = POINTS_SYSTEM.sprint.fastestLap;
    }

    // DNF/Not Classified penalty
    if (sprintResult.status === 'DNF' || sprintResult.status === 'Not Classified') {
        points += POINTS_SYSTEM.sprint.dnf;
        breakdown.dnf = POINTS_SYSTEM.sprint.dnf;
    }

    // Disqualification penalty
    if (sprintResult.status === 'Disqualified') {
        points += POINTS_SYSTEM.sprint.disqualified;
        breakdown.disqualified = POINTS_SYSTEM.sprint.disqualified;
    }

    return { points, breakdown };
}

// Route to calculate fantasy points for a specific race
router.get('/points/:year/:round', async (req, res) => {
    try {
        const { year, round } = req.params;

        // Get race and qualifying results using FastF1
        // Corrected Python script with proper variable interpolation
        const pythonScript = `
import fastf1
import json
import pandas as pd

# Enable caching
fastf1.Cache.enable_cache('cache/fastf1')

try:
    # Load the session
    quali = fastf1.get_session(${req.params.year}, ${req.params.round}, 'Q')
    race = fastf1.get_session(${req.params.year}, ${req.params.round}, 'R')

    # Load the data
    quali.load()
    race.load()

    # Get qualifying results
    quali_results = quali.results
    quali_data = []
    
    for _, driver in quali_results.iterrows():
        position = int(driver['Position'])
        driver_code = driver['Abbreviation']
        quali_data.append({
            'driver': driver_code,
            'position': position,
            'Q2': not pd.isna(driver['Q2']),
            'Q3': not pd.isna(driver['Q3'])
        })

    # Get race results
    race_results = race.results
    race_data = []

    for _, driver in race_results.iterrows():
        position = int(driver['Position']) if not pd.isna(driver['Position']) else None
        driver_code = driver['Abbreviation']
        status = driver['Status']

        # Determine if the driver DNFed
        dnf = status not in ['Finished'] and not status.startswith('+')

        race_data.append({
            'driver': driver_code,
            'position': position,
            'status': status,
            'dnf': dnf,
            'fastestLap': False,  # We'll update this next
            'overtakes': 0  # Placeholder for overtakes
        })

    # Get fastest lap info
    laps = race.laps
    fastest_lap = laps.pick_fastest()
    fastest_lap_driver = fastest_lap['Driver']

    # Update fastest lap info
    for race_entry in race_data:
        if race_entry['driver'] == fastest_lap_driver:
            race_entry['fastestLap'] = True
            break

    # Calculate overtakes
    for driver in race.drivers:
        driver_laps = race.laps.pick_drivers(driver)
        overtakes = 0
        for i in range(1, len(driver_laps)):
            if driver_laps.iloc[i]['Position'] < driver_laps.iloc[i - 1]['Position']:
                overtakes += 1
        for race_entry in race_data:
            if race_entry['driver'] == driver:
                race_entry['overtakes'] = overtakes
                break

    # Prepare output
    output = {
        'qualifying': quali_data,
        'race': race_data,
        'event_info': {
            'name': race.event['EventName'],
            'year': ${req.params.year},
            'round': ${req.params.round},
            'date': str(race.date)
        }
    }

    print(json.dumps(output))
except Exception as e:
    error_output = {
        'error': str(e),
        'year': ${req.params.year},
        'round': ${req.params.round}
    }
    print(json.dumps(error_output))
`;

        // Execute Python script
        const { spawn } = require('child_process');
        const python = spawn('python3', ['-c', pythonScript]);

        let data = '';
        let error = '';

        python.stdout.on('data', (chunk) => {
            data += chunk;
        });

        python.stderr.on('data', (chunk) => {
            error += chunk;
            // Log error immediately for debugging
            console.log('Python Error:', chunk.toString());
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('Python script error:', error);
                return res.status(500).json({
                    error: 'Error fetching race data',
                    details: error
                });
            }

            try {
                // Extract JSON from the data string
                const jsonStartIndex = data.indexOf('{');
                const jsonEndIndex = data.lastIndexOf('}');
                if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                    throw new Error('No JSON data found in Python script output');
                }
                const jsonString = data.substring(jsonStartIndex, jsonEndIndex + 1);

                const results = JSON.parse(jsonString);

                // Check if we got an error from Python
                if (results.error) {
                    return res.status(500).json({
                        error: 'Error in Python script',
                        details: results.error
                    });
                }

                const fantasyPoints = {};

                // Calculate points for each driver
                results.qualifying.forEach(qualiResult => {
                    const driver = qualiResult.driver;
                    const raceResult = results.race.find(r => r.driver === driver);

                    if (!raceResult) return;

                    const qualifyingPoints = calculateQualifyingPoints(qualiResult);
                    const racePoints = calculateRacePoints(raceResult, qualiResult);

                    fantasyPoints[driver] = {
                        total: qualifyingPoints.points + racePoints.points,
                        qualifying: qualifyingPoints,
                        race: racePoints
                    };
                });

                res.json({
                    event: results.event_info,
                    points: fantasyPoints,
                    unprocessed: results
                });
            } catch (err) {
                console.error('Error processing results:', err);
                res.status(500).json({
                    error: 'Error processing results',
                    details: err.message,
                    data: data
                });
            }
        });
    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;