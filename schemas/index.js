const { z } = require('zod');

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

const usernameParam = z.object({
  username: z
    .string()
    .regex(USERNAME_REGEX, 'username must be 3–30 characters: lowercase letters, numbers, and underscores only'),
});

const createPost = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z
      .string({ required_error: 'content is required' })
      .trim()
      .min(1, 'content must be at least 1 character')
      .max(500, 'content must be 500 characters or fewer'),
    caption: z
      .string()
      .trim()
      .max(2200, 'caption must be 2200 characters or fewer')
      .optional(),
  }),
  z.object({
    type: z.literal('photo'),
    caption: z
      .string()
      .trim()
      .max(2200, 'caption must be 2200 characters or fewer')
      .optional(),
    // file count validated separately after multer runs
  }),
]);

const updateProfile = z.object({
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

const setupProfile = z.object({
  username: z
    .string({ required_error: 'username is required' })
    .regex(USERNAME_REGEX, 'username must be 3–30 characters: lowercase letters, numbers, and underscores only'),
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

module.exports = { usernameParam, createPost, updateProfile, setupProfile };
