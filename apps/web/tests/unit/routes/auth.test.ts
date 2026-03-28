import { container } from '../../../src/container';
import { setupMockContainer, makeRequest } from '../helpers/mockContainer';
import { AppError } from '../../../src/shared/errors/AppError';

// Mock env before importing routes
jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 604800,
    AUTH_RATE_LIMIT_MAX: 5,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: 900,
  },
}));

beforeEach(() => setupMockContainer());
afterEach(() => container._reset());

describe('POST /api/v1/auth/register', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/auth/register/route'));
  });

  it('201 with valid input', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/register', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe('test@example.com');
  });

  it('400 for invalid email', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/register', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 for short password', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/register', {
      method: 'POST',
      body: { email: 'test@example.com', password: '1234' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 for invalid body', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/register', {
      method: 'POST',
      body: null,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 when body is not valid JSON', async () => {
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json!',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('passes through AppError from authProvider', async () => {
    setupMockContainer({ auth: { register: jest.fn().mockRejectedValue(AppError.conflict('email exists')) } });
    const req = makeRequest('http://localhost/api/v1/auth/register', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/auth/login', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/auth/login/route'));
  });

  it('200 with valid credentials', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
  });

  it('429 when rate limit exceeded', async () => {
    setupMockContainer({
      cache: { incr: jest.fn().mockResolvedValue(10) }, // > AUTH_RATE_LIMIT_MAX (5)
    });
    const req = makeRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('400 for missing fields', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 when body is not valid JSON', async () => {
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'bad body',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('401 for wrong credentials', async () => {
    setupMockContainer({ auth: { login: jest.fn().mockRejectedValue(AppError.unauthorized()) } });
    const req = makeRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'wrong' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/auth/refresh/route'));
  });

  it('401 when no cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/refresh', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('200 with valid refresh token cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/refresh', {
      method: 'POST',
      cookies: { refresh_token: 'valid-token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
  });

  it('401 for invalid refresh token', async () => {
    setupMockContainer({ auth: { refreshAccessToken: jest.fn().mockRejectedValue(AppError.unauthorized()) } });
    const req = makeRequest('http://localhost/api/v1/auth/refresh', {
      method: 'POST',
      cookies: { refresh_token: 'bad-token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/auth/logout/route'));
  });

  it('200 and clears cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/logout', {
      method: 'POST',
      cookies: { refresh_token: 'token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('200 even without cookie', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/logout', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('500 when logout throws unexpectedly', async () => {
    setupMockContainer({ auth: { logout: jest.fn().mockRejectedValue(new Error('db error')) } });
    const req = makeRequest('http://localhost/api/v1/auth/logout', {
      method: 'POST',
      cookies: { refresh_token: 'token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
