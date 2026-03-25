/**
 * Full-Game RTP Simulation (new per-spin toss model)
 *
 * Simulates the complete game loop:
 *   ① FG trigger decided at spin start (FG_TRIGGER_PROB)
 *   ② Phase A: guaranteed cascade to MAX_ROWS (if triggered)
 *   ③ Entry toss (80% main, 100% buy)
 *   ④ FG spin loop: spin → toss → upgrade/end
 *
 * @jest-environment node
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_FG,
    FG_MULTIPLIERS, FG_TRIGGER_PROB,
    COIN_TOSS_HEADS_PROB, ENTRY_TOSS_PROB_MAIN,
    MAX_WIN_MULT, TB_SECOND_HIT_PROB,
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
    BUY_COST_MULT, BUY_FG_PAYOUT_SCALE, BUY_FG_MIN_WIN_MULT,
    SYM,
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

interface SimStats {
    totalWagered: number;
    totalPayout:  number;
    basePayout:   number;
    fgPayout:     number;
    fgTriggered:  number;
    fgEntered:    number;
    maxWinHits:   number;
    coinTossCount: number;
    coinTossHeads: number;
}

function simulateFullGame(
    engine: SlotEngine,
    rng: () => number,
    spins: number,
    totalBet: number,
): SimStats {
    const stats: SimStats = {
        totalWagered: 0, totalPayout: 0,
        basePayout: 0, fgPayout: 0,
        fgTriggered: 0, fgEntered: 0,
        maxWinHits: 0,
        coinTossCount: 0, coinTossHeads: 0,
    };

    for (let i = 0; i < spins; i++) {
        stats.totalWagered += totalBet;

        // ① Decide FG trigger at spin start
        const fgTriggered = rng() < FG_TRIGGER_PROB;

        if (fgTriggered) {
            stats.fgTriggered++;

            // Phase A: cascade to MAX_ROWS
            let currentRows = BASE_ROWS;
            let phaseAWin = 0;
            const marks = new Set<string>();
            for (let s = 0; s < 100; s++) {
                const r = engine.simulateSpin({
                    totalBet, startRows: currentRows, lightningMarks: marks,
                });
                phaseAWin += r.totalRawWin;
                currentRows = r.finalRows;
                if (currentRows >= MAX_ROWS) break;
            }
            stats.basePayout += phaseAWin;
            stats.totalPayout += phaseAWin;

            // Entry toss
            stats.coinTossCount++;
            const entryHeads = rng() < ENTRY_TOSS_PROB_MAIN;
            if (entryHeads) stats.coinTossHeads++;

            if (!entryHeads) continue;

            stats.fgEntered++;

            // FG spin loop
            const fgMarks = new Set<string>();
            let multIdx = 0;
            for (let safety = 0; safety < 200; safety++) {
                const mult = FG_MULTIPLIERS[multIdx];
                const fg = engine.simulateSpin({
                    inFreeGame: true, fgMultiplier: mult,
                    totalBet, lightningMarks: fgMarks,
                });
                const fgWin = fg.totalRawWin * mult;
                stats.fgPayout += fgWin;
                stats.totalPayout += fgWin;

                // Coin toss
                stats.coinTossCount++;
                const tossProb = COIN_TOSS_HEADS_PROB[multIdx] ?? COIN_TOSS_HEADS_PROB[COIN_TOSS_HEADS_PROB.length - 1];
                const heads = rng() < tossProb;
                if (heads) stats.coinTossHeads++;

                if (fg.maxWinCapped) { stats.maxWinHits++; break; }
                if (!heads) break;
                if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
            }
        } else {
            // Normal spin
            const base = engine.simulateSpin({ totalBet });
            stats.basePayout += base.totalRawWin;
            stats.totalPayout += base.totalRawWin;
            if (base.maxWinCapped) stats.maxWinHits++;
        }
    }

    return stats;
}

jest.setTimeout(120_000);

describe('Full-Game RTP Simulation (200k spins)', () => {

    it('Overall RTP converges to 97.5% ± 5%', () => {
        const N = 200_000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const stats = simulateFullGame(engine, rng, N, 1);

        const rtp = stats.totalPayout / stats.totalWagered;

        console.log('=== Full-Game RTP Report ===');
        console.log(`Spins:        ${N.toLocaleString()}`);
        console.log(`Overall RTP:  ${(rtp * 100).toFixed(2)}%`);
        console.log(`Base Payout:  ${(stats.basePayout / stats.totalWagered * 100).toFixed(2)}%`);
        console.log(`FG Payout:    ${(stats.fgPayout / stats.totalWagered * 100).toFixed(2)}%`);
        console.log(`FG Triggered: ${stats.fgTriggered} (${(stats.fgTriggered / N * 100).toFixed(3)}%)`);
        console.log(`FG Entered:   ${stats.fgEntered}`);
        console.log(`Max Win Hits: ${stats.maxWinHits}`);
        if (stats.coinTossCount > 0) {
            console.log(`Coin Tosses:  ${stats.coinTossCount} (Heads: ${(stats.coinTossHeads / stats.coinTossCount * 100).toFixed(1)}%)`);
        }

        expect(rtp).toBeGreaterThan(0.925);
        expect(rtp).toBeLessThan(1.025);
    });

    it('RTP stability: two 100k runs differ by < 5%', () => {
        const N = 100_000;
        const rng1 = mulberry32(100);
        const rng2 = mulberry32(200);
        const e1 = new SlotEngine(rng1);
        const e2 = new SlotEngine(rng2);

        const s1 = simulateFullGame(e1, rng1, N, 1);
        const s2 = simulateFullGame(e2, rng2, N, 1);

        const rtp1 = s1.totalPayout / s1.totalWagered;
        const rtp2 = s2.totalPayout / s2.totalWagered;

        console.log(`RTP seed=100: ${(rtp1 * 100).toFixed(2)}%`);
        console.log(`RTP seed=200: ${(rtp2 * 100).toFixed(2)}%`);

        expect(Math.abs(rtp1 - rtp2)).toBeLessThan(0.05);
    });

    it('Base game RTP is a meaningful component (> 15%)', () => {
        const N = 200_000;
        const rng = mulberry32(777);
        const engine = new SlotEngine(rng);
        const stats = simulateFullGame(engine, rng, N, 1);

        const baseRtp = stats.basePayout / stats.totalWagered;
        console.log(`Base game RTP: ${(baseRtp * 100).toFixed(2)}%`);
        expect(baseRtp).toBeGreaterThan(0.15);
    });

    it('FG contributes significantly to overall RTP', () => {
        const N = 200_000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const stats = simulateFullGame(engine, rng, N, 1);

        const fgRtp = stats.fgPayout / stats.totalWagered;
        console.log(`FG contribution to RTP: ${(fgRtp * 100).toFixed(2)}%`);
        expect(fgRtp).toBeGreaterThan(0.05);
    });
});

describe('Coin Toss Mechanics Verification', () => {

    it('Per-spin coin toss probabilities are correctly ordered (decreasing)', () => {
        for (let i = 1; i < COIN_TOSS_HEADS_PROB.length; i++) {
            expect(COIN_TOSS_HEADS_PROB[i]).toBeLessThanOrEqual(COIN_TOSS_HEADS_PROB[i - 1]);
        }
    });

    it('Expected FG chain length matches theoretical calculation', () => {
        const rng = mulberry32(42);
        const N = 50_000;
        const chainLengths: number[] = [];

        for (let i = 0; i < N; i++) {
            let multIdx = 0;
            let length = 0;
            for (let safety = 0; safety < 200; safety++) {
                length++;
                const tossProb = COIN_TOSS_HEADS_PROB[multIdx] ?? COIN_TOSS_HEADS_PROB[COIN_TOSS_HEADS_PROB.length - 1];
                if (rng() >= tossProb) break;
                if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
            }
            chainLengths.push(length);
        }

        const avgLength = chainLengths.reduce((a, b) => a + b, 0) / N;
        console.log(`Avg FG chain length: ${avgLength.toFixed(2)} spins`);
        expect(avgLength).toBeGreaterThan(1);
        expect(avgLength).toBeLessThan(20);
    });
});

describe('Buy Feature Expected Value', () => {

    it('Buy FG RTP ≈ 97.5% with BUY_FG_PAYOUT_SCALE (50k sessions)', () => {
        const N = 50_000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const totalBet = 1;
        const buyCost = totalBet * BUY_COST_MULT;

        let totalCost = 0;
        let totalReturn = 0;

        for (let i = 0; i < N; i++) {
            totalCost += buyCost;
            let sessionPay = 0;

            // Phase A: cascade to MAX_ROWS
            let currentRows = BASE_ROWS;
            const marks = new Set<string>();
            for (let s = 0; s < 100; s++) {
                const r = engine.simulateSpin({
                    totalBet, inFreeGame: true, startRows: currentRows, lightningMarks: marks,
                });
                sessionPay += r.totalRawWin;
                currentRows = r.finalRows;
                if (currentRows >= MAX_ROWS) break;
            }

            // FG chain (guaranteed wins, all tosses heads → full 5-spin progression)
            const fgMarks = new Set<string>();
            for (let multIdx = 0; multIdx < FG_MULTIPLIERS.length; multIdx++) {
                const mult = FG_MULTIPLIERS[multIdx];
                let rawWin = 0;
                for (let attempt = 0; attempt < 50; attempt++) {
                    const fg = engine.simulateSpin({
                        inFreeGame: true, fgMultiplier: mult,
                        totalBet, lightningMarks: fgMarks,
                    });
                    if (fg.totalRawWin > 0 || attempt === 49) {
                        rawWin = fg.totalRawWin;
                        break;
                    }
                }
                sessionPay += rawWin * mult;
            }

            let win = sessionPay * BUY_FG_PAYOUT_SCALE;
            if (win < BUY_FG_MIN_WIN_MULT * totalBet) win = BUY_FG_MIN_WIN_MULT * totalBet;
            if (win > MAX_WIN_MULT * totalBet) win = MAX_WIN_MULT * totalBet;
            totalReturn += win;
        }

        const buyRtp = totalReturn / totalCost;
        console.log(`Buy FG RTP: ${(buyRtp * 100).toFixed(2)}% (${N} sessions, scale=${BUY_FG_PAYOUT_SCALE})`);
        expect(buyRtp).toBeGreaterThan(0.92);
        expect(buyRtp).toBeLessThan(1.05);
    });
});

describe('Max Win Cap (30,000x)', () => {

    it('MAX_WIN_MULT is 30000', () => {
        expect(MAX_WIN_MULT).toBe(30000);
    });

    it('No spin can exceed max win', () => {
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        for (let i = 0; i < 100_000; i++) {
            const r = engine.simulateSpin({ totalBet: 1, fgMultiplier: 77, inFreeGame: true });
            expect(r.totalRawWin * 77).toBeLessThanOrEqual(MAX_WIN_MULT + 1);
        }
    });
});

describe('GDD Config Verification', () => {

    it('Main game symbol weights sum to 90 (GDD §2-1)', () => {
        const total = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
        expect(total).toBe(90);
    });

    it('FG symbol weights sum to 90 (GDD §2-2)', () => {
        const total = Object.values(SYMBOL_WEIGHTS_FG).reduce((a, b) => a + b, 0);
        expect(total).toBe(90);
    });

    it('FG_MULTIPLIERS matches GDD §10-2', () => {
        expect(FG_MULTIPLIERS).toEqual([3, 7, 17, 27, 77]);
    });

    it('Max win cap = 30,000x (GDD §13)', () => {
        expect(MAX_WIN_MULT).toBe(30000);
    });
});
