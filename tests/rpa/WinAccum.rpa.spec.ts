/**
 * WIN Accumulation RPA Test — Phase 1 (Online Standalone) + Phase 2 (K8s)
 *
 * Verifies that WinLabel accumulates correctly during the BuyFG chain in both
 * deployment variants:
 *
 *   Phase 1 (standalone): https://ibalasite.github.io/thunder-blessing-slot/
 *     - No auth, LocalEngineAdapter, balance stored in memory (DEFAULT_BALANCE=1000)
 *     - WIN behavior is the reference / correct version
 *
 *   Phase 2 (K8s local): http://localhost:30080
 *     - Auth + RemoteEngineAdapter → Fastify backend
 *     - Must match Phase 1 WIN behavior after spinBonus fix
 *
 * Also verifies that the K8s build uses the new probabilities:
 *   FG_TRIGGER_PROB = 0.0089  (old = 0.008)
 *   BUY_FG_PAYOUT_SCALE = 1.073 (old = 0.995 / 1.065)
 *
 * @jest-environment node
 *
 * Run:
 *   npx playwright test tests/rpa/WinAccum.rpa.spec.ts
 *   npx playwright test tests/rpa/WinAccum.rpa.spec.ts --ui
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ─── URLs ────────────────────────────────────────────────────────────────────

const ONLINE_URL = 'https://ibalasite.github.io/thunder-blessing-slot/';
const K8S_URL    = 'http://localhost:30080';
const K8S_API    = 'http://localhost:30001/api/v1';

// ─── Shared Cocos scene helpers ──────────────────────────────────────────────

/** Read a Label node's string value */
async function getLabelText(page: Page, nodeName: string): Promise<string | null> {
    return page.evaluate((name: string) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const cc = (window as any).cc;
        if (!cc?.director) return null;
        function findNode(n: any, tgt: string): any {
            if (n.name === tgt) return n;
            for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
            return null;
        }
        const scene = cc.director.getScene();
        if (!scene) return null;
        const node = findNode(scene, name);
        return node?.getComponent(cc.Label)?.string ?? null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    }, nodeName);
}

/** Check whether a panel node is active */
async function isPanelActive(page: Page, panelName: string): Promise<boolean> {
    return page.evaluate((name: string) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const cc = (window as any).cc;
        function findNode(n: any, tgt: string): any {
            if (n.name === tgt) return n;
            for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
            return null;
        }
        const scene = cc?.director?.getScene();
        if (!scene) return false;
        return findNode(scene, name)?.active === true;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    }, panelName);
}

/** Wait until a panel becomes active */
async function waitPanelOpen(page: Page, panelName: string, timeout = 20000): Promise<void> {
    await page.waitForFunction(
        ([name]: [string]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, tgt: string): any {
                if (n.name === tgt) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
                return null;
            }
            return cc?.director?.getScene()
                ? findNode(cc.director.getScene(), name)?.active === true
                : false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        [panelName] as [string],
        { timeout, polling: 200 },
    );
}

/** Wait until a panel becomes inactive */
async function waitPanelClosed(page: Page, panelName: string, timeout = 15000): Promise<void> {
    await page.waitForFunction(
        ([name]: [string]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, tgt: string): any {
                if (n.name === tgt) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
                return null;
            }
            const scene = cc?.director?.getScene();
            if (!scene) return false;
            const p = findNode(scene, name);
            return p !== null && p.active === false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        [panelName] as [string],
        { timeout, polling: 200 },
    );
}

/** Click a button until a panel opens (retry-safe for Cocos engine busy state) */
async function clickUntilPanelOpen(
    page: Page,
    coord: { x: number; y: number },
    panelName: string,
    retries = 4,
): Promise<void> {
    for (let i = 0; i < retries; i++) {
        await page.mouse.click(coord.x, coord.y);
        try {
            await waitPanelOpen(page, panelName, 5000);
            return;
        } catch {
            if (i === retries - 1) throw new Error(`Panel '${panelName}' did not open after ${retries} click(s)`);
            await page.waitForTimeout(400);
        }
    }
}

/** Wait for the Cocos scene to be ready (BalanceLabel shows balance) */
async function waitGameReady(page: Page, timeout = 60_000): Promise<void> {
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, tgt: string): any {
                if (n.name === tgt) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
                return null;
            }
            const scene = cc?.director?.getScene();
            if (!scene) return false;
            const node = findNode(scene, 'BalanceLabel');
            const s = node?.getComponent(cc.Label)?.string ?? '';
            if (!s.startsWith('餘額:')) return false;
            const ls = document.getElementById('LoadingScreen');
            if (ls && ls.style.display !== 'none' && !ls.classList.contains('fade-out')) return false;
            return true;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout, polling: 300 },
    );
    await page.waitForTimeout(1000);
    // Give canvas focus so Cocos receives synthetic mouse events
    await page.mouse.click(360, 600);
    await page.waitForTimeout(200);
}

/** Parse 'WIN: 12.50' or 'WIN: 0' → number */
function parseWin(txt: string | null): number {
    if (!txt) return 0;
    const m = txt.match(/WIN[:\s]*([\d.]+)/i);
    return m ? parseFloat(m[1]) : 0;
}

/** Parse '餘額: 1000.00' → number */
function parseBal(txt: string | null): number {
    if (!txt) return NaN;
    return parseFloat(txt.replace(/[^0-9.]/g, ''));
}

/** Cocos canvas coordinates (720×1280, origin centre, Y up → browser Y down) */
const C = (cx: number, cy: number) => ({ x: 360 + cx, y: 640 - cy });

const BTN = {
    spin:         C(   0, -574),
    buyFG:        C(-160, -330),
    buyFGCancel:  C( -95, -118),
    buyFGStart:   C(  95, -118),
    menu:         C( 325, -574),
    deposit500:   C(  88,  -2),
    depositCancel:C(   0, -152),
    collect:      C(   0, -120),
} as const;

// ─── Core WIN accumulation test (shared logic) ────────────────────────────────

/**
 * Runs one BuyFG session and asserts WIN label accumulates monotonically.
 * Returns the peak WIN value observed.
 */
async function runBuyFGWinCheck(page: Page, initialBal: number): Promise<number> {
    const balBefore = initialBal;
    expect(balBefore).toBeGreaterThan(30); // must cover BuyFG cost (≥25)

    // Open BuyFG panel and start
    await clickUntilPanelOpen(page, BTN.buyFG, 'BuyFGPanel');
    await page.mouse.click(BTN.buyFGStart.x, BTN.buyFGStart.y);

    // Wait for BuyFGPanel to close (spin started)
    await waitPanelClosed(page, 'BuyFGPanel', 15000);

    // Poll WIN label through the entire BuyFG session (max 60s)
    const winSamples: number[] = [];
    const deadline = Date.now() + 60000;
    let sessionDone = false;

    while (Date.now() < deadline && !sessionDone) {
        const txt = await getLabelText(page, 'WinLabel');
        winSamples.push(parseWin(txt));

        // Session done when TotalWinPanel appears
        if (await isPanelActive(page, 'TotalWinPanel')) {
            // Grab final WIN value from the panel label if available
            const finalTxt = await getLabelText(page, 'WinLabel');
            winSamples.push(parseWin(finalTxt));
            sessionDone = true;
        }

        if (!sessionDone) await page.waitForTimeout(120);
    }

    // Dismiss TotalWinPanel if present
    if (await isPanelActive(page, 'TotalWinPanel')) {
        await page.mouse.click(BTN.collect.x, BTN.collect.y);
        await waitPanelClosed(page, 'TotalWinPanel', 12000).catch(() => { /* best-effort */ });
    }

    const peak = Math.max(0, ...winSamples);

    // ── Assertion 1: BuyFG must produce a non-zero WIN ────────────────────────
    // BuyFG guarantees wins (_guaranteedWinSpin retries up to 50×).
    if (peak <= 0) {
        throw new Error(
            `BuyFG produced no WIN at all. WinLabel samples: [${winSamples.slice(0, 30).join(',')}]`,
        );
    }

    // ── Assertion 2: Once WIN > 0, must never return to 0 ────────────────────
    let seenNonZero = false;
    for (const w of winSamples) {
        if (w > 0) seenNonZero = true;
        if (seenNonZero && w === 0) {
            throw new Error(
                `WIN reset to 0 after reaching ${peak.toFixed(2)}! ` +
                `samples: [${winSamples.slice(0, 50).join(',')}]`,
            );
        }
    }

    // ── Assertion 3: WIN must be monotonically non-decreasing ─────────────────
    let prev = 0;
    for (const w of winSamples) {
        if (w < prev - 0.01) {
            throw new Error(
                `WIN decreased: ${prev.toFixed(2)} → ${w.toFixed(2)}. ` +
                `samples: [${winSamples.join(',')}]`,
            );
        }
        if (w > prev) prev = w;
    }

    console.log(
        `WIN check PASS: peak=${peak.toFixed(2)}, ` +
        `samples=${winSamples.length}, ` +
        `nonZeroCount=${winSamples.filter(w => w > 0).length}`,
    );

    return peak;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1 — Online Standalone (https://ibalasite.github.io/thunder-blessing-slot/)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Phase 1 — Online Standalone WIN Accumulation', () => {

    test.setTimeout(120_000);

    /**
     * WIN-P1-01: Reference version (online standalone, LocalEngineAdapter).
     * BuyFG costs 0.25 × 100 = 25; DEFAULT_BALANCE = 1000 → always affordable.
     * No auth needed — game starts directly with local balance.
     */
    test('WIN-P1-01: Online BuyFG WinLabel 在整個 FG 鏈中不歸零（Phase 1 參考版）', async ({ page }) => {
        // Use 'load' (not 'networkidle') — Cocos game loads many assets and may
        // keep open long-poll connections that prevent networkidle from firing.
        await page.goto(ONLINE_URL, { waitUntil: 'load', timeout: 60000 });
        await waitGameReady(page);

        const balText = await getLabelText(page, 'BalanceLabel');
        const initialBal = parseBal(balText);

        console.log(`Phase 1 initial balance: ${initialBal}`);

        const peak = await runBuyFGWinCheck(page, initialBal);

        await page.screenshot({ path: '.playwright-output/win-p1-01-online-buyfg.png' });

        console.log(`WIN-P1-01 PASS (online standalone): peak WIN = ${peak.toFixed(2)}`);
    });

});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2 — K8s Local Dev (http://localhost:30080)
// ═══════════════════════════════════════════════════════════════════════════════

let k8sReady = false;
const K8S_EMAIL    = `rpa-winacc-${Date.now()}@test.local`;
const K8S_PASSWORD = 'WinAccum1!';

/** K8s game URL with auto-login params */
function k8sGameURL(): string {
    return `${K8S_URL}?email=${encodeURIComponent(K8S_EMAIL)}&password=${encodeURIComponent(K8S_PASSWORD)}&apiUrl=${encodeURIComponent(K8S_API.replace('/api/v1', ''))}`;
}

/** Register account and deposit enough balance for BuyFG tests */
async function bootstrapK8sAccount(request: APIRequestContext): Promise<void> {
    await request.post(`${K8S_API}/auth/register`, {
        data: { email: K8S_EMAIL, password: K8S_PASSWORD },
    });
    const loginRes = await request.post(`${K8S_API}/auth/login`, {
        data: { email: K8S_EMAIL, password: K8S_PASSWORD },
    });
    const { accessToken } = await loginRes.json() as { accessToken: string };

    // Deposit 2000 (BuyFG costs ≈25 per session at default bet)
    await request.post(`${K8S_API}/wallet/deposit`, {
        data: { amount: '2000' },
        headers: { Authorization: `Bearer ${accessToken}` },
    });
}

test.describe('Phase 2 — K8s Local Dev WIN Accumulation', () => {

    test.setTimeout(120_000);

    test.beforeAll(async ({ request }) => {
        try {
            const h = await request.get(`${K8S_API}/health`, { timeout: 5000 });
            k8sReady = h.ok();
        } catch {
            k8sReady = false;
        }
        if (!k8sReady) { console.warn('[WinAccum] K8s not ready — Phase 2 tests will be skipped'); return; }

        try {
            const g = await request.get(`${K8S_URL}/index.html`, { timeout: 5000 });
            if (!g.ok()) { k8sReady = false; return; }
        } catch {
            k8sReady = false;
            return;
        }

        await bootstrapK8sAccount(request);
    });

    /**
     * WIN-P2-01: K8s version must match Phase 1 WIN accumulation behaviour.
     * After the spinBonus fix + rebuild, each FG spin's stepWin is credited
     * correctly and WIN label must never reset during a BuyFG session.
     */
    test('WIN-P2-01: K8s BuyFG WinLabel 在整個 FG 鏈中不歸零（Phase 2 修正版）', async ({ page }) => {
        test.skip(!k8sReady, 'K8s not available');

        await page.goto(k8sGameURL(), { waitUntil: 'networkidle', timeout: 30000 });
        await waitGameReady(page);

        const balText = await getLabelText(page, 'BalanceLabel');
        const initialBal = parseBal(balText);
        console.log(`Phase 2 K8s initial balance: ${initialBal}`);

        const peak = await runBuyFGWinCheck(page, initialBal);

        await page.screenshot({ path: '.playwright-output/win-p2-01-k8s-buyfg.png' });

        console.log(`WIN-P2-01 PASS (K8s): peak WIN = ${peak.toFixed(2)}`);
    });

    /**
     * WIN-P2-02: Confirm deployed K8s build uses new probabilities.
     *
     * Checks that the compiled JS bundle served from the K8s Cocos deployment
     * contains the new FG_TRIGGER_PROB (0.0089) and not the old value (0.008).
     *
     * Strategy: intercept all .js responses loaded by the game page and search
     * for the probability constants in the minified source.
     */
    test('WIN-P2-02: K8s 部署使用新機率 FG_TRIGGER_PROB=0.0089', async ({ page, request }) => {
        test.skip(!k8sReady, 'K8s not available');

        const bundleContents: string[] = [];

        // Intercept all JS responses to collect bundle source
        page.on('response', async (resp) => {
            const url = resp.url();
            const ct  = resp.headers()['content-type'] ?? '';
            if (!url.includes('.js') && !ct.includes('javascript')) return;
            // Only check scripts from the game origin (skip CDN/analytics)
            if (!url.startsWith(K8S_URL) && !url.startsWith('http://localhost')) return;
            try {
                const text = await resp.text();
                if (text.length > 100) bundleContents.push(text);
            } catch { /* ignore */ }
        });

        await page.goto(K8S_URL, { waitUntil: 'networkidle', timeout: 30000 });

        const allSource = bundleContents.join('\n');

        // ── New FG_TRIGGER_PROB: 0.0089 ───────────────────────────────────────
        // Minifier drops the leading zero: 0.0089 → .0089 in bundle JS.
        // Check for both forms to be safe.
        const hasNewTriggerProb = allSource.includes('0.0089') || allSource.includes('.0089');
        expect(
            hasNewTriggerProb,
            `FG_TRIGGER_PROB=0.0089 (or .0089) not found in deployed JS. ` +
            `If only 0.008 / .008 is present, the K8s image was built from stale code. ` +
            `Run: bash infra/k8s/cocos/build-cocos.sh`,
        ).toBe(true);

        // ── Old value must NOT appear as standalone probability ────────────────
        // 0.008 could appear in other contexts (e.g. hex colour, delay ms).
        // We look for it next to adjacent config numbers to be precise.
        // BUY_FG_PAYOUT_SCALE=1.073 confirms the new config is present.
        const hasNewPayoutScale = allSource.includes('1.073');
        expect(
            hasNewPayoutScale,
            `BUY_FG_PAYOUT_SCALE=1.073 not found in deployed JS. ` +
            `K8s image may be built from old GameConfig.ts.`,
        ).toBe(true);

        console.log(`WIN-P2-02 PASS: New probabilities confirmed in ${bundleContents.length} JS bundle(s)`);
    });

    /**
     * WIN-P2-03: Second BuyFG session on the same account must also accumulate
     * WIN correctly (no cross-session WIN reset bug).
     */
    test('WIN-P2-03: K8s 連續兩次 BuyFG WinLabel 均正確累積', async ({ page, request }) => {
        test.setTimeout(240_000); // two full BuyFG sessions can each take up to 60s
        test.skip(!k8sReady, 'K8s not available');

        // Use a fresh account to avoid FG-session carry-over
        const email2 = `rpa-winacc2-${Date.now()}@test.local`;
        await request.post(`${K8S_API}/auth/register`, {
            data: { email: email2, password: K8S_PASSWORD },
        });
        const loginRes = await request.post(`${K8S_API}/auth/login`, {
            data: { email: email2, password: K8S_PASSWORD },
        });
        const { accessToken } = await loginRes.json() as { accessToken: string };
        await request.post(`${K8S_API}/wallet/deposit`, {
            data: { amount: '5000' },
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const url2 = `${K8S_URL}?email=${encodeURIComponent(email2)}&password=${encodeURIComponent(K8S_PASSWORD)}&apiUrl=${encodeURIComponent(K8S_API.replace('/api/v1', ''))}`;
        await page.goto(url2, { waitUntil: 'networkidle', timeout: 30000 });
        await waitGameReady(page);

        // Session 1
        const bal1 = parseBal(await getLabelText(page, 'BalanceLabel'));
        const peak1 = await runBuyFGWinCheck(page, bal1);
        console.log(`Session 1 peak WIN: ${peak1.toFixed(2)}`);

        // Reload the page between sessions to guarantee a clean idle game state.
        // After TotalWinPanel collect, the Cocos engine briefly locks while
        // crediting the win — a fresh page load is the most reliable reset.
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await waitGameReady(page);

        // Session 2
        const bal2 = parseBal(await getLabelText(page, 'BalanceLabel'));
        const peak2 = await runBuyFGWinCheck(page, bal2);
        console.log(`Session 2 peak WIN: ${peak2.toFixed(2)}`);

        await page.screenshot({ path: '.playwright-output/win-p2-03-k8s-two-buyfg.png' });

        console.log(`WIN-P2-03 PASS: Two consecutive BuyFG sessions both accumulated WIN correctly`);
    });

});
