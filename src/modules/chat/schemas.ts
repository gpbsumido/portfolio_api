import { z } from 'zod';

export const chatSchema = z.object({
  prompt: z
    .string({ required_error: 'Prompt is required' })
    .min(1, 'Prompt must not be empty')
    .max(4000, 'Prompt too long'),
});

export type ChatInput = z.infer<typeof chatSchema>;

export const summarizeSchema = z.object({
  text: z
    .string({ required_error: 'Text for summarization is required' })
    .min(1, 'Text must not be empty')
    .max(4000, 'Text too long'),
});

export type SummarizeInput = z.infer<typeof summarizeSchema>;
