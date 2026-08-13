import type { Pool } from 'pg';
import type { DbSslConfig } from '../utils/dbSsl.js';

/** The single shared pool. See pool.js for why it lives in CommonJS. */
export declare const pool: Pool;

/** The resolved connection string, so callers can reason about the host. */
export declare const connectionString: string;

/** The TLS settings the pool was built with, so callers need not read them back off it. */
export declare const ssl: DbSslConfig;
