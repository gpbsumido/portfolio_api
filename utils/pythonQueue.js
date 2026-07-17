const { spawn } = require('child_process');
const path = require('path');
const requestQueue = require('./queue');

const MEMORY_ERROR_MESSAGES = {
    THRESHOLD_EXCEEDED: 'Memory usage exceeded threshold',
    LOADING_ERROR: 'Memory limit exceeded while loading session data',
    PROCESSING_ERROR: 'Memory limit exceeded while processing data',
    QUEUE_TIMEOUT: 'Request queue timeout',
};

const QUEUE_TIMEOUT = 600000; // 10 minutes

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

module.exports = { runPythonScriptQueued, MEMORY_ERROR_MESSAGES, QUEUE_TIMEOUT };
