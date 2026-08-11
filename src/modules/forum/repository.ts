import { pool } from '../../config/database.js';
import type { TableColumn, ForumPost, Marker } from './types.js';

export class ForumRepository {


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
