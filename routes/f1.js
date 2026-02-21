const express = require('express');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkJwt } = require('../middleware/auth');
const router = express.Router();
const requestQueue = require('../utils/queue');

// Memory error messages
const MEMORY_ERROR_MESSAGES = {
    THRESHOLD_EXCEEDED: 'Memory usage exceeded threshold',
    LOADING_ERROR: 'Memory limit exceeded while loading session data',
    PROCESSING_ERROR: 'Memory limit exceeded while processing data',
    QUEUE_TIMEOUT: 'Request queue timeout',
};

// Queue configuration
const QUEUE_TIMEOUT = 600000; // 10 minutes

// Ensure cache directory exists
const setupCacheDirectory = () => {
    const cacheDir = process.env.RAILWAY_ENVIRONMENT
        ? '/tmp/fastf1_cache'
        : path.join(__dirname, '..', 'cache', 'fastf1');

    if (!fs.existsSync(cacheDir)) {
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
        } catch (err) {
            console.error('Failed to create FastF1 cache directory:', err);
        }
    }

    try {
        fs.chmodSync(cacheDir, '777');
    } catch (err) {
        console.error('Failed to update cache directory permissions:', err);
    }
};

setupCacheDirectory();

// Ensure Python dependencies are installed on startup
const installPythonDeps = () => {
    const requirementsPath = path.join(__dirname, '..', 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) return;

    exec('pip3 install -r requirements.txt', { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
        if (err) {
            console.error('Failed to install Python dependencies:', stderr);
        }
    });
};

installPythonDeps();

// Run a Python script via the request queue
const runPythonScriptQueued = async (scriptName, args = []) => {
    const task = () => new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'scripts', 'f1', scriptName);
        const proc = spawn('python3', [scriptPath, ...args]);

        let data = '';
        let error = '';

        const timeout = setTimeout(() => {
            proc.kill();
            reject(new Error(MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT));
        }, QUEUE_TIMEOUT);

        proc.stdout.on('data', (chunk) => { data += chunk.toString(); });
        proc.stderr.on('data', (chunk) => {
            error += chunk.toString();
            console.error('Python stderr:', error);
        });

        proc.on('close', (code) => {
            clearTimeout(timeout);

            if (code !== 0 && error) {
                try {
                    const errorData = JSON.parse(error);
                    if (errorData.memory_stats) {
                        console.error('Memory stats:', errorData.memory_stats);
                    }
                    reject(new Error(errorData.error || error));
                } catch {
                    reject(new Error(error));
                }
                return;
            }

            try {
                const jsonData = JSON.parse(data);
                if (jsonData.memory_stats) {
                    console.log('Memory stats:', {
                        current: `${(jsonData.memory_stats.current / 1024 / 1024).toFixed(2)}MB`,
                        peak: `${(jsonData.memory_stats.peak / 1024 / 1024).toFixed(2)}MB`,
                    });
                    delete jsonData.memory_stats;
                }
                resolve(jsonData);
            } catch (err) {
                reject(new Error('Invalid JSON from Python script'));
            }
        });
    });

    return requestQueue.add(task);
};

// Middleware to expose queue status in response headers
router.use((req, res, next) => {
    res.set({
        'X-Queue-Position': requestQueue.pendingCount,
        'X-Active-Requests': requestQueue.activeCount,
    });
    next();
});

// Helper to handle queue timeout responses
const handleQueuedRoute = async (res, next, scriptName, args) => {
    try {
        const data = await runPythonScriptQueued(scriptName, args);
        res.json(data);
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
};

// Race schedule
router.get('/schedule/:year', (req, res, next) => {
    handleQueuedRoute(res, next, 'get_schedule.py', [req.params.year]);
});

// Session results (qualifying or race)
router.get('/results/:year/:round/:session', (req, res, next) => {
    const { year, round, session } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [year, round, session, 'results']);
});

// Driver telemetry for a specific lap
router.get('/telemetry/:year/:round/:session/:driver/:lap', (req, res, next) => {
    const { year, round, session, driver, lap } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [year, round, session, 'telemetry', driver, lap]);
});

// Fastest laps for a session
router.get('/fastest-laps/:year/:round/:session', (req, res, next) => {
    const { year, round, session } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [year, round, session, 'fastest_laps']);
});

// Driver's best lap in a session
router.get('/best-lap/:year/:round/:session/:driver', (req, res, next) => {
    const { year, round, session, driver } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [year, round, session, 'driver_best_lap', driver]);
});

// Session weather data
router.get('/weather/:year/:round/:session', (req, res, next) => {
    const { year, round, session } = req.params;
    handleQueuedRoute(res, next, 'get_session_data.py', [year, round, session, 'weather']);
});

// Driver championship standings for a full year
router.get('/driver-points/:year', (req, res, next) => {
    handleQueuedRoute(res, next, 'get_championship_points.py', [req.params.year, 'driver']);
});

// Constructor championship standings for a full year
router.get('/constructor-points/:year', (req, res, next) => {
    handleQueuedRoute(res, next, 'get_championship_points.py', [req.params.year, 'constructor']);
});

// Driver points after a specific round
router.get('/driver-points/:year/:round', (req, res, next) => {
    const { year, round } = req.params;
    handleQueuedRoute(res, next, 'get_championship_points.py', [year, round, 'driver']);
});

// Constructor points after a specific round
router.get('/constructor-points/:year/:round', (req, res, next) => {
    const { year, round } = req.params;
    handleQueuedRoute(res, next, 'get_championship_points.py', [year, round, 'constructor']);
});

// Driver points subdivided per race for a full year
router.get('/driver-points-per-race/:year', (req, res, next) => {
    handleQueuedRoute(res, next, 'get_championship_points.py', [req.params.year, 'driver', 'per_race']);
});

// Constructor points subdivided per race for a full year
router.get('/constructor-points-per-race/:year', (req, res, next) => {
    handleQueuedRoute(res, next, 'get_championship_points.py', [req.params.year, 'constructor', 'per_race']);
});

// Driver points per race up to a specific round
router.get('/driver-points-per-race/:year/:round', (req, res, next) => {
    const { year, round } = req.params;
    handleQueuedRoute(res, next, 'get_championship_points.py', [year, round]);
});

// Constructor points per race up to a specific round
router.get('/constructor-points-per-race/:year/:round', (req, res, next) => {
    const { year, round } = req.params;
    handleQueuedRoute(res, next, 'get_championship_points.py', [year, round, 'constructor']);
});

// Clear the FastF1 cache (requires authentication)
router.delete('/cache', checkJwt, (req, res) => {
    const cachePath = path.join(__dirname, '..', 'cache', 'fastf1');

    fs.readdir(cachePath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: `Failed to read cache directory: ${err.message}` });
        }

        const deletePromises = files.map((file) =>
            new Promise((resolve, reject) => {
                fs.rm(path.join(cachePath, file), { recursive: true, force: true }, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            })
        );

        Promise.all(deletePromises)
            .then(() => res.json({ message: 'Cache cleared successfully' }))
            .catch((err) => res.status(500).json({ error: `Failed to clear cache: ${err.message}` }));
    });
});

// Queue status
router.get('/queue-status', (req, res) => {
    res.json({
        pending: requestQueue.pendingCount,
        active: requestQueue.activeCount,
        maxConcurrent: requestQueue.maxConcurrent,
    });
});

module.exports = router;
