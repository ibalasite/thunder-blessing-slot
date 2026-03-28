import { buildTestApp, authHeader } from '../../helpers/buildTestApp';
import { container } from '../../../../src/container';
import type { FastifyInstance } from 'fastify';

jest.mock('../../../../src/infrastructure/config/env', () => ({
  env: {
    AUTH_RATE_LIMIT_MAX: 5,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: 900,
    NODE_ENV: 'test',
  },
}));

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  container._reset();
});

describe('POST /api/v1/auth/register', () => {
  it('returns 201 with user id and email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe('user-1');
    expect(body.email).toBe('test@example.com');
  });

  it('returns 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 with access token and sets cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'password' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBe('access-tok');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bad', password: 'password' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns 200 with new access token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: 'refresh_token=my-refresh-tok' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBe('access-tok');
  });

  it('returns 401 when no refresh token cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 on logout', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: 'refresh_token=my-refresh-tok' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('returns 200 even without refresh token cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(res.statusCode).toBe(200);
  });
});
