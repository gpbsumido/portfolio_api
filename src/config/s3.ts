import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3 = new S3Client({
  credentials:
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  region: env.AWS_REGION,
});

export const S3_BUCKET = env.AWS_S3_BUCKET_NAME;

/**
 * Where uploaded media is served from. Prefer the CDN, but fall back to the
 * bucket's own URL so a missing CDN_BASE_URL degrades to a slower-but-working
 * link instead of stringifying `undefined` into every stored image URL.
 */
export const CDN_BASE =
  env.CDN_BASE_URL ??
  (env.AWS_S3_BUCKET_NAME && env.AWS_REGION
    ? `https://${env.AWS_S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com`
    : undefined);
