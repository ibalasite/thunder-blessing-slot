import { container } from '../../../src/container';
import { setupMockContainer, makeRequest } from '../helpers/mockContainer';
import { AppError } from '../../../src/shared/errors/AppError';

jest.mock('../../../src/config/env', () => ({
  env: { NODE_ENV: 'test', JWT_ACCESS_TTL_SECONDS: 900, JWT_REFRESH_TTL_SECONDS: 604800 },
}));

beforeEach(() => setupMockContainer());
afterEach(() => container._reset());

function authHeader() {
  return { Authorization: 'Bearer valid-token' };
}

describe('GET /api/v1/game/bet-range', () => {
  let GET: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    ({ GET } = await import('../../../src/app/api/v1/game/bet-range/route'));
  });

  it('200 returns USD bet range', async () => {
    const req = makeRequest('http://localhost/api/v1/game/bet-range?currency=USD', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currency).toBe('USD');
    expect(Array.isArray(body.levels)).toBe(true);
  });

  it('400 for unsupported currency', async () => {
    const req = makeRequest('http://localhost/api/v1/game/bet-range?currency=EUR', { headers: authHeader() });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('401 without auth', async () => {
    const req = makeRequest('http://localhost/api/v1/game/bet-range?currency=USD');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/game/[spinId]/replay', () => {
  let GET: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
  beforeAll(async () => {
    ({ GET } = await import('../../../src/app/api/v1/game/[spinId]/replay/route'));
  });

  it('404 when spin log not found', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin-123/replay', { headers: authHeader() });
    const res = await GET(req, { params: { spinId: 'spin-123' } });
    expect(res.status).toBe(404);
  });

  it('403 when user does not own spin', async () => {
    setupMockContainer({
      spinLog: {
        getById: jest.fn().mockResolvedValue({ id: 'spin-123', userId: 'other-user', createdAt: new Date() }),
      },
    });
    const req = makeRequest('http://localhost/api/v1/game/spin-123/replay', { headers: authHeader() });
    const res = await GET(req, { params: { spinId: 'spin-123' } });
    expect(res.status).toBe(403);
  });

  it('200 when user owns the spin', async () => {
    setupMockContainer({
      spinLog: {
        getById: jest.fn().mockResolvedValue({
          id: 'spin-123',
          userId: 'user-123',
          mode: 'main',
          currency: 'USD',
          betLevel: 1,
          winLevel: 0,
          playerBet: '0.01',
          playerWin: '0',
          gridSnapshot: {},
          rngByteCount: 16,
          createdAt: new Date(),
        }),
      },
    });
    const req = makeRequest('http://localhost/api/v1/game/spin-123/replay', { headers: authHeader() });
    const res = await GET(req, { params: { spinId: 'spin-123' } });
    expect(res.status).toBe(200);
  });

  it('400 when spinId missing', async () => {
    const req = makeRequest('http://localhost/api/v1/game//replay', { headers: authHeader() });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(400);
  });

  it('401 without auth', async () => {
    const req = makeRequest('http://localhost/api/v1/game/spin-123/replay');
    const res = await GET(req, { params: { spinId: 'spin-123' } });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/health', () => {
  let GET: () => Promise<Response>;
  beforeAll(async () => {
    ({ GET } = await import('../../../src/app/api/v1/health/route'));
  });

  it('200 with status ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
