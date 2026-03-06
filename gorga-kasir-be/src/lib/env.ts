import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalString = () => z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.string().optional());

const optionalUrl = () => z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.string().url().optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.string().default("4000"),
  JWT_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.string().default("30"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  RATE_LIMIT_AUTH_MAX: z.string().default("20"),
  RATE_LIMIT_AUTH_WINDOW: z.string().default("1 minute"),
  RATE_LIMIT_SYNC_MAX: z.string().default("40"),
  RATE_LIMIT_SYNC_WINDOW: z.string().default("1 minute"),
  AUTH_LOCKOUT_MAX_ATTEMPTS: z.string().default("5"),
  AUTH_LOCKOUT_WINDOW_MINUTES: z.string().default("15"),
  S3_ENDPOINT: optionalUrl(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: optionalString(),
  S3_SECRET_ACCESS_KEY: optionalString(),
  S3_BUCKET: optionalString(),
  S3_PUBLIC_BASE_URL: optionalUrl(),
  SENTRY_DSN: optionalUrl(),
  APP_ENV: z.string().default("development")
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid env: ${parsed.error.message}`);
}

export const env = {
  databaseUrl: parsed.data.DATABASE_URL,
  port: Number(parsed.data.PORT),
  jwtSecret: parsed.data.JWT_SECRET,
  jwtAccessTtl: parsed.data.JWT_ACCESS_TTL,
  refreshTokenTtlDays: Number(parsed.data.REFRESH_TOKEN_TTL_DAYS),
  frontendOrigin: parsed.data.FRONTEND_ORIGIN,
  rateLimitAuthMax: Number(parsed.data.RATE_LIMIT_AUTH_MAX),
  rateLimitAuthWindow: parsed.data.RATE_LIMIT_AUTH_WINDOW,
  rateLimitSyncMax: Number(parsed.data.RATE_LIMIT_SYNC_MAX),
  rateLimitSyncWindow: parsed.data.RATE_LIMIT_SYNC_WINDOW,
  authLockoutMaxAttempts: Number(parsed.data.AUTH_LOCKOUT_MAX_ATTEMPTS),
  authLockoutWindowMinutes: Number(parsed.data.AUTH_LOCKOUT_WINDOW_MINUTES),
  s3Endpoint: parsed.data.S3_ENDPOINT,
  s3Region: parsed.data.S3_REGION,
  s3AccessKeyId: parsed.data.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
  s3Bucket: parsed.data.S3_BUCKET,
  s3PublicBaseUrl: parsed.data.S3_PUBLIC_BASE_URL,
  sentryDsn: parsed.data.SENTRY_DSN,
  appEnv: parsed.data.APP_ENV
};
