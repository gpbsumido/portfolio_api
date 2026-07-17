import { pool } from '../../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import type { SaveEntryInput } from './types.js';

export class MedJournalRepository {
  async saveOrUpdate(entry: SaveEntryInput, userSub: string): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let entryId: string;
      if (entry.id) {
        await client.query(
          `UPDATE med_journal
           SET "patientSetting" = $1, "interaction" = $2, "canmedsRoles" = $3, "learningObjectives" = $4,
               "rotation" = $5, "date" = $6, "location" = $7, "hospital" = $8, "doctor" = $9,
               "whatIDidWell" = $10, "whatICouldImprove" = $11
           WHERE "id" = $12 AND "user_sub" = $13`,
          [
            entry.patientSetting,
            entry.interaction,
            JSON.stringify(entry.canmedsRoles),
            JSON.stringify(entry.learningObjectives),
            entry.rotation,
            entry.date,
            entry.location,
            entry.hospital,
            entry.doctor,
            entry.whatIDidWell,
            entry.whatICouldImprove,
            entry.id,
            userSub,
          ],
        );
        entryId = entry.id;
      } else {
        entryId = uuidv4();
        await client.query(
          `INSERT INTO med_journal
           ("id", "patientSetting", "interaction", "canmedsRoles", "learningObjectives", "rotation", "date", "location", "hospital", "doctor",
            "whatIDidWell", "whatICouldImprove", "user_sub")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            entryId,
            entry.patientSetting,
            entry.interaction,
            JSON.stringify(entry.canmedsRoles),
            JSON.stringify(entry.learningObjectives),
            entry.rotation,
            entry.date,
            entry.location,
            entry.hospital,
            entry.doctor,
            entry.whatIDidWell,
            entry.whatICouldImprove,
            userSub,
          ],
        );
      }

      if (entry.feedbackText) {
        const feedbackId = uuidv4();
        await client.query(
          `INSERT INTO feedback (id, text, rotation, journal_entry_id, user_sub)
           VALUES ($1, $2, $3, $4, $5)`,
          [feedbackId, entry.feedbackText, entry.rotation, entryId, userSub],
        );
      }

      await client.query('COMMIT');

      return this.findById(entryId, userSub);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async delete(id: string, userSub: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM feedback WHERE journal_entry_id = $1', [id]);
      await client.query('DELETE FROM med_journal WHERE id = $1 AND user_sub = $2', [id, userSub]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async findById(id: string, userSub: string): Promise<any | null> {
    const { rows } = await pool.query(
      `SELECT
          mj.*,
          f.text as feedback_text,
          f.rotation as feedback_rotation
       FROM med_journal mj
       LEFT JOIN feedback f ON f.journal_entry_id = mj.id
       WHERE mj.id = $1 AND mj.user_sub = $2`,
      [id, userSub],
    );
    if (rows[0]) {
      const { feedback_text, feedback_rotation, ...entry } = rows[0];
      return {
        ...entry,
        feedback: feedback_text
          ? [{ text: feedback_text, rotation: feedback_rotation }]
          : [],
      };
    }
    return null;
  }

  async findWithPagination(
    page: number,
    limit: number,
    userSub: string,
    searchTerm?: string,
    rotation?: string,
  ): Promise<any[]> {
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        mj.*,
        json_agg(
          CASE
            WHEN f.id IS NOT NULL THEN
              json_build_object(
                'id', f.id,
                'text', f.text,
                'rotation', f.rotation
              )
            ELSE NULL
          END
        ) FILTER (WHERE f.id IS NOT NULL) as feedback_array
      FROM med_journal mj
      LEFT JOIN feedback f ON f.journal_entry_id = mj.id
      WHERE mj.user_sub = $3
    `;
    const values: unknown[] = [limit, offset, userSub];

    if (rotation) {
      query += ` AND mj."rotation" = $${values.length + 1}`;
      values.push(rotation);
    }

    if (searchTerm) {
      query += `
        AND (
          LOWER(mj."rotation") LIKE LOWER($${values.length + 1})
          OR LOWER(mj."hospital") LIKE LOWER($${values.length + 1})
          OR LOWER(mj."doctor") LIKE LOWER($${values.length + 1})
          OR LOWER(mj."location") LIKE LOWER($${values.length + 1})
          OR LOWER(mj."canmedsRoles"::text) LIKE LOWER($${values.length + 1})
          OR LOWER(mj."learningObjectives"::text) LIKE LOWER($${values.length + 1})
        )
      `;
      values.push(`%${searchTerm}%`);
    }

    query += `
      GROUP BY mj.id
      ORDER BY mj.date DESC
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(query, values);
    return rows.map((row: any) => ({
      ...row,
      feedback: row.feedback_array || [],
    }));
  }
}
