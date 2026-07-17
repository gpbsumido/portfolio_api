import { pool } from '../../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import type { FeedbackRow, FeedbackWithJournal } from './types.js';

export class FeedbackRepository {
  async findWithPagination(
    page: number,
    limit: number,
    rotation: string | undefined,
    userSub: string,
    searchTerm: string | undefined,
  ): Promise<{ feedback: FeedbackWithJournal[]; totalCount: number }> {
    const offset = (page - 1) * limit;

    // Count query
    let countQuery = 'SELECT COUNT(*) as total FROM feedback WHERE user_sub = $1';
    const countValues: unknown[] = [userSub];
    if (rotation) {
      countQuery += ` AND rotation = $2`;
      countValues.push(rotation);
    }
    if (searchTerm) {
      countQuery += ` AND (
        LOWER(text) LIKE LOWER($${countValues.length + 1})
        OR LOWER(rotation) LIKE LOWER($${countValues.length + 1})
      )`;
      countValues.push(`%${searchTerm}%`);
    }
    const { rows: countRows } = await pool.query(countQuery, countValues);
    const totalCount = parseInt(countRows[0].total as string);

    // Data query
    let query = `
      SELECT
        f.*,
        mj."id" as journal_id,
        mj."patientSetting",
        mj."interaction",
        mj."canmedsRoles",
        mj."learningObjectives",
        mj."rotation" as journal_rotation,
        mj."date",
        mj."location",
        mj."hospital",
        mj."doctor",
        mj."whatIDidWell",
        mj."whatICouldImprove"
      FROM feedback f
      LEFT JOIN med_journal mj ON f.journal_entry_id = mj.id
      WHERE f.user_sub = $1
    `;
    const values: unknown[] = [userSub];

    if (rotation) {
      query += ` AND f.rotation = $2`;
      values.push(rotation);
    }
    if (searchTerm) {
      query += ` AND (
        LOWER(f.text) LIKE LOWER($${values.length + 1})
        OR LOWER(f.rotation) LIKE LOWER($${values.length + 1})
      )`;
      values.push(`%${searchTerm}%`);
    }

    query += `
      ORDER BY f.id ASC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    values.push(limit, offset);

    const { rows } = await pool.query(query, values);

    const feedback: FeedbackWithJournal[] = rows.map((row: any) => ({
      id: row.id,
      text: row.text,
      rotation: row.rotation,
      journal_entry_id: row.journal_entry_id,
      journal: row.journal_entry_id
        ? {
            id: row.journal_id,
            patientSetting: row.patientSetting,
            interaction: row.interaction,
            canmedsRoles: row.canmedsRoles
              ? typeof row.canmedsRoles === 'string'
                ? JSON.parse(row.canmedsRoles)
                : row.canmedsRoles
              : [],
            learningObjectives: row.learningObjectives
              ? typeof row.learningObjectives === 'string'
                ? JSON.parse(row.learningObjectives)
                : row.learningObjectives
              : [],
            rotation: row.journal_rotation,
            date: row.date,
            location: row.location,
            hospital: row.hospital,
            doctor: row.doctor,
            whatIDidWell: row.whatIDidWell,
            whatICouldImprove: row.whatICouldImprove,
          }
        : null,
    }));

    return { feedback, totalCount };
  }

  async add(input: {
    text: string;
    rotation: string;
    journal_entry_id?: string;
    user_sub: string;
  }): Promise<FeedbackRow> {
    const id = uuidv4();
    const { rows } = await pool.query<FeedbackRow>(
      `INSERT INTO feedback (id, text, rotation, journal_entry_id, user_sub)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.text, input.rotation, input.journal_entry_id || null, input.user_sub],
    );
    return rows[0];
  }

  async update(
    id: string,
    input: { text: string; rotation: string; journal_entry_id?: string; user_sub: string },
  ): Promise<FeedbackRow> {
    const { rows } = await pool.query<FeedbackRow>(
      `UPDATE feedback
       SET text = $1, rotation = $2, journal_entry_id = $3
       WHERE id = $4 AND user_sub = $5
       RETURNING *`,
      [input.text, input.rotation, input.journal_entry_id || null, id, input.user_sub],
    );
    if (rows.length === 0) {
      throw new Error('Feedback not found or unauthorized');
    }
    return rows[0];
  }

  async delete(id: string): Promise<FeedbackRow | null> {
    const { rows } = await pool.query<FeedbackRow>(
      'DELETE FROM feedback WHERE id = $1 RETURNING *',
      [id],
    );
    return rows[0] ?? null;
  }
}
