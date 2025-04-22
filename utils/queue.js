const os = require('os');

class RequestQueue {
    constructor(maxConcurrent = Math.max(1, Math.floor(os.cpus().length * 0.75))) {
        this.queue = [];
        this.active = new Set();
        this.maxConcurrent = maxConcurrent;
    }

    get pendingCount() {
        return this.queue.length;
    }

    get activeCount() {
        return this.active.size;
    }

    async add(task) {
        if (this.active.size < this.maxConcurrent) {
            return this.execute(task);
        }

        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
        });
    }

    async execute(task) {
        const taskId = Symbol('taskId');
        this.active.add(taskId);

        try {
            const result = await task();
            return result;
        } finally {
            this.active.delete(taskId);
            this.processQueue();
        }
    }

    processQueue() {
        if (this.queue.length === 0 || this.active.size >= this.maxConcurrent) {
            return;
        }

        const { task, resolve, reject } = this.queue.shift();
        this.execute(task).then(resolve).catch(reject);
    }
}

module.exports = new RequestQueue(); 