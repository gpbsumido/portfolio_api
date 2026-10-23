import { z } from 'zod';

/**
 * Joining the study, or updating your profile. The consent version is the one
 * the page showed; a new version re-stamps when consent was given.
 */
export const participantSchema = z
  .object({
    consentVersion: z.string().trim().min(1).max(40),
    trainingLevel: z.enum(['medical-student', 'resident', 'fellow', 'attending', 'other']),
    trainingYear: z.number().int().min(1).max(15).nullable().optional(),
    specialty: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

/**
 * Any length a caliper can draw. The slice is 384 px at 0.85 mm, so corner to
 * corner is about 460 mm: a silly measurement, but one to keep, not a reason
 * to drop the attempt it belongs to.
 */
const mm = z.number().min(0).max(1000);

const taskScoreSchema = z
  .object({
    id: z.string().max(40),
    yours: mm.nullable(),
    reference: mm,
    verdict: z.enum(['within', 'outside', 'unmeasured']),
  })
  .strict();

const deviceGradeSchema = z
  .object({
    id: z.string().max(40),
    code: z.string().max(40).nullable(),
    picked: mm.nullable(),
    expected: mm.nullable(),
    verdict: z.enum(['match', 'mismatch', 'unpicked']),
  })
  .strict();

/**
 * One attempt. Bounded everywhere, because it ends up in jsonb: nothing here
 * should be able to carry more than a few hundred bytes of numbers.
 */
export const attemptSchema = z
  .object({
    clientAttemptId: z.string().uuid(),
    caseId: z.string().trim().min(1).max(40),
    level: z.enum(['easy', 'medium', 'hard']),
    appVersion: z.string().trim().min(1).max(20),
    startedAt: z.string().datetime(),
    submittedAt: z.string().datetime(),
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
    timeLimitMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).nullable(),
    timedOut: z.boolean(),
    measurements: z
      .object({
        neckDiameter: mm.optional(),
        neckLength: mm.optional(),
        maxSac: mm.optional(),
        rightCia: mm.optional(),
        leftCia: mm.optional(),
      })
      .strict(),
    scores: z.array(taskScoreSchema).max(10),
    devices: z
      .object({
        ipsilateral: z.enum(['right', 'left']),
        mainBody: z.string().max(40).nullable(),
        contraLimb: z.string().max(40).nullable(),
        ipsiExtension: z.string().max(40).nullable(),
        grades: z.array(deviceGradeSchema).max(5),
      })
      .strict()
      .nullable(),
  })
  .strict();

/** A case id as the page knows it: lowercase words joined by hyphens. */
export const caseParamsSchema = z
  .object({
    caseId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
  })
  .strict();

const answer = z.number().positive().max(300);

/** All five answers at once, so a case is never half overridden. */
export const referenceSchema = z
  .object({
    neckDiameter: answer,
    neckLength: answer,
    maxSac: answer,
    rightCia: answer,
    leftCia: answer,
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type ReferenceInput = z.infer<typeof referenceSchema>;
export type ParticipantInput = z.infer<typeof participantSchema>;
export type AttemptInput = z.infer<typeof attemptSchema>;
