import { env } from './env.js';

/**
 * The frontends this API answers to: CORS, and where the Google OAuth flow may
 * send someone back to. There used to be two copies, and the Google one let
 * localhost through in production while CORS didn't.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'https://paulsumido.com',
  'https://develop.paulsumido.com',
  ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
];
