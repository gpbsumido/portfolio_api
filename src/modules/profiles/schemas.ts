import { z } from 'zod';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export const setupProfileSchema = z.object({
  username: z
    .string({ required_error: 'username is required' })
    .regex(
      USERNAME_REGEX,
      'username must be 3-30 characters: lowercase letters, numbers, and underscores only',
    ),
  display_name: z
    .string()
    .trim()
    .max(50, 'display_name must be 50 characters or fewer')
    .optional(),
  bio: z
    .string()
    .trim()
    .max(160, 'bio must be 160 characters or fewer')
    .optional(),
  avatar_url: z
    .union([z.string().url('avatar_url must be a valid URL'), z.literal('')])
    .optional(),
});

export const updateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(50, 'display_name must be 50 characters or fewer')
    .optional(),
  bio: z
    .string()
    .trim()
    .max(160, 'bio must be 160 characters or fewer')
    .optional(),
  avatar_url: z
    .union([z.string().url('avatar_url must be a valid URL'), z.literal('')])
    .optional(),
  is_public: z.boolean().optional(),
});

export const usernameParamSchema = z.object({
  username: z
    .string()
    .regex(
      USERNAME_REGEX,
      'username must be 3-30 characters: lowercase letters, numbers, and underscores only',
    ),
});

export type SetupProfileInput = z.infer<typeof setupProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UsernameParam = z.infer<typeof usernameParamSchema>;
