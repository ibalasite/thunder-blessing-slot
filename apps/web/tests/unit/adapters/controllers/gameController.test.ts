import { buildTestApp, authHeader } from '../../helpers/buildTestApp';
import { container } from '../../../../src/container';
import type { FastifyInstance } from 'fastify';

// Mock slotEngine
jest.mock('../../../../src/shared/engine/slotEngine', () => ({
  createSlotEngine: jest.fn(() => ({
    computeFullSpin: jest.fn().mockReturnValue({ totalWin: 5, grid: [] }),
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

describe('GET /api/v1/game/bet-range', () => {
  it('returns bet range for USD', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/bet-range?currency=USD',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currency).toBe('USD');
  });

  it('returns 400 for unsupported currency', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/bet-range?currency=EUR',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when currency query param is omitted', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/bet-range',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/bet-range?currency=USD',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/game/spin', () => {
  it('executes a spin and returns result', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      headers: authHeader(),
      payload: { mode: 'main', betLevel: 1, currency: 'USD', extraBetOn: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spinId).toBeDefined();
    expect(body.playerBet).toBeDefined();
  });

  it('returns 400 for invalid mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      headers: authHeader(),
      payload: { mode: 'invalid', betLevel: 1, currency: 'USD' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid betLevel', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      headers: authHeader(),
      payload: { mode: 'main', betLevel: -1, currency: 'USD' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      payload: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts spin with explicit clientSeed and txId (optional fields coverage)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      headers: authHeader(),
      payload: {
        mode: 'main', betLevel: 1, currency: 'USD',
        extraBetOn: true,
        clientSeed: 'my-client-seed',
        txId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('passes x-session-id header to use case', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      headers: { ...authHeader(), 'x-session-id': 'test-session' },
      payload: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/v1/game/:spinId/replay', () => {
  it('returns spin replay data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/spin-1/replay',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spinId).toBe('spin-1');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/spin-1/replay',
    });
    expect(res.statusCode).toBe(401);
  });
});
