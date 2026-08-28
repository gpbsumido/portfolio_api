import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../../shared/errors/AppError.js';
import * as repo from './adjustments.repository.js';
import type { ListQuery, PatchStatusBody, PostBatchBody } from './adjustments.schemas.js';
import type { AdjustmentDto, AdjustmentRow } from './adjustments.types.js';

function toDto(row: AdjustmentRow): AdjustmentDto {
  return {
    id: row.id,
    player: row.player_name,
    team: row.team,
    position: row.position,
    category: row.category,
    note: row.note,
    sourceUrl: row.source_url,
    deltaPct: Number(row.delta_pct),
    beneficiaryOf: row.beneficiary_of,
    confidence: row.confidence,
    status: row.status,
    batchDate: typeof row.batch_date === 'string' ? row.batch_date : String(row.batch_date),
  };
}

export class AdjustmentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status } = (req.validatedQuery ?? req.query) as unknown as ListQuery;
      const rows = await repo.listAdjustments(status);
      res.json({ adjustments: rows.map(toDto) });
    } catch (err) {
      next(err);
    }
  }

  async patch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status } = req.body as PatchStatusBody;
      const row = await repo.setStatus(id, status);
      if (!row) throw new NotFoundError('adjustment not found');
      res.json({ adjustment: toDto(row) });
    } catch (err) {
      next(err);
    }
  }

  async postBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batchDate, items } = req.body as PostBatchBody;
      const count = await repo.upsertBatch(batchDate, items);
      res.status(201).json({ batchDate, upserted: count });
    } catch (err) {
      next(err);
    }
  }
}
