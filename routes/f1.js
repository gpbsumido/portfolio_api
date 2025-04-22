const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const cache = require('apicache').middleware; // Add apicache for caching

// Helper function to run Python scripts
const runPythonScript = (scriptName, args = []) => {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'scripts', 'f1', scriptName);
        const process = spawn('python3', [scriptPath, ...args]);

        let data = '';
        let error = '';

        process.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        process.stderr.on('data', (chunk) => {
            error += chunk.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                console.error(`Python script error (${scriptName}):`, error);
                reject(new Error(error));
                return;
            }
            try {
                const jsonData = JSON.parse(data);
                resolve(jsonData);
            } catch (err) {
                console.error(`JSON parse error (${scriptName}):`, err);
                reject(new Error('Invalid JSON from Python script'));
            }
        });
    });
};

// Apply caching middleware for all routes in this file (cache for 1 day)
router.use(cache('1 day'));

// Get race schedule for a specific season
router.get('/schedule/:year', async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = await runPythonScript('get_schedule.py', [year]);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get session results (qualifying or race)
router.get('/results/:year/:round/:session', async (req, res, next) => {
    try {
        const { year, round, session } = req.params;
        const data = await runPythonScript('get_session_data.py', [year, round, session, 'results']);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get driver telemetry for a specific lap
router.get('/telemetry/:year/:round/:session/:driver/:lap', async (req, res, next) => {
    try {
        const { year, round, session, driver, lap } = req.params;
        const data = await runPythonScript('get_session_data.py', [
            year, round, session, 'telemetry', driver, lap
        ]);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get fastest laps for a session
router.get('/fastest-laps/:year/:round/:session', async (req, res, next) => {
    try {
        const { year, round, session } = req.params;
        const data = await runPythonScript('get_session_data.py', [
            year, round, session, 'fastest_laps'
        ]);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get driver's best lap in a session
router.get('/best-lap/:year/:round/:session/:driver', async (req, res, next) => {
    try {
        const { year, round, session, driver } = req.params;
        const data = await runPythonScript('get_session_data.py', [
            year, round, session, 'driver_best_lap', driver
        ]);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get session weather data
router.get('/weather/:year/:round/:session', async (req, res, next) => {
    try {
        const { year, round, session } = req.params;
        const data = await runPythonScript('get_session_data.py', [
            year, round, session, 'weather'
        ]);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get driver points for a specific year
router.get('/driver-points/:year', async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = await runPythonScript('get_championship_points.py', [year, 'driver']);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get constructor points for a specific year
router.get('/constructor-points/:year', async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = await runPythonScript('get_championship_points.py', [year, 'constructor']);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get driver points for a specific race in a year
router.get('/driver-points/:year/:round', async (req, res, next) => {
    try {
        const { year, round } = req.params;
        const data = await runPythonScript('get_championship_points.py', [year, round, 'driver']);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get constructor points for a specific race in a year
router.get('/constructor-points/:year/:round', async (req, res, next) => {
    try {
        const { year, round } = req.params;
        const data = await runPythonScript('get_championship_points.py', [year, 'constructor', round]);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get driver points for a specific year, subdivided per race
router.get('/driver-points-per-race/:year', async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = await runPythonScript('get_championship_points.py', [year, 'driver', 'per_race']);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get constructor points for a specific year, subdivided per race
router.get('/constructor-points-per-race/:year', async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = await runPythonScript('get_championship_points.py', [year, 'constructor', 'per_race']);
        res.json(data);
    } catch (error) {
        console.error('F1 API Error:', error);
        next(error);
    }
});

router.get('/driver-points-per-race/:year/:round', (req, res) => {
    const year = req.params.year;
    const round = req.params.round;

    // Log the received parameters for debugging
    console.log(`Route accessed: GET /driver-points-per-race/${year}/${round}`);

    // Construct the path to the Python script
    const scriptPath = path.join(__dirname, '..', 'scripts', 'f1', 'get_championship_points.py');

    // Spawn the Python process
    const py = spawn('python3', [scriptPath, year, round]);

    let stdoutData = '';
    let stderrData = '';

    // Collect stdout data
    py.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
    });

    // Collect stderr data (but don't treat it as an error automatically)
    py.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
    });

    // Handle process close
    py.on('close', (code) => {
        try {
            // Parse and return JSON response
            const result = JSON.parse(stdoutData);
            if (result.error) {
                // If the result itself has an error field
                return res.status(500).json({
                    error: result.error,
                    details: result.details || null,
                    context: { year, round }
                });
            }
            return res.json(result);
        } catch (e) {
            // Handle JSON parsing errors or unexpected output
            console.error('Failed to parse Python output:', stdoutData);
            return res.status(500).json({
                error: 'Failed to parse Python output',
                details: e.toString(),
                raw_output: stdoutData,
                stderr_logs: stderrData
            });
        }
    });
});

router.get('/constructor-points-per-race/:year/:round', (req, res) => {
    const year = req.params.year;
    const round = req.params.round;

    // Log the received parameters for debugging
    console.log(`Routesss accessed: GET /constructor-points-per-race/${year}/${round}`);

    // Construct the path to the Python script
    const scriptPath = path.join(__dirname, '..', 'scripts', 'f1', 'get_championship_points.py');

    // Spawn the Python process
    const py = spawn('python3', [scriptPath, year, round, 'constructor']);

    let stdoutData = '';
    let stderrData = '';

    // Collect stdout data
    py.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
    });

    // Collect stderr data (but don't treat it as an error automatically)
    py.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
    });

    // Handle process close
    py.on('close', (code) => {
        try {
            // Parse and return JSON response
            const result = JSON.parse(stdoutData);
            if (result.error) {
                // If the result itself has an error field
                return res.status(500).json({
                    error: result.error,
                    details: result.details || null,
                    context: { year, round }
                });
            }
            return res.json(result);
        } catch (e) {
            // Handle JSON parsing errors or unexpected output
            console.error('Failed to parse Python output:', stdoutData);
            return res.status(500).json({
                error: 'Failed to parse Python output',
                details: e.toString(),
                raw_output: stdoutData,
                stderr_logs: stderrData
            });
        }
    });
});

// Route to clear the FastF1 cache
router.get('/clear-cache', (req, res) => {
    const cachePath = path.join(__dirname, '..', 'cache', 'fastf1');

    // Read the contents of the cache directory
    fs.readdir(cachePath, (err, files) => {
        if (err) {
            console.error('Failed to read cache directory:', err);
            return res.status(500).json({ error: `Failed to read cache directory. ${err}` });
        }

        // Delete each file in the directory
        let deletePromises = files.map((file) => {
            return new Promise((resolve, reject) => {
                const filePath = path.join(cachePath, file);
                fs.rm(filePath, { recursive: true, force: true }, (err) => {
                    if (err) {
                        console.error(`Failed to delete file: ${filePath}`, err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });

        // Wait for all files to be deleted
        Promise.all(deletePromises)
            .then(() => {
                console.log('Cache cleared successfully.');
                res.json({ message: 'Cache cleared successfully' });
            })
            .catch((err) => {
                console.error('Failed to clear some cache files:', err);
                res.status(500).json({ error: `Failed to clear some cache files. ${err}` });
            });
    });
});

module.exports = router;