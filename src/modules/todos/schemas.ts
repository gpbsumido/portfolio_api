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

export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
