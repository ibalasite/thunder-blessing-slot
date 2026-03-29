/**
 * Deposit E2E RPA Tests
 *
 * 目的：以 RPA（Robot Process Automation）方式驗證儲值面板的完整流程。
 *
 * 測試策略：
 *   Phase A — API 層 RPA（本文件）：模擬前端 SceneBuilder 按下儲值按鈕後的
 *             完整 HTTP 呼叫鏈，驗證餘額真的寫入 DB、金額正確、交易歷史可查。
 *   Phase B — 瀏覽器 RPA（未來）：使用 Playwright 在 K8s 部署的遊戲頁面上
 *             點擊 UI 按鈕，驗證畫面餘額標籤更新（WebGL canvas coordinate-click）。
 *
 * 前置條件（K8s 未就緒時自動跳過）：
 *   K8s Fastify API : http://localhost:30001
 *   K8s Supabase    : http://localhost:31099
 *
 * 涵蓋情境：
 *   1. 正常儲值 $10 / $50 / $100 / $500 — 對應 SceneBuilder 四個預設金額按鈕
 *   2. 儲值後餘額正確增加（DB 寫入驗證）
 *   3. 交易歷史記錄儲值事件
 *   4. 連續儲值兩次累計正確
 *   5. 無效金額被 API 拒絕（0、負數、非數字）
 *   6. 儲值 → Spin 餘額算術正確（end-to-end 金流驗證）
 *
 * @jest-environment node
 */

const K8S_API = 'http://localhost:30001/api/v1';

// ─── 工具函式（同 k8s-server.e2e.test.ts 風格） ─────────────────────────────

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

async function getBalance(token: string): Promise<number> {
    const { body } = await fetchJSON(`${K8S_API}/wallet`, {
        headers: authHeaders(token),
    });
    return parseFloat((body as { balance: string }).balance);
}

async function doDeposit(token: string, amount: string): Promise<{ ok: boolean; status: number; body: unknown }> {
    return fetchJSON(`${K8S_API}/wallet/deposit`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ amount }),
    });
}

// ─── K8s 可用性檢查 ───────────────────────────────────────────────────────────

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
            '[Deposit.e2e] K8s API not reachable at localhost:30001 — skipping all tests.\n' +
            '  Run: ./infra/k8s/build.sh to deploy first.',
        );
    }
}, 8000);

function skipIfOffline(): boolean {
    return !k8sAvailable;
}

// ─── 測試帳號（每次 test run 獨立） ─────────────────────────────────────────

const testEmail    = `deposit-rpa-${Date.now()}@test.local`;
const testPassword = 'DepositRpaPass1!';
let accessToken    = '';

// ═══════════════════════════════════════════════════════════════════════════════
// 0. 前置：Register + Login（取得 JWT）
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deposit RPA: setup', () => {
    it('register + login to obtain JWT', async () => {
        if (skipIfOffline()) return;

        const reg = await fetchJSON(`${K8S_API}/auth/register`, {
            method: 'POST',
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        expect(reg.ok).toBe(true);

        const login = await fetchJSON(`${K8S_API}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        expect(login.ok).toBe(true);
        accessToken = (login.body as { access_token: string }).access_token;
        expect(typeof accessToken).toBe('string');
        expect(accessToken.length).toBeGreaterThan(10);
    }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 正常儲值 — 對應 SceneBuilder 四個預設金額按鈕
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deposit RPA: 四個預設金額按鈕（$10 / $50 / $100 / $500）', () => {
    /**
     * 對應 SceneBuilder.ts amounts 陣列：
     *   ['$10', '10'], ['$50', '50'], ['$100', '100'], ['$500', '500']
     * 每個 test case 模擬玩家點擊對應按鈕後的 API 呼叫鏈。
     */
    const presets: [string, number][] = [
        ['10',  10],
        ['50',  50],
        ['100', 100],
        ['500', 500],
    ];

    for (const [amountStr, expectedDelta] of presets) {
        it(`RPA: 點擊 $${amountStr} 按鈕 → 餘額增加 ${expectedDelta}（DB 確認）`, async () => {
            if (skipIfOffline()) return;

            const before = await getBalance(accessToken);

            // 模擬 GameBootstrap.ts onDeposit callback — client.deposit(amount)
            const { ok, body } = await doDeposit(accessToken, amountStr);
            expect(ok).toBe(true);

            // 模擬 GameBootstrap.ts — client.fetchWallet() 後 setDisplayBalance
            const after = await getBalance(accessToken);

            expect(after).toBeCloseTo(before + expectedDelta, 2);

            // 回傳的 deposited 欄位應等於送出的金額
            const result = body as { balance: string; deposited: string; currency: string };
            expect(parseFloat(result.deposited)).toBeCloseTo(expectedDelta, 2);
            expect(parseFloat(result.balance)).toBeCloseTo(after, 2);
        }, 10000);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 連續儲值兩次 — 累計金額正確
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deposit RPA: 連續儲值累計', () => {
    it('連續儲值 $100 + $50 = +$150', async () => {
        if (skipIfOffline()) return;

        const before = await getBalance(accessToken);

        const r1 = await doDeposit(accessToken, '100');
        expect(r1.ok).toBe(true);
        const r2 = await doDeposit(accessToken, '50');
        expect(r2.ok).toBe(true);

        const after = await getBalance(accessToken);
        expect(after).toBeCloseTo(before + 150, 2);
    }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 交易歷史記錄儲值事件
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deposit RPA: 交易歷史', () => {
    it('儲值後交易歷史可查到 deposit 紀錄', async () => {
        if (skipIfOffline()) return;

        await doDeposit(accessToken, '100');

        const { ok, body } = await fetchJSON(
            `${K8S_API}/wallet/transactions?limit=5`,
            { headers: authHeaders(accessToken) },
        );
        expect(ok).toBe(true);

        const txs = body as Array<{ type: string; amount: string }>;
        const depositTxs = txs.filter(tx => tx.type === 'deposit');
        expect(depositTxs.length).toBeGreaterThan(0);

        const amounts = depositTxs.map(tx => parseFloat(tx.amount));
        expect(amounts).toContain(100);
    }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 無效金額被拒絕（邊界測試）
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deposit RPA: 無效金額邊界', () => {
    it('金額 0 → API 回傳 4xx（不應儲值）', async () => {
        if (skipIfOffline()) return;
        const before = await getBalance(accessToken);
        const { ok } = await doDeposit(accessToken, '0');
        expect(ok).toBe(false);
        const after = await getBalance(accessToken);
        expect(after).toBeCloseTo(before, 2); // 餘額不變
    }, 8000);

    it('負數金額 → API 回傳 4xx', async () => {
        if (skipIfOffline()) return;
        const { ok } = await doDeposit(accessToken, '-100');
        expect(ok).toBe(false);
    }, 8000);

    it('非數字字串 → API 回傳 4xx', async () => {
        if (skipIfOffline()) return;
        const { ok } = await doDeposit(accessToken, 'abc');
        expect(ok).toBe(false);
    }, 8000);

    it('空字串 → API 回傳 4xx', async () => {
        if (skipIfOffline()) return;
        const { ok } = await doDeposit(accessToken, '');
        expect(ok).toBe(false);
    }, 8000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 儲值 → Spin 金流驗證（端對端）
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deposit RPA: 儲值 → Spin 金流一致性', () => {
    /**
     * 完整玩家流程：
     *   1. 儲值確保有餘額
     *   2. Spin 一局
     *   3. 驗證餘額變化 = wagered - win（DB 一致）
     *
     * 對應 GameBootstrap.ts onDeposit → fetchWallet → spin 的完整鏈路。
     */
    it('儲值 $500 → spin → 餘額差值等於 wagered - win', async () => {
        if (skipIfOffline()) return;

        await doDeposit(accessToken, '500');
        const balBefore = await getBalance(accessToken);

        const { ok, body } = await fetchJSON(`${K8S_API}/game/spin`, {
            method: 'POST',
            headers: {
                ...authHeaders(accessToken),
                'x-session-id': `deposit-e2e-${Date.now()}`,
            },
            body: JSON.stringify({
                mode: 'base',
                betLevel: 25,
                currency: 'USD',
            }),
        });
        expect(ok).toBe(true);

        const spin = body as { wagered: string; totalWin: string; balance: string };
        const wagered = parseFloat(spin.wagered);
        const totalWin = parseFloat(spin.totalWin);
        const reportedBalance = parseFloat(spin.balance);

        const balAfter = await getBalance(accessToken);

        // 餘額差值應符合：before - wagered + win ≈ after
        expect(balAfter).toBeCloseTo(balBefore - wagered + totalWin, 2);
        // spin response 的 balance 欄位應與 DB 一致
        expect(reportedBalance).toBeCloseTo(balAfter, 2);
    }, 15000);
});
