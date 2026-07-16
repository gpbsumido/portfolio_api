import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
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

  // Auth0
  NEXT_PUBLIC_AUTH0_AUDIENCE: z.string().min(1),
  NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL: z.string().url(),

  // AWS S3
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET_NAME: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),

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
