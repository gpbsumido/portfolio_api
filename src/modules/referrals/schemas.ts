import { z } from 'zod';

/** Slugs are short, url-safe, and used verbatim in the shareable link. */
export const SLUG_REGEX = /^[a-z0-9-]{3,32}$/;

export const createReferralSchema = z.object({
  // Optional custom slug; when omitted the server generates a unique one.
  slug: z.string().regex(SLUG_REGEX).optional(),
  // Path on the site the link points at, e.g. "/work-portfolio".
  //
  // startsWith('/') is not enough on its own: "//evil.example" is a
  // protocol-relative URL, so it passes that check and then sends the visitor
  // off-site once the frontend resolves it -- on a link that looked like ours,
  // which is the whole value of an open redirect to whoever finds it. Require
  // a single leading slash and no scheme.
  targetPath: z
    .string()
    .min(1)
    .max(512)
    .regex(
      /^\/(?!\/)(?![\\])[^\s\\]*$/,
      'must be a site-relative path such as /work-portfolio',
    )
    .refine((v) => !/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v), {
      message: 'must not contain a scheme',
    })
    .optional(),
  label: z.string().max(120).optional(),
});

export const slugParamSchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
});

export type CreateReferralInput = z.infer<typeof createReferralSchema>;
export type SlugParam = z.infer<typeof slugParamSchema>;
