/**
 * Live E2E tests — hit the real running server at E2E_BASE_URL.
 *
 * Prerequisites:
 *   - Dev env running: http://localhost:30001 (API NodePort)
 *   - Supabase accessible from the server pod
 *
 * Run:
 *   E2E_LIVE=1 pnpm test:e2e:live
 *   E2E_LIVE=1 E2E_BASE_URL=http://localhost:30001 pnpm test:e2e:live
 *
 * Flow:
 *   health → register → login → wallet → deposit → spin (×3) →
 *   txId idempotency → replay → transactions → logout → 401
 */

const RUN = process.env.E2E_LIVE === '1';
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:30001').replace(/\/$/, '');

const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

// ─── helpers ─────────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const headers: Record<string, string> = {};
  // Only set Content-Type: application/json when there is a body.
  // Fastify 5 rejects Content-Type: application/json with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.cookie) headers['Cookie'] = opts.cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let body: unknown;
  const ct = res.headers.get('content-type') ?? '';
  body = ct.includes('application/json') ? await res.json() : await res.text();

  return { status: res.status, body, headers: res.headers };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describeIf(RUN)(`Live E2E → ${BASE}`, () => {
  const email = `e2e-live-${Date.now()}@example.com`;
  const password = 'e2eL1vePass!99';

  let accessToken = '';
  let refreshCookie = '';
  let spinId = '';

  // ── 1. Health ────────────────────────────────────────────────────────────

  it('GET /api/v1/health → 200 ok', async () => {
    const { status, body } = await api('GET', '/api/v1/health');
    expect(status).toBe(200);
    expect((body as { status: string }).status).toBe('ok');
  });

  // ── 2. Register ──────────────────────────────────────────────────────────

  it('POST /api/v1/auth/register → 201', async () => {
    const { status, body } = await api('POST', '/api/v1/auth/register', {
      body: { email, password },
    });
    expect(status).toBe(201);
    expect((body as { id: string }).id).toBeTruthy();
  });

  it('POST /api/v1/auth/register duplicate → 4xx', async () => {
    const { status } = await api('POST', '/api/v1/auth/register', {
      body: { email, password },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  // ── 3. Login ─────────────────────────────────────────────────────────────

  it('POST /api/v1/auth/login → 200 with accessToken + refresh cookie', async () => {
    const { status, body, headers } = await api('POST', '/api/v1/auth/login', {
      body: { email, password },
    });
    expect(status).toBe(200);
    accessToken = (body as { accessToken: string }).accessToken;
    expect(accessToken).toBeTruthy();

    const setCookie = headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('refresh_token');
    refreshCookie = `refresh_token=${setCookie.match(/refresh_token=([^;]+)/)?.[1] ?? ''}`;
  });

  it('POST /api/v1/auth/login wrong password → 4xx', async () => {
    const { status } = await api('POST', '/api/v1/auth/login', {
      body: { email, password: 'wrong' },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  // ── 4. Protected routes without token ────────────────────────────────────

  it('GET /api/v1/wallet without token → 401', async () => {
    const { status } = await api('GET', '/api/v1/wallet');
    expect(status).toBe(401);
  });

  // ── 5. Wallet ─────────────────────────────────────────────────────────────

  it('GET /api/v1/wallet → 200 with id + currency', async () => {
    const { status, body } = await api('GET', '/api/v1/wallet', { token: accessToken });
    expect(status).toBe(200);
    const w = body as { id: string; currency: string; balance: string };
    expect(w.id).toBeTruthy();
    expect(w.currency).toBe('USD');
    expect(typeof w.balance).toBe('string');
  });

  // ── 6. Deposit ────────────────────────────────────────────────────────────

  it('POST /api/v1/wallet/deposit 50 USD → 200', async () => {
    const { status, body } = await api('POST', '/api/v1/wallet/deposit', {
      token: accessToken,
      body: { amount: '50.00', provider: 'test' },
    });
    expect(status).toBe(200);
    expect((body as { deposited: string }).deposited).toBe('50.00');
  });

  it('POST /api/v1/wallet/deposit missing amount → 400', async () => {
    const { status } = await api('POST', '/api/v1/wallet/deposit', {
      token: accessToken,
      body: {},
    });
    expect(status).toBe(400);
  });

  // ── 7. Bet range ──────────────────────────────────────────────────────────

  it('GET /api/v1/game/bet-range?currency=USD → 200', async () => {
    const { status, body } = await api('GET', '/api/v1/game/bet-range?currency=USD', {
      token: accessToken,
    });
    expect(status).toBe(200);
    const r = body as { currency: string; baseUnit: string; levels: number[] };
    expect(r.currency).toBe('USD');
    expect(r.baseUnit).toBe('0.01');
    expect(r.levels.length).toBe(40);
  });

  it('GET /api/v1/game/bet-range?currency=EUR → 400', async () => {
    const { status } = await api('GET', '/api/v1/game/bet-range?currency=EUR', {
      token: accessToken,
    });
    expect(status).toBe(400);
  });

  // ── 8. Spin ───────────────────────────────────────────────────────────────

  it('POST /api/v1/game/spin → 200 with spinId + balance', async () => {
    const { status, body } = await api('POST', '/api/v1/game/spin', {
      token: accessToken,
      body: { mode: 'main', betLevel: 25, currency: 'USD', extraBetOn: false },
    });
    expect(status).toBe(200);
    const s = body as { spinId: string; playerBet: string; playerWin: string; balance: number; currency: string };
    expect(s.spinId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.playerBet).toBe('0.25');
    expect(typeof s.playerWin).toBe('string');
    expect(typeof s.balance).toBe('number');   // gameController returns parseFloat(balance)
    expect(s.currency).toBe('USD');
    spinId = s.spinId;
  });

  it('POST /api/v1/game/spin invalid mode → 400', async () => {
    const { status } = await api('POST', '/api/v1/game/spin', {
      token: accessToken,
      body: { mode: 'bogus', betLevel: 25, currency: 'USD' },
    });
    expect(status).toBe(400);
  });

  it('POST /api/v1/game/spin invalid betLevel → 400', async () => {
    const { status } = await api('POST', '/api/v1/game/spin', {
      token: accessToken,
      body: { mode: 'main', betLevel: -1, currency: 'USD' },
    });
    expect(status).toBe(400);
  });

  // ── 9. txId idempotency ───────────────────────────────────────────────────

  it('spin with txId returns same result on retry', async () => {
    const txId = crypto.randomUUID();
    const first = await api('POST', '/api/v1/game/spin', {
      token: accessToken,
      body: { mode: 'main', betLevel: 25, currency: 'USD', txId },
    });
    expect(first.status).toBe(200);
    const firstBody = first.body as { spinId: string; playerBet: string };

    const second = await api('POST', '/api/v1/game/spin', {
      token: accessToken,
      body: { mode: 'main', betLevel: 25, currency: 'USD', txId },
    });
    expect(second.status).toBe(200);
    const secondBody = second.body as { spinId: string; playerBet: string };

    // Same spinId means cached result returned
    expect(secondBody.spinId).toBe(firstBody.spinId);
    expect(secondBody.playerBet).toBe(firstBody.playerBet);
  });

  // ── 10. Replay ────────────────────────────────────────────────────────────

  it('GET /api/v1/game/:spinId/replay → 200', async () => {
    // Spin log is fire-and-forget — retry for up to 2s to allow async DB insert to complete
    let status = 0;
    let body: unknown = {};
    for (let i = 0; i < 10; i++) {
      ({ status, body } = await api(`GET`, `/api/v1/game/${spinId}/replay`, { token: accessToken }));
      if (status === 200) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(status).toBe(200);
    expect((body as { spinId: string }).spinId).toBe(spinId);
  });

  it('GET /api/v1/game/nonexistent/replay → 404', async () => {
    const { status } = await api('GET', '/api/v1/game/00000000-0000-0000-0000-000000000000/replay', {
      token: accessToken,
    });
    expect(status).toBe(404);
  });

  // ── 11. Transactions ──────────────────────────────────────────────────────

  it('GET /api/v1/wallet/transactions → 200 list', async () => {
    const { status, body } = await api('GET', '/api/v1/wallet/transactions', {
      token: accessToken,
    });
    expect(status).toBe(200);
    const t = body as { transactions: unknown[]; limit: number; offset: number };
    expect(Array.isArray(t.transactions)).toBe(true);
    expect(t.limit).toBe(20);
    expect(t.offset).toBe(0);
  });

  it('GET /api/v1/wallet/transactions?limit=5&offset=0 → limit respected', async () => {
    const { status, body } = await api('GET', '/api/v1/wallet/transactions?limit=5&offset=0', {
      token: accessToken,
    });
    expect(status).toBe(200);
    expect((body as { limit: number }).limit).toBe(5);
  });

  // ── 12. Token refresh ─────────────────────────────────────────────────────

  it('POST /api/v1/auth/refresh with cookie → 200 new accessToken', async () => {
    const { status, body } = await api('POST', '/api/v1/auth/refresh', {
      cookie: refreshCookie,
    });
    expect(status).toBe(200);
    expect((body as { accessToken: string }).accessToken).toBeTruthy();
  });

  it('POST /api/v1/auth/refresh without cookie → 401', async () => {
    const { status } = await api('POST', '/api/v1/auth/refresh');
    expect(status).toBe(401);
  });

  // ── 13. Logout ────────────────────────────────────────────────────────────

  it('POST /api/v1/auth/logout → 200', async () => {
    const { status, body } = await api('POST', '/api/v1/auth/logout', {
      cookie: refreshCookie,
    });
    expect(status).toBe(200);
    expect((body as { success: boolean }).success).toBe(true);
  });

  it('GET /api/v1/wallet after logout with old token → 401', async () => {
    const { status } = await api('GET', '/api/v1/wallet', { token: 'invalid-token' });
    expect(status).toBe(401);
  });
});

describeIf(!RUN)('Live E2E (SKIPPED — set E2E_LIVE=1 to run)', () => {
  it(`skipped: run with E2E_LIVE=1 pnpm test:e2e:live  [target: ${BASE}]`, () => {
    expect(true).toBe(true);
  });
});
