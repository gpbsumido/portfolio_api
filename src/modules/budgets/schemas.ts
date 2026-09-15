import { z } from 'zod';

const splitSchema = z.object({
  personId: z.string(),
  amountCents: z.number().int().nonnegative(),
});

/** Budget settings the owner can change. Strict so a typo is a 400, not a no-op. */
export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    cycleStartDay: z.number().int().min(1).max(28).optional(),
    visibility: z.enum(['private', 'public']).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

export const addPersonSchema = z
  .object({ name: z.string().trim().min(1).max(60) })
  .strict();

export const createExpenseSchema = z
  .object({
    categoryId: z.string().trim().min(1).max(40),
    amountCents: z.number().int().positive(),
    occurredAt: z.string().datetime(),
    personId: z.string().uuid().nullish(),
    tags: z.array(z.string().trim().max(40)).max(20).optional(),
    note: z.string().trim().max(500).nullish(),
    vendor: z.string().trim().max(80).nullish(),
    splits: z.array(splitSchema).max(20).nullish(),
  })
  .strict();

export const updateExpenseSchema = z
  .object({
    categoryId: z.string().trim().min(1).max(40).optional(),
    amountCents: z.number().int().positive().optional(),
    occurredAt: z.string().datetime().optional(),
    personId: z.string().uuid().nullish(),
    tags: z.array(z.string().trim().max(40)).max(20).optional(),
    note: z.string().trim().max(500).nullish(),
    vendor: z.string().trim().max(80).nullish(),
    splits: z.array(splitSchema).max(20).nullish(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' });

/** Ask to join a public budget, found by the owner's email. */
export const createJoinRequestSchema = z
  .object({
    ownerEmail: z.string().email(),
    name: z.string().trim().min(1).max(60),
  })
  .strict();

export const budgetIdParamSchema = z.object({ budgetId: z.string().uuid() });
export const expenseParamSchema = z.object({
  budgetId: z.string().uuid(),
  expenseId: z.string().uuid(),
});
export const requestParamSchema = z.object({
  budgetId: z.string().uuid(),
  requestId: z.string().uuid(),
});

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type AddPersonInput = z.infer<typeof addPersonSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CreateJoinRequestInput = z.infer<typeof createJoinRequestSchema>;
