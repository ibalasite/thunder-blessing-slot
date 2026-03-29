/**
 * BuyFGAndLetters.e2e.test.ts
 * E2E test (engine-level) verifying Buy FG and FREE letters behavior.
 *
 * This test exercises the full engine → adapter → controller chain
 * with real engine instances and mocked UI/Reels to verify:
 *
 *   1. Buy FG never stops halfway — always reaches FG chain
 *   2. FREE letters light progressively (rows 4→5→6) during cascade
 *   3. Buy FG tier upgrade coin toss uses playCoinToss(true, …)
 *   4. After Buy FG, game returns to idle state
 */
import { SlotEngine, createEngine } from '../../assets/scripts/SlotEngine';
import { LocalEngineAdapter }       from '../../assets/scripts/services/LocalEngineAdapter';
import { GameFlowController }       from '../../assets/scripts/core/GameFlowController';
import { GameSession }               from '../../assets/scripts/core/GameSession';
import { LocalAccountService }      from '../../assets/scripts/services/LocalAccountService';
import { IReelManager }             from '../../assets/scripts/contracts/IReelManager';
import { IUIController }            from '../../assets/scripts/contracts/IUIController';
import {
    BASE_ROWS, MAX_ROWS, FG_MULTIPLIERS,
    BUY_COST_MULT, LINES_BASE,
} from '../../assets/scripts/GameConfig';

jest.setTimeout(60_000);

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

interface LetterCall { rows: number; fourthE: boolean }

function makeUI(): jest.Mocked<IUIController> & { letterCalls: LetterCall[] } {
    const letterCalls: LetterCall[] = [];
    const ui: any = {
        letterCalls,
        refresh:             jest.fn(),
        setDisplayBalance:   jest.fn(),
        setStatus:           jest.fn(),
        showWinPop:          jest.fn(),
        enableSpin:          jest.fn(),
        updateExtraBetUI:    jest.fn(),
        updateTurboUI:       jest.fn(),
        updateFreeLetters:   jest.fn((rows: number, fourthE = false) => {
            letterCalls.push({ rows, fourthE });
        }),
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
    };
    return ui;
}

// ─── E2E: Buy FG flow ─────────────────────────────────────────────────────────

describe('E2E: Buy FG never stops halfway', () => {

    const SEEDS = 50;

    it(`Buy FG completes successfully for ${SEEDS} different seeds`, async () => {
        const failures: number[] = [];

        for (let seed = 0; seed < SEEDS; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.onBuyFreeGame();

            if (ctrl.busy) {
                failures.push(seed);
                continue;
            }

            // Must have entered FG
            if (!(ui.showFGBar as jest.Mock).mock.calls.length) {
                failures.push(seed);
                continue;
            }

            // Must have exited FG
            if (session.inFreeGame) {
                failures.push(seed);
            }
        }

        if (failures.length > 0) {
            throw new Error(`Buy FG failed to complete for seeds: ${failures.join(', ')}`);
        }
    });
});

describe('E2E: FREE letters progressive lighting', () => {

    it('Cascade rows expand from BASE_ROWS, letters light progressively', async () => {
        let foundProgressive = false;

        for (let seed = 0; seed < 100; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.doSpin();

            const rows = ui.letterCalls.map(c => c.rows);
            // Check for progressive expansion: 3 → 4 or 4 → 5 etc.
            for (let i = 1; i < rows.length; i++) {
                if (rows[i] > rows[i - 1] && rows[i] > BASE_ROWS) {
                    foundProgressive = true;
                    break;
                }
            }
            if (foundProgressive) break;
        }

        expect(foundProgressive).toBe(true);
    });

    it('Buy FG shows letters lighting up to MAX_ROWS', async () => {
        for (let seed = 0; seed < 30; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.onBuyFreeGame();

            const rows = ui.letterCalls.map(c => c.rows);
            const maxRow = Math.max(...rows);
            expect(maxRow).toBeGreaterThanOrEqual(MAX_ROWS);

            // Verify fourthE=true when reaching MAX_ROWS
            const maxRowCalls = ui.letterCalls.filter(c => c.rows >= MAX_ROWS);
            const hasFourthE = maxRowCalls.some(c => c.fourthE);
            expect(hasFourthE).toBe(true);
        }
    });

    it('updateFreeLetters(BASE_ROWS) is always the first call (reset)', async () => {
        for (let seed = 0; seed < 10; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.doSpin();

            expect(ui.letterCalls.length).toBeGreaterThan(0);
            expect(ui.letterCalls[0].rows).toBe(BASE_ROWS);
        }
    });

    it('Buy FG resets FREE letters to BASE_ROWS before playback', async () => {
        for (let seed = 0; seed < 10; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.onBuyFreeGame();

            expect(ui.letterCalls.length).toBeGreaterThan(0);
            expect(ui.letterCalls[0].rows).toBe(BASE_ROWS);
        }
    });

    it('fourthE is never true when rows < MAX_ROWS (regression)', async () => {
        for (let seed = 0; seed < 50; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.onBuyFreeGame();

            const bad = ui.letterCalls.filter(c => c.fourthE && c.rows < MAX_ROWS);
            if (bad.length > 0) {
                throw new Error(
                    `seed ${seed}: fourthE=true at rows=${bad[0].rows} (< MAX_ROWS=${MAX_ROWS})`);
            }
        }
    });
});

describe('E2E: Buy FG tier upgrade coin toss', () => {

    it('playCoinToss calls are tier ceremony only (first arg true)', async () => {
        for (let seed = 0; seed < 30; seed++) {
            const session = new GameSession();
            const account = new LocalAccountService(10000);
            const engine  = createEngine(mulberry32(seed));
            const adapter = new LocalEngineAdapter(engine);
            const ui      = makeUI();
            const ctrl    = new GameFlowController(
                session, account, adapter, makeReels(), ui, () => Promise.resolve());

            await ctrl.onBuyFreeGame();

            const coinCalls = (ui.playCoinToss as jest.Mock).mock.calls;
            expect(coinCalls.length).toBeGreaterThanOrEqual(1);
            for (const call of coinCalls) {
                expect(call[0]).toBe(true);
            }
        }
    });

    it('Buy FG FG chain always has exactly 5 spins (guaranteed full progression)', async () => {
        for (let seed = 0; seed < 30; seed++) {
            const engine  = createEngine(mulberry32(seed));
            const o = (engine as any).computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgSpins.length).toBe(5);
            for (const fg of o.fgSpins) {
                expect(fg.coinToss.heads).toBe(true);
            }
        }
    });
});
