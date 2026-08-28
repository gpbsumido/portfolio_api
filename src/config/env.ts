import { z } from 'zod';
import 'dotenv/config';

export const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database
  DATABASE_URL: z.string().optional(),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('portfolio'),

  // Auth0 — required by the web service (see config/auth.ts), but optional here
  // so DB-only workloads (the reset-feature-flags cron, migrations, scripts) can
  // boot without them. auth.ts validates their presence at the point of use.
  // The correct names. NEXT_PUBLIC_ is a Next.js build-time convention meaning
  // "inline this into the browser bundle", and it means nothing to Express — so
  // wearing it here was always just wrong rather than dangerous. The danger is
  // the copy: the moment one of these names is pasted into the frontend's
  // environment, anything under that prefix ships to every visitor. Naming them
  // correctly on this side removes the tempting thing to copy.
  AUTH0_AUDIENCE: z.string().min(1).optional(),
  AUTH0_ISSUER_BASE_URL: z.string().url().optional(),
  // The old names, still read so a deploy can rename its variables without a
  // window where the API cannot validate a token. Remove once both sides carry
  // the new ones.
  NEXT_PUBLIC_AUTH0_AUDIENCE: z.string().min(1).optional(),
  NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL: z.string().url().optional(),

  // AWS S3
  // Shared secret paul-explore's BFF sends on operator writes. Unset means the
  // guard is off, which keeps a fresh clone and local dev working.
  OPERATOR_SERVICE_TOKEN: z.string().optional(),

  // Shared secret paul-explore's BFF sends on open-tier feature-flag writes,
  // which have no signed-in user to borrow a token from. Unset disables that
  // path entirely and every write falls back to requiring a user.
  FLAGS_SERVICE_TOKEN: z.string().optional(),

  // Shared secret the Draft Lab extension and its daily research job carry to
  // approve/push valuation adjustments. Unset disables adjustment writes (503)
  // — there is no user-auth fallback for this resource.
  DRAFT_ADJ_SERVICE_TOKEN: z.string().optional(),

  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET_NAME: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),


  // Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_STATE_SECRET: z.string().optional(),
  GOOGLE_WEBHOOK_URL: z.string().optional(),

  // Frontend
  FRONTEND_URL: z.string().optional(),

  // Admin
  PLAYOFFS_ADMIN_SECRET: z.string().optional(),

  // Database TLS. DB_CA_CERT is the provider's root certificate in PEM form;
  // supplying it turns on real server verification.
  DB_CA_CERT: z.string().optional(),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().optional(),

  // Railway
  RAILWAY_ENVIRONMENT: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
