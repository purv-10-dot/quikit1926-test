/**
 * Centralized, validated environment access.
 * Throws early (at import) if a critical var is missing so misconfig fails fast.
 * Non-critical integration keys (Twilio/Zoom/etc.) are read lazily by their
 * own service modules and may be empty in local dev.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BASE_URL: z.string().url().default('http://localhost:3020'),
  FRONTEND_URL: z.string().url().default('http://localhost:3020'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be set (>=16 chars)'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be set'),
});

// Parse only the critical subset; integration keys are optional and read ad hoc.
const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See .env.example.');
}

export const env = parsed.data;

/** Read an optional integration var (returns '' if unset). */
export const optionalEnv = (key: string): string => process.env[key] ?? '';
