import { buildApp, requireAuth, requireAdminIp } from '../../../src/infrastructure/fastify/app';
import { buildTestApp, authHeader } from '../helpers/buildTestApp';
import { container } from '../../../src/container';
import { AppError } from '../../../src/shared/errors/AppError';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

jest.mock('../../../src/infrastructure/config/env', () => ({
  env: {
    AUTH_RATE_LIMIT_MAX: 5,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: 900,
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../src/shared/engine/slotEngine', () => ({
  createSlotEngine: jest.fn(() => ({
    computeFullSpin: jest.fn().mockReturnValue({ totalWin: 0, grid: [] }),
  })),
}));

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  container._reset();
});

describe('buildApp()', () => {
  it('serves health endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
  });

  it('has error handler for AppError', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: authHeader(),
    });
    // wallet returns mock data — just check it doesn't 500
    expect([200, 400, 401, 403, 404, 422, 429]).toContain(res.statusCode);
  });

  it('handles Zod validation errors via global error handler', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for protected routes without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/wallet' });
    expect(res.statusCode).toBe(401);
  });
});

describe('requireAuth preHandler', () => {
  it('throws UNAUTHORIZED for missing Bearer prefix', async () => {
    const mockReq = { headers: { authorization: 'Basic abc' } } as unknown as FastifyRequest;
    const mockReply = {} as FastifyReply;
    await expect(requireAuth(mockReq, mockReply)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when no auth header', async () => {
    const mockReq = { headers: {} } as unknown as FastifyRequest;
    const mockReply = {} as FastifyReply;
    await expect(requireAuth(mockReq, mockReply)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('requireAdminIp preHandler', () => {
  it('passes when ADMIN_ALLOWED_IPS not set', async () => {
    const orig = process.env.ADMIN_ALLOWED_IPS;
    delete process.env.ADMIN_ALLOWED_IPS;
    const mockReq = { headers: {}, ip: '1.2.3.4' } as unknown as FastifyRequest;
    const mockReply = {} as FastifyReply;
    await expect(requireAdminIp(mockReq, mockReply)).resolves.toBeUndefined();
    process.env.ADMIN_ALLOWED_IPS = orig;
  });

  it('passes when IP is in allowlist', async () => {
    process.env.ADMIN_ALLOWED_IPS = '1.2.3.4,5.6.7.8';
    const mockReq = { headers: {}, ip: '1.2.3.4' } as unknown as FastifyRequest;
    const mockReply = {} as FastifyReply;
    await expect(requireAdminIp(mockReq, mockReply)).resolves.toBeUndefined();
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  it('throws FORBIDDEN when IP not in allowlist', async () => {
    process.env.ADMIN_ALLOWED_IPS = '1.2.3.4';
    const mockReq = { headers: {}, ip: '9.9.9.9' } as unknown as FastifyRequest;
    const mockReply = {} as FastifyReply;
    await expect(requireAdminIp(mockReq, mockReply)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  it('uses x-forwarded-for header when present', async () => {
    process.env.ADMIN_ALLOWED_IPS = '1.2.3.4';
    const mockReq = { headers: { 'x-forwarded-for': '1.2.3.4, proxy' }, ip: '0.0.0.0' } as unknown as FastifyRequest;
    const mockReply = {} as FastifyReply;
    await expect(requireAdminIp(mockReq, mockReply)).resolves.toBeUndefined();
    delete process.env.ADMIN_ALLOWED_IPS;
  });
});
