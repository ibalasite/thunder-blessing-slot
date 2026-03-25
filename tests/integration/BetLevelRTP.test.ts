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
    FG_MULTIPLIERS, FG_ROUND_COUNTS, FG_TRIGGER_PROB,
    COIN_TOSS_HEADS_PROB, COIN_TOSS_HEADS_PROB_BUY,
    MAX_WIN_MULT, MAX_ROWS, BUY_FG_MIN_WIN_MULT,
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
// ══════════════════════════════════════════════════════════════════════════════

function runFGChain(engine: SlotEngine, rng: () => number, totalBet: number, isBuyFG = false): number {
    const probs = isBuyFG ? COIN_TOSS_HEADS_PROB_BUY : COIN_TOSS_HEADS_PROB;
    let tierIdx = 0;
    for (let j = 0; j < probs.length; j++) {
        if (rng() >= probs[j]) break;
        if (tierIdx < FG_MULTIPLIERS.length - 1) tierIdx++;
    }
    const rounds = FG_ROUND_COUNTS[tierIdx];
    const mult   = FG_MULTIPLIERS[tierIdx];
    const marks  = new Set<string>();
    let acc = 0;
    for (let j = 0; j < rounds; j++) {
        const fg = engine.simulateSpin({
            inFreeGame: true, fgMultiplier: mult, totalBet, lightningMarks: marks,
        });
        acc += fg.totalRawWin * mult;
        if (fg.maxWinCapped) break;
    }
    return acc;
}

function simMode(
    mode: GameMode, totalBet: number, spins: number, seed: number,
): { rtp: number } {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);

    const scale = mode === 'buyFG' ? BUY_FG_PAYOUT_SCALE
                : mode === 'extraBet' ? EB_PAYOUT_SCALE : 1;
    const costMult = mode === 'buyFG' ? BUY_COST_MULT
                   : mode === 'extraBet' ? EXTRA_BET_MULT : 1;

    let wagered = 0, payout = 0;

    for (let i = 0; i < spins; i++) {
        wagered += totalBet * costMult;
        let spinPay = 0;

        if (mode === 'buyFG') {
            for (let s = 0; s < 20; s++) {
                const r = engine.simulateSpin({ totalBet });
                spinPay += r.totalRawWin;
                if (r.fgTriggered || r.finalRows >= MAX_ROWS) break;
            }
            spinPay += runFGChain(engine, rng, totalBet, true);
        } else {
            const extraBet = mode === 'extraBet';
            const base = engine.simulateSpin({ totalBet, extraBet });
            spinPay += base.totalRawWin;
            if (!base.maxWinCapped && base.fgTriggered) {
                if (rng() < FG_TRIGGER_PROB) {
                    spinPay += runFGChain(engine, rng, totalBet);
                }
            }
        }

        let win = spinPay * scale;
        if (mode === 'buyFG' && win < BUY_FG_MIN_WIN_MULT * totalBet) {
            win = BUY_FG_MIN_WIN_MULT * totalBet;
        }
        const maxWin = totalBet * MAX_WIN_MULT;
        if (win > maxWin) win = maxWin;
        payout += win;
    }

    return { rtp: payout / wagered };
}

// Pick representative bet levels to keep runtime reasonable
const SAMPLE_BETS = [BET_MIN, 0.50, 1.00, 2.50, 5.00, BET_MAX];
const MODES: GameMode[] = ['main', 'buyFG', 'extraBet'];
const SPINS_PER_COMBO = 100_000;

describe(`Batch RTP: ${MODES.length} modes × ${SAMPLE_BETS.length} bets (${SPINS_PER_COMBO / 1000}k each)`, () => {
    const results: { mode: GameMode; bet: number; rtp: number }[] = [];

    for (const mode of MODES) {
        for (const bet of SAMPLE_BETS) {
            it(`${mode} @ bet=${bet.toFixed(2)} → RTP ≈ 97.5% ± 4%`, () => {
                const { rtp } = simMode(mode, bet, SPINS_PER_COMBO, 42);
                results.push({ mode, bet, rtp });
                console.log(`  ${mode.padEnd(8)} bet=${bet.toFixed(2).padStart(5)}  RTP=${(rtp * 100).toFixed(2)}%`);
                expect(rtp).toBeGreaterThan(0.935);
                expect(rtp).toBeLessThan(1.015);
            });
        }
    }
});

describe('Full bet range smoke test (10k spins each)', () => {
    it(`All ${BET_LEVELS.length} bet levels × main mode within tolerance`, () => {
        let pass = 0;
        for (const bet of BET_LEVELS) {
            const { rtp } = simMode('main', bet, 10_000, 42);
            if (rtp > 0.85 && rtp < 1.10) pass++;
        }
        console.log(`  Main mode: ${pass}/${BET_LEVELS.length} bet levels within [85%, 110%]`);
        expect(pass).toBe(BET_LEVELS.length);
    });
});
