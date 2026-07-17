import path from 'path';
import fs from 'fs';
import { env } from '../../config/env.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('f1');

// eslint-disable-next-line @typescript-eslint/no-var-requires -- JS util, not yet migrated
const requestQueue = require('../../../utils/queue') as {
  pendingCount: number;
  activeCount: number;
  maxConcurrent: number;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runPythonScriptQueued, MEMORY_ERROR_MESSAGES } = require('../../../utils/pythonQueue') as {
  runPythonScriptQueued: (scriptName: string, args?: string[]) => Promise<any>;
  MEMORY_ERROR_MESSAGES: Record<string, string>;
};

export { requestQueue, MEMORY_ERROR_MESSAGES };

export class F1Service {
  private cacheDir: string;

  constructor() {
    this.cacheDir = env.RAILWAY_ENVIRONMENT
      ? '/tmp/fastf1_cache'
      : path.join(__dirname, '..', '..', '..', 'cache', 'fastf1');
    this.setupCacheDirectory();
  }

  private setupCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        log.error({ err }, 'failed to create FastF1 cache directory');
      }
    }
    try {
      fs.chmodSync(this.cacheDir, '777');
    } catch (err) {
      log.error({ err }, 'failed to update cache directory permissions');
    }
  }

  async runQueued(scriptName: string, args: string[] = []): Promise<any> {
    return runPythonScriptQueued(scriptName, args);
  }

  async clearCache(): Promise<void> {
    const cachePath = path.join(__dirname, '..', '..', '..', 'cache', 'fastf1');
    const files = await fs.promises.readdir(cachePath);
    await Promise.all(
      files.map((file) =>
        fs.promises.rm(path.join(cachePath, file), { recursive: true, force: true }),
      ),
    );
  }

  getQueueStatus() {
    return {
      pending: requestQueue.pendingCount,
      active: requestQueue.activeCount,
      maxConcurrent: requestQueue.maxConcurrent,
    };
  }
}
