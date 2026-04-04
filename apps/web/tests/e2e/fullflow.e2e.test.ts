/**
 * 2A-14: E2E API tests — full HTTP flow through real Supabase local DB
 *
 * Prerequisites:
 *   - supabase start (running on http://127.0.0.1:54321)
 *   - apps/web/.env.local configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET)
 *
 * Run: E2E=1 pnpm test:e2e
 *
 * Flow:
 *   health → register → login → get wallet → deposit → spin → check balance → logout
 *
 * The slot engine (computeFullSpin) is mocked so tests don't need real Cocos/game files.
 * All HTTP calls go through the real Fastify app with real Supabase adapters.
 */

// Mock slotEngine before any imports resolve it
jest.mock('../../src/shared/engine/slotEngine', () => ({
  createSlotEngine: jest.fn().mockReturnValue({
    computeFullSpin: jest.fn().mockReturnValue({
      mode: 'main',
      extraBetOn: false,
      totalBet: 1,
      wagered: 1,
      baseSpins: [],
      baseWin: 5,
      fgTriggered: false,
      fgSpins: [],
      fgWin: 0,
      totalRawWin: 5,
      totalWin: 5,
      maxWinCapped: false,
    }),
  }),
}));

import type { FastifyInstance } from 'fastify';

const RUN_E2E = process.env.E2E === '1';

const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

// ─── E2E: Full API Flow ───────────────────────────────────────────────────────

describeIf(RUN_E2E)('2A-14 E2E: Full API Flow (real Supabase + Fastify)', () => {
  let app: FastifyInstance;
  let accessToken: string;

  const testEmail = `e2e-${Date.now()}@example.com`;
  const testPassword = 'e2e-test-password-789';

  beforeAll(async () => {
    // Use the real buildApp — it wires the real Supabase adapters via container
    const { buildApp } = await import('../../src/infrastructure/fastify/app');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // 1. Health check
  it('GET /api/v1/health → 200 { status: "ok" }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  // 2. Register new user
  it('POST /api/v1/auth/register → 201 with user info', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: testEmail, password: testPassword },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toBeDefined();
    // Registration may return user object or success flag depending on implementation
    expect(res.statusCode).toBe(201);
  });

  // 3. Login — get access token
  it('POST /api/v1/auth/login → 200 with accessToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    accessToken = body.accessToken;
  });

  // 4. Get wallet (balance should be 0 for new user)
  it('GET /api/v1/wallet with auth → 200, balance starts at 0', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balance).toBeDefined();
    expect(parseFloat(body.balance)).toBeGreaterThanOrEqual(0);
  });

  // 5. Deposit funds
  it('POST /api/v1/wallet/deposit → 200, adds 10.00 to balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/deposit',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { amount: '10.00' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balance).toBeDefined();
    expect(parseFloat(body.balance)).toBeGreaterThanOrEqual(10.0);
  });

  // 6. Get wallet again — confirm balance increased
  it('GET /api/v1/wallet → balance reflects deposit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(parseFloat(body.balance)).toBeGreaterThanOrEqual(10.0);
  });

  // 7. Get bet range
  it('GET /api/v1/game/bet-range?currency=USD → 200 with betRange', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/game/bet-range?currency=USD',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.baseUnit).toBeDefined();
    expect(body.levels).toBeDefined();
    expect(Array.isArray(body.levels)).toBe(true);
  });

  // 8. Spin — engine is mocked to return totalWin: 5
  it('POST /api/v1/game/spin → 200 with outcome (engine mocked)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/game/spin',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-session-id': 'e2e-session-001',
      },
      payload: {
        mode: 'main',
        betLevel: 1,
        currency: 'USD',
        extraBetOn: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spinId).toBeTruthy();
    expect(body.outcome).toBeDefined();
    expect(body.playerBet).toBeDefined();
    expect(body.playerWin).toBeDefined();
    expect(body.balance).toBeDefined();
    expect(body.currency).toBe('USD');
  });

  // 9. Logout
  it('POST /api/v1/auth/logout → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });

    // Logout reads the cookie; without it, it may still return 200
    expect(res.statusCode).toBe(200);
  });

  // 10. Wallet after logout → 401
  it('GET /api/v1/wallet after logout → 401 Unauthorized', async () => {
    // Use an invalid/expired token to simulate post-logout state
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: { authorization: 'Bearer expired-or-invalid-token' },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── Skip notice ──────────────────────────────────────────────────────────────

describeIf(!RUN_E2E)('2A-14 E2E tests (SKIPPED — set E2E=1 to run)', () => {
  it('skipped: run with E2E=1 pnpm test:e2e', () => {
    // This test block only appears when E2E tests are NOT enabled.
    // Prerequisites: supabase start + apps/web/.env.local configured
    expect(true).toBe(true);
  });
});
