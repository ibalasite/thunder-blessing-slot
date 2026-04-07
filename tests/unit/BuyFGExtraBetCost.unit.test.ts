/**
 * BuyFGExtraBetCost.unit.test.ts
 *
 * Regression test for the bug:
 *   Extra Bet ON → bet displays 0.75 → Buy Free Game shows 171 instead of 75 (100×BET)
 *
 * Root cause: UIController.showBuyPanel() used session.totalBet which includes
 * expanded rows (LINES_MAX=57) from a previous cascade, instead of always using
 * LINES_BASE=25 for the buy cost calculation.
 *
 * Also verifies that GameFlowController.onBuyFreeGame() passes the correct
 * totalBet (including EB multiplier) to the engine.
 *
 * Coverage:
 *   - All 40 bet levels (0.25 ~ 10.00, step 0.25)
 *   - Extra Bet ON / OFF
 *   - All row states (3, 4, 5, 6)
 */
import { GameSession } from '../../assets/scripts/core/GameSession';
import { GameFlowController } from '../../assets/scripts/core/GameFlowController';
import { LocalAccountService } from '../../assets/scripts/services/LocalAccountService';
import { LocalEngineAdapter } from '../../assets/scripts/services/LocalEngineAdapter';
import { createEngine, SlotEngine } from '../../assets/scripts/SlotEngine';
import { IReelManager } from '../../assets/scripts/contracts/IReelManager';
import { IUIController } from '../../assets/scripts/contracts/IUIController';
import {
    BUY_COST_MULT, EXTRA_BET_MULT, LINES_BASE,
    DEFAULT_BET, BASE_ROWS, MAX_ROWS,
    BET_LEVELS, BET_MIN, BET_MAX, BET_STEP,
} from '../../assets/scripts/GameConfig';

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
        showBuyPanel:        jest.fn().mockResolvedValue(true),
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

/**
 * Runs onBuyFreeGame and returns the net debit (= wagered cost).
 * Uses a spy on account.credit to capture the actual credited amount
 * (outcome.totalWin), independent of session.roundWin which is only
 * accumulated by the cascade animation (mocked in tests).
 */
async function runAndGetDebit(
    account: LocalAccountService,
    ctrl: GameFlowController,
): Promise<number> {
    const spy    = jest.spyOn(account, 'credit');
    const before = account.getBalance();
    await ctrl.onBuyFreeGame();
    const credited = (spy.mock.calls as [number][]).reduce((s, a) => s + a[0], 0);
    spy.mockRestore();
    return before - account.getBalance() + credited;
}

/** Helper: expected displayed bet = betLevel × ebMult (always LINES_BASE) */
function expectedDisplayBet(betLevel: number, ebOn: boolean): number {
    const ebMult = ebOn ? EXTRA_BET_MULT : 1;
    return parseFloat((betLevel * ebMult).toFixed(2));
}

/** Helper: expected buy cost = displayBet × BUY_COST_MULT */
function expectedBuyCost(betLevel: number, ebOn: boolean): number {
    return parseFloat((expectedDisplayBet(betLevel, ebOn) * BUY_COST_MULT).toFixed(2));
}

function makeSetup(seed: number, betLevel: number = DEFAULT_BET, balance = 50000) {
    const session = new GameSession();
    session.setBetPerLine(betLevel / LINES_BASE);
    const account = new LocalAccountService(balance);
    const engine  = createEngine(mulberry32(seed));
    const adapter = new LocalEngineAdapter(engine);
    const reels   = makeReels();
    const ui      = makeUI();
    const ctrl    = new GameFlowController(session, account, adapter, reels, ui, instantWait);
    return { session, account, adapter, reels, ui, ctrl };
}

// ═══════════════════════════════════════════════════════════
// GameSession.computeTotalBet — underlying data model
// ═══════════════════════════════════════════════════════════

describe('GameSession.computeTotalBet — base bet vs expanded rows', () => {

    it('Extra Bet OFF, base rows → totalBet = betLevel', () => {
        const s = new GameSession();
        expect(s.totalBet).toBeCloseTo(DEFAULT_BET, 4);
    });

    it('Extra Bet ON, base rows → totalBet = betLevel × 3', () => {
        const s = new GameSession();
        s.setExtraBet(true);
        expect(s.totalBet).toBeCloseTo(DEFAULT_BET * EXTRA_BET_MULT, 4);
    });

    it('Extra Bet ON, expanded rows (>3) → totalBet inflated by LINES_MAX (bug origin)', () => {
        const s = new GameSession();
        s.setExtraBet(true);
        s.setCurrentRows(5);
        s.computeTotalBet();
        const betPerLine = DEFAULT_BET / LINES_BASE;
        const inflated = betPerLine * 57 * EXTRA_BET_MULT;
        expect(s.totalBet).toBeCloseTo(inflated, 2);
    });

    it.each(BET_LEVELS)(
        'betLevel=%s: EB OFF base rows → totalBet = betLevel',
        (betLevel) => {
            const s = new GameSession();
            s.setBetPerLine(betLevel / LINES_BASE);
            expect(s.totalBet).toBeCloseTo(betLevel, 2);
        },
    );

    it.each(BET_LEVELS)(
        'betLevel=%s: EB ON base rows → totalBet = betLevel × 3',
        (betLevel) => {
            const s = new GameSession();
            s.setBetPerLine(betLevel / LINES_BASE);
            s.setExtraBet(true);
            expect(s.totalBet).toBeCloseTo(betLevel * EXTRA_BET_MULT, 2);
        },
    );
});

// ═══════════════════════════════════════════════════════════
// Engine — wagered amount for Buy FG at every bet level
// ═══════════════════════════════════════════════════════════

describe('SlotEngine.computeFullSpin — Buy FG wagered at every bet level', () => {

    it.each(BET_LEVELS)(
        'betLevel=%s EB OFF: wagered = betLevel × 100',
        (betLevel) => {
            const engine = new SlotEngine(mulberry32(42));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: betLevel });
            expect(o.wagered).toBeCloseTo(betLevel * BUY_COST_MULT, 2);
        },
    );

    it.each(BET_LEVELS)(
        'betLevel=%s EB ON: wagered = (betLevel×3) × 100',
        (betLevel) => {
            const engine = new SlotEngine(mulberry32(42));
            const betWithEB = parseFloat((betLevel * EXTRA_BET_MULT).toFixed(4));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: betWithEB });
            expect(o.wagered).toBeCloseTo(betWithEB * BUY_COST_MULT, 2);
        },
    );
});

// ═══════════════════════════════════════════════════════════
// Original bug case (default bet 0.25)
// ═══════════════════════════════════════════════════════════

describe('Bug regression: default bet 0.25 — Extra Bet + Buy FG', () => {

    it('Extra Bet OFF → debit = 0.25 × 100 = 25', async () => {
        const { session, account, ctrl } = makeSetup(42);

        const baseBet = parseFloat((session.betPerLine * LINES_BASE).toFixed(4));
        expect(baseBet).toBeCloseTo(0.25, 4);

        const debited = await runAndGetDebit(account, ctrl);
        expect(debited).toBeCloseTo(25, 2);
    });

    it('Extra Bet ON → debit = 0.75 × 100 = 75', async () => {
        const { session, account, ctrl } = makeSetup(42);
        session.setExtraBet(true);

        const debited = await runAndGetDebit(account, ctrl);
        expect(debited).toBeCloseTo(75, 2);
    });

    it('Extra Bet ON + expanded rows → debit still = 75 (not 171)', async () => {
        const { session, account, ctrl } = makeSetup(42);
        session.setExtraBet(true);
        session.setCurrentRows(5);
        session.computeTotalBet();

        expect(session.totalBet).toBeCloseTo(1.71, 2);

        const debited = await runAndGetDebit(account, ctrl);
        expect(debited).toBeCloseTo(75, 2);
    });
});

// ═══════════════════════════════════════════════════════════
// ALL bet levels × EB × row states — full matrix
// ═══════════════════════════════════════════════════════════

describe('All bet levels: Buy FG cost = 100 × displayedBet (EB OFF)', () => {

    it.each(BET_LEVELS)(
        'betLevel=%s rows=3 EB OFF → cost = %s × 100',
        async (betLevel) => {
            const { account, ctrl } = makeSetup(42, betLevel);

            const debited = await runAndGetDebit(account, ctrl);
            expect(debited).toBeCloseTo(expectedBuyCost(betLevel, false), 2);
        },
    );
});

describe('All bet levels: Buy FG cost = 100 × displayedBet (EB ON, base rows)', () => {

    it.each(BET_LEVELS)(
        'betLevel=%s rows=3 EB ON → cost = %s × 3 × 100',
        async (betLevel) => {
            const { session, account, ctrl } = makeSetup(42, betLevel);
            session.setExtraBet(true);

            const debited = await runAndGetDebit(account, ctrl);
            expect(debited).toBeCloseTo(expectedBuyCost(betLevel, true), 2);
        },
    );
});

describe('All bet levels: Buy FG cost unaffected by expanded rows (EB ON)', () => {

    const expandedRows = [4, 5, MAX_ROWS];

    it.each(BET_LEVELS)(
        'betLevel=%s EB ON + expanded rows → cost = betLevel × 3 × 100 (not inflated)',
        async (betLevel) => {
            for (const rows of expandedRows) {
                const { session, account, ctrl } = makeSetup(42, betLevel);
                session.setExtraBet(true);
                session.setCurrentRows(rows);
                session.computeTotalBet();

                const debited = await runAndGetDebit(account, ctrl);
                const expected = expectedBuyCost(betLevel, true);
                expect(debited).toBeCloseTo(expected, 2);
            }
        },
    );
});

describe('All bet levels: Buy FG cost unaffected by expanded rows (EB OFF)', () => {

    const expandedRows = [4, 5, MAX_ROWS];

    it.each(BET_LEVELS)(
        'betLevel=%s EB OFF + expanded rows → cost = betLevel × 100 (not inflated)',
        async (betLevel) => {
            for (const rows of expandedRows) {
                const { session, account, ctrl } = makeSetup(42, betLevel);
                session.setCurrentRows(rows);
                session.computeTotalBet();

                const debited = await runAndGetDebit(account, ctrl);
                expect(debited).toBeCloseTo(expectedBuyCost(betLevel, false), 2);
            }
        },
    );
});

// ═══════════════════════════════════════════════════════════
// Spot-check: representative bet levels × full row/EB matrix
// ═══════════════════════════════════════════════════════════

describe('Spot-check representative bet levels — full matrix', () => {

    const spotBets = [BET_MIN, 0.50, 1.00, 2.50, 5.00, BET_MAX];
    const allRows  = [BASE_ROWS, 4, 5, MAX_ROWS];
    const ebStates = [false, true];

    const cases = spotBets.flatMap(bet =>
        allRows.flatMap(rows =>
            ebStates.map(eb => ({
                bet, rows, eb,
                label: `bet=${bet} rows=${rows} EB=${eb ? 'ON' : 'OFF'}`,
            })),
        ),
    );

    it.each(cases)(
        '$label → cost = 100 × displayedBet',
        async ({ bet, rows, eb }) => {
            const { session, account, ctrl } = makeSetup(42, bet);
            session.setExtraBet(eb);
            session.setCurrentRows(rows);
            session.computeTotalBet();

            const debited  = await runAndGetDebit(account, ctrl);
            const expected = expectedBuyCost(bet, eb);
            expect(debited).toBeCloseTo(expected, 2);
        },
    );
});
