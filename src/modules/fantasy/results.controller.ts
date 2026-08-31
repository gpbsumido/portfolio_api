import type { NextFunction, Request, Response } from 'express';
import * as repo from './results.repository.js';
import { readClientKey } from './results.client-key.js';
import type { ListResultsQuery, ResultInputBody } from './results.schemas.js';
import type { ResultRow, ResultSummaryDto } from './results.types.js';

function toSummary(row: ResultRow): ResultSummaryDto {
  return {
    id: row.id,
    sport: row.sport,
    numTeams: row.num_teams,
    mySlot: row.my_slot,
    mode: row.mode,
    fullySim: row.fully_sim,
    humanPickCount: row.human_pick_count,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export class ResultsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit } = (req.validatedQuery ?? req.query) as unknown as ListResultsQuery;
      const rows = await repo.listResults(limit);
      res.json({ results: rows.map(toSummary) });
    } catch (err) {
      next(err);
    }
  }

  async post(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // requireClientKey has already validated it; this is never null here.
      const key = readClientKey(req) as string;
      const body = req.body as ResultInputBody;
      const { id } = await repo.upsertResult(key, body);
      res.status(201).json({ id });
    } catch (err) {
      next(err);
    }
  }
}
