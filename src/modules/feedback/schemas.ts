import { z } from 'zod';

export const createFeedbackSchema = z.object({
  text: z.string({ required_error: 'text is required' }).min(1, 'text must not be empty'),
  rotation: z.string({ required_error: 'rotation is required' }).min(1, 'rotation must not be empty'),
  journal_entry_id: z.string().optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const updateFeedbackSchema = z.object({
  text: z.string({ required_error: 'text is required' }).min(1, 'text must not be empty'),
  rotation: z.string({ required_error: 'rotation is required' }).min(1, 'rotation must not be empty'),
  journal_entry_id: z.string().optional(),
});

export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
