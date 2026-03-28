import { NextResponse } from 'next/server';
import { container } from '../../../src/container';
import { setupMockContainer, makeRequest, TEST_USER } from '../helpers/mockContainer';
import { withAuth, withAdminAuth } from '../../../src/shared/middleware/withAuth';
import { AppError } from '../../../src/shared/errors/AppError';

jest.mock('../../../src/config/env', () => ({
  env: { NODE_ENV: 'test' },
}));

beforeEach(() => setupMockContainer());
afterEach(() => container._reset());

describe('withAuth()', () => {
  const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));

  beforeEach(() => handler.mockClear());

  it('calls handler with authenticated user', async () => {
    const wrapped = withAuth(handler);
    const req = makeRequest('http://localhost/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(req, TEST_USER, undefined);
  });

  it('returns 401 when no Authorization header', async () => {
    const wrapped = withAuth(handler);
    const req = makeRequest('http://localhost/test');
    const res = await wrapped(req);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', async () => {
    setupMockContainer({ auth: { verifyAccessToken: jest.fn().mockRejectedValue(AppError.unauthorized()) } });
    const wrapped = withAuth(handler);
    const req = makeRequest('http://localhost/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(401);
  });

  it('passes context to handler', async () => {
    const wrapped = withAuth(handler);
    const req = makeRequest('http://localhost/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const ctx = { params: { id: '123' } };
    await wrapped(req, ctx);
    expect(handler).toHaveBeenCalledWith(req, TEST_USER, ctx);
  });
});

describe('withAdminAuth()', () => {
  const handler = jest.fn().mockResolvedValue(NextResponse.json({ admin: true }));

  beforeEach(() => handler.mockClear());

  it('allows access when ADMIN_ALLOWED_IPS is empty', async () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    const wrapped = withAdminAuth(handler);
    const req = makeRequest('http://localhost/admin', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(200);
  });

  it('allows IP in allowlist', async () => {
    process.env.ADMIN_ALLOWED_IPS = '127.0.0.1,192.168.1.1';
    const wrapped = withAdminAuth(handler);
    const req = makeRequest('http://localhost/admin', {
      headers: {
        Authorization: 'Bearer valid-token',
        'x-forwarded-for': '192.168.1.1',
      },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(200);
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  it('blocks IP not in allowlist (S-12)', async () => {
    process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
    const wrapped = withAdminAuth(handler);
    const req = makeRequest('http://localhost/admin', {
      headers: {
        Authorization: 'Bearer valid-token',
        'x-forwarded-for': '1.2.3.4',
      },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  it('blocks when neither x-forwarded-for nor x-real-ip present', async () => {
    process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
    const wrapped = withAdminAuth(handler);
    const req = makeRequest('http://localhost/admin', {
      headers: { Authorization: 'Bearer valid-token' },
      // No x-forwarded-for or x-real-ip
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  it('uses x-real-ip when x-forwarded-for absent', async () => {
    process.env.ADMIN_ALLOWED_IPS = '10.0.0.1';
    const wrapped = withAdminAuth(handler);
    const req = makeRequest('http://localhost/admin', {
      headers: {
        Authorization: 'Bearer valid-token',
        'x-real-ip': '10.0.0.1',
      },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(200);
    delete process.env.ADMIN_ALLOWED_IPS;
  });
});
