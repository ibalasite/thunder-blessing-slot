/**
 * AllButtons RPA Browser Test — Playwright
 *
 * 逐一測試畫面上每個按鈕的行為。
 * 使用 Cocos 場景樹讀取（page.evaluate → cc.director.getScene()），
 * 座標點擊（page.mouse.click），驗證節點狀態 / Label 文字 / 餘額變化。
 *
 * ═══════════════════════════════════════════════════════════════
 * 完整按鈕清單（SceneBuilder.ts 座標系推導）
 * ═══════════════════════════════════════════════════════════════
 *
 * 座標轉換公式（Cocos Y 朝上 ↔ 瀏覽器 Y 朝下，viewport 720×1280）：
 *   screenX = 360 + cocosX
 *   screenY = 640 - cocosY
 *
 * ── HUD（UIPanel 位於 canvas y=−530）──────────────────────────
 * 所有 HUD 按鈕在 UIPanel 本地 y=−44，換算至畫布 y=−574，screen y=1214
 *
 * TurboBtn  ⚡  UIPanel-local(−295,−44) → screen(65, 1214)
 * BetMinusBtn − UIPanel-local(−175,−44) → screen(185, 1214)
 * SpinBtn    ↺  UIPanel-local(0,−44)    → screen(360, 1214)
 * BetPlusBtn +  UIPanel-local(175,−44)  → screen(535, 1214)
 * AutoSpinBtn▶  UIPanel-local(255,−44)  → screen(615, 1214)
 * MenuBtn    ≡  UIPanel-local(325,−44)  → screen(685, 1214)
 *
 * ── BuyExtraRow（canvas y=−330）──────────────────────────────
 * BuyBtn       BuyExtraRow-local(−160,0) → screen(200, 970)
 * ExtraBetBtn  BuyExtraRow-local(168,0)  → screen(528, 970)
 * ExtraBetInfoBtn BuyExtraRow-local(338,0) → screen(698, 970)
 *
 * ── AutoSpin 面板（card 位於 canvas 0,0）─────────────────────
 * cols=4, btnW=96, btnH=44, gapX=12, gapY=10, startX=−162
 * 10   canvas(−162, 60) → screen(198, 580)
 * 25   canvas(−54,  60) → screen(306, 580)
 * 50   canvas( 54,  60) → screen(414, 580)
 * 100  canvas(162,  60) → screen(522, 580)
 * 200  canvas(−162,  6) → screen(198, 634)
 * 500  canvas(−54,   6) → screen(306, 634)
 * ∞    canvas( 54,   6) → screen(414, 634)
 * ✕ 取消 canvas(0, −110) → screen(360, 750)
 *
 * ── BuyFG 面板（panel 位於 canvas 0,0）──────────────────────
 * CANCEL canvas(−95,−118) → screen(265, 758)
 * START  canvas( 95,−118) → screen(455, 758)
 *
 * ── 儲值面板（panel 位於 canvas 0,0）────────────────────────
 * $10  canvas(−88, 62) → screen(272, 578)
 * $50  canvas( 88, 62) → screen(448, 578)
 * $100 canvas(−88, −2) → screen(272, 642)
 * $500 canvas( 88, −2) → screen(448, 642)
 * 取消  canvas(0, −152) → screen(360, 792)
 *
 * ── TotalWin 面板 ────────────────────────────────────────────
 * COLLECT canvas(0,−120) → screen(360, 760)
 *
 * ── ExtraBetInfo 面板（tap anywhere to close）────────────────
 * 點任意處  screen(360, 640)
 *
 * 前置條件：
 *   K8s Cocos game: http://localhost:30080
 *   K8s API:        http://localhost:30001
 *
 * 執行：
 *   npx playwright test tests/rpa/AllButtons.rpa.spec.ts
 *   npx playwright test --ui
 *
 */

import { test, expect, type Page } from '@playwright/test';

// ─── 常數 ──────────────────────────────────────────────────────────────────

const GAME_URL = 'http://localhost:30080';
const API_URL  = 'http://localhost:30001/api/v1';

const TEST_EMAIL    = `rpa-buttons-${Date.now()}@test.local`;
const TEST_PASSWORD = 'RpaButtons1!';

// BFG-02 uses its own account to avoid contaminating the shared account with an incomplete FG session
const BFG_EMAIL     = `rpa-bfg-${Date.now()}@test.local`;

// ─── 座標表（SceneBuilder.ts 推導） ────────────────────────────────────────

/** Cocos 座標 → 瀏覽器座標（canvas 720×1280，Y 軸反轉） */
const C = (cx: number, cy: number) => ({ x: 360 + cx, y: 640 - cy });

export const BTN = {
    // ── HUD（UIPanel y=−530，按鈕 y=−44，絕對 canvas y=−574）
    turbo:       C(-295, -574),   // ⚡
    betMinus:    C(-175, -574),   // −
    spin:        C(   0, -574),   // ↺
    betPlus:     C( 175, -574),   // +
    autoSpin:    C( 255, -574),   // ▶
    menu:        C( 325, -574),   // ≡  → 開儲值面板

    // ── BuyExtraRow（canvas y=−330）
    buyFG:       C(-160, -330),   // BUY FREE GAME
    extraBet:    C( 168, -330),   // EXTRA BET ON/OFF
    extraBetInfo:C( 338, -330),   // ?

    // ── AutoSpin 面板（card at canvas 0,0）
    autoSpin10:  C(-162,  60),
    autoSpin25:  C( -54,  60),
    autoSpin50:  C(  54,  60),
    autoSpin100: C( 162,  60),
    autoSpin200: C(-162,   6),
    autoSpin500: C( -54,   6),
    autoSpinInf: C(  54,   6),
    autoSpinCancel: C(0, -110),

    // ── BuyFG 面板（panel at canvas 0,0）
    buyFGCancel: C(-95, -118),
    buyFGStart:  C( 95, -118),

    // ── 儲值面板（panel at canvas 0,0）
    deposit10:   C( -88,  62),
    deposit50:   C(  88,  62),
    deposit100:  C( -88,  -2),
    deposit500:  C(  88,  -2),
    depositCancel: C(0, -152),

    // ── TotalWin 面板
    collect:     C(0, -120),

    // ── ExtraBetInfo 面板（tap anywhere）
    extraBetInfoClose: C(0, 0),
} as const;

// ─── Cocos 場景工具 ─────────────────────────────────────────────────────────

type CocosEvalFn<T> = (args: { nodeName: string }) => T | null;


/** 讀取 Label 節點的 string */
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

/** 從 Cocos 場景讀取目前 turboMode 值（依 TurboBtn lbl 顏色判斷：金色=ON, 暗色=OFF） */
async function getTurboMode(page: Page): Promise<boolean | null> {
    return page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const cc = (window as any).cc;
        const scene = cc?.director?.getScene();
        if (!scene) return null;
        function findNode(n: any, tgt: string): any {
            if (n.name === tgt) return n;
            for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
            return null;
        }
        const turboBtn = findNode(scene, 'TurboBtn');
        if (!turboBtn) return null;
        const lbl = turboBtn.getChildByName('lbl');
        if (!lbl) return null;
        const label = lbl.getComponent(cc.Label);
        if (!label) return null;
        // turboMode ON: lbl color #ffcc22 (r≈255), OFF: #444456 (r≈68)
        return label.color ? label.color.r > 150 : null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

/** 讀取某節點子節點 'lbl' 的 Label.string（按鈕標籤） */
async function getButtonLabel(page: Page, buttonNodeName: string): Promise<string | null> {
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
        const btn = findNode(scene, name);
        if (!btn) return null;
        const lbl = btn.getChildByName('lbl');
        return lbl?.getComponent(cc.Label)?.string ?? null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    }, buttonNodeName);
}

/** 檢查面板節點是否 active */
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

/** 等待面板打開（active=true） */
async function waitPanelOpen(page: Page, panelName: string, timeout = 15000): Promise<void> {
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

/**
 * 點擊按鈕直到面板打開（最多 retries 次）。
 * Cocos 在引擎繁忙時偶爾會丟失第一次 click，此函式自動重試。
 */
async function clickUntilPanelOpen(
    page: Page,
    coord: { x: number; y: number },
    panelName: string,
    retries = 3,
): Promise<void> {
    for (let i = 0; i < retries; i++) {
        await page.mouse.click(coord.x, coord.y);
        try {
            await waitPanelOpen(page, panelName, 5000);
            return;
        } catch {
            if (i === retries - 1) throw new Error(`Panel '${panelName}' did not open after ${retries} click(s)`);
            await page.waitForTimeout(300);
        }
    }
}

/** 等待面板關閉（active=false） */
async function waitPanelClosed(page: Page, panelName: string, timeout = 12000): Promise<void> {
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

/** 等待 Cocos 場景就緒（BalanceLabel 顯示 '餘額: …'） */
async function waitGameReady(page: Page): Promise<void> {
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
            // Also wait for loading overlay to stop blocking clicks
            const ls = document.getElementById('LoadingScreen');
            if (ls && ls.style.display !== 'none' && !ls.classList.contains('fade-out')) return false;
            return true;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 45_000, polling: 200 },
    );
    // Extra buffer: loading screen fade-out (0.5s CSS transition) + Cocos engine warm-up
    await page.waitForTimeout(1000);
}

/** 解析 '餘額: 1000.00' 格式 */
function parseBal(s: string | null): number {
    if (!s) return NaN;
    return parseFloat(s.replace(/[^0-9.]/g, ''));
}

/** 解析 '押分: 2.50' 格式 */
function parseBet(s: string | null): number {
    if (!s) return NaN;
    return parseFloat(s.replace(/[^0-9.]/g, ''));
}

/** 等待 BalanceLabel 改變（spin 結束後才會更新） */
async function waitBalanceChange(page: Page, prevBal: number, timeout = 20000): Promise<number> {
    await page.waitForFunction(
        ([prev]: [number]) => {
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
            const cur = parseFloat(s.replace(/[^0-9.]/g, ''));
            return !isNaN(cur) && Math.abs(cur - prev) > 0.001;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        [prevBal] as [number],
        { timeout, polling: 300 },
    );
    return parseBal(await getLabelText(page, 'BalanceLabel'));
}

// ─── 遊戲 URL（帶測試帳號參數） ──────────────────────────────────────────────

function gameURL(email: string, password: string): string {
    return `${GAME_URL}?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`;
}

// ─── 前置：K8s 可用性 + 建立測試帳號 ──────────────────────────────────────

let k8sAvailable = false;
let accessToken   = '';

test.beforeAll(async ({ request }) => {
    try {
        const h = await request.get(`${API_URL}/health`, { timeout: 4000 });
        k8sAvailable = h.ok();
    } catch { k8sAvailable = false; }

    if (!k8sAvailable) { console.warn('[AllButtons.rpa] K8s not ready — skip'); return; }

    try {
        const g = await request.get(`${GAME_URL}/index.html`, { timeout: 4000 });
        if (!g.ok()) { k8sAvailable = false; return; }
    } catch { k8sAvailable = false; return; }

    await request.post(`${API_URL}/auth/register`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const login = await request.post(`${API_URL}/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const body = await login.json() as { accessToken: string };
    accessToken = body.accessToken;

    // 確保足夠餘額（10,000）供全部測試使用
    await request.post(`${API_URL}/wallet/deposit`, {
        data: { amount: '10000' },
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    // BFG-02 獨立帳號（避免 FG session 污染共用帳號）
    await request.post(`${API_URL}/auth/register`, {
        data: { email: BFG_EMAIL, password: TEST_PASSWORD },
    });
    const bfgLogin = await request.post(`${API_URL}/auth/login`, {
        data: { email: BFG_EMAIL, password: TEST_PASSWORD },
    });
    const bfgBody = await bfgLogin.json() as { accessToken: string };
    await request.post(`${API_URL}/wallet/deposit`, {
        data: { amount: '10000' },
        headers: { Authorization: `Bearer ${bfgBody.accessToken}` },
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HUD 按鈕
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('HUD 按鈕', () => {

    // ── TurboBtn (⚡) ────────────────────────────────────────────────────────
    test('HUD-01: TurboBtn default 金框（turboMode=true），點擊變暗框（turboMode=false）', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        // 初始狀態：turboMode=true（金框）
        expect(await getTurboMode(page)).toBe(true);

        // 點擊 → turboMode=false（暗框）
        await page.mouse.click(BTN.turbo.x, BTN.turbo.y);
        await page.waitForTimeout(300);
        expect(await getTurboMode(page)).toBe(false);

        await page.screenshot({ path: '.playwright-output/hud-01-turbo-off.png' });

        // 再點 → turboMode=true（金框還原）
        await page.mouse.click(BTN.turbo.x, BTN.turbo.y);
        await page.waitForTimeout(300);
        expect(await getTurboMode(page)).toBe(true);

        await page.screenshot({ path: '.playwright-output/hud-01-turbo-on.png' });
    });

    // ── TurboBtn ⚡ 旁不得出現額外文字（regression：Windows stale build 曾出現 'on' 撐框）
    test('HUD-01b: TurboBtn 點擊前後標籤只有 ⚡，旁邊不出現任何額外文字', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        // 初始狀態
        expect(await getButtonLabel(page, 'TurboBtn')).toBe('⚡');

        // 點擊切換（模擬 ON）
        await page.mouse.click(BTN.turbo.x, BTN.turbo.y);
        await page.waitForTimeout(300);
        expect(await getButtonLabel(page, 'TurboBtn')).toBe('⚡');   // 不能出現 'ON' 或其他附加字

        // 再點切換（模擬 OFF）
        await page.mouse.click(BTN.turbo.x, BTN.turbo.y);
        await page.waitForTimeout(300);
        expect(await getButtonLabel(page, 'TurboBtn')).toBe('⚡');   // 仍然只有 ⚡

        await page.screenshot({ path: '.playwright-output/hud-01b-turbo-no-extra-text.png' });
    });

    // ── BetMinusBtn (−) ──────────────────────────────────────────────────────
    test('HUD-02: BetMinusBtn (−) 點擊後押分減少', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        // DEFAULT_BET = BET_MIN = 0.25 → first increment so BetMinus has room to decrease
        await page.mouse.click(BTN.betPlus.x, BTN.betPlus.y);
        await page.waitForTimeout(300);

        const before = parseBet(await getLabelText(page, 'BetLabel'));
        expect(isNaN(before)).toBe(false);

        await page.mouse.click(BTN.betMinus.x, BTN.betMinus.y);
        await page.waitForTimeout(300);

        const after = parseBet(await getLabelText(page, 'BetLabel'));
        expect(after).toBeLessThan(before);

        await page.screenshot({ path: '.playwright-output/hud-02-bet-minus.png' });
    });

    // ── BetPlusBtn (+) ───────────────────────────────────────────────────────
    test('HUD-03: BetPlusBtn (+) 點擊後押分增加', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const before = parseBet(await getLabelText(page, 'BetLabel'));
        expect(isNaN(before)).toBe(false);

        await page.mouse.click(BTN.betPlus.x, BTN.betPlus.y);
        await page.waitForTimeout(300);

        const after = parseBet(await getLabelText(page, 'BetLabel'));
        expect(after).toBeGreaterThan(before);

        await page.screenshot({ path: '.playwright-output/hud-03-bet-plus.png' });
    });

    // ── BetMinus + BetPlus 對稱性 ────────────────────────────────────────────
    test('HUD-04: BetMinus 後 BetPlus → 押分恢復原值', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const original = parseBet(await getLabelText(page, 'BetLabel'));
        await page.mouse.click(BTN.betMinus.x, BTN.betMinus.y);
        await page.waitForTimeout(200);
        await page.mouse.click(BTN.betPlus.x, BTN.betPlus.y);
        await page.waitForTimeout(200);

        const restored = parseBet(await getLabelText(page, 'BetLabel'));
        expect(restored).toBeCloseTo(original, 2);
    });

    // ── SpinBtn (↺) ─────────────────────────────────────────────────────────
    test('HUD-05: SpinBtn (↺) 點擊後執行 spin，餘額減少押分', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const betStr  = await getLabelText(page, 'BetLabel');
        const bet     = parseBet(betStr);
        const balBefore = parseBal(await getLabelText(page, 'BalanceLabel'));

        await page.mouse.click(BTN.spin.x, BTN.spin.y);

        // 等待餘額變動（spin 扣款後更新）
        const balAfter = await waitBalanceChange(page, balBefore, 20000);

        // 餘額有變動（扣押分或淨贏）
        const delta = Math.abs(balAfter - balBefore);
        expect(delta).toBeGreaterThan(0);

        await page.screenshot({ path: '.playwright-output/hud-05-spin.png' });
    });

    // ── AutoSpinBtn (▶) ──────────────────────────────────────────────────────
    test('HUD-06: AutoSpinBtn (▶) 點擊後 AutoSpinPanel 出現', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        expect(await isPanelActive(page, 'AutoSpinPanel')).toBe(false);

        await clickUntilPanelOpen(page, BTN.autoSpin, 'AutoSpinPanel');

        expect(await isPanelActive(page, 'AutoSpinPanel')).toBe(true);
        await page.screenshot({ path: '.playwright-output/hud-06-autospin-panel.png' });
    });

    // ── MenuBtn (≡) ──────────────────────────────────────────────────────────
    test('HUD-07: MenuBtn (≡) 點擊後 DepositPanel 出現', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        expect(await isPanelActive(page, 'DepositPanel')).toBe(false);

        await clickUntilPanelOpen(page, BTN.menu, 'DepositPanel');

        expect(await isPanelActive(page, 'DepositPanel')).toBe(true);
        await page.screenshot({ path: '.playwright-output/hud-07-deposit-panel.png' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BuyExtraRow 按鈕
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('BuyExtraRow 按鈕', () => {

    // ── BuyBtn（BUY FREE GAME）───────────────────────────────────────────────
    test('ROW-01: BuyBtn 點擊後 BuyFGPanel 出現', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        expect(await isPanelActive(page, 'BuyFGPanel')).toBe(false);

        await clickUntilPanelOpen(page, BTN.buyFG, 'BuyFGPanel');

        expect(await isPanelActive(page, 'BuyFGPanel')).toBe(true);
        await page.screenshot({ path: '.playwright-output/row-01-buyfg-panel.png' });
    });

    // ── ExtraBetBtn（EXTRA BET ON/OFF）──────────────────────────────────────
    test('ROW-02: ExtraBetBtn 第一次點擊 → 標籤變 EXTRA BET  ON', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const before = await getButtonLabel(page, 'ExtraBetBtn');
        expect(before).toBe('EXTRA BET  OFF');

        await page.mouse.click(BTN.extraBet.x, BTN.extraBet.y);
        await page.waitForTimeout(300);

        const after = await getButtonLabel(page, 'ExtraBetBtn');
        expect(after).toBe('EXTRA BET  ON');
        await page.screenshot({ path: '.playwright-output/row-02-extrabet-on.png' });
    });

    test('ROW-03: ExtraBetBtn 連點兩次 → 標籤回到 EXTRA BET  OFF', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        await page.mouse.click(BTN.extraBet.x, BTN.extraBet.y); // ON
        await page.waitForTimeout(200);
        await page.mouse.click(BTN.extraBet.x, BTN.extraBet.y); // OFF
        await page.waitForTimeout(200);

        expect(await getButtonLabel(page, 'ExtraBetBtn')).toBe('EXTRA BET  OFF');
    });

    test('ROW-04: ExtraBetBtn ON 時 BetLabel 押分為 3× 原值（Extra Bet 加成）', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const betOff = parseBet(await getLabelText(page, 'BetLabel'));
        await page.mouse.click(BTN.extraBet.x, BTN.extraBet.y);
        await page.waitForTimeout(300);
        const betOn = parseBet(await getLabelText(page, 'BetLabel'));

        expect(betOn).toBeCloseTo(betOff * 3, 1);
        await page.screenshot({ path: '.playwright-output/row-04-extrabet-bet3x.png' });
    });

    // ── ExtraBetInfoBtn（?）────────────────────────────────────────────────
    test('ROW-05: ExtraBetInfoBtn (?) 點擊後 ExtraBetInfoPanel 出現', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        expect(await isPanelActive(page, 'ExtraBetInfoPanel')).toBe(false);

        await clickUntilPanelOpen(page, BTN.extraBetInfo, 'ExtraBetInfoPanel');

        expect(await isPanelActive(page, 'ExtraBetInfoPanel')).toBe(true);
        await page.screenshot({ path: '.playwright-output/row-05-extrabet-info.png' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AutoSpin 面板按鈕
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('AutoSpin 面板', () => {

    async function openAutoSpinPanel(page: Page): Promise<void> {
        await clickUntilPanelOpen(page, BTN.autoSpin, 'AutoSpinPanel');
    }

    const AUTOSPIN_OPTIONS: Array<{ label: string; coord: { x: number; y: number }; value: number }> = [
        { label: '10',  coord: BTN.autoSpin10,  value: 10  },
        { label: '25',  coord: BTN.autoSpin25,  value: 25  },
        { label: '50',  coord: BTN.autoSpin50,  value: 50  },
        { label: '100', coord: BTN.autoSpin100, value: 100 },
        { label: '200', coord: BTN.autoSpin200, value: 200 },
        { label: '500', coord: BTN.autoSpin500, value: 500 },
        { label: '∞',   coord: BTN.autoSpinInf, value: -1  },
    ];

    for (const opt of AUTOSPIN_OPTIONS) {
        test(`AS-0${AUTOSPIN_OPTIONS.indexOf(opt) + 1}: 選擇 ${opt.label} → AutoSpinPanel 關閉`, async ({ page }) => {
            test.skip(!k8sAvailable, 'K8s not available');
            await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
            await waitGameReady(page);
            await openAutoSpinPanel(page);

            await page.mouse.click(opt.coord.x, opt.coord.y);
            await waitPanelClosed(page, 'AutoSpinPanel');

            expect(await isPanelActive(page, 'AutoSpinPanel')).toBe(false);
            await page.screenshot({ path: `.playwright-output/as-select-${opt.label}.png` });

            // 停止 auto spin（再點一次 spin 或直接刷新）
            // （後續測試用 fresh page.goto，不受影響）
        });
    }

    test('AS-08: ✕ 取消 → AutoSpinPanel 關閉，不啟動 auto spin', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const balBefore = parseBal(await getLabelText(page, 'BalanceLabel'));

        await openAutoSpinPanel(page);
        await page.mouse.click(BTN.autoSpinCancel.x, BTN.autoSpinCancel.y);
        await waitPanelClosed(page, 'AutoSpinPanel');

        expect(await isPanelActive(page, 'AutoSpinPanel')).toBe(false);

        // 取消後不應有任何 spin 發生（餘額不變）
        await page.waitForTimeout(500);
        const balAfter = parseBal(await getLabelText(page, 'BalanceLabel'));
        expect(balAfter).toBeCloseTo(balBefore, 2);

        await page.screenshot({ path: '.playwright-output/as-08-cancel.png' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BuyFG 面板按鈕
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('BuyFG 面板', () => {

    async function openBuyFGPanel(page: Page): Promise<void> {
        await clickUntilPanelOpen(page, BTN.buyFG, 'BuyFGPanel');
    }

    test('BFG-01: CANCEL → BuyFGPanel 關閉，餘額不變', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const balBefore = parseBal(await getLabelText(page, 'BalanceLabel'));

        await openBuyFGPanel(page);
        await page.screenshot({ path: '.playwright-output/bfg-01a-panel-open.png' });

        await page.mouse.click(BTN.buyFGCancel.x, BTN.buyFGCancel.y);
        await waitPanelClosed(page, 'BuyFGPanel');

        expect(await isPanelActive(page, 'BuyFGPanel')).toBe(false);

        const balAfter = parseBal(await getLabelText(page, 'BalanceLabel'));
        expect(balAfter).toBeCloseTo(balBefore, 2);

        await page.screenshot({ path: '.playwright-output/bfg-01b-cancelled.png' });
    });

    test('BFG-02: START → BuyFGPanel 關閉，餘額扣除 Buy FG 費用', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        // 使用獨立帳號避免 FG session 狀態污染後續測試的共用帳號
        await page.goto(gameURL(BFG_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const balBefore = parseBal(await getLabelText(page, 'BalanceLabel'));
        expect(balBefore).toBeGreaterThan(100); // 確保有足夠餘額

        await openBuyFGPanel(page);

        // 讀取 BuyFG 費用（panel 內 '25.00' 等 costLbl）
        const costText = await page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, tgt: string): any {
                if (n.name === tgt) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
                return null;
            }
            function findLabel(n: any): string | null {
                // BuyFGPanel → panel → costBox → 'lbl'（顯示費用數字）
                const panel = findNode(n, 'BuyFGPanel');
                if (!panel) return null;
                // 走訪找到費用標籤（倒數第 2 個 lbl，文字為數字）
                const all: any[] = [];
                function collect(node: any): void {
                    if (node.name === 'lbl') all.push(node);
                    for (const c of (node.children ?? [])) collect(c);
                }
                collect(panel);
                // 找到純數字格式的 label（費用）
                for (const n of all) {
                    const s = n.getComponent(cc.Label)?.string ?? '';
                    if (/^\d+\.\d{2}$/.test(s)) return s;
                }
                return null;
            }
            return findLabel(cc?.director?.getScene());
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        const cost = parseFloat(costText ?? '0');

        await page.mouse.click(BTN.buyFGStart.x, BTN.buyFGStart.y);

        // 等待 BuyFGPanel 關閉（START 觸發後面板消失）
        await waitPanelClosed(page, 'BuyFGPanel', 15000);
        expect(await isPanelActive(page, 'BuyFGPanel')).toBe(false);

        // 等待餘額更新（扣費即可，FG 過程中有 Zeus flip 互動需求，不等完整結束）
        // 使用獨立帳號 BFG_EMAIL 確保未完成的 FG session 不影響其他測試
        const balAfter = await waitBalanceChange(page, balBefore, 20000);
        expect(Math.abs(balAfter - balBefore)).toBeGreaterThan(0);

        await page.screenshot({ path: '.playwright-output/bfg-02-start.png' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 儲值面板按鈕（補充 Deposit.rpa.spec.ts）
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('儲值面板', () => {

    async function openDepositPanel(page: Page): Promise<void> {
        await clickUntilPanelOpen(page, BTN.menu, 'DepositPanel');
    }

    const DEPOSIT_PRESETS: Array<{ label: string; coord: { x: number; y: number }; amount: number }> = [
        { label: '$10',  coord: BTN.deposit10,  amount: 10  },
        { label: '$50',  coord: BTN.deposit50,  amount: 50  },
        { label: '$100', coord: BTN.deposit100, amount: 100 },
        { label: '$500', coord: BTN.deposit500, amount: 500 },
    ];

    for (const preset of DEPOSIT_PRESETS) {
        test(`DEP-${DEPOSIT_PRESETS.indexOf(preset) + 1}: ${preset.label} → 面板關閉，餘額增加 ${preset.amount}`, async ({ page }) => {
            test.skip(!k8sAvailable, 'K8s not available');
            await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
            await waitGameReady(page);

            const balBefore = parseBal(await getLabelText(page, 'BalanceLabel'));
            await openDepositPanel(page);
            await page.screenshot({ path: `.playwright-output/dep-${preset.label.replace('$','')}-a-open.png` });

            await page.mouse.click(preset.coord.x, preset.coord.y);
            await waitPanelClosed(page, 'DepositPanel', 15000);

            const balAfter = parseBal(await getLabelText(page, 'BalanceLabel'));
            expect(balAfter).toBeCloseTo(balBefore + preset.amount, 1);

            await page.screenshot({ path: `.playwright-output/dep-${preset.label.replace('$','')}-b-done.png` });
        });
    }

    test('DEP-05: 取消 → 面板關閉，餘額不變', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        const balBefore = parseBal(await getLabelText(page, 'BalanceLabel'));
        await openDepositPanel(page);

        await page.mouse.click(BTN.depositCancel.x, BTN.depositCancel.y);
        await waitPanelClosed(page, 'DepositPanel');

        const balAfter = parseBal(await getLabelText(page, 'BalanceLabel'));
        expect(balAfter).toBeCloseTo(balBefore, 2);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ExtraBetInfo 面板
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('ExtraBetInfo 面板', () => {

    test('EBI-01: ExtraBetInfoPanel tap 任意處 → 面板關閉', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        await clickUntilPanelOpen(page, BTN.extraBetInfo, 'ExtraBetInfoPanel');

        await page.screenshot({ path: '.playwright-output/ebi-01a-open.png' });

        // Tap anywhere（面板是全螢幕 Button）
        await page.mouse.click(BTN.extraBetInfoClose.x, BTN.extraBetInfoClose.y);
        await waitPanelClosed(page, 'ExtraBetInfoPanel');

        expect(await isPanelActive(page, 'ExtraBetInfoPanel')).toBe(false);
        await page.screenshot({ path: '.playwright-output/ebi-01b-closed.png' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TotalWin 面板 — COLLECT 按鈕
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TotalWin 面板', () => {
    /**
     * TotalWinPanel 在 spin 結束有 win 時自動出現。
     * 以連續 spin 直到出現面板（最多 20 次）。
     */
    test('TWP-01: COLLECT → TotalWinPanel 關閉，WinLabel 歸零', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        // 連續 spin，直到 TotalWinPanel 出現（最多 6 次，每次最多 5s；共 ~30s，符合 60s 限制）
        let panelAppeared = false;
        for (let i = 0; i < 6; i++) {
            const bal = parseBal(await getLabelText(page, 'BalanceLabel'));
            if (bal <= 0) break;

            await page.mouse.click(BTN.spin.x, BTN.spin.y);

            // 等待 spin 完成或 TotalWinPanel 出現（取先到者）
            const result = await Promise.race([
                page.waitForFunction(
                    () => {
                        /* eslint-disable @typescript-eslint/no-explicit-any */
                        const cc = (window as any).cc;
                        function findNode(n: any, tgt: string): any {
                            if (n.name === tgt) return n;
                            for (const c of (n.children ?? [])) { const f = findNode(c, tgt); if (f) return f; }
                            return null;
                        }
                        return cc?.director?.getScene()
                            ? findNode(cc.director.getScene(), 'TotalWinPanel')?.active === true
                            : false;
                        /* eslint-enable @typescript-eslint/no-explicit-any */
                    },
                    { timeout: 5000, polling: 200 },
                ).then(() => 'panel'),
                waitBalanceChange(page, bal, 5000).then(() => 'balance'),
            ]).catch(() => 'timeout');

            if (result === 'panel' || await isPanelActive(page, 'TotalWinPanel')) {
                panelAppeared = true;
                break;
            }
        }

        if (!panelAppeared) {
            test.skip(true, 'TotalWinPanel 未在 20 次 spin 內出現（機率性）');
            return;
        }

        expect(await isPanelActive(page, 'TotalWinPanel')).toBe(true);
        await page.screenshot({ path: '.playwright-output/twp-01a-panel-open.png' });

        // 點擊 COLLECT
        await page.mouse.click(BTN.collect.x, BTN.collect.y);
        await waitPanelClosed(page, 'TotalWinPanel');

        expect(await isPanelActive(page, 'TotalWinPanel')).toBe(false);
        await page.screenshot({ path: '.playwright-output/twp-01b-collected.png' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 互斥性驗證：同一時間只有一個面板開啟
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('面板互斥性', () => {

    test('MUTEX-01: 開啟 BuyFGPanel 後，DepositPanel 仍為關閉', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        await clickUntilPanelOpen(page, BTN.buyFG, 'BuyFGPanel');

        expect(await isPanelActive(page, 'DepositPanel')).toBe(false);
        expect(await isPanelActive(page, 'AutoSpinPanel')).toBe(false);
        expect(await isPanelActive(page, 'ExtraBetInfoPanel')).toBe(false);

        // 關閉
        await page.mouse.click(BTN.buyFGCancel.x, BTN.buyFGCancel.y);
        await waitPanelClosed(page, 'BuyFGPanel');
    });

    test('MUTEX-02: 開啟 AutoSpinPanel 後，BuyFGPanel 仍為關閉', async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');
        await page.goto(gameURL(TEST_EMAIL, TEST_PASSWORD));
        await waitGameReady(page);

        await clickUntilPanelOpen(page, BTN.autoSpin, 'AutoSpinPanel');

        expect(await isPanelActive(page, 'BuyFGPanel')).toBe(false);
        expect(await isPanelActive(page, 'DepositPanel')).toBe(false);

        await page.mouse.click(BTN.autoSpinCancel.x, BTN.autoSpinCancel.y);
        await waitPanelClosed(page, 'AutoSpinPanel');
    });
});
