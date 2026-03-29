/**
 * K8s Server E2E Tests
 *
 * 目的：驗證開發環境使用的是 K8s pod 上的 Fastify API，
 *       而非本地單機版（SlotEngine 直呼）。
 *
 * 測試前置條件（跳過若 K8s 未就緒）：
 *   - K8s Fastify API: http://localhost:30001  (NodePort)
 *   - K8s Supabase Kong: http://localhost:31099 (NodePort)
 *
 * 驗證項目：
 *   1. K8s Fastify 健康檢查
 *   2. 使用者 register → login，取得 JWT
 *   3. Wallet 初始存款與餘額讀取（DB 確認）
 *   4. 執行 spin → 餘額減少 playerBet（DB 扣款確認）
 *   5. 若有 win → 餘額增加 playerWin（DB 入帳確認）
 *   6. 透過 replay endpoint 確認 rngByteCount > 0（CSPRNG 實際消耗 entropy）
 *   7. 兩次 spin 的 outcome 不同（CSPRNG 隨機性確認，非靜態/seeded 回應）
 *   8. spin outcome 結構完整（mode / totalWin / wagered / baseSpins）
 *
 * @jest-environment node
 */

const K8S_API = 'http://localhost:30001/api/v1';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchJSON(
    url: string,
    opts: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
    const res = await fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(opts.headers as Record<string, string> ?? {}),
        },
    });
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    return { ok: res.ok, status: res.status, body };
}

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

// ─── K8s availability guard ───────────────────────────────────────────────────

let k8sAvailable = false;

beforeAll(async () => {
    try {
        const { ok } = await fetchJSON(`${K8S_API}/health`, { signal: AbortSignal.timeout(3000) });
        k8sAvailable = ok;
    } catch {
        k8sAvailable = false;
    }
    if (!k8sAvailable) {
        console.warn(
            '[k8s-server.e2e] K8s API not reachable at localhost:30001 — skipping all tests.\n' +
            '  Run: ./infra/k8s/build.sh to deploy first.',
        );
    }
}, 8000);

/** Call at the top of each test; returns true if the test should be skipped. */
function skipIfOffline(): boolean {
    return !k8sAvailable;
}

// ─── Test state ───────────────────────────────────────────────────────────────

const testEmail = `e2e-${Date.now()}@test.local`;
const testPassword = 'E2eTestPass1!';
let accessToken = '';
let firstSpinId = '';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Health
// ═══════════════════════════════════════════════════════════════════════════════

describe('K8s API Health', () => {
    it('GET /health returns { status: "ok" }', async () => {
        if (skipIfOffline()) return;
        const { ok, body } = await fetchJSON(`${K8S_API}/health`);
        expect(ok).toBe(true);
        expect((body as { status: string }).status).toBe('ok');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Auth — Register + Login
// ═══════════════════════════════════════════════════════════════════════════════

describe('K8s Auth: register + login', () => {
    it('POST /auth/register creates a new user', async () => {
        if (skipIfOffline()) return;
        const { ok, status } = await fetchJSON(`${K8S_API}/auth/register`, {
            method: 'POST',
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        // 201 = created; 409 = already exists (idempotent re-run)
        expect([201, 409]).toContain(status);
        expect(ok || status === 409).toBe(true);
    });

    it('POST /auth/login returns accessToken', async () => {
        if (skipIfOffline()) return;
        const { ok, body } = await fetchJSON(`${K8S_API}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        expect(ok).toBe(true);
        accessToken = (body as { accessToken: string }).accessToken;
        expect(typeof accessToken).toBe('string');
        expect(accessToken.length).toBeGreaterThan(10);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Wallet — DB 餘額確認
// ═══════════════════════════════════════════════════════════════════════════════

describe('K8s Wallet: balance persisted in DB', () => {
    it('GET /wallet returns a balance row from Supabase DB', async () => {
        if (skipIfOffline()) return;
        const { ok, body } = await fetchJSON(`${K8S_API}/wallet`, {
            headers: authHeaders(accessToken),
        });
        expect(ok).toBe(true);
        const wallet = body as { balance: string; currency: string };
        expect(typeof wallet.balance).toBe('string');
        expect(['USD', 'TWD']).toContain(wallet.currency);
    });

    it('POST /wallet/deposit credits the balance (DB write)', async () => {
        if (skipIfOffline()) return;
        const before = await fetchJSON(`${K8S_API}/wallet`, { headers: authHeaders(accessToken) });
        const balBefore = parseFloat((before.body as { balance: string }).balance);

        const { ok } = await fetchJSON(`${K8S_API}/wallet/deposit`, {
            method: 'POST',
            headers: authHeaders(accessToken),
            body: JSON.stringify({ amount: '100' }),
        });
        expect(ok).toBe(true);

        const after = await fetchJSON(`${K8S_API}/wallet`, { headers: authHeaders(accessToken) });
        const balAfter = parseFloat((after.body as { balance: string }).balance);

        expect(balAfter).toBeCloseTo(balBefore + 100, 2);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Spin — Server-side CSPRNG (not local SlotEngine)
// ═══════════════════════════════════════════════════════════════════════════════

describe('K8s Spin: server computes outcome via CSPRNG', () => {
    it('POST /game/spin debits playerBet from DB wallet', async () => {
        if (skipIfOffline()) return;

        const walletBefore = await fetchJSON(`${K8S_API}/wallet`, { headers: authHeaders(accessToken) });
        const balBefore = parseFloat((walletBefore.body as { balance: string }).balance);

        const { ok, body } = await fetchJSON(`${K8S_API}/game/spin`, {
            method: 'POST',
            headers: { ...authHeaders(accessToken), 'x-session-id': 'e2e-test-session' },
            body: JSON.stringify({ mode: 'main', betLevel: 1, currency: 'USD' }),
        });
        expect(ok).toBe(true);

        const spin = body as {
            spinId: string;
            outcome: {
                mode: string;
                totalBet: number;
                totalWin: number;
                wagered: number;
                baseSpins: unknown[];
            };
            playerBet: string;
            playerWin: string;
            balance: string;
        };

        firstSpinId = spin.spinId;

        // Outcome structure — proof it came from server engine
        expect(spin.outcome.mode).toBe('main');
        expect(typeof spin.outcome.totalWin).toBe('number');
        expect(spin.outcome.wagered).toBeGreaterThan(0);
        expect(Array.isArray(spin.outcome.baseSpins)).toBe(true);

        // Balance deducted by playerBet, then credited by playerWin
        const playerBet = parseFloat(spin.playerBet);
        const playerWin = parseFloat(spin.playerWin);
        const expectedBalance = balBefore - playerBet + playerWin;
        const actualBalance = parseFloat(spin.balance);
        expect(actualBalance).toBeCloseTo(expectedBalance, 2);
    });

    it('replay endpoint confirms rngByteCount > 0 (CSPRNG consumed entropy)', async () => {
        if (skipIfOffline()) return;
        if (!firstSpinId) return; // previous spin test was skipped

        const { ok, body } = await fetchJSON(
            `${K8S_API}/game/${firstSpinId}/replay`,
            { headers: authHeaders(accessToken) },
        );
        expect(ok).toBe(true);

        const replay = body as { rngByteCount: number; gridSnapshot: unknown };

        // CSPRNG must consume at least 8 bytes per random call (crypto.randomBytes(8))
        // A minimal spin (no FG, no cascade) uses ~20 random calls = ~160 bytes
        expect(replay.rngByteCount).toBeGreaterThan(0);

        // Grid snapshot must be non-empty (server stored the spin result in DB)
        expect(replay.gridSnapshot).not.toBeNull();
        expect(Array.isArray(replay.gridSnapshot)).toBe(true);
    });

    it('two consecutive spins produce different outcomes (not seeded/static)', async () => {
        if (skipIfOffline()) return;

        const spin1 = await fetchJSON(`${K8S_API}/game/spin`, {
            method: 'POST',
            headers: { ...authHeaders(accessToken), 'x-session-id': 'e2e-test-session' },
            body: JSON.stringify({ mode: 'main', betLevel: 1, currency: 'USD' }),
        });
        const spin2 = await fetchJSON(`${K8S_API}/game/spin`, {
            method: 'POST',
            headers: { ...authHeaders(accessToken), 'x-session-id': 'e2e-test-session' },
            body: JSON.stringify({ mode: 'main', betLevel: 1, currency: 'USD' }),
        });

        expect(spin1.ok).toBe(true);
        expect(spin2.ok).toBe(true);

        const outcome1 = (spin1.body as { outcome: { baseSpins: { grid: unknown[][] }[] } }).outcome;
        const outcome2 = (spin2.body as { outcome: { baseSpins: { grid: unknown[][] }[] } }).outcome;

        const grid1 = JSON.stringify(outcome1.baseSpins[0]?.grid ?? []);
        const grid2 = JSON.stringify(outcome2.baseSpins[0]?.grid ?? []);

        // Two independent CSPRNG spins should produce different grids
        // (probability of identical 5×6 grids from a 10-symbol alphabet ≈ 10^-47)
        expect(grid1).not.toEqual(grid2);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Wallet integrity after multiple spins
// ═══════════════════════════════════════════════════════════════════════════════

describe('K8s Wallet integrity: DB tracks every spin', () => {
    it('wallet balance after 5 spins matches cumulative bet/win arithmetic', async () => {
        if (skipIfOffline()) return;

        const walletStart = await fetchJSON(`${K8S_API}/wallet`, { headers: authHeaders(accessToken) });
        let expectedBalance = parseFloat((walletStart.body as { balance: string }).balance);

        for (let i = 0; i < 5; i++) {
            const { ok, body } = await fetchJSON(`${K8S_API}/game/spin`, {
                method: 'POST',
                headers: { ...authHeaders(accessToken), 'x-session-id': `e2e-integrity-${i}` },
                body: JSON.stringify({ mode: 'main', betLevel: 1, currency: 'USD' }),
            });
            expect(ok).toBe(true);
            const spin = body as { playerBet: string; playerWin: string };
            expectedBalance -= parseFloat(spin.playerBet);
            expectedBalance += parseFloat(spin.playerWin);
        }

        const walletEnd = await fetchJSON(`${K8S_API}/wallet`, { headers: authHeaders(accessToken) });
        const actualBalance = parseFloat((walletEnd.body as { balance: string }).balance);

        // Allow 0.01 floating-point tolerance
        expect(Math.abs(actualBalance - expectedBalance)).toBeLessThan(0.01);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Bet range comes from server (not hardcoded local config)
// ═══════════════════════════════════════════════════════════════════════════════

describe('K8s BetRange: served from K8s API, not local GameConfig', () => {
    it('GET /game/bet-range returns minLevel / maxLevel / levels array', async () => {
        if (skipIfOffline()) return;
        const { ok, body } = await fetchJSON(`${K8S_API}/game/bet-range?currency=USD`, {
            headers: authHeaders(accessToken),
        });
        expect(ok).toBe(true);
        const range = body as { minLevel: number; maxLevel: number; levels: number[]; baseUnit: string };
        expect(typeof range.minLevel).toBe('number');
        expect(typeof range.maxLevel).toBe('number');
        expect(Array.isArray(range.levels)).toBe(true);
        expect(range.levels.length).toBeGreaterThan(0);
        expect(range.minLevel).toBeLessThan(range.maxLevel);
    });
});
