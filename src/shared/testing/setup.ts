import { afterAll } from 'vitest';
import { pool } from '../../config/database.js';

afterAll(async () => {
  await pool.end();
});
