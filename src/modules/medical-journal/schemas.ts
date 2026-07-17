import { z } from 'zod';

export const saveEntrySchema = z.object({
  id: z.string().optional(),
  patientSetting: z.string({ required_error: 'patientSetting is required' }),
  interaction: z.string({ required_error: 'interaction is required' }),
  canmedsRoles: z.array(z.string()).optional(),
  learningObjectives: z.array(z.string()).optional(),
  rotation: z.string({ required_error: 'rotation is required' }),
  date: z.string({ required_error: 'date is required' }),
  location: z.string().optional(),
  hospital: z.string().optional(),
  doctor: z.string().optional(),
  whatIDidWell: z.string().optional(),
  whatICouldImprove: z.string().optional(),
  feedbackText: z.string().optional(),
});

export type SaveEntryInput = z.infer<typeof saveEntrySchema>;
