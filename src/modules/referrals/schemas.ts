import { z } from 'zod';

/** Slugs are short, url-safe, and used verbatim in the shareable link. */
export const SLUG_REGEX = /^[a-z0-9-]{3,32}$/;

export const createReferralSchema = z.object({
  // Optional custom slug; when omitted the server generates a unique one.
  slug: z.string().regex(SLUG_REGEX).optional(),
  // Path on the site the link points at, e.g. "/work-portfolio".
  targetPath: z.string().min(1).max(512).startsWith('/').optional(),
  label: z.string().max(120).optional(),
});

export const slugParamSchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
});

export type CreateReferralInput = z.infer<typeof createReferralSchema>;
export type SlugParam = z.infer<typeof slugParamSchema>;
