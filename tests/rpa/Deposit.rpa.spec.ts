/**
 * Deposit RPA Browser Test — Playwright
 *
 * 以「玩家視角」在 K8s 部署的 Cocos WebGL 遊戲頁面上：
 *   1. 開啟遊戲 → 等待 Cocos 引擎就緒
 *   2. 點擊 ≡ 選單鍵（右下角）→ 開啟儲值面板
 *   3. 點擊預設金額按鈕（$100）
 *   4. 等待面板關閉（代表 API 回應成功）
 *   5. 驗證畫面餘額標籤已更新
 *
 * 前置條件：
 *   K8s Cocos game : http://localhost:30080
 *   K8s API        : http://localhost:30001
 *
 * 執行方式：
 *   npx playwright test tests/rpa/Deposit.rpa.spec.ts
 *   npx playwright test --ui      ← 可視化模式（推薦首次執行）
 *
 * ═══════════════════════════════════════════════════════════════
 * 座標系對應說明（Cocos ↔ 瀏覽器）
 * ═══════════════════════════════════════════════════════════════
 * Cocos 座標系：原點在畫布中央，Y 軸朝上
 * 瀏覽器座標系：原點在畫布左上角，Y 軸朝下
 *
 *   screenX = CANVAS_W/2 + cocosX  =  360 + cocosX
 *   screenY = CANVAS_H/2 - cocosY  =  640 - cocosY
 *
 * 各元素位置：
 *   MenuBtn (≡)  : UIPanel(0,-530) + local(325,-44) → canvas(325,-574) → screen(685,1214)
 *   BalanceLabel : UIPanel(0,-530) + local(-215, 52) → canvas(-215,-478) → screen(145,1118)
 *   $10  按鈕    : panel center + (-88, 62)  → screen(272, 578)
 *   $50  按鈕    : panel center + ( 88, 62)  → screen(448, 578)
 *   $100 按鈕    : panel center + (-88, -2)  → screen(272, 642)
 *   $500 按鈕    : panel center + ( 88, -2)  → screen(448, 642)
 *   取消按鈕     : panel center + (  0,-152) → screen(360, 792)
 */

import { test, expect, type Page } from '@playwright/test';

// ─── 常數 ──────────────────────────────────────────────────────────────────

const GAME_URL    = 'http://localhost:30080';
const API_URL     = 'http://localhost:30001/api/v1';

/** 測試帳號（每次 run 獨立 email 避免狀態污染） */
const TEST_EMAIL    = `rpa-deposit-${Date.now()}@test.local`;
const TEST_PASSWORD = 'RpaDeposit1!';

// ─── Cocos 畫布座標 → 瀏覽器螢幕座標 ──────────────────────────────────────

/** Cocos 座標系原點在畫布中央，Y 朝上。Playwright click 需要瀏覽器座標（Y 朝下）。 */
function cc2screen(cocosX: number, cocosY: number): { x: number; y: number } {
    return { x: 360 + cocosX, y: 640 - cocosY };
}

// 各按鈕的畫面座標（viewport 720×1280，與 Cocos CANVAS_W/H 完全一致）
const COORDS = {
    // MenuBtn (≡) — UIPanel 本地座標 (325,-44) + UIPanel 偏移 (0,-530)
    menuBtn:       cc2screen(325, -574),
    // HUD 餘額標籤 — UIPanel 本地座標 (-215, 52) + UIPanel 偏移 (0,-530)
    balanceLabel:  cc2screen(-215, -478),
    // 儲值面板（位於畫布正中央 0,0）的預設金額按鈕
    depositPanel: {
        btn10:   cc2screen(-88,   62),
        btn50:   cc2screen( 88,   62),
        btn100:  cc2screen(-88,   -2),
        btn500:  cc2screen( 88,   -2),
        cancel:  cc2screen(  0, -152),
        balance: cc2screen(  0,  118),
    },
};

// ─── 工具函式 ──────────────────────────────────────────────────────────────

/**
 * 取得 Cocos Label 的文字內容。
 * 透過 page.evaluate() 走訪 Cocos 場景節點樹，找到指定名稱的 Label 組件。
 *
 * @param nodeName  SceneBuilder 中設定的節點名稱
 * @returns label 的 string 屬性，找不到則回傳 null
 */
async function getCocosLabelText(page: Page, nodeName: string): Promise<string | null> {
    return page.evaluate((name: string) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const cc = (window as any).cc;
        if (!cc?.director) return null;

        function findNode(node: any, targetName: string): any {
            if (node.name === targetName) return node;
            for (const child of (node.children ?? [])) {
                const found = findNode(child, targetName);
                if (found) return found;
            }
            return null;
        }

        const scene = cc.director.getScene();
        if (!scene) return null;
        const node = findNode(scene, name);
        if (!node) return null;
        const lbl = node.getComponent(cc.Label);
        return lbl?.string ?? null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    }, nodeName);
}

/**
 * 等待 Cocos 引擎初始化並載入遊戲場景。
 * 條件：cc.director.getScene() 不為 null，且 BalanceLabel 有顯示餘額。
 */
async function waitForGameReady(page: Page): Promise<void> {
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            if (!cc?.director) return false;
            const scene = cc.director.getScene();
            if (!scene) return false;

            function findNode(node: any, name: string): any {
                if (node.name === name) return node;
                for (const child of (node.children ?? [])) {
                    const f = findNode(child, name);
                    if (f) return f;
                }
                return null;
            }
            const balNode = findNode(scene, 'BalanceLabel');
            const lbl = balNode?.getComponent(cc.Label);
            // 等待餘額標籤顯示非空值（表示 loginOrRegister + fetchWallet 完成）
            return typeof lbl?.string === 'string' && lbl.string.startsWith('餘額:');
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 45_000, polling: 500 },
    );
}

/**
 * 等待儲值面板關閉。
 * 面板消失時，DepositPanel 節點的 active 為 false。
 */
async function waitForDepositPanelClosed(page: Page): Promise<void> {
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            if (!cc?.director) return false;
            const scene = cc.director.getScene();
            if (!scene) return false;

            function findNode(node: any, name: string): any {
                if (node.name === name) return node;
                for (const child of (node.children ?? [])) {
                    const f = findNode(child, name);
                    if (f) return f;
                }
                return null;
            }
            const panel = findNode(scene, 'DepositPanel');
            // panel.active === false means it's hidden
            return panel !== null && panel.active === false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 15_000, polling: 200 },
    );
}

/** 從 "餘額: 1000.00" 格式解析出數字 */
function parseBalanceStr(s: string | null): number {
    if (!s) return NaN;
    const m = s.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : NaN;
}

/** 直接呼叫 API 取得帳戶餘額（用於交叉驗證） */
async function getBalanceViaAPI(token: string): Promise<number> {
    const res = await fetch(`${API_URL}/wallet`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const body = await res.json() as { balance: string };
    return parseFloat(body.balance);
}

// ─── 前置：建立測試帳號 ──────────────────────────────────────────────────────

let k8sAvailable = false;
let accessToken   = '';

test.beforeAll(async ({ request }) => {
    // 1. 確認 K8s API 可達
    try {
        const health = await request.get(`${API_URL}/health`, { timeout: 4000 });
        k8sAvailable = health.ok();
    } catch {
        k8sAvailable = false;
    }
    if (!k8sAvailable) {
        console.warn(
            '[Deposit.rpa] K8s not ready — skipping all RPA tests.\n' +
            '  Deploy first: ./infra/k8s/build.sh',
        );
        return;
    }

    // 2. 確認 Cocos game 可達
    try {
        const game = await request.get(`${GAME_URL}/index.html`, { timeout: 4000 });
        if (!game.ok()) { k8sAvailable = false; return; }
    } catch {
        k8sAvailable = false;
        return;
    }

    // 3. Register test account
    await request.post(`${API_URL}/auth/register`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });

    // 4. Login to get token (for API cross-validation)
    const login = await request.post(`${API_URL}/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginBody = await login.json() as { accessToken: string };
    accessToken = loginBody.accessToken;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 遊戲載入驗證
// ═══════════════════════════════════════════════════════════════════════════════

test('RPA-01: 遊戲載入 — Cocos 場景就緒，BalanceLabel 顯示初始餘額', async ({ page }) => {
    test.skip(!k8sAvailable, 'K8s not available');

    // 注入測試帳號 via URL params（GameBootstrap 支援 ?email=&password=&apiUrl=）
    await page.goto(`${GAME_URL}?email=${encodeURIComponent(TEST_EMAIL)}&password=${encodeURIComponent(TEST_PASSWORD)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`);

    await waitForGameReady(page);

    const balText = await getCocosLabelText(page, 'BalanceLabel');
    expect(balText).toMatch(/^餘額: \d+\.\d{2}$/);

    const balance = parseBalanceStr(balText);
    expect(balance).toBeGreaterThan(0); // auto-deposit $1000 on first login

    await page.screenshot({ path: '.playwright-output/01-game-loaded.png' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 點擊 ≡ 開啟儲值面板
// ═══════════════════════════════════════════════════════════════════════════════

test('RPA-02: 點擊 ≡ 選單鍵 → 儲值面板出現', async ({ page }) => {
    test.skip(!k8sAvailable, 'K8s not available');

    await page.goto(`${GAME_URL}?email=${encodeURIComponent(TEST_EMAIL)}&password=${encodeURIComponent(TEST_PASSWORD)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`);
    await waitForGameReady(page);

    // 點擊 ≡ MenuBtn（右下角，canvas 座標 325,-574）
    await page.mouse.click(COORDS.menuBtn.x, COORDS.menuBtn.y);

    // 等待 DepositPanel 節點 active=true
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, name: string): any {
                if (n.name === name) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, name); if (f) return f; }
                return null;
            }
            const scene = cc?.director?.getScene();
            const panel = scene ? findNode(scene, 'DepositPanel') : null;
            return panel?.active === true;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 8000, polling: 200 },
    );

    await page.screenshot({ path: '.playwright-output/02-deposit-panel-open.png' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 點擊 $100 → 餘額增加 100（核心 RPA 流程）
// ═══════════════════════════════════════════════════════════════════════════════

test('RPA-03: 點擊 $100 → 面板關閉 → BalanceLabel 增加 100', async ({ page }) => {
    test.skip(!k8sAvailable, 'K8s not available');

    await page.goto(`${GAME_URL}?email=${encodeURIComponent(TEST_EMAIL)}&password=${encodeURIComponent(TEST_PASSWORD)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`);
    await waitForGameReady(page);

    // 記錄儲值前餘額
    const balBefore = parseBalanceStr(await getCocosLabelText(page, 'BalanceLabel'));
    expect(isNaN(balBefore)).toBe(false);

    // 點擊 ≡ 開啟面板
    await page.mouse.click(COORDS.menuBtn.x, COORDS.menuBtn.y);
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, name: string): any {
                if (n.name === name) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, name); if (f) return f; }
                return null;
            }
            return cc?.director?.getScene() ? findNode(cc.director.getScene(), 'DepositPanel')?.active === true : false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 8000 },
    );

    await page.screenshot({ path: '.playwright-output/03a-before-click-100.png' });

    // 點擊 $100 按鈕（canvas 座標 -88, -2）
    await page.mouse.click(COORDS.depositPanel.btn100.x, COORDS.depositPanel.btn100.y);

    // 等待面板關閉（API 完成後 hideDepositPanel 才會關）
    await waitForDepositPanelClosed(page);

    await page.screenshot({ path: '.playwright-output/03b-after-deposit.png' });

    // 讀取儲值後餘額（BalanceLabel 應已更新）
    const balAfter = parseBalanceStr(await getCocosLabelText(page, 'BalanceLabel'));
    expect(isNaN(balAfter)).toBe(false);

    // 主斷言：畫面餘額增加了 100
    expect(balAfter).toBeCloseTo(balBefore + 100, 1);

    // 交叉驗證：API 確認 DB 餘額也正確
    const apiBalance = await getBalanceViaAPI(accessToken);
    expect(apiBalance).toBeCloseTo(balAfter, 1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 全預設金額按鈕流程（$10 / $50 / $500）
// ═══════════════════════════════════════════════════════════════════════════════

const PRESETS: Array<{ label: string; coord: { x: number; y: number }; amount: number }> = [
    { label: '$10',  coord: COORDS.depositPanel.btn10,  amount: 10  },
    { label: '$50',  coord: COORDS.depositPanel.btn50,  amount: 50  },
    { label: '$500', coord: COORDS.depositPanel.btn500, amount: 500 },
];

for (const preset of PRESETS) {
    test(`RPA-04: 點擊 ${preset.label} → BalanceLabel 增加 ${preset.amount}`, async ({ page }) => {
        test.skip(!k8sAvailable, 'K8s not available');

        await page.goto(`${GAME_URL}?email=${encodeURIComponent(TEST_EMAIL)}&password=${encodeURIComponent(TEST_PASSWORD)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`);
        await waitForGameReady(page);

        const balBefore = parseBalanceStr(await getCocosLabelText(page, 'BalanceLabel'));

        // 開啟面板
        await page.mouse.click(COORDS.menuBtn.x, COORDS.menuBtn.y);
        await page.waitForFunction(
            () => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const cc = (window as any).cc;
                function findNode(n: any, name: string): any {
                    if (n.name === name) return n;
                    for (const c of (n.children ?? [])) { const f = findNode(c, name); if (f) return f; }
                    return null;
                }
                return cc?.director?.getScene() ? findNode(cc.director.getScene(), 'DepositPanel')?.active === true : false;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            },
            { timeout: 8000 },
        );

        // 點擊預設金額
        await page.mouse.click(preset.coord.x, preset.coord.y);
        await waitForDepositPanelClosed(page);

        const balAfter = parseBalanceStr(await getCocosLabelText(page, 'BalanceLabel'));
        expect(balAfter).toBeCloseTo(balBefore + preset.amount, 1);

        await page.screenshot({
            path: `.playwright-output/04-preset-${preset.label.replace('$', '')}.png`,
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 取消鍵 — 不觸發儲值，餘額不變
// ═══════════════════════════════════════════════════════════════════════════════

test('RPA-05: 點擊取消 → 面板關閉，餘額不變', async ({ page }) => {
    test.skip(!k8sAvailable, 'K8s not available');

    await page.goto(`${GAME_URL}?email=${encodeURIComponent(TEST_EMAIL)}&password=${encodeURIComponent(TEST_PASSWORD)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`);
    await waitForGameReady(page);

    const balBefore = parseBalanceStr(await getCocosLabelText(page, 'BalanceLabel'));

    // 開啟面板
    await page.mouse.click(COORDS.menuBtn.x, COORDS.menuBtn.y);
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, name: string): any {
                if (n.name === name) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, name); if (f) return f; }
                return null;
            }
            return cc?.director?.getScene() ? findNode(cc.director.getScene(), 'DepositPanel')?.active === true : false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 8000 },
    );

    // 點擊取消
    await page.mouse.click(COORDS.depositPanel.cancel.x, COORDS.depositPanel.cancel.y);

    // 面板關閉
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, name: string): any {
                if (n.name === name) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, name); if (f) return f; }
                return null;
            }
            return cc?.director?.getScene() ? findNode(cc.director.getScene(), 'DepositPanel')?.active === false : false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 8000 },
    );

    const balAfter = parseBalanceStr(await getCocosLabelText(page, 'BalanceLabel'));
    // 餘額不應有任何變化
    expect(balAfter).toBeCloseTo(balBefore, 2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. 儲值面板顯示的「餘額:」標籤與 HUD 一致
// ═══════════════════════════════════════════════════════════════════════════════

test('RPA-06: 儲值面板內的餘額標籤與 HUD 餘額一致', async ({ page }) => {
    test.skip(!k8sAvailable, 'K8s not available');

    await page.goto(`${GAME_URL}?email=${encodeURIComponent(TEST_EMAIL)}&password=${encodeURIComponent(TEST_PASSWORD)}&apiUrl=${encodeURIComponent('http://localhost:30001')}`);
    await waitForGameReady(page);

    // HUD 餘額
    const hudBalText = await getCocosLabelText(page, 'BalanceLabel');
    const hudBal = parseBalanceStr(hudBalText);

    // 開啟儲值面板
    await page.mouse.click(COORDS.menuBtn.x, COORDS.menuBtn.y);
    await page.waitForFunction(
        () => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const cc = (window as any).cc;
            function findNode(n: any, name: string): any {
                if (n.name === name) return n;
                for (const c of (n.children ?? [])) { const f = findNode(c, name); if (f) return f; }
                return null;
            }
            return cc?.director?.getScene() ? findNode(cc.director.getScene(), 'DepositPanel')?.active === true : false;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        },
        { timeout: 8000 },
    );

    // 面板內的餘額標籤（'餘額: 1000.00' 格式，在 DepositPanel 內）
    const panelBalText = await getCocosLabelText(page, 'BalanceLabel');
    const panelBal = parseBalanceStr(panelBalText);

    await page.screenshot({ path: '.playwright-output/06-panel-balance-consistency.png' });

    expect(panelBal).toBeCloseTo(hudBal, 1);

    // 取消
    await page.mouse.click(COORDS.depositPanel.cancel.x, COORDS.depositPanel.cancel.y);
});
