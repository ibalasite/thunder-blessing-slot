/**
 * GameFlowController.unit.test.ts
 * 測試 GameFlowController 的純遊戲流程邏輯（所有 Cocos 依賴以 jest.fn() mock）
 */
import { GameFlowController } from '../../assets/scripts/core/GameFlowController';
import { IGameSession }       from '../../assets/scripts/contracts/IGameSession';
import { IAccountService }    from '../../assets/scripts/contracts/IAccountService';
import { IEngineAdapter }     from '../../assets/scripts/contracts/IEngineAdapter';
import { IReelManager }       from '../../assets/scripts/contracts/IReelManager';
import { IUIController }      from '../../assets/scripts/contracts/IUIController';
import { SpinResponse }       from '../../assets/scripts/contracts/types';
import { BASE_ROWS, MAX_ROWS, REEL_COUNT, MAX_WIN_MULT } from '../../assets/scripts/GameConfig';
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

function makeSession(overrides: Partial<IGameSession> = {}): jest.Mocked<IGameSession> {
    const m: any = {
        totalBet:       1,
        betPerLine:     0.0044,
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
        resetRound:          jest.fn((this_: any) => { m.roundWin = 0; }),
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

function makeEngine(res?: Partial<SpinResponse>): jest.Mocked<IEngineAdapter> {
    return {
        spin: jest.fn().mockResolvedValue(makeSpinResponse(res)),
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
        setStatus:          jest.fn(),
        showWinPop:         jest.fn(),
        enableSpin:         jest.fn(),
        updateExtraBetUI:   jest.fn(),
        updateTurboUI:      jest.fn(),
        updateFreeLetters:  jest.fn(),
        showBuyPanel:       jest.fn().mockResolvedValue(false),
        showCoinToss:       jest.fn().mockResolvedValue(false),
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

    // ── constructor ──────────────────────────────────────────────────────

    it('can be instantiated with 5 deps', () => {
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        expect(ctrl).toBeDefined();
        expect(ctrl.busy).toBe(false);
        expect(ctrl.autoSpinCount).toBe(0);
    });

    // ── doSpin ───────────────────────────────────────────────────────────

    it('doSpin calls engine.spin once', async () => {
        const eng  = makeEngine();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(eng.spin).toHaveBeenCalledTimes(1);
    });

    it('doSpin debits totalBet from account', async () => {
        const acc  = makeAccount(100);
        const ctrl = new GameFlowController(
            makeSession(), acc, makeEngine(), makeReels(), makeUI(), instantWait);
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

    it('doSpin does not call engine.spin if balance insufficient', async () => {
        const eng = makeEngine();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(0), eng, makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(eng.spin).not.toHaveBeenCalled();
    });

    it('doSpin calls reels.spinWithGrid with engine result grid', async () => {
        const grid  = makeGrid();
        const eng   = makeEngine({ grid });
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

    it('doSpin calls session.clearMarks when not in FreeGame', async () => {
        const sess = makeSession({ inFreeGame: false });
        const ctrl = new GameFlowController(
            sess, makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(sess.clearMarks).toHaveBeenCalled();
    });

    it('doSpin does NOT call clearMarks when in FreeGame', async () => {
        const sess = makeSession({ inFreeGame: true });
        const ctrl = new GameFlowController(
            sess, makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        await ctrl.doSpin();
        expect(sess.clearMarks).not.toHaveBeenCalled();
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

    it('doSpin calls ui.refresh', async () => {
        const ui   = makeUI();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), ui, instantWait);
        await ctrl.doSpin();
        expect(ui.refresh).toHaveBeenCalled();
    });

    // ── doSpin with cascade steps ─────────────────────────────────────

    it('doSpin processes cascade steps and credits winnings', async () => {
        const cascadeSteps = [{
            wins:     [{ multiplier: 5, cells: [{ reel: 0, row: 0 }], lineIndex: 0, rowPath: [0], symbol: 'L4' as SymType, count: 3 } as WinLine],
            winCells: [{ reel: 0, row: 0 }],
            rawWin:   5,
            rowsAfter: BASE_ROWS,
        }];
        const acc  = makeAccount(100);
        const eng  = makeEngine({ cascadeSteps, totalWin: 5 });
        const reels = makeReels();
        const ctrl = new GameFlowController(
            makeSession(), acc, eng, reels, makeUI(), instantWait);
        await ctrl.doSpin();
        expect(reels.flashWinCells).toHaveBeenCalled();
        expect(acc.credit).toHaveBeenCalled();
    });

    // ── doCoinTossAndMaybeFG ─────────────────────────────────────────

    it('doCoinTossAndMaybeFG calls ui.showCoinToss with isFGContext=false', async () => {
        const ui   = makeUI();
        ui.showCoinToss.mockResolvedValue(false);
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), ui, instantWait);
        await ctrl.doCoinTossAndMaybeFG(false);
        expect(ui.showCoinToss).toHaveBeenCalledWith(false, expect.any(Number));
    });

    it('doCoinTossAndMaybeFG(guaranteed=true) passes prob=1.0', async () => {
        const ui   = makeUI();
        ui.showCoinToss.mockResolvedValue(false);
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), ui, instantWait);
        await ctrl.doCoinTossAndMaybeFG(true);
        expect(ui.showCoinToss).toHaveBeenCalledWith(false, 1.0);
    });

    it('doCoinTossAndMaybeFG tails: shows fail message, does not enter FG', async () => {
        const ui   = makeUI();
        ui.showCoinToss.mockResolvedValue(false);  // tails
        const sess = makeSession();
        const ctrl = new GameFlowController(
            sess, makeAccount(), makeEngine(), makeReels(), ui, instantWait);
        await ctrl.doCoinTossAndMaybeFG(false);
        // inFreeGame was not set
        expect(sess.inFreeGame).toBe(false);
        expect(ui.setStatus).toHaveBeenCalledWith(expect.stringContaining('反面'), '#ff8888');
    });

    it('doCoinTossAndMaybeFG heads: enters FreeGame', async () => {
        const ui   = makeUI();
        ui.showCoinToss
            .mockResolvedValueOnce(true)   // entry heads
            .mockResolvedValue(false);     // FG coin toss → tails → exit
        const sess = makeSession();
        const eng  = makeEngine();
        const ctrl = new GameFlowController(
            sess, makeAccount(1000), eng, makeReels(), ui, instantWait);
        await ctrl.doCoinTossAndMaybeFG(false);
        // enterFreeGame was called: sess.inFreeGame set true, then freeGameLoop ran and set it false
        expect(ui.showFGBar).toHaveBeenCalled();
        expect(ui.showTotalWin).toHaveBeenCalled();
    });

    // ── enterFreeGame ────────────────────────────────────────────────

    it('enterFreeGame sets inFreeGame=true', async () => {
        const ui   = makeUI();
        // Coin toss in FG → immediate tails → exit
        ui.showCoinToss.mockResolvedValue(false);
        const sess = makeSession();
        const ctrl = new GameFlowController(
            sess, makeAccount(1000), makeEngine(), makeReels(), ui, instantWait);
        await ctrl.enterFreeGame();
        // After freeGameLoop exits, inFreeGame=false
        expect(ui.showFGBar).toHaveBeenCalledWith(0);
        expect(ui.showTotalWin).toHaveBeenCalled();
    });

    // ── onBuyFreeGame ────────────────────────────────────────────────

    it('onBuyFreeGame does nothing if busy=true', async () => {
        const ui  = makeUI();
        const eng = makeEngine();
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), eng, makeReels(), ui, instantWait);
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
        expect(eng.spin).not.toHaveBeenCalled();
    });

    it('onBuyFreeGame shows 餘額不足 when balance too low', async () => {
        const ui  = makeUI();
        ui.showBuyPanel.mockResolvedValue(true);
        const acc = makeAccount(50);   // totalBet=1, cost=100 → insufficient
        const ctrl = new GameFlowController(
            makeSession(), acc, makeEngine(), makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();
        expect(ui.setStatus).toHaveBeenCalledWith('餘額不足！', '#ff4444');
    });

    it('onBuyFreeGame debits 100× totalBet on confirm', async () => {
        const ui  = makeUI();
        ui.showBuyPanel.mockResolvedValue(true);
        ui.showCoinToss.mockResolvedValue(false);  // tails → don't enter FG
        const acc  = makeAccount(200);
        const sess = makeSession({ totalBet: 1 });
        const eng  = makeEngine();
        const ctrl = new GameFlowController(
            sess, acc, eng, makeReels(), ui, instantWait);
        await ctrl.onBuyFreeGame();
        expect(acc.debit).toHaveBeenCalledWith(100);
    });

    // ── autoSpinCount ─────────────────────────────────────────────────

    it('autoSpinCount decrements after each spin', async () => {
        const ctrl = new GameFlowController(
            makeSession(), makeAccount(), makeEngine(), makeReels(), makeUI(), instantWait);
        ctrl.autoSpinCount = 2;
        // First doSpin
        await ctrl.doSpin();
        // autoSpinCount should be 1 (decremented by 1), then doSpin again called recursively
        // The recursive call happens; it's fire-and-forget; just verify initial decrement
        // We can't easily verify the recursive call in this model, but we can check autoSpinCount reached 0
        // Wait a tick for recursive async to settle
        await new Promise(r => setTimeout(r, 10));
        expect(ctrl.autoSpinCount).toBe(0);
    });
});
