const express = require('express');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const cache = require('apicache').middleware; // Add apicache for caching
const requestQueue = require('../utils/queue');

// Memory error messages
const MEMORY_ERROR_MESSAGES = {
    THRESHOLD_EXCEEDED: 'Memory usage exceeded threshold',
    LOADING_ERROR: 'Memory limit exceeded while loading session data',
    PROCESSING_ERROR: 'Memory limit exceeded while processing data',
    QUEUE_TIMEOUT: 'Request queue timeout'
};

// Queue configuration
const QUEUE_TIMEOUT = 30000; // 30 seconds timeout for queued requests

// Helper function to handle memory errors
const handleMemoryError = (error, res) => {
    if (error.includes(MEMORY_ERROR_MESSAGES.THRESHOLD_EXCEEDED) ||
        error.includes(MEMORY_ERROR_MESSAGES.LOADING_ERROR) ||
        error.includes(MEMORY_ERROR_MESSAGES.PROCESSING_ERROR)) {
        
        return res.status(503).json({
            error: 'Service temporarily unavailable',
            details: 'The request requires more memory than currently available. Try again later or with a smaller data request.',
            suggestion: 'Consider requesting less data or using more specific filters'
        });
    }
    return false;
};

// Ensure cache directory exists
const setupCacheDirectory = () => {
    let cacheDir;
    
    // Check if we're in Railway environment
    if (process.env.RAILWAY_ENVIRONMENT) {
        cacheDir = '/tmp/fastf1_cache';
    } else {
        cacheDir = path.join(__dirname, '..', 'cache', 'fastf1');
    }

    if (!fs.existsSync(cacheDir)) {
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
            console.log('FastF1 cache directory created at:', cacheDir);
        } catch (err) {
            console.error('Failed to create FastF1 cache directory:', err);
        }
    }

    // Set appropriate permissions for the cache directory
    try {
        fs.chmodSync(cacheDir, '777');
        console.log('Cache directory permissions updated');
    } catch (err) {
        console.error('Failed to update cache directory permissions:', err);
    }
};

// Setup cache directory
setupCacheDirectory();

// Ensure Python dependencies are installed
const installPythonDeps = () => {
    const requirementsPath = path.join(__dirname, '..', 'requirements.txt');
    
    // Check if requirements.txt exists
    if (!fs.existsSync(requirementsPath)) {
        console.error('requirements.txt not found at:', requirementsPath);
        return;
    }

    exec('pip3 install -r requirements.txt', { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
        if (err) {
            console.error('Failed to install Python dependencies:', stderr);
        } else {
            console.log('Python dependencies installed successfully:', stdout);
        }
    });
};

// Install Python dependencies
installPythonDeps();

// Helper function to run Python scripts with memory monitoring and queuing
const runPythonScriptQueued = async (scriptName, args = []) => {
    const task = () => new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'scripts', 'f1', scriptName);
        const process = spawn('python3', [scriptPath, ...args]);

        let data = '';
        let error = '';

        const timeout = setTimeout(() => {
            process.kill();
            reject(new Error(MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT));
        }, QUEUE_TIMEOUT);

        process.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        process.stderr.on('data', (chunk) => {
            error += chunk.toString();
            console.error('PYTHON STDERR:', error);
        });

        process.on('close', (code) => {
            clearTimeout(timeout);
            
            if (code !== 0 && error) {
                try {
                    const errorData = JSON.parse(error);
                    if (errorData.memory_stats) {
                        console.error('Memory usage stats:', errorData.memory_stats);
                    }
                    reject(new Error(errorData.error || error));
                } catch (e) {
                    console.error(`Python script error (${scriptName}):`, error);
                    reject(new Error(error));
                }
                return;
            }

            try {
                const jsonData = JSON.parse(data);
                
                if (jsonData.memory_stats) {
                    console.log('Memory usage stats:', {
                        current: `${(jsonData.memory_stats.current / 1024 / 1024).toFixed(2)}MB`,
                        peak: `${(jsonData.memory_stats.peak / 1024 / 1024).toFixed(2)}MB`
                    });
                    delete jsonData.memory_stats;
                }
                
                resolve(jsonData);
            } catch (err) {
                console.error(`JSON parse error (${scriptName}):`, err);
                reject(new Error('Invalid JSON from Python script'));
            }
        });
    });

    return requestQueue.add(task);
};

// Middleware to add queue status to response headers
router.use((req, res, next) => {
    res.set({
        'X-Queue-Position': requestQueue.pendingCount,
        'X-Active-Requests': requestQueue.activeCount
    });
    next();
});

// Apply caching middleware for all routes in this file (cache for 1 day)
router.use(cache('1 day'));

// Debug route to test Python setup
router.get('/debug-python', (req, res) => {
    const py = spawn('python3', ['-c', 'import json; print(json.dumps({"status": "ok"}))']);
    let output = '';
    let error = '';

    py.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });

    py.stderr.on('data', (chunk) => {
        error += chunk.toString();
        console.error('PYTHON STDERR (debug):', error);
    });

    py.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({
                error: 'Python debug script failed',
                stderr: error
            });
        }
        res.json({ message: 'Python debug successful', output: JSON.parse(output) });
    });
});

// Get race schedule for a specific season
router.get('/schedule/:year', async (req, res, next) => {
    try {
        const { year } = req.params;
        const data = await runPythonScriptQueued('get_schedule.py', [year]);
        res.json(data);
    } catch (error) {
        if (error.message === MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT) {
            return res.status(503).json({
                error: 'Request timeout',
                details: 'The request took too long to process due to high server load.',
                suggestion: 'Please try again later'
            });
        }
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get session results (qualifying or race)
router.get('/results/:year/:round/:session', async (req, res, next) => {
    try {
        const { year, round, session } = req.params;
        const data = await runPythonScriptQueued('get_session_data.py', [year, round, session, 'results']);
        res.json(data);
    } catch (error) {
        if (error.message === MEMORY_ERROR_MESSAGES.QUEUE_TIMEOUT) {
            return res.status(503).json({
                error: 'Request timeout',
                details: 'The request took too long to process due to high server load.',
                suggestion: 'Please try again later'
            });
        }
        console.error('F1 API Error:', error);
        next(error);
    }
});

// Get driver telemetry for a specific lap
router.get('/telemetry/:year/:round/:session/:driver/:lap', async (req, res, next) => {
    try {
        const { year, round, session, driver, lap } = req.params;
        const data = await runPythonScriptQueued('get_session_data.py', [
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
        const data = await runPythonScriptQueued('get_session_data.py', [
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
        const data = await runPythonScriptQueued('get_session_data.py', [
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
        const data = await runPythonScriptQueued('get_session_data.py', [
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
        const data = await runPythonScriptQueued('get_championship_points.py', [year, 'driver']);
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
        const data = await runPythonScriptQueued('get_championship_points.py', [year, 'constructor']);
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
        const data = await runPythonScriptQueued('get_championship_points.py', [year, round, 'driver']);
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
        const data = await runPythonScriptQueued('get_championship_points.py', [year, 'constructor', round]);
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
        const data = await runPythonScriptQueued('get_championship_points.py', [year, 'driver', 'per_race']);
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
        const data = await runPythonScriptQueued('get_championship_points.py', [year, 'constructor', 'per_race']);
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

    // Collect stderr data
    py.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
    });

    // Handle process close
    py.on('close', (code) => {
        try {
            // Extract JSON from stdoutData
            const jsonStart = stdoutData.indexOf('{');
            const jsonEnd = stdoutData.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonStr = stdoutData.slice(jsonStart, jsonEnd + 1);
                const result = JSON.parse(jsonStr);
                return res.json(result);
            } else {
                console.error('No valid JSON found in output:', stdoutData);
                return res.status(500).json({ error: 'Malformed response from Python script.' });
            }
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

// Add queue status endpoint
router.get('/queue-status', (req, res) => {
    res.json({
        pending: requestQueue.pendingCount,
        active: requestQueue.activeCount,
        maxConcurrent: requestQueue.maxConcurrent
    });
});

module.exports = router;