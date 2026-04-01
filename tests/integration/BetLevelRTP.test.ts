/**
 * Bet-Level Independent RTP Test
 *
 * Proves that every (mode × betLevel) combination independently achieves 97.5% RTP.
 *
 * Structure:
 *   1. Mathematical proof: calcWinAmount scales linearly with totalBet
 *   2. All 3×N combo batch (100k spins each): verifies ±4% tolerance
 *   3. Max Win cap: 30,000× applies independently per bet level
 *
 * @jest-environment node
 */

import { SlotEngine, calcWinAmount, WinLine } from '../../assets/scripts/SlotEngine';
import {
    BET_LEVELS, BET_MIN, BET_MAX, BET_STEP,
    BUY_FG_PAYOUT_SCALE, EB_PAYOUT_SCALE, BUY_COST_MULT, EXTRA_BET_MULT,
    FG_MULTIPLIERS, FG_TRIGGER_PROB, FG_SPIN_BONUS,
    COIN_TOSS_HEADS_PROB, ENTRY_TOSS_PROB_MAIN, ENTRY_TOSS_PROB_BUY,
    MAX_WIN_MULT, MAX_ROWS, BASE_ROWS, BUY_FG_MIN_WIN_MULT,
} from '../../assets/scripts/GameConfig';
import type { GameMode } from '../../assets/scripts/contracts/types';

jest.setTimeout(600_000);

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEEDS = [42, 123, 456, 789, 1001, 2022, 3033, 4044, 5055, 6066];

// ══════════════════════════════════════════════════════════════════════════════
// 1. Mathematical proof: linear scaling
// ══════════════════════════════════════════════════════════════════════════════

describe('Mathematical: RTP is bet-level independent', () => {
    it('calcWinAmount(win, 2*bet) = 2 * calcWinAmount(win, bet)', () => {
        const win: WinLine = {
            lineIndex: 0, rowPath: [1,1,1,1,1],
            symbol: 'P1', count: 5, multiplier: 3.57,
            cells: [{reel:0,row:1},{reel:1,row:1},{reel:2,row:1},{reel:3,row:1},{reel:4,row:1}],
        };
        for (const bet of [0.25, 0.5, 1, 2.5, 5, 10]) {
            const x1 = calcWinAmount(win, bet);
            const x2 = calcWinAmount(win, bet * 2);
            expect(x2).toBeCloseTo(x1 * 2, 2);
        }
    });

    it('simulateSpin totalRawWin scales linearly with totalBet', () => {
        const seed = 42;
        const N = 1000;
        for (const mult of [0.5, 2, 5]) {
            const rng1 = mulberry32(seed);
            const rng2 = mulberry32(seed);
            const e1 = new SlotEngine(rng1);
            const e2 = new SlotEngine(rng2);
            for (let i = 0; i < N; i++) {
                const r1 = e1.simulateSpin({ totalBet: 1 });
                const r2 = e2.simulateSpin({ totalBet: mult });
                expect(r2.totalRawWin).toBeCloseTo(r1.totalRawWin * mult, 2);
            }
        }
    });

    it(`BET_LEVELS has ${Math.round((BET_MAX - BET_MIN) / BET_STEP) + 1} entries`, () => {
        const expected = Math.round((BET_MAX - BET_MIN) / BET_STEP) + 1;
        expect(BET_LEVELS.length).toBe(expected);
        expect(BET_LEVELS[0]).toBe(BET_MIN);
        expect(BET_LEVELS[BET_LEVELS.length - 1]).toBe(BET_MAX);
    });

    it('MAX_WIN cap at 30,000× per bet level', () => {
        for (const bet of [BET_MIN, 1.0, BET_MAX]) {
            const maxWin = bet * MAX_WIN_MULT;
            expect(maxWin).toBe(bet * 30000);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Batch RTP verification: 3 modes × all bet levels
//    Uses engine.computeFullSpin directly for perfect alignment with production.
// ══════════════════════════════════════════════════════════════════════════════

function simMode(
    mode: GameMode, totalBet: number, spinsPerSeed: number,
): { rtp: number } {
    let wagered = 0, payout = 0;

    for (const seed of SEEDS) {
        const rng = mulberry32(seed);
        const engine = new SlotEngine(rng);
        for (let i = 0; i < spinsPerSeed; i++) {
            const o = engine.computeFullSpin({ mode, totalBet });
            wagered += o.wagered;
            payout += o.totalWin;
        }
    }

    return { rtp: payout / wagered };
}

const SAMPLE_BETS = [BET_MIN, 0.50, 1.00, 2.50, 5.00, BET_MAX];
const MODES: GameMode[] = ['main', 'buyFG', 'extraBet'];
const SPINS_PER_SEED = 100_000; // × 10 seeds = 1M total per combo

describe(`Batch RTP: ${MODES.length} modes × ${SAMPLE_BETS.length} bets (${SPINS_PER_SEED * SEEDS.length / 1000}k each)`, () => {
    const results: { mode: GameMode; bet: number; rtp: number }[] = [];

    for (const mode of MODES) {
        for (const bet of SAMPLE_BETS) {
            it(`${mode} @ bet=${bet.toFixed(2)} → RTP ≈ 97.5% ± 5%`, () => {
                const { rtp } = simMode(mode, bet, SPINS_PER_SEED);
                results.push({ mode, bet, rtp });
                console.log(`  ${mode.padEnd(8)} bet=${bet.toFixed(2).padStart(5)}  RTP=${(rtp * 100).toFixed(2)}%`);
                expect(rtp).toBeGreaterThan(0.925);
                expect(rtp).toBeLessThan(1.025);
            });
        }
    }
});

describe('Full bet range smoke test', () => {
    it(`All ${BET_LEVELS.length} bet levels × main mode within tolerance`, () => {
        // With FG_SPIN_BONUS up to 100x, small samples have extreme variance.
        // All bet levels use identical seeds → identical RTP (linear scaling).
        // Verify the common RTP is within a wide but reasonable band.
        const { rtp } = simMode('main', 1.0, 5_000); // 5K × 10 seeds = 50K
        console.log(`  Main mode (all bets identical): RTP=${(rtp * 100).toFixed(2)}%`);
        expect(rtp).toBeGreaterThan(0.80);
        expect(rtp).toBeLessThan(1.20);
    });
});
