import { z } from 'zod';

/**
 * What a caller may change on an existing item.
 *
 * This was `done` alone, on the grounds that a partial of the row would let the
 * client rewrite the list rather than tick it off. Editing is a feature now, so
 * that narrowness stopped being a safety property and became a missing one —
 * the fields it kept out were the whole point of the page.
 *
 * The ones still left out are left out deliberately, and for different reasons:
 *
 *   position     assigned by the server; the ordering is what the page is for
 *   done_at      derived from done, so accepting it invites the two to disagree
 *   deleted_at   removal has its own route, its own confirm, and its own 404
 *   id, created_at, updated_at   identity and bookkeeping, never input
 */
export const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required').max(200).optional(),
    project: z.string().trim().min(1, 'A project is required').max(60).optional(),
    phase: z.number().int().min(1).max(4).optional(),
    detail: z.string().trim().max(2000).nullish(),
    reason: z.string().trim().max(2000).nullish(),
    blocking: z.boolean().optional(),
    command: z.string().trim().max(500).nullish(),
    pr_repo: z.string().trim().max(60).nullish(),
    pr_number: z.number().int().positive().nullish(),
    done: z.boolean().optional(),
  })
  // strict, not the default strip. Both are safe from mass assignment, but a
  // silently discarded field looks like it worked from the caller's side.
  .strict()
  // An empty body would otherwise write a revision recording that nothing
  // happened, which makes the timeline harder to read for no gain.
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

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
    // Why the item exists, as opposed to detail, which is what to do about it.
    reason: z.string().trim().max(2000).nullish(),
  })
  .strict();

/** Which revision to restore. Strict, so a typo'd field is a 400 not a no-op. */
export const revertTodoSchema = z.object({ revision: z.number().int().positive() }).strict();

export const commentBodySchema = z
  .object({ body: z.string().trim().min(1, 'A comment cannot be empty').max(4000) })
  .strict();

export const commentIdParamSchema = z.object({ commentId: z.string().uuid() });

export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
