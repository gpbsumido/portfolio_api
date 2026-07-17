import { pool } from '../../config/database.js';
import type { TableColumn, ForumPost, Marker } from './types.js';

export class ForumRepository {
  async getTables(): Promise<string[]> {
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );
    return result.rows.map((row) => row.table_name);
  }

  async getTableSchema(tableName: string): Promise<TableColumn[]> {
    const result = await pool.query<TableColumn>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1`,
      [tableName],
    );
    return result.rows;
  }

  async getForumPosts(
    page: number,
    limit: number,
  ): Promise<{ data: ForumPost[]; totalCount: number }> {
    const offset = (page - 1) * limit;
    const [dataResult, countResult] = await Promise.all([
      pool.query<ForumPost>(
        'SELECT * FROM postforum ORDER BY id DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      ),
      pool.query<{ count: string }>('SELECT COUNT(*) FROM postforum'),
    ]);
    return {
      data: dataResult.rows,
      totalCount: parseInt(countResult.rows[0].count),
    };
  }

  async createForumPost(title: string, text: string, username: string): Promise<ForumPost> {
    const result = await pool.query<ForumPost>(
      'INSERT INTO postforum (title, text, username) VALUES ($1, $2, $3) RETURNING *',
      [title, text, username],
    );
    return result.rows[0];
  }

  async createMarker(latitude: number, longitude: number, text: string): Promise<Marker> {
    const result = await pool.query<Marker>(
      'INSERT INTO locations (latitude, longitude, text) VALUES ($1, $2, $3) RETURNING *',
      [latitude, longitude, text],
    );
    return result.rows[0];
  }

  async getMarkers(): Promise<Marker[]> {
    const result = await pool.query<Marker>(
      'SELECT * FROM locations ORDER BY id DESC',
    );
    return result.rows;
  }

  async deleteMarker(id: string): Promise<Marker | null> {
    const result = await pool.query<Marker>(
      'DELETE FROM locations WHERE id = $1 RETURNING *',
      [id],
    );
    return result.rows[0] ?? null;
  }
}
