/**
 * env.ts is parsed at module load time — test via dynamic re-require.
 * We mock process.env before each test and clear the module cache.
 */

const REQUIRED_ENV = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  JWT_SECRET: 'test-secret-that-is-at-least-32-chars-long',
};

function loadEnv(overrides: Record<string, string | undefined> = {}) {
  jest.resetModules();
  const saved = { ...process.env };
  // Clear all env vars, set only what we provide
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, REQUIRED_ENV, overrides);
  try {
    const mod = require('../../../src/infrastructure/config/env');
    return { env: mod.env, restore: () => { Object.assign(process.env, saved); } };
  } catch (err) {
    Object.assign(process.env, saved);
    throw err;
  }
}

describe('env.ts validation', () => {
  afterEach(() => jest.resetModules());

  it('parses valid env successfully', () => {
    const { env, restore } = loadEnv();
    expect(env.NODE_ENV).toBe('test');
    expect(env.SUPABASE_URL).toBe('http://localhost:54321');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);  // default
    restore();
  });

  it('throws when SUPABASE_URL missing', () => {
    expect(() => loadEnv({ SUPABASE_URL: undefined })).toThrow('SUPABASE_URL');
  });

  it('throws when JWT_SECRET too short', () => {
    expect(() => loadEnv({ JWT_SECRET: 'tooshort' })).toThrow();
  });

  it('throws when SUPABASE_URL is not a URL', () => {
    expect(() => loadEnv({ SUPABASE_URL: 'not-a-url' })).toThrow();
  });

  it('accepts optional UPSTASH vars', () => {
    const { env, restore } = loadEnv({
      UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });
    expect(env.UPSTASH_REDIS_REST_URL).toBe('https://redis.upstash.io');
    restore();
  });

  it('defaults PORT to 3001', () => {
    const { env, restore } = loadEnv();
    expect(env.PORT).toBe(3001);
    restore();
  });

  it('defaults AUTH_RATE_LIMIT_MAX to 5', () => {
    const { env, restore } = loadEnv();
    expect(env.AUTH_RATE_LIMIT_MAX).toBe(5);
    restore();
  });

  it('coerces PORT to number', () => {
    const { env, restore } = loadEnv({ PORT: '4000' });
    expect(env.PORT).toBe(4000);
    restore();
  });
});
