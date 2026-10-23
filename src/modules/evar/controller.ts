import type { NextFunction, Request, Response } from 'express';
import { actorEmail } from '../../shared/auth/adminEmail.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/index.js';
import * as repo from './repository.js';
import type { AttemptInput, ParticipantInput, ReferenceInput } from './schemas.js';
import type { EvarAttemptRow, EvarCaseReferenceRow, EvarParticipantRow } from './types.js';

/** How many of your own attempts the history shows. */
const HISTORY_LIMIT = 100;

/** The Auth0 subject of the caller, or a 401 if the token carried none. */
function requireSub(req: Request): string {
  const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub;
  if (!sub) throw new UnauthorizedError();
  return sub;
}

/**
 * What leaves the API about a participant. The sub stays behind: it's how
 * this server finds your row, and nobody reading the data needs it.
 */
const toParticipant = (p: EvarParticipantRow) => ({
  id: p.id,
  consentVersion: p.consent_version,
  consentedAt: p.consented_at,
  trainingLevel: p.training_level,
  trainingYear: p.training_year,
  specialty: p.specialty,
});

const toAttempt = (a: EvarAttemptRow) => ({
  id: a.id,
  participantId: a.participant_id,
  caseId: a.case_id,
  level: a.level,
  appVersion: a.app_version,
  startedAt: a.started_at,
  submittedAt: a.submitted_at,
  durationMs: a.duration_ms,
  timeLimitMs: a.time_limit_ms,
  timedOut: a.timed_out,
  measurements: a.measurements,
  scores: a.scores,
  devices: a.devices,
});

/** A case's answers as the page reads them. Who set them stays on the server. */
const toReference = (r: EvarCaseReferenceRow) => ({
  caseId: r.case_id,
  neckDiameter: r.neck_diameter,
  neckLength: r.neck_length,
  maxSac: r.max_sac,
  rightCia: r.right_cia,
  leftCia: r.left_cia,
  note: r.note,
  updatedAt: r.updated_at,
});

export class EvarController {
  /** GET /api/evar/references. Public: anonymous practice scores against these too. */
  async listReferences(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await repo.listReferences();
      res.json({ references: rows.map(toReference) });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/evar/admin/references/:caseId */
  async putReference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params as { caseId: string };
      const row = await repo.upsertReference(caseId, req.body as ReferenceInput, actorEmail(req));
      res.json({ reference: toReference(row) });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/evar/admin/references/:caseId. Idempotent, like withdrawing. */
  async deleteReference(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { caseId } = req.params as { caseId: string };
      await repo.deleteReference(caseId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/evar/participant */
  async getParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const participant = await repo.getParticipant(requireSub(req));
      res.json({ participant: participant ? toParticipant(participant) : null });
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/evar/participant */
  async putParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const participant = await repo.upsertParticipant(requireSub(req), req.body as ParticipantInput);
      res.json({ participant: toParticipant(participant) });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/evar/participant. Idempotent: withdrawing twice is still withdrawn. */
  async deleteParticipant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await repo.deleteParticipant(requireSub(req));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/evar/attempts. Nothing is stored for someone who hasn't consented. */
  async recordAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const participant = await repo.getParticipant(requireSub(req));
      if (!participant) throw new ForbiddenError('Join the study before attempts are recorded');
      const result = await repo.recordAttempt(participant.id, req.body as AttemptInput);
      res.status(result.status === 'recorded' ? 201 : 200).json({ attempt: toAttempt(result.attempt) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/evar/attempts */
  async listAttempts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const participant = await repo.getParticipant(requireSub(req));
      if (!participant) {
        res.json({ attempts: [] });
        return;
      }
      const attempts = await repo.listAttempts(participant.id, HISTORY_LIMIT);
      res.json({ attempts: attempts.map(toAttempt) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/evar/admin/export. Pseudonymous: participant uuids, no subs, no emails. */
  async exportAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { participants, attempts } = await repo.exportAll();
      res.json({ participants: participants.map(toParticipant), attempts: attempts.map(toAttempt) });
    } catch (err) {
      next(err);
    }
  }
}
