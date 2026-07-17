import { pool } from '../../config/database.js';
import type { GalleryRow } from './types.js';

export class GalleryRepository {
  async add(input: {
    text: string;
    description: string;
    imageUrl: string;
    date: Date;
    user_sub?: string;
  }): Promise<GalleryRow> {
    const { rows } = await pool.query<GalleryRow>(
      'INSERT INTO gallery (title, description, image_url, date, user_sub) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [input.text, input.description, input.imageUrl, input.date, input.user_sub ?? null],
    );
    return rows[0];
  }

  async findById(id: string): Promise<GalleryRow | null> {
    const { rows } = await pool.query<GalleryRow>(
      'SELECT * FROM gallery WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findAll(page: number, limit: number): Promise<GalleryRow[]> {
    const offset = (page - 1) * limit;
    const { rows } = await pool.query<GalleryRow>(
      'SELECT * FROM gallery ORDER BY date DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );
    return rows;
  }

  async deleteById(id: string): Promise<GalleryRow | null> {
    const { rows } = await pool.query<GalleryRow>(
      'DELETE FROM gallery WHERE id = $1 RETURNING *',
      [id],
    );
    return rows[0] ?? null;
  }
}
