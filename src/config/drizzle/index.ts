import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '../database.js';

export const db = drizzle(pool);
