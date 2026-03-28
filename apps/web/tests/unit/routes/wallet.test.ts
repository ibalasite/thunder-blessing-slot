import { container } from '../../../src/container';
import { setupMockContainer, makeRequest, TEST_USER, TEST_WALLET } from '../helpers/mockContainer';
import { AppError } from '../../../src/shared/errors/AppError';

jest.mock('../../../src/config/env', () => ({
  env: { NODE_ENV: 'test', JWT_ACCESS_TTL_SECONDS: 900, JWT_REFRESH_TTL_SECONDS: 604800 },
}));

beforeEach(() => setupMockContainer());
afterEach(() => container._reset());

function authHeader() {
  return { Authorization: 'Bearer valid-token' };
}

describe('GET /api/v1/wallet', () => {
  let GET: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ GET } = await import('../../../src/app/api/v1/wallet/route'));
  });

  it('200 returns wallet', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currency).toBe('USD');
    expect(body.balance).toBeDefined();
  });

  it('401 without auth header', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('404 when wallet not found', async () => {
    setupMockContainer({ wallet: { getByUserId: jest.fn().mockResolvedValue(null) } });
    const req = makeRequest('http://localhost/api/v1/wallet', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/wallet/deposit', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/wallet/deposit/route'));
  });

  it('200 with valid amount', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/deposit', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '10.00' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deposited).toBe('10.00');
  });

  it('403 for mock provider in production (S-01)', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    const req = makeRequest('http://localhost/api/v1/wallet/deposit', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '10.00', provider: 'mock' },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
  });

  it('400 for invalid amount', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/deposit', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: 'abc' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 when body is not valid JSON', async () => {
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/v1/wallet/deposit', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'text/plain' },
      body: 'bad body',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('404 when wallet not found', async () => {
    setupMockContainer({ wallet: { getByUserId: jest.fn().mockResolvedValue(null) } });
    const req = makeRequest('http://localhost/api/v1/wallet/deposit', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '10.00' },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('400 when deposit exceeds limit', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/deposit', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '200000' },  // way over USD 100000 limit
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/wallet/withdraw', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/wallet/withdraw/route'));
  });

  it('200 with valid withdrawal', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/withdraw', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '5.00' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('422 when insufficient funds', async () => {
    setupMockContainer({ wallet: { debit: jest.fn().mockRejectedValue(AppError.insufficientFunds()) } });
    const req = makeRequest('http://localhost/api/v1/wallet/withdraw', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '1000.00' },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('400 for amount below minimum', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/withdraw', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '0' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 for invalid amount format', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/withdraw', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: 'abc' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 when body is not valid JSON', async () => {
    // Triggers req.json().catch(() => ({})) lambda — schema fails with empty body
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/v1/wallet/withdraw', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'text/plain' },
      body: 'not json!',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('404 when wallet not found', async () => {
    setupMockContainer({ wallet: { getByUserId: jest.fn().mockResolvedValue(null) } });
    const req = makeRequest('http://localhost/api/v1/wallet/withdraw', {
      method: 'POST',
      headers: authHeader(),
      body: { amount: '5.00' },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/wallet/transactions', () => {
  let GET: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ GET } = await import('../../../src/app/api/v1/wallet/transactions/route'));
  });

  it('200 returns empty list', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/transactions', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.transactions)).toBe(true);
  });

  it('respects limit=5 query param', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/transactions?limit=5', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(5);
  });

  it('caps limit at 100', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/transactions?limit=999', { headers: authHeader() });
    const res = await GET(req);
    const body = await res.json();
    expect(body.limit).toBe(100);
  });

  it('uses offset=0 when negative', async () => {
    const req = makeRequest('http://localhost/api/v1/wallet/transactions?offset=-5', { headers: authHeader() });
    const res = await GET(req);
    const body = await res.json();
    expect(body.offset).toBe(0);
  });

  it('404 when wallet not found', async () => {
    setupMockContainer({ wallet: { getByUserId: jest.fn().mockResolvedValue(null) } });
    const req = makeRequest('http://localhost/api/v1/wallet/transactions', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});
