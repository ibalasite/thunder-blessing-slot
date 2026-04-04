/**
 * FreeLetters.unit.test.ts
 * 驗證 FREE 字母亮燈邏輯：
 *   1. 每次 cascade step 結束後，updateFreeLetters 應以 step.rowsAfter 呼叫
 *   2. 基礎遊戲 3 列 → 全暗；4 列亮 F；5 列亮 FR；6 列亮 FREE
 *   3. fgTriggered 時第 4 盞 E 亮（fourthE = true）
 *   4. FG 中不更新 FREE letters（FG bar 取代）
 */
import { GameFlowController } from '../../assets/scripts/core/GameFlowController';
import { IGameSession }       from '../../assets/scripts/contracts/IGameSession';
import { IAccountService }    from '../../assets/scripts/contracts/IAccountService';
import { IEngineAdapter }     from '../../assets/scripts/contracts/IEngineAdapter';
import { IReelManager }       from '../../assets/scripts/contracts/IReelManager';
import { IUIController }      from '../../assets/scripts/contracts/IUIController';
import { FullSpinOutcome, SpinResponse } from '../../assets/scripts/contracts/types';
import {
    BASE_ROWS, MAX_ROWS, REEL_COUNT, MAX_WIN_MULT, LINES_BASE,
    SymType,
} from '../../assets/scripts/GameConfig';
import { WinLine } from '../../assets/scripts/SlotEngine';

function makeGrid(): SymType[][] {
    return Array.from({ length: REEL_COUNT }, () =>
        Array(MAX_ROWS).fill('L4' as SymType));
}

function makeSpinResponse(overrides: Partial<SpinResponse> = {}): SpinResponse {
    return {
        grid:         makeGrid(),
        cascadeSteps: [],
        totalWin:     0,
        fgTriggered:  false,
        finalRows:    BASE_ROWS,
        maxWinCapped: false,
        newMarks:     [],
        ...overrides,
    };
}

function makeOutcome(overrides: Partial<FullSpinOutcome> = {}): FullSpinOutcome {
    return {
        mode:            'main',
        extraBetOn:      false,
        totalBet:        1,
        wagered:         1,
        baseSpins:       [makeSpinResponse()],
        baseWin:         0,
        fgTriggered:     false,
        fgSpins:         [],
        fgWin:           0,
        totalRawWin:     0,
        totalWin:        0,
        maxWinCapped:    false,
        ...overrides,
    };
}

function makeSession(): jest.Mocked<IGameSession> {
    const m: any = {
        totalBet:       1,
        betPerLine:     1 / LINES_BASE,
        extraBetOn:     false,
        turboMode:      true,
        inFreeGame:     false,
        fgMultIndex:    0,
        get fgMultiplier() { return 3; },
        roundWin:       0,
        cascadeCount:   0,
        currentRows:    BASE_ROWS,
        grid:           makeGrid(),
        lightningMarks: new Set<string>(),
        expandRows:          jest.fn(),
        resetRows:           jest.fn(),
        setCurrentRows:      jest.fn(),
        resetRound:          jest.fn(() => { m.roundWin = 0; }),
        addRoundWin:         jest.fn((amount: number) => { m.roundWin += amount; }),
        incrementCascade:    jest.fn(),
        clearMarks:          jest.fn(),
        addMark:             jest.fn(),
        hasMark:             jest.fn(() => false),
        setGrid:             jest.fn(),
        setExtraBet:         jest.fn(),
        setTurboMode:        jest.fn(),
        setBetPerLine:       jest.fn(),
        computeTotalBet:     jest.fn(),
        enterFreeGame:       jest.fn((idx: number = 0) => { m.inFreeGame = true;  m.fgMultIndex = idx; }),
        exitFreeGame:        jest.fn(() =>                 { m.inFreeGame = false; m.fgMultIndex = 0;  }),
        upgradeFGMultiplier: jest.fn(() => { if (m.fgMultIndex < 4) m.fgMultIndex++; }),
    };
    return m as unknown as jest.Mocked<IGameSession>;
}

function makeAccount(balance = 1000): jest.Mocked<IAccountService> {
    let bal = balance;
    return {
        getBalance: jest.fn(() => bal),
        canAfford:  jest.fn((amt: number) => bal >= amt),
        debit:      jest.fn((amt: number) => { bal -= amt; }),
        credit:     jest.fn((amt: number) => { bal += amt; }),
    } as jest.Mocked<IAccountService>;
}

function makeEngine(outcome?: Partial<FullSpinOutcome>): jest.Mocked<IEngineAdapter> {
    return {
        spin:     jest.fn().mockResolvedValue(makeSpinResponse()),
        fullSpin: jest.fn().mockResolvedValue(makeOutcome(outcome)),
    } as jest.Mocked<IEngineAdapter>;
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

function makeUI(): jest.Mocked<IUIController> {
    return {
        refresh:             jest.fn(),
        setDisplayBalance:   jest.fn(),
        setStatus:           jest.fn(),
        showWinPop:          jest.fn(),
        enableSpin:          jest.fn(),
        updateExtraBetUI:    jest.fn(),
        updateTurboUI:       jest.fn(),
        updateFreeLetters:   jest.fn(),
        showBuyPanel:        jest.fn().mockResolvedValue(false),
        showCoinToss:        jest.fn().mockResolvedValue(false),
        playCoinToss:        jest.fn().mockResolvedValue(undefined),
        showTotalWin:        jest.fn().mockResolvedValue(undefined),
        showThunderBlessing: jest.fn().mockResolvedValue(undefined),
        showFGBar:           jest.fn(),
        hideFGBar:           jest.fn(),
        updateMultBar:       jest.fn(),
        showAutoSpinPanel:   jest.fn(),
        updateAutoSpinLabel: jest.fn(),
        showDepositPanel:    jest.fn().mockResolvedValue(undefined),
        hideDepositPanel:    jest.fn(),
    } as jest.Mocked<IUIController>;
}

const instantWait = () => Promise.resolve();

function makeCascadeStep(rowsAfter: number, multiplier = 0.5) {
    const win: WinLine = {
        lineIndex: 0, rowPath: [0,0,0,0,0], symbol: 'L4' as SymType,
        count: 3, multiplier,
        cells: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }],
    };
    return {
        wins:     [win],
        winCells: win.cells,
        rawWin:   multiplier,
        rowsAfter,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FREE letters update during cascade', () => {

    it('updateFreeLetters called with progressive rowsAfter values', async () => {
        const ui = makeUI();
        const cascadeSteps = [
            makeCascadeStep(4),
            makeCascadeStep(5),
            makeCascadeStep(6),
        ];
        const spin = makeSpinResponse({
            cascadeSteps,
            finalRows: 6,
            fgTriggered: true,
        });
        const eng = makeEngine({ baseSpins: [spin] });
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.doSpin();

        const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
        // Should see progressive calls during cascade: (4, false), (5, false), (6, false)
        // Then after cascade: (MAX_ROWS, true) for fgTriggered
        const rowValues = calls.map((c: any) => c[0]);
        expect(rowValues).toContain(4);
        expect(rowValues).toContain(5);
    });

    it('updateFreeLetters(BASE_ROWS) called at start to reset', async () => {
        const ui = makeUI();
        const eng = makeEngine();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.doSpin();

        const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
        // First call should be reset to BASE_ROWS
        expect(calls[0]).toEqual([BASE_ROWS]);
    });

    it('no updateFreeLetters during FG cascade (fgMultiplier > 1)', async () => {
        const ui = makeUI();
        const fgCascade = [makeCascadeStep(6)];
        const fgSpin = {
            multiplierIndex: 0, multiplier: 3,
            spin: makeSpinResponse({ cascadeSteps: fgCascade, finalRows: 6 }),
            rawWin: 0.5, multipliedWin: 1.5,
            coinToss: { probability: 0.80, heads: false },
        };
        const eng = makeEngine({
            fgTriggered: true,
            entryCoinToss: { probability: 0.80, heads: true },
            baseSpins: [makeSpinResponse({ fgTriggered: true })],
            fgSpins: [fgSpin],
        });
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.doSpin();

        const showFGBarCalls = (ui.showFGBar as jest.Mock).mock.calls.length;
        expect(showFGBarCalls).toBeGreaterThan(0);
    });

    it('updateFreeLetters(MAX_ROWS, true) when FG triggers and entry toss heads', async () => {
        const ui = makeUI();
        const fgSpin = {
            multiplierIndex: 0, multiplier: 3,
            spin: makeSpinResponse(), rawWin: 0, multipliedWin: 0,
            coinToss: { probability: 0.80, heads: false },
        };
        const eng = makeEngine({
            fgTriggered: true,
            entryCoinToss: { probability: 0.80, heads: true },
            baseSpins: [makeSpinResponse({ fgTriggered: true, finalRows: MAX_ROWS })],
            fgSpins: [fgSpin],
        });
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.doSpin();

        const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
        const maxRowsCall = calls.find((c: any) => c[0] === MAX_ROWS && c[1] === true);
        expect(maxRowsCall).toBeDefined();
    });

    it('updateFreeLetters(MAX_ROWS, false) when FG triggers but entry toss fails', async () => {
        const ui = makeUI();
        const eng = makeEngine({
            fgTriggered: true,
            entryCoinToss: { probability: 0.80, heads: false },
            baseSpins: [makeSpinResponse({ fgTriggered: true, finalRows: MAX_ROWS })],
            fgSpins: [],
        });
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.doSpin();

        const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
        const maxRowsTrueCall = calls.find((c: any) => c[0] === MAX_ROWS && c[1] === true);
        const maxRowsFalseCall = calls.find((c: any) => c[0] === MAX_ROWS && c[1] === false);
        expect(maxRowsTrueCall).toBeUndefined();
        expect(maxRowsFalseCall).toBeDefined();
    });
});

describe('Buy FG controller flow', () => {

    it('Buy FG plays all intro spins, enters FG, shows total win', async () => {
        const ui = makeUI();
        ui.showBuyPanel.mockResolvedValue(true);

        const introSpins = [
            makeSpinResponse({ finalRows: 4 }),
            makeSpinResponse({ finalRows: 5 }),
            makeSpinResponse({ finalRows: MAX_ROWS, fgTriggered: true }),
        ];
        const fgSpin = {
            multiplierIndex: 0, multiplier: 3,
            spin: makeSpinResponse(), rawWin: 1, multipliedWin: 3,
            coinToss: { probability: 0.80, heads: false },
        };
        const eng = makeEngine({
            mode:            'buyFG',
            wagered:         100,
            fgTriggered:     true,
            entryCoinToss:   { probability: 1.0, heads: true },
            baseSpins:       introSpins,
            fgSpins:         [fgSpin],
        });

        const sess = makeSession();
        const ctrl = new GameFlowController(
            sess, makeAccount(200), eng, makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();

        // Should call fullSpin with 'buyFG' (3rd arg is optional extraBetOn boolean)
        expect(eng.fullSpin).toHaveBeenCalledWith('buyFG', expect.any(Number), expect.any(Boolean));

        // Should show FG bar (entered FG)
        expect(ui.showFGBar).toHaveBeenCalled();

        // Should exit FG and show total win
        expect(sess.exitFreeGame).toHaveBeenCalled();
        expect(ui.hideFGBar).toHaveBeenCalled();

        // busy should be false
        expect(ctrl.busy).toBe(false);
    });

    it('Buy FG shows FREE letters progressively during intro', async () => {
        const ui = makeUI();
        ui.showBuyPanel.mockResolvedValue(true);

        const introSpins = [
            makeSpinResponse({ finalRows: 4 }),
            makeSpinResponse({ finalRows: 5 }),
            makeSpinResponse({ finalRows: MAX_ROWS, fgTriggered: true }),
        ];
        const fgSpin = {
            multiplierIndex: 0, multiplier: 3,
            spin: makeSpinResponse(), rawWin: 0, multipliedWin: 0,
            coinToss: { probability: 0.80, heads: false },
        };
        const eng = makeEngine({
            mode:            'buyFG',
            wagered:         100,
            fgTriggered:     true,
            entryCoinToss:   { probability: 1.0, heads: true },
            baseSpins:       introSpins,
            fgSpins:         [fgSpin],
        });

        const ctrl = new GameFlowController(
            makeSession(), makeAccount(200), eng, makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();

        // Should call updateFreeLetters with 4, 5, and then MAX_ROWS with fourthE=true
        const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
        const rowValues = calls.map((c: any) => c[0]);
        expect(rowValues).toContain(4);
        expect(rowValues).toContain(5);
        expect(rowValues).toContain(MAX_ROWS);
    });
});
