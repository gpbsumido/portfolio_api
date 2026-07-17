import { z } from 'zod';

// ---------------------------------------------------------------------------
// Calendar Events
// ---------------------------------------------------------------------------

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().optional(),
  startDate: z.string().min(1, 'startDate is required'),
  endDate: z.string().min(1, 'endDate is required'),
  allDay: z.boolean().optional(),
  color: z.string().optional(),
  calendarId: z.string().uuid().optional(),
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  allDay: z.boolean().optional(),
  color: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export const createCalendarSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  color: z.string().optional(),
  syncMode: z.string().optional(),
});

export const updateCalendarSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().optional(),
  syncMode: z.string().optional(),
  googleCalId: z.string().optional().nullable(),
  googleCalName: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Countdowns
// ---------------------------------------------------------------------------

export const createCountdownSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().optional(),
  targetDate: z.string().min(1, 'targetDate is required'),
  color: z.string().optional(),
});

export const updateCountdownSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  targetDate: z.string().optional(),
  color: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Calendar Members
// ---------------------------------------------------------------------------

export const addMemberSchema = z.object({
  email: z.string().email('email must be a valid email address'),
  role: z.enum(['editor', 'viewer']).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

// ---------------------------------------------------------------------------
// Event Cards
// ---------------------------------------------------------------------------

export const addEventCardSchema = z.object({
  cardId: z.string().min(1, 'cardId is required'),
  cardName: z.string().min(1, 'cardName is required'),
  cardSetId: z.string().optional(),
  cardSetName: z.string().optional(),
  cardImageUrl: z.string().url().optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().optional(),
});

export const updateEventCardSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;
export type CreateCountdownInput = z.infer<typeof createCountdownSchema>;
export type UpdateCountdownInput = z.infer<typeof updateCountdownSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type AddEventCardInput = z.infer<typeof addEventCardSchema>;
export type UpdateEventCardInput = z.infer<typeof updateEventCardSchema>;
