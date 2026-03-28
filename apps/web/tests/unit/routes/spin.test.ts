import { container } from '../../../src/container';
import { setupMockContainer, makeRequest, TEST_WALLET } from '../helpers/mockContainer';
import { AppError } from '../../../src/shared/errors/AppError';

jest.mock('../../../src/config/env', () => ({
  env: { NODE_ENV: 'test', JWT_ACCESS_TTL_SECONDS: 900, JWT_REFRESH_TTL_SECONDS: 604800 },
}));

// Mock the engine adapter
jest.mock('../../../src/shared/engine/slotEngine', () => ({
  createSlotEngine: jest.fn().mockReturnValue({
    computeFullSpin: jest.fn().mockReturnValue({
      totalWin: 5,
      grid: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
    }),
  }),
}));

// Mock RNG that returns actual bytes (so reduce callback runs)
const MOCK_BYTES = [Buffer.from([0x01, 0x02, 0x03, 0x04])];
const mockRng = {
  random: jest.fn().mockReturnValue(0.5),
  randomInt: jest.fn().mockReturnValue(3),
  getSpinBytes: jest.fn().mockReturnValue(MOCK_BYTES),
  resetSpinBytes: jest.fn(),
};

beforeEach(() => {
  setupMockContainer();
  container._override({ rng: mockRng });
});
afterEach(() => container._reset());

function authHeader() {
  return { Authorization: 'Bearer valid-token' };
}

describe('POST /api/v1/game/spin', () => {
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import('../../../src/app/api/v1/game/spin/route'));
  });

  it('200 for valid main mode spin', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playerBet).toBeDefined();
    expect(body.playerWin).toBeDefined();
    expect(body.currency).toBe('USD');
  });

  it('400 for invalid mode', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'invalid', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 for betLevel out of range', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 999, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400 for betLevel not in allowed levels', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 3, currency: 'USD' },  // 3 not in [1,5,10,25,50,100]
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('422 for insufficient balance', async () => {
    setupMockContainer({
      wallet: {
        getByUserId: jest.fn().mockResolvedValue({ ...TEST_WALLET, balance: '0.00' }),
      },
    });
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 100, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('400 for concurrent spin (lock not acquired)', async () => {
    setupMockContainer({
      cache: { acquireLock: jest.fn().mockResolvedValue(false) },
    });
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('404 when wallet not found', async () => {
    setupMockContainer({ wallet: { getByUserId: jest.fn().mockResolvedValue(null) } });
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('401 without auth', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      body: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('200 for buyFG mode (100× bet)', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'buyFG', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('200 for extraBet mode', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'extraBet', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('200 with clientSeed', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 1, currency: 'USD', clientSeed: 'my-seed' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('200 when winLevel is 0 (no win — credit skipped)', async () => {
    jest.mocked(require('../../../src/shared/engine/slotEngine').createSlotEngine).mockReturnValueOnce({
      computeFullSpin: jest.fn().mockReturnValue({ totalWin: 0, grid: [] }),
    });
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playerWin).toBe('0');
  });

  it('400 when body is not valid JSON', async () => {
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'text/plain' },
      body: 'not json!',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('credits win when winLevel > 0', async () => {
    const creditMock = jest.fn().mockResolvedValue({ ...TEST_WALLET, balance: '100.05' });
    setupMockContainer({ wallet: { credit: creditMock } });
    const req = makeRequest('http://localhost/api/v1/game/spin', {
      method: 'POST',
      headers: authHeader(),
      body: { mode: 'main', betLevel: 1, currency: 'USD' },
    });
    await POST(req);
    expect(creditMock).toHaveBeenCalledWith(TEST_WALLET.id, expect.any(String), 'win');
  });
});
