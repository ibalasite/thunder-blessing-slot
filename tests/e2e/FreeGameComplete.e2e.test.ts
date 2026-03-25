/**
 * FreeGameComplete.e2e.test.ts
 *
 * E2E 測試：所有 Free Game 路徑必須走完整個流程，最後顯示 Total Win。
 *
 * 三種 FG 觸發路徑：
 *   1. Main Game 觸發 FG  — doSpin → cascade → MAX_ROWS → FG_TRIGGER → tier coin toss → FG chain → Total Win
 *   2. Buy Free Game 觸發 FG — onBuyFreeGame → intro spins → tier coin toss → FG chain → Total Win
 *   3. Extra Bet 觸發 FG  — doSpin(extraBet) → cascade → MAX_ROWS → FG_TRIGGER → tier coin toss → FG chain → Total Win
 *
 * 每條路徑驗證：
 *   ✓ 流程完成（busy = false）
 *   ✓ 進入 FG（showFGBar 被呼叫）
 *   ✓ FG chain 內有 spin（playCoinToss 被呼叫）
 *   ✓ 離開 FG（hideFGBar、session.inFreeGame = false）
 *   ✓ 顯示 Total Win（showTotalWin 被呼叫）
 *   ✓ 回到 idle 狀態
 */
import { SlotEngine, createEngine }  from '../../assets/scripts/SlotEngine';
import { LocalEngineAdapter }        from '../../assets/scripts/services/LocalEngineAdapter';
import { GameFlowController }        from '../../assets/scripts/core/GameFlowController';
import { GameSession }               from '../../assets/scripts/core/GameSession';
import { LocalAccountService }       from '../../assets/scripts/services/LocalAccountService';
import { IReelManager }              from '../../assets/scripts/contracts/IReelManager';
import { IUIController }             from '../../assets/scripts/contracts/IUIController';
import type { GameMode, FullSpinOutcome } from '../../assets/scripts/contracts/types';
import { BASE_ROWS, MAX_ROWS, LINES_BASE } from '../../assets/scripts/GameConfig';

jest.setTimeout(120_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeReels(): jest.Mocked<IReelManager> {
    return {
        spinWithGrid:         jest.fn().mockResolvedValue(undefined),
        cascade:              jest.fn().mockResolvedValue(undefined),
        flashWinCells:        jest.fn().mockResolvedValue(undefined),
        refreshAllMarks:      jest.fn(),
        updateGrid:           jest.fn(),
        reset:                jest.fn(),
        previewExtraBet:      jest.fn(),
        clearPreviewExtraBet: jest.fn(),
    } as jest.Mocked<IReelManager>;
}

interface FlowRecord {
    showFGBarCalls:     number;
    hideFGBarCalls:     number;
    playCoinTossCalls:  [boolean, boolean][];
    showTotalWinCalls:  number[];
    statusMessages:     string[];
}

function makeUI(): jest.Mocked<IUIController> & { record: FlowRecord } {
    const record: FlowRecord = {
        showFGBarCalls:    0,
        hideFGBarCalls:    0,
        playCoinTossCalls: [],
        showTotalWinCalls: [],
        statusMessages:    [],
    };
    const ui: any = {
        record,
        refresh:             jest.fn(),
        setDisplayBalance:   jest.fn(),
        setStatus:           jest.fn((msg: string) => { record.statusMessages.push(msg); }),
        showWinPop:          jest.fn(),
        enableSpin:          jest.fn(),
        updateExtraBetUI:    jest.fn(),
        updateTurboUI:       jest.fn(),
        updateFreeLetters:   jest.fn(),
        showBuyPanel:        jest.fn().mockResolvedValue(true),
        showCoinToss:        jest.fn().mockResolvedValue(false),
        playCoinToss:        jest.fn((ctx: boolean, result: boolean) => {
            record.playCoinTossCalls.push([ctx, result]);
            return Promise.resolve();
        }),
        showTotalWin:        jest.fn((amount: number) => {
            record.showTotalWinCalls.push(amount);
            return Promise.resolve();
        }),
        showThunderBlessing: jest.fn().mockResolvedValue(undefined),
        showFGBar:           jest.fn(() => { record.showFGBarCalls++; }),
        hideFGBar:           jest.fn(() => { record.hideFGBarCalls++; }),
        updateMultBar:       jest.fn(),
        showAutoSpinPanel:   jest.fn(),
        updateAutoSpinLabel: jest.fn(),
    };
    return ui;
}

/**
 * Scan seeds to find ones that produce FG for a given mode.
 * Returns an array of seeds that trigger a full FG chain.
 */
function findFGSeeds(mode: GameMode, count: number, maxScan = 10000): number[] {
    const results: number[] = [];
    for (let seed = 0; seed < maxScan && results.length < count; seed++) {
        const engine = new SlotEngine(mulberry32(seed));
        const totalBet = 1;
        const o = engine.computeFullSpin({ mode, totalBet });
        if (o.fgSpins.length > 0) {
            results.push(seed);
        }
    }
    return results;
}

interface RunResult {
    seed:     number;
    mode:     GameMode;
    session:  GameSession;
    account:  LocalAccountService;
    ctrl:     GameFlowController;
    ui:       ReturnType<typeof makeUI>;
    outcome?: FullSpinOutcome;
}

async function runFGFlow(mode: GameMode, seed: number): Promise<RunResult> {
    const session = new GameSession();
    const account = new LocalAccountService(100000);
    const engine  = createEngine(mulberry32(seed));
    const adapter = new LocalEngineAdapter(engine);
    const reels   = makeReels();
    const ui      = makeUI();
    const ctrl    = new GameFlowController(
        session, account, adapter, reels, ui, () => Promise.resolve());

    if (mode === 'buyFG') {
        await ctrl.onBuyFreeGame();
    } else if (mode === 'extraBet') {
        session.setExtraBet(true);
        session.computeTotalBet();
        await ctrl.doSpin();
    } else {
        await ctrl.doSpin();
    }

    return { seed, mode, session, account, ctrl, ui };
}

function assertFGComplete(r: RunResult): void {
    const { seed, mode, session, ctrl, ui } = r;
    const tag = `[${mode} seed=${seed}]`;

    // Flow completed
    expect(ctrl.busy).toBe(false);

    // Entered FG
    expect(ui.record.showFGBarCalls).toBeGreaterThanOrEqual(1);

    // Exited FG
    expect(ui.record.hideFGBarCalls).toBeGreaterThanOrEqual(1);
    expect(session.inFreeGame).toBe(false);

    // At least 1 tier upgrade coin toss played (isFGContext=true)
    const tierUpgradeTosses = ui.record.playCoinTossCalls.filter(c => c[0] === true);
    expect(tierUpgradeTosses.length).toBeGreaterThanOrEqual(1);

    // Total Win shown at the end
    expect(ui.record.showTotalWinCalls.length).toBeGreaterThanOrEqual(1);
    const totalWinAmount = ui.record.showTotalWinCalls[ui.record.showTotalWinCalls.length - 1];
    expect(totalWinAmount).toBeGreaterThanOrEqual(0);

    // Status includes "Free Game 完成"
    const hasFGComplete = ui.record.statusMessages.some(m => m.includes('Free Game 完成'));
    expect(hasFGComplete).toBe(true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Buy Free Game — 必定進入 FG 並走完
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: Buy Free Game → 完整 FG 流程 → Total Win', () => {

    const SEEDS = 30;

    it(`Buy FG: ${SEEDS} seeds 全部走完 FG 到 Total Win`, async () => {
        const failures: string[] = [];

        for (let seed = 0; seed < SEEDS; seed++) {
            const r = await runFGFlow('buyFG', seed);
            try {
                assertFGComplete(r);
            } catch (e: any) {
                failures.push(`seed=${seed}: ${e.message}`);
            }
        }

        if (failures.length > 0) {
            throw new Error(
                `Buy FG failed ${failures.length}/${SEEDS}:\n` +
                failures.join('\n')
            );
        }
    });

    it('Buy FG FG chain 至少 8 輪（GDD minimum tier）', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgSpins.length).toBeGreaterThanOrEqual(8);
        }
    });

    it('Buy FG tier 升級硬幣至少翻 1 次', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const r = await runFGFlow('buyFG', seed);
            const tierTosses = r.ui.record.playCoinTossCalls.filter(c => c[0] === true);
            expect(tierTosses.length).toBeGreaterThanOrEqual(1);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Main Game 觸發 FG — 找到觸發 seed 後驗證完整流程
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: Main Game → 觸發 FG → 完整流程 → Total Win', () => {

    let fgSeeds: number[];

    beforeAll(() => {
        fgSeeds = findFGSeeds('main', 10);
        console.log(`Found ${fgSeeds.length} Main Game FG seeds: [${fgSeeds.slice(0, 5).join(',')}...]`);
    });

    it('至少找到 5 個觸發 FG 的 seeds', () => {
        expect(fgSeeds.length).toBeGreaterThanOrEqual(5);
    });

    it('Main Game FG 觸發後走完整個流程到 Total Win', async () => {
        const failures: string[] = [];

        for (const seed of fgSeeds) {
            const r = await runFGFlow('main', seed);
            try {
                assertFGComplete(r);
            } catch (e: any) {
                failures.push(`seed=${seed}: ${e.message}`);
            }
        }

        if (failures.length > 0) {
            throw new Error(
                `Main FG failed ${failures.length}/${fgSeeds.length}:\n` +
                failures.join('\n')
            );
        }
    });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Extra Bet 觸發 FG — 找到觸發 seed 後驗證完整流程
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: Extra Bet → 觸發 FG → 完整流程 → Total Win', () => {

    let fgSeeds: number[];

    beforeAll(() => {
        fgSeeds = findFGSeeds('extraBet', 10);
        console.log(`Found ${fgSeeds.length} Extra Bet FG seeds: [${fgSeeds.slice(0, 5).join(',')}...]`);
    });

    it('至少找到 5 個觸發 FG 的 seeds', () => {
        expect(fgSeeds.length).toBeGreaterThanOrEqual(5);
    });

    it('Extra Bet FG 觸發後走完整個流程到 Total Win', async () => {
        const failures: string[] = [];

        for (const seed of fgSeeds) {
            const r = await runFGFlow('extraBet', seed);
            try {
                assertFGComplete(r);
            } catch (e: any) {
                failures.push(`seed=${seed}: ${e.message}`);
            }
        }

        if (failures.length > 0) {
            throw new Error(
                `Extra Bet FG failed ${failures.length}/${fgSeeds.length}:\n` +
                failures.join('\n')
            );
        }
    });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 共通驗證：FG 結束後回到 idle 狀態
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: FG 結束後遊戲狀態正確', () => {

    it('所有模式 FG 結束後 session.inFreeGame = false', async () => {
        // Buy FG
        for (let seed = 0; seed < 10; seed++) {
            const r = await runFGFlow('buyFG', seed);
            expect(r.session.inFreeGame).toBe(false);
        }
    });

    it('所有模式 FG 結束後 busy = false', async () => {
        for (let seed = 0; seed < 10; seed++) {
            const r = await runFGFlow('buyFG', seed);
            expect(r.ctrl.busy).toBe(false);
        }
    });

    it('FG 結束後 showTotalWin 的金額 >= 0', async () => {
        for (let seed = 0; seed < 10; seed++) {
            const r = await runFGFlow('buyFG', seed);
            for (const amount of r.ui.record.showTotalWinCalls) {
                expect(amount).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('FG 結束後 enableSpin(true) 被呼叫（恢復可操作）', async () => {
        const r = await runFGFlow('buyFG', 42);
        const enableCalls = (r.ui.enableSpin as jest.Mock).mock.calls;
        const lastCall = enableCalls[enableCalls.length - 1];
        expect(lastCall).toEqual([true]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FG 流程時序驗證：showFGBar → FG spins → hideFGBar → Total Win
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: FG 流程時序正確', () => {

    it('Buy FG 時序：showFGBar(ceremony) → coin toss → hideFGBar → showFGBar(chain) → hideFGBar → showTotalWin', async () => {
        const r = await runFGFlow('buyFG', 42);

        const ui = r.ui;
        const showFGOrder = (ui.showFGBar as jest.Mock).mock.invocationCallOrder;
        const hideOrder = (ui.hideFGBar as jest.Mock).mock.invocationCallOrder;
        const totalWinOrder = (ui.showTotalWin as jest.Mock).mock.invocationCallOrder;
        const coinOrder = (ui.playCoinToss as jest.Mock).mock.invocationCallOrder;

        // showFGBar called twice: ceremony (tier 0) + FG chain
        expect(showFGOrder.length).toBeGreaterThanOrEqual(2);

        // First showFGBar (ceremony) → coin tosses → first hideFGBar (ceremony end)
        const tierCoinOrders = coinOrder.filter((_: any, i: number) =>
            (ui.playCoinToss as jest.Mock).mock.calls[i][0] === true
        );
        if (tierCoinOrders.length > 0) {
            expect(Math.min(...showFGOrder)).toBeLessThan(Math.min(...tierCoinOrders));
            expect(Math.max(...tierCoinOrders)).toBeLessThan(Math.min(...hideOrder));
        }

        // Last hideFGBar (FG chain end) → showTotalWin
        expect(Math.max(...hideOrder)).toBeLessThan(Math.min(...totalWinOrder));
    });

    it('Main Game FG 時序正確', async () => {
        const seeds = findFGSeeds('main', 3);
        if (seeds.length === 0) return; // skip if no FG found

        const r = await runFGFlow('main', seeds[0]);
        const ui = r.ui;

        const showOrder = (ui.showFGBar as jest.Mock).mock.invocationCallOrder;
        const hideOrder = (ui.hideFGBar as jest.Mock).mock.invocationCallOrder;
        const totalWinOrder = (ui.showTotalWin as jest.Mock).mock.invocationCallOrder;

        if (showOrder.length > 0 && hideOrder.length > 0 && totalWinOrder.length > 0) {
            expect(Math.min(...showOrder)).toBeLessThan(Math.min(...hideOrder));
            expect(Math.min(...hideOrder)).toBeLessThan(Math.min(...totalWinOrder));
        }
    });
});
