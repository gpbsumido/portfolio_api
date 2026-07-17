import { z } from 'zod';

export const createForumPostSchema = z.object({
  title: z.string({ required_error: 'title is required' }).min(1, 'title must not be empty'),
  text: z.string({ required_error: 'text is required' }).min(1, 'text must not be empty'),
});

export type CreateForumPostInput = z.infer<typeof createForumPostSchema>;

export const createMarkerSchema = z.object({
  latitude: z.number({ required_error: 'latitude is required', invalid_type_error: 'latitude must be a number' }),
  longitude: z.number({ required_error: 'longitude is required', invalid_type_error: 'longitude must be a number' }),
  text: z.string({ required_error: 'text is required' }).min(1, 'text must not be empty'),
});

export type CreateMarkerInput = z.infer<typeof createMarkerSchema>;
