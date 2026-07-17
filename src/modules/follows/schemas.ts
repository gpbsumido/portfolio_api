import { z } from 'zod';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export const followParamSchema = z.object({
  username: z.string().regex(USERNAME_REGEX),
});

export type FollowParam = z.infer<typeof followParamSchema>;
