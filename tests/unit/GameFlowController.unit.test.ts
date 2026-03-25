/**
 * GameFlowController.unit.test.ts
 * 測試 GameFlowController 的純遊戲流程邏輯（Atomic Spin 架構）
 */
import { GameFlowController } from '../../assets/scripts/core/GameFlowController';
import { IGameSession }       from '../../assets/scripts/contracts/IGameSession';
import { IAccountService }    from '../../assets/scripts/contracts/IAccountService';
import { IEngineAdapter }     from '../../assets/scripts/contracts/IEngineAdapter';
import { IReelManager }       from '../../assets/scripts/contracts/IReelManager';
import { IUIController }      from '../../assets/scripts/contracts/IUIController';
import { FullSpinOutcome, SpinResponse } from '../../assets/scripts/contracts/types';
import { BASE_ROWS, MAX_ROWS, REEL_COUNT, MAX_WIN_MULT, LINES_BASE,
         BUY_COST_MULT, EXTRA_BET_MULT } from '../../assets/scripts/GameConfig';
import { SymType } from '../../assets/scripts/GameConfig';
import { WinLine } from '../../assets/scripts/SlotEngine';

// ─── Mock factories ───────────────────────────────────────────────────────────

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
        totalBet:        1,
        wagered:         1,
        modePayoutScale: 1,
        baseSpins:       [makeSpinResponse()],
        baseWin:         0,
        tierUpgrades:    [],
        fgSpins:         [],
        fgWin:           0,
        totalRawWin:     0,
        totalWin:        0,
        maxWinCapped:    false,
        ...overrides,
    };
}

function makeSession(overrides: Partial<IGameSession> = {}): jest.Mocked<IGameSession> {
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
    Object.assign(m, overrides);
    return m as unknown as jest.Mocked<IGameSession>;
}

function makeAccount(balance = 1000): jest.Mocked<IAccountService> {
    let bal = balance;
    return {
        getBalance:  jest.fn(() => bal),
        canAfford:   jest.fn((amt: number) => bal >= amt),
        debit:       jest.fn((amt: number) => { bal -= amt; }),
        credit:      jest.fn((amt: number) => { bal += amt; }),
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
        spinWithGrid:        jest.fn().mockResolvedValue(undefined),
        cascade:             jest.fn().mockResolvedValue(undefined),
        flashWinCells:       jest.fn().mockResolvedValue(undefined),
        refreshAllMarks:     jest.fn(),
        updateGrid:          jest.fn(),
        reset:               jest.fn(),
        previewExtraBet:     jest.fn(),
        clearPreviewExtraBet: jest.fn(),
    } as jest.Mocked<IReelManager>;
}

function makeUI(): jest.Mocked<IUIController> {
    return {
        refresh:            jest.fn(),
        setDisplayBalance:  jest.fn(),
        setStatus:          jest.fn(),
        showWinPop:         jest.fn(),
        enableSpin:         jest.fn(),
        updateExtraBetUI:   jest.fn(),
        updateTurboUI:      jest.fn(),
        updateFreeLetters:  jest.fn(),
        showBuyPanel:       jest.fn().mockResolvedValue(false),
        showCoinToss:       jest.fn().mockResolvedValue(false),
        playCoinToss:       jest.fn().mockResolvedValue(undefined),
        showTotalWin:       jest.fn().mockResolvedValue(undefined),
        showThunderBlessing: jest.fn().mockResolvedValue(undefined),
        showFGBar:          jest.fn(),
        hideFGBar:          jest.fn(),
        updateMultBar:      jest.fn(),
        showAutoSpinPanel:  jest.fn(),
        updateAutoSpinLabel: jest.fn(),
    } as jest.Mocked<IUIController>;
}

const instantWait = (_sec: number) => Promise.resolve();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GameFlowController', () => {

    it('can be instantiated with 5 deps', () => {
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        expect(ctrl).toBeDefined();
        expect(ctrl.busy).toBe(false);
        expect(ctrl.autoSpinCount).toBe(0);
    });

    // ── doSpin (atomic) ───────────────────────────────────────────────

    it('doSpin calls engine.fullSpin with mode and baseBet', async () => {
        const eng  = makeEngine();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(eng.fullSpin).toHaveBeenCalledWith('main', expect.any(Number));
    });

    it('doSpin uses extraBet mode when extraBetOn=true', async () => {
        const eng  = makeEngine({ mode: 'extraBet', wagered: 3 });
        const sess = makeSession({ extraBetOn: true });
        const ctrl = new GameFlowController(
            sess, makeAccount(), eng, makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(eng.fullSpin).toHaveBeenCalledWith('extraBet', expect.any(Number));
    });

    it('doSpin debits outcome.wagered from account', async () => {
        const acc  = makeAccount(100);
        const eng  = makeEngine({ wagered: 1 });
        const ctrl = new GameFlowController(
            makeSession(), acc, eng, makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(acc.debit).toHaveBeenCalledWith(1);
    });

    it('doSpin sets busy=false after completion', async () => {
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(ctrl.busy).toBe(false);
    });

    it('doSpin shows "餘額不足" if canAfford returns false', async () => {
        const acc = makeAccount(0);
        const ui  = makeUI();
        const ctrl = new GameFlowController(
            makeSession(), acc, makeEngine(), makeReels(), ui, instantWait);
        await ctrl.doSpin();
        expect(ui.setStatus).toHaveBeenCalledWith('餘額不足！', '#ff4444');
    });

    it('doSpin calls reels.spinWithGrid with base spin grid', async () => {
        const grid  = makeGrid();
        const eng   = makeEngine({ baseSpins: [makeSpinResponse({ grid })] });
        const reels = makeReels();
        const ctrl  = new GameFlowController(
            makeSession(), makeAccount(), eng, reels, makeUI(), instantWait);
        await ctrl.doSpin();
        expect(reels.spinWithGrid).toHaveBeenCalledWith(grid);
    });

    it('doSpin calls session.resetRound', async () => {
        const sess = makeSession();
        const ctrl = new GameFlowController(
            sess, makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(sess.resetRound).toHaveBeenCalled();
    });

    it('doSpin calls session.clearMarks', async () => {
        const sess = makeSession();
        const ctrl = new GameFlowController(
            sess, makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(sess.clearMarks).toHaveBeenCalled();
    });

    it('doSpin calls enableSpin(false) then enableSpin(true)', async () => {
        const ui   = makeUI();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), ui, instantWait);
        await ctrl.doSpin();
        const calls = (ui.enableSpin as jest.Mock).mock.calls;
        expect(calls[0]).toEqual([false]);
        expect(calls[calls.length - 1]).toEqual([true]);
    });

    // ── doSpin with cascade steps ──────────────────────────────────

    it('doSpin processes cascade steps and credits winnings', async () => {
        const cascadeSteps = [{
            wins:     [{ multiplier: 5, cells: [{ reel: 0, row: 0 }], lineIndex: 0,
                         rowPath: [0], symbol: 'L4' as SymType, count: 3 } as WinLine],
            winCells: [{ reel: 0, row: 0 }],
            rawWin:   5,
            rowsAfter: BASE_ROWS,
        }];
        const acc  = makeAccount(100);
        const eng  = makeEngine({
            baseSpins: [makeSpinResponse({ cascadeSteps, totalWin: 5 })],
        });
        const reels = makeReels();
        const ctrl = new GameFlowController(
            makeSession(), acc, eng, reels, makeUI(), instantWait);
        await ctrl.doSpin();
        expect(reels.flashWinCells).toHaveBeenCalled();
        expect(acc.credit).toHaveBeenCalled();
    });

    // ── Atomic FG chain playback ──────────────────────────────────

    it('doSpin plays tier upgrade coin toss then FG chain when FG triggered', async () => {
        const ui = makeUI();
        const fgSpin = {
            multiplierIndex: 0, multiplier: 3,
            spin: makeSpinResponse(), rawWin: 0, multipliedWin: 0,
            coinToss: { probability: 0, heads: false },
        };
        const eng = makeEngine({
            tierUpgrades: [{ probability: 0.15, heads: false }],
            fgTier: { tierIndex: 0, rounds: 8, multiplier: 3 },
            fgSpins: [fgSpin],
            baseSpins: [makeSpinResponse({ fgTriggered: true })],
        });
        const sess = makeSession();
        const ctrl = new GameFlowController(
            sess, makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.doSpin();
        expect(sess.enterFreeGame).toHaveBeenCalledWith(0);
        expect(ui.showFGBar).toHaveBeenCalled();
        expect(ui.playCoinToss).toHaveBeenCalledTimes(1);
        expect(ui.playCoinToss).toHaveBeenCalledWith(true, false);
        expect(sess.exitFreeGame).toHaveBeenCalled();
    });

    // ── onBuyFreeGame (atomic) ────────────────────────────────────

    it('onBuyFreeGame does nothing if busy=true', async () => {
        const ui  = makeUI();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), ui, instantWait);
        ctrl.busy = true;
        await ctrl.onBuyFreeGame();
        expect(ui.showBuyPanel).not.toHaveBeenCalled();
    });

    it('onBuyFreeGame does nothing if player cancels buy panel', async () => {
        const ui  = makeUI();
        ui.showBuyPanel.mockResolvedValue(false);
        const eng = makeEngine();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();
        expect(eng.fullSpin).not.toHaveBeenCalled();
    });

    it('onBuyFreeGame shows 餘額不足 when balance too low', async () => {
        const ui  = makeUI();
        ui.showBuyPanel.mockResolvedValue(true);
        const eng = makeEngine({ mode: 'buyFG', wagered: 100 });
        const acc = makeAccount(50);
        const ctrl = new GameFlowController(
            makeSession(), acc, eng, makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();
        expect(ui.setStatus).toHaveBeenCalledWith('餘額不足！', '#ff4444');
    });

    it('onBuyFreeGame debits wagered on confirm', async () => {
        const ui  = makeUI();
        ui.showBuyPanel.mockResolvedValue(true);
        const eng = makeEngine({ mode: 'buyFG', wagered: 100 });
        const acc = makeAccount(200);
        const ctrl = new GameFlowController(
            makeSession(), acc, eng, makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();
        expect(acc.debit).toHaveBeenCalledWith(100);
    });

    // ── autoSpinCount ───────────────────────────────────────────────

    it('autoSpinCount decrements after each spin', async () => {
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        ctrl.autoSpinCount = 2;
        await ctrl.doSpin();
        await new Promise(r => setTimeout(r, 10));
        expect(ctrl.autoSpinCount).toBe(0);
    });
});
