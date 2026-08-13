import { z } from 'zod';

/**
 * The only field a caller may change.
 *
 * Deliberately not a partial of the row: allowing project/phase/title through
 * would let the client rewrite the list rather than tick it off, which is the
 * mass-assignment shape the audit looked for everywhere else.
 */
export const updateTodoSchema = z
  .object({
    done: z.boolean(),
  })
  // strict, not the default strip. Both are safe from mass assignment, but a
  // silently discarded field looks like it worked from the caller's side.
  .strict();

export const todoIdParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Quick add: a title and a project, everything else optional.
 *
 * position is absent on purpose — the server assigns it. done and blocking are
 * absent for the same reason the update schema is one field: adding an item
 * should not be a way to declare it urgent or already finished.
 */
export const createTodoSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required').max(200),
    project: z.string().trim().min(1, 'A project is required').max(60),
    phase: z.number().int().min(1).max(4).default(4),
    detail: z.string().trim().max(2000).nullish(),
  })
  .strict();

export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
