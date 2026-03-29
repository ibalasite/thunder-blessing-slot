/**
 * ExtraBetBuyFG.integration.test.ts
 *
 * Integration tests for Extra Bet + Buy Free Game SC guarantee.
 *
 * Uses real SlotEngine + LocalEngineAdapter + GameSession + AccountService.
 * Only mocks IReelManager and IUIController.
 *
 * Verifies:
 *   1. When Extra Bet is ON and player buys FG, engine.fullSpin is called with extraBetOn=true
 *   2. The outcome has extraBetOn=true
 *   3. Cost = bet × 3 × 100 (300× base bet)
 *   4. Phase B FG spins have SC in visible rows (guarantee applied)
 *   5. Normal buyFG (EB off) does NOT have guarantee applied (some FG spins lack SC)
 */
import { GameFlowController }   from '../../assets/scripts/core/GameFlowController';
import { GameSession }           from '../../assets/scripts/core/GameSession';
import { LocalAccountService }  from '../../assets/scripts/services/LocalAccountService';
import { LocalEngineAdapter }   from '../../assets/scripts/services/LocalEngineAdapter';
import { createEngine }         from '../../assets/scripts/SlotEngine';
import { IReelManager }         from '../../assets/scripts/contracts/IReelManager';
import { IUIController }        from '../../assets/scripts/contracts/IUIController';
import { IEngineAdapter }       from '../../assets/scripts/contracts/IEngineAdapter';
import {
    BASE_ROWS, BUY_COST_MULT, EXTRA_BET_MULT, LINES_BASE,
    REEL_COUNT, SYM,
} from '../../assets/scripts/GameConfig';
import type { SymType } from '../../assets/scripts/GameConfig';
import type { FullSpinOutcome } from '../../assets/scripts/contracts/types';

jest.setTimeout(30_000);

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hasScatterInVisibleRows(grid: SymType[][]): boolean {
    for (let ri = 0; ri < REEL_COUNT; ri++) {
        for (let row = 0; row < BASE_ROWS; row++) {
            if (grid[ri][row] === SYM.SCATTER) return true;
        }
    }
    return false;
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

function makeIntegration(seed: number, balance = 50_000) {
    const session  = new GameSession();
    const account  = new LocalAccountService(balance);
    const engine   = createEngine(mulberry32(seed));
    const adapter  = new LocalEngineAdapter(engine);
    const reels    = makeReels();
    const ui       = makeUI();
    const ctrl     = new GameFlowController(session, account, adapter, reels, ui, instantWait);
    return { session, account, adapter, engine, reels, ui, ctrl };
}

// ─── Spy adapter to capture fullSpin calls and outcomes ───────────────────────

class SpyEngineAdapter implements IEngineAdapter {
    public calls: Array<{ mode: string; totalBet: number; extraBetOn?: boolean }> = [];
    public outcomes: FullSpinOutcome[] = [];

    constructor(private readonly _inner: IEngineAdapter) {}

    async spin(req: any) { return this._inner.spin(req); }

    async fullSpin(mode: any, totalBet: number, extraBetOn?: boolean): Promise<FullSpinOutcome> {
        this.calls.push({ mode, totalBet, extraBetOn });
        const o = await this._inner.fullSpin(mode, totalBet, extraBetOn);
        this.outcomes.push(o);
        return o;
    }
}

function makeSpyIntegration(seed: number, balance = 50_000) {
    const session  = new GameSession();
    const account  = new LocalAccountService(balance);
    const engine   = createEngine(mulberry32(seed));
    const inner    = new LocalEngineAdapter(engine);
    const spy      = new SpyEngineAdapter(inner);
    const reels    = makeReels();
    const ui       = makeUI();
    const ctrl     = new GameFlowController(session, account, spy, reels, ui, instantWait);
    return { session, account, spy, reels, ui, ctrl };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Extra Bet + Buy FG — integration', () => {

    describe('Controller passes extraBetOn to engine', () => {

        it('Extra Bet ON → fullSpin called with extraBetOn=true', async () => {
            for (let seed = 0; seed < 10; seed++) {
                const { session, spy, ctrl } = makeSpyIntegration(seed);
                session.setExtraBet(true);

                await ctrl.onBuyFreeGame();

                expect(spy.calls.length).toBeGreaterThan(0);
                const lastCall = spy.calls[spy.calls.length - 1];
                expect(lastCall.mode).toBe('buyFG');
                expect(lastCall.extraBetOn).toBe(true);
            }
        });

        it('Extra Bet OFF → fullSpin called with extraBetOn=false', async () => {
            for (let seed = 0; seed < 10; seed++) {
                const { spy, ctrl } = makeSpyIntegration(seed);
                // extraBet is OFF by default

                await ctrl.onBuyFreeGame();

                const lastCall = spy.calls[spy.calls.length - 1];
                expect(lastCall.mode).toBe('buyFG');
                expect(lastCall.extraBetOn).toBe(false);
            }
        });

        it('outcome has extraBetOn=true when Extra Bet is ON', async () => {
            for (let seed = 0; seed < 10; seed++) {
                const { session, spy, ctrl } = makeSpyIntegration(seed);
                session.setExtraBet(true);

                await ctrl.onBuyFreeGame();

                const outcome = spy.outcomes[spy.outcomes.length - 1];
                expect(outcome.extraBetOn).toBe(true);
            }
        });

        it('outcome has extraBetOn=false when Extra Bet is OFF', async () => {
            for (let seed = 0; seed < 10; seed++) {
                const { spy, ctrl } = makeSpyIntegration(seed);

                await ctrl.onBuyFreeGame();

                const outcome = spy.outcomes[spy.outcomes.length - 1];
                expect(outcome.extraBetOn).toBe(false);
            }
        });
    });

    describe('SC guarantee in Phase B FG spins', () => {

        it('Extra Bet ON + Buy FG: ALL baseSpins and ALL fgSpins have SC in visible rows', async () => {
            // GDD §11: SC guaranteed in visible rows (rows 0–2) for EVERY spin in the flow.
            // Phase A (baseSpins) may have 1–2 spins expanding to MAX_ROWS.
            // Phase B (fgSpins) has up to 5 spins (x3 → x7 → x11 → x13 → x30).
            // All must be verified — not just fgSpins[0] or baseSpins[0].
            let missingBase = 0, missingFG = 0;
            let totalBase = 0, totalFG = 0;

            for (let seed = 0; seed < 50; seed++) {
                const { session, spy, ctrl } = makeSpyIntegration(seed);
                session.setExtraBet(true);

                await ctrl.onBuyFreeGame();

                const outcome = spy.outcomes[spy.outcomes.length - 1];
                expect(outcome.fgSpins.length).toBeGreaterThan(0);

                for (const spin of outcome.baseSpins) {
                    totalBase++;
                    if (!hasScatterInVisibleRows(spin.grid)) missingBase++;
                }
                for (const fg of outcome.fgSpins) {
                    totalFG++;
                    if (!hasScatterInVisibleRows(fg.spin.grid)) missingFG++;
                }
            }
            expect(totalBase).toBeGreaterThan(0);
            expect(totalFG).toBeGreaterThan(0);
            expect(missingBase).toBe(0);
            expect(missingFG).toBe(0);
        });

        it('Extra Bet OFF + Buy FG: some FG spins may lack SC', async () => {
            let missingCount = 0;
            for (let seed = 0; seed < 100; seed++) {
                const { spy, ctrl } = makeSpyIntegration(seed);
                // extra bet is OFF

                await ctrl.onBuyFreeGame();

                const outcome = spy.outcomes[spy.outcomes.length - 1];
                for (const fg of outcome.fgSpins) {
                    if (!hasScatterInVisibleRows(fg.spin.grid)) {
                        missingCount++;
                    }
                }
            }
            // Without guarantee, BUY_FG weights have low SC (weight=2/90 ≈ 2.2%)
            // Over 500 FG spins (100 runs × 5 spins), some should lack SC
            expect(missingCount).toBeGreaterThan(0);
        });
    });

    describe('Cost verification', () => {

        it('Extra Bet ON + Buy FG → cost = bet × 3 × 100', async () => {
            const betLevel = 0.25;
            const { session, account, ctrl } = makeIntegration(42);
            session.setExtraBet(true);

            const before = account.getBalance();
            await ctrl.onBuyFreeGame();

            const debited = before - account.getBalance() + session.roundWin;
            const expected = betLevel * EXTRA_BET_MULT * BUY_COST_MULT; // 0.25 * 3 * 100 = 75
            expect(debited).toBeCloseTo(expected, 2);
        });

        it('Extra Bet OFF + Buy FG → cost = bet × 100', async () => {
            const betLevel = 0.25;
            const { session, account, ctrl } = makeIntegration(42);
            // extra bet is OFF

            const before = account.getBalance();
            await ctrl.onBuyFreeGame();

            const debited = before - account.getBalance() + session.roundWin;
            const expected = betLevel * BUY_COST_MULT; // 0.25 * 100 = 25
            expect(debited).toBeCloseTo(expected, 2);
        });

        it('busy resets to false after Extra Bet ON + Buy FG completes', async () => {
            for (let seed = 0; seed < 10; seed++) {
                const { session, ctrl } = makeIntegration(seed);
                session.setExtraBet(true);
                await ctrl.onBuyFreeGame();
                expect(ctrl.busy).toBe(false);
            }
        });
    });

    describe('Normal Buy FG still works correctly', () => {

        it('Normal Buy FG (EB OFF) completes and busy resets', async () => {
            for (let seed = 0; seed < 10; seed++) {
                const { ctrl } = makeIntegration(seed);
                await ctrl.onBuyFreeGame();
                expect(ctrl.busy).toBe(false);
            }
        });

        it('Normal Buy FG enters FG (showFGBar called)', async () => {
            for (let seed = 0; seed < 5; seed++) {
                const { ui, ctrl } = makeIntegration(seed);
                await ctrl.onBuyFreeGame();
                expect(ui.showFGBar).toHaveBeenCalled();
            }
        });
    });
});
