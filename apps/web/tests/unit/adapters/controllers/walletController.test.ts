import { buildTestApp, authHeader } from '../../helpers/buildTestApp';
import { container } from '../../../../src/container';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  container._reset();
});

describe('GET /api/v1/wallet', () => {
  it('returns wallet data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('wallet-1');
    expect(body.currency).toBe('USD');
  });

  it('returns 401 without auth header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/wallet/deposit', () => {
  it('deposits and returns updated balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/deposit',
      headers: authHeader(),
      payload: { amount: '50', provider: 'stripe' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deposited).toBe('50');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/deposit',
      payload: { amount: '10' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for missing amount', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/deposit',
      headers: authHeader(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/wallet/deposit — NODE_ENV branch', () => {
  it('passes nodeEnv from process.env to use case (development)', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/deposit',
      headers: authHeader(),
      payload: { amount: '10', provider: 'stripe' },
    });
    expect(res.statusCode).toBe(200);
    process.env.NODE_ENV = saved;
  });

  it('deposit body parsed as empty object when no body sent (ZodError)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/deposit',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('withdraw body parsed as empty object when no body sent (ZodError)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/withdraw',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/wallet/withdraw', () => {
  it('withdraws and returns result', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/withdraw',
      headers: authHeader(),
      payload: { amount: '5' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.withdrawn).toBe('5');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/withdraw',
      payload: { amount: '5' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for missing amount', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/withdraw',
      headers: authHeader(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/wallet/transactions', () => {
  it('returns transactions list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/transactions',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transactions).toEqual([]);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  it('parses limit and offset from query', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/transactions?limit=5&offset=10',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limit).toBe(5);
    expect(body.offset).toBe(10);
  });

  it('caps limit at 100', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/transactions?limit=999',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limit).toBe(100);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/transactions',
    });
    expect(res.statusCode).toBe(401);
  });
});
