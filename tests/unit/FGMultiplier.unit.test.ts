/**
 * FGMultiplier.unit.test.ts
 * 驗證 Free Game 倍率（×3/×7/×17/×27/×77）是否正確乘入 WIN，
 * 以及 WIN 是否隨押分等比例變化。
 *
 * 策略：
 *   - GameSession + LocalAccountService 使用真實實作
 *   - IEngineAdapter 使用 mock，固定回傳一筆已知賠率的中獎：
 *       3 連 Zeus（P1），PAYTABLE['P1'][3] = 0.17
 *   - IReelManager / IUIController 使用 jest.fn() mock
 *   - showCoinToss mock 控制 FG 循環退出時機
 *
 * 關鍵路徑（GameFlowController._cascadeFromEngineResult）：
 *   rawWin   = parseFloat((totalBet × paytable_mult).toFixed(4))
 *   stepWin  = Math.round(rawWin × fgMultiplier × 100 + ε) / 100
 *   account.credit(stepWin)
 *   session.addRoundWin(stepWin)
 */

import { GameFlowController }   from '../../assets/scripts/core/GameFlowController';
import { GameSession }           from '../../assets/scripts/core/GameSession';
import { LocalAccountService }  from '../../assets/scripts/services/LocalAccountService';
import { IEngineAdapter }       from '../../assets/scripts/contracts/IEngineAdapter';
import { IReelManager }         from '../../assets/scripts/contracts/IReelManager';
import { IUIController }        from '../../assets/scripts/contracts/IUIController';
import {
    REEL_COUNT, MAX_ROWS, BASE_ROWS,
    FG_MULTIPLIERS, PAYTABLE, LINES_BASE,
    SymType,
} from '../../assets/scripts/GameConfig';
import { SpinResponse } from '../../assets/scripts/contracts/types';
import { WinLine }     from '../../assets/scripts/SlotEngine';

const instantWait = (_sec: number) => Promise.resolve();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGrid(): SymType[][] {
    return Array.from({ length: REEL_COUNT }, () =>
        Array(MAX_ROWS).fill('L4' as SymType));
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
        init:                 jest.fn(),
    } as unknown as jest.Mocked<IReelManager>;
}

function makeUI(coinHeads: boolean): jest.Mocked<IUIController> {
    return {
        refresh:              jest.fn(),
        setStatus:            jest.fn(),
        showWinPop:           jest.fn(),
        enableSpin:           jest.fn(),
        updateExtraBetUI:     jest.fn(),
        updateTurboUI:        jest.fn(),
        updateFreeLetters:    jest.fn(),
        showBuyPanel:         jest.fn().mockResolvedValue(false),
        showCoinToss:         jest.fn().mockResolvedValue(coinHeads),
        showTotalWin:         jest.fn().mockResolvedValue(undefined),
        showThunderBlessing:  jest.fn().mockResolvedValue(undefined),
        showFGBar:            jest.fn(),
        hideFGBar:            jest.fn(),
        updateMultBar:        jest.fn(),
        showAutoSpinPanel:    jest.fn(),
        updateAutoSpinLabel:  jest.fn(),
    } as jest.Mocked<IUIController>;
}

/**
 * 建立一個固定回傳「1 個 cascade step，1 條中獎線」的 mock 引擎。
 * 中獎線的 multiplier 為 PAYTABLE 層的倍率值（非押分，需在 calcWinAmount 乘以 totalBet）。
 * 實際 rawWin 由 GameFlowController._cascadeFromEngineResult 在套用 session.totalBet 時計算。
 */
function makeEngineOneWin(paytableMultiplier: number): jest.Mocked<IEngineAdapter> {
    const win: WinLine = {
        lineIndex:   0,
        rowPath:     [0, 0, 0, 0, 0],
        symbol:      'P1' as SymType,
        count:       3,
        multiplier:  paytableMultiplier,
        cells:       [
            { reel: 0, row: 0 },
            { reel: 1, row: 0 },
            { reel: 2, row: 0 },
        ],
    };
    const response: SpinResponse = {
        grid:         makeGrid(),
        cascadeSteps: [{
            wins:      [win],
            winCells:  win.cells,
            rawWin:    0,   // 不由此決定：GameFlowController 自行重算
            rowsAfter: BASE_ROWS,
        }],
        totalWin:     0,
        fgTriggered:  false,
        finalRows:    BASE_ROWS,
        maxWinCapped: false,
        newMarks:     [],
    };
    return { spin: jest.fn().mockResolvedValue(response) } as jest.Mocked<IEngineAdapter>;
}

/**
 * 以 SAME 公式重現 GameFlowController._cascadeFromEngineResult 中的計算，
 * 用作期望值比較基準：
 *   rawWin  = parseFloat((totalBet × paytable).toFixed(4))
 *   stepWin = Math.round(rawWin × fgMult × 100 + ε) / 100
 */
function expectedStepWin(totalBet: number, paytable: number, fgMult: number): number {
    const rawWin = parseFloat((totalBet * paytable).toFixed(4));
    return Math.round(rawWin * fgMult * 100 + Number.EPSILON) / 100;
}

/**
 * 在固定的 FG 倍率等級執行一局 FG spin（showCoinToss 立即回傳 false → 退出）
 * 回傳 session.roundWin
 */
async function runOneFGSpin(opts: {
    multIndex:   number;   // 0=×3, 1=×7, 2=×17, 3=×27, 4=×77
    totalBet:    number;   // 以 25 條線為基礎
    paytable?:   number;   // 預設 PAYTABLE['P1'][3] = 0.17
}): Promise<{ actualWin: number; balance: number }> {
    const { multIndex, totalBet, paytable = PAYTABLE['P1'][3] } = opts;

    const session = new GameSession();
    const account = new LocalAccountService(1000);

    session.setBetPerLine(totalBet / LINES_BASE);
    session.computeTotalBet();

    // 直接進入 FG，設定目標倍率等級
    session.enterFreeGame(multIndex);
    session.resetRound();

    const ctrl = new GameFlowController(
        session, account,
        makeEngineOneWin(paytable),
        makeReels(),
        makeUI(false),   // tails → 退出 FG
        instantWait,
    );

    const balBefore = account.getBalance();
    await ctrl.freeGameLoop();

    return {
        actualWin: session.roundWin,
        balance:   parseFloat((account.getBalance() - balBefore).toFixed(4)),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 各 FG 倍率等級 × WIN 金額精確驗證
// ─────────────────────────────────────────────────────────────────────────────

describe('FG 倍率 × WIN 金額精確驗證（押分 0.25，3連 Zeus = paytable 0.17）', () => {

    const totalBet = 0.25;
    const paytable = PAYTABLE['P1'][3]; // 0.17

    it.each([
        [0, '×3',  FG_MULTIPLIERS[0]],   // 3
        [1, '×7',  FG_MULTIPLIERS[1]],   // 7
        [2, '×17', FG_MULTIPLIERS[2]],   // 17
        [3, '×27', FG_MULTIPLIERS[3]],   // 27
        [4, '×77', FG_MULTIPLIERS[4]],   // 77
    ])('FG [multIndex=%i] %s : roundWin = %.4f × %i', async (multIndex, _label, fgMult) => {
        const { actualWin } = await runOneFGSpin({ multIndex, totalBet, paytable });
        const expected = expectedStepWin(totalBet, paytable, fgMult);

        // 精確比對（同一公式重算）
        expect(actualWin).toBe(expected);

        // 可讀性說明：expected 應為 rawWin × fgMult 的整數分約值
        const rawWin = parseFloat((totalBet * paytable).toFixed(4));
        expect(actualWin).toBeGreaterThan(rawWin); // 倍率效果：FG win > 原始 win
    });

    it('FG ×77 的 WIN 比 ×3 大約 25 倍（理論值 77/3 ≈ 25.67，含 rounding 誤差）', async () => {
        const { actualWin: win3  } = await runOneFGSpin({ multIndex: 0, totalBet, paytable });
        const { actualWin: win77 } = await runOneFGSpin({ multIndex: 4, totalBet, paytable });
        const ratio = win77 / win3;
        // 理論比 77/3 = 25.67；win3 捨入後偏大導致 ratio 略低，允許 [24, 27]
        expect(ratio).toBeGreaterThan(24);
        expect(ratio).toBeLessThan(27);
    });

    it('account.credit(stepWin) 金額與 session.roundWin 一致', async () => {
        const { actualWin, balance } = await runOneFGSpin({ multIndex: 0, totalBet, paytable });
        // balance 增加量 = credit(stepWin) = session.roundWin
        expect(balance).toBe(actualWin);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. WIN 隨押分等比例變化
// ─────────────────────────────────────────────────────────────────────────────

describe('WIN 隨押分等比例變化（FG ×3，3連 Zeus）', () => {

    const paytable  = PAYTABLE['P1'][3]; // 0.17
    const multIndex = 0;                 // ×3
    const fgMult    = FG_MULTIPLIERS[0]; // 3

    it.each([
        [0.25],
        [0.50],
        [1.00],
        [2.00],
        [5.00],
        [10.00],
    ])('押分 %.2f → WIN = %.4f × %i', async (totalBet) => {
        const { actualWin } = await runOneFGSpin({ multIndex, totalBet, paytable });
        const expected = expectedStepWin(totalBet, paytable, fgMult);
        // 精確比對（同一公式）
        expect(actualWin).toBe(expected);
    });

    it('押分加倍，WIN 加倍（bet=0.25 vs 0.50）', async () => {
        const { actualWin: win25 } = await runOneFGSpin({ multIndex, totalBet: 0.25, paytable });
        const { actualWin: win50 } = await runOneFGSpin({ multIndex, totalBet: 0.50, paytable });
        // 0.50 = 2 × 0.25，WIN 應精確加倍
        expect(win50).toBe(win25 * 2);
    });

    it('押分 ×4，WIN ×4（bet=0.25 vs 1.00）', async () => {
        const { actualWin: win25  } = await runOneFGSpin({ multIndex, totalBet: 0.25, paytable });
        const { actualWin: win100 } = await runOneFGSpin({ multIndex, totalBet: 1.00, paytable });
        // 使用 expectedStepWin 確認兩者均正確（因 rounding 各自四捨五入）
        const exp25  = expectedStepWin(0.25, paytable, fgMult);
        const exp100 = expectedStepWin(1.00, paytable, fgMult);
        expect(win25).toBe(exp25);
        expect(win100).toBe(exp100);
        // 比率在 [3.9, 4.1] 範圍內（rounding 差最多 ±0.01）
        expect(win100 / win25).toBeGreaterThan(3.9);
        expect(win100 / win25).toBeLessThan(4.1);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 連續 FG — 依序經歷 ×3 → ×7 → ×17 → ×27 → ×77 全程累積
// ─────────────────────────────────────────────────────────────────────────────

describe('完整 FG 序列：×3 → ×7 → ×17 → ×27 → ×77', () => {

    it('4 次正面後再反面，roundWin = Σ(paytable × bet × mult) for all 5 levels', async () => {
        const totalBet = 0.25;
        const paytable = PAYTABLE['P1'][3]; // 0.17

        const session = new GameSession();
        const account = new LocalAccountService(1000);
        session.setBetPerLine(totalBet / LINES_BASE);
        session.computeTotalBet();

        session.enterFreeGame(0); // 從 ×3 開始
        session.resetRound();

        const ui = makeUI(false); // base: return false
        // 前 4 次回 true（依序升至 ×7, ×17, ×27, ×77），第 5 次回 false（退出）
        ui.showCoinToss
            .mockResolvedValueOnce(true)   // ×3 → 升至 ×7
            .mockResolvedValueOnce(true)   // ×7 → 升至 ×17
            .mockResolvedValueOnce(true)   // ×17 → 升至 ×27
            .mockResolvedValueOnce(true)   // ×27 → 升至 ×77
            .mockResolvedValueOnce(false); // ×77 → 退出

        const ctrl = new GameFlowController(
            session, account,
            makeEngineOneWin(paytable),
            makeReels(),
            ui,
            instantWait,
        );

        await ctrl.freeGameLoop();

        // 每個等級各執行一次 spin，累積 WIN
        const expected = FG_MULTIPLIERS.reduce((sum, mult) =>
            sum + expectedStepWin(totalBet, paytable, mult), 0);

        expect(session.roundWin).toBeCloseTo(expected, 2);
    });

    it('各倍率層 WIN 嚴格遞增：win(×7) > win(×3)，以此類推', async () => {
        const wins: number[] = [];
        const totalBet = 0.25;
        const paytable = PAYTABLE['P1'][3];

        for (let multIndex = 0; multIndex < FG_MULTIPLIERS.length; multIndex++) {
            const { actualWin } = await runOneFGSpin({ multIndex, totalBet, paytable });
            wins.push(actualWin);
        }

        // [×3, ×7, ×17, ×27, ×77] — 每個應大於前一個
        for (let i = 1; i < wins.length; i++) {
            expect(wins[i]).toBeGreaterThan(wins[i - 1]);
        }
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. FG 倍率 × 不同賠率符號
// ─────────────────────────────────────────────────────────────────────────────

describe('FG ×3 在不同賠率符號的 WIN', () => {

    const multIndex = 0; // ×3
    const fgMult    = FG_MULTIPLIERS[0];
    const totalBet  = 0.25;

    // 測試每個非 SC/Wild 符號的 3 連賠率
    const cases: [SymType, number][] = [
        ['P1', PAYTABLE['P1'][3]], // 0.17
        ['P2', PAYTABLE['P2'][3]], // 0.11
        ['P3', PAYTABLE['P3'][3]], // 0.09
        ['P4', PAYTABLE['P4'][3]], // 0.07
        ['L1', PAYTABLE['L1'][3]], // 0.03
        ['L2', PAYTABLE['L2'][3]], // 0.03
        ['L3', PAYTABLE['L3'][3]], // 0.02
        ['L4', PAYTABLE['L4'][3]], // 0.02
    ];

    it.each(cases)('符號 %s（paytable=%.2f）× ×3 WIN 正確', async (sym, paytable) => {
        const { actualWin } = await runOneFGSpin({ multIndex, totalBet, paytable });
        const expected = expectedStepWin(totalBet, paytable, fgMult);
        expect(actualWin).toBe(expected);
        expect(actualWin).toBeGreaterThan(0);
    });

});
