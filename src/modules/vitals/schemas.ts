import { z } from 'zod';

const validMetrics = ['LCP', 'CLS', 'FCP', 'INP', 'TTFB'] as const;
const validRatings = ['good', 'needs-improvement', 'poor'] as const;

export const ingestVitalSchema = z.object({
  metric: z.enum(validMetrics, {
    required_error: 'metric is required',
    invalid_type_error: `metric must be one of: ${validMetrics.join(', ')}`,
  }),
  value: z.number({ required_error: 'value is required', invalid_type_error: 'value must be a number' }),
  rating: z.enum(validRatings, {
    required_error: 'rating is required',
    invalid_type_error: `rating must be one of: ${validRatings.join(', ')}`,
  }),
  page: z.string({ required_error: 'page is required' }).min(1, 'page must not be empty'),
  nav_type: z.string().nullish(),
  app_version: z.string().default('unknown'),
});

export type IngestVitalInput = z.infer<typeof ingestVitalSchema>;
