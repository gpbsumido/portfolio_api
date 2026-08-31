import type { NextFunction, Request, Response } from 'express';
import * as repo from './results.repository.js';
import { readClientKey } from './results.client-key.js';
import type { ListResultsQuery, ResultInputBody } from './results.schemas.js';
import type { ResultRow, ResultSummaryDto } from './results.types.js';

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d));

function toSummary(row: ResultRow): ResultSummaryDto {
  return {
    id: row.id,
    sport: row.sport,
    numTeams: row.num_teams,
    mySlot: row.my_slot,
    mode: row.mode,
    fullySim: row.fully_sim,
    humanPickCount: row.human_pick_count,
    createdAt: iso(row.created_at),
  };
}

// The full export: summary fields plus the picks + standings blobs.
function toFull(row: ResultRow) {
  return {
    ...toSummary(row),
    clientDraftId: row.client_draft_id,
    rounds: row.rounds,
    teamNames: row.team_names,
    picks: row.picks,
    standings: row.standings,
  };
}

export class ResultsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit, full } = (req.validatedQuery ?? req.query) as unknown as ListResultsQuery;
      const rows = await repo.listResults(limit, full);
      res.json({ results: rows.map((r) => (full ? toFull(r) : toSummary(r))) });
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
