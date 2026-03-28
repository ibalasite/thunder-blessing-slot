import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Supabase (server-side only — never exposed to client)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),     // 15 min
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().default(604800), // 7 days

  // Upstash Redis (optional — NullCacheAdapter if absent)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Rate limiting
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(900),

  // Session limit per user (S-07)
  MAX_SESSIONS_PER_USER: z.coerce.number().default(5),

  // Admin IP allowlist (S-12) — comma-separated, empty = no restriction
  ADMIN_ALLOWED_IPS: z.string().default(''),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${msg}`);
  }
  return result.data;
}

// Singleton — parsed once at startup
export const env = parseEnv();
export type Env = typeof env;
