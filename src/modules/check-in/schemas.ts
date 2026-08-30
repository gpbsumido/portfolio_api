import { z } from 'zod';

/** Creating a site. The salt is generated server-side, never accepted. */
export const createSiteSchema = z
  .object({
    name: z.string().trim().min(1, 'A site name is required').max(120),
  })
  .strict();

export const siteParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

/**
 * A submitted arrival. The code is six digits and nothing else -- rejecting the
 * shape here means a malformed guess never reaches the HMAC or the attempt
 * counter.
 */
export const arrivalSchema = z
  .object({
    siteId: z.string().uuid(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'The code is six digits'),
  })
  .strict();

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type ArrivalInput = z.infer<typeof arrivalSchema>;
