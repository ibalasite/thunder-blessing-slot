/**
 * Full-Game RTP Simulation (1,000,000 spins)
 *
 * Simulates the complete game loop:
 *   Base spin → Cascade → FG trigger check → Coin Toss → Free Game chain
 *
 * Verifies:
 *   1. Overall RTP converges to 97.5% ± tolerance
 *   2. Base game RTP component
 *   3. FG contribution to RTP
 *   4. Coin Toss mechanics (tiered probabilities)
 *   5. Buy Feature expected value
 *   6. Max Win cap enforcement
 *
 * Jest timeout: 120s (1M spins can be slow)
 * @jest-environment node
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_FG,
    FG_MULTIPLIERS, FG_TRIGGER_PROB, COIN_TOSS_HEADS_PROB,
    MAX_WIN_MULT, TB_SECOND_HIT_PROB,
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
    SYM,
} from '../../assets/scripts/GameConfig';

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Full game simulation: one "player session" spin ──────────────────────────

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

        const base = engine.simulateSpin({ totalBet });
        stats.basePayout += base.totalRawWin;
        stats.totalPayout += base.totalRawWin;

        if (base.maxWinCapped) {
            stats.maxWinHits++;
            continue;
        }

        if (!base.fgTriggered) continue;
        stats.fgTriggered++;

        // FG trigger probability gate (GDD §10-1: 20%)
        if (rng() >= FG_TRIGGER_PROB) continue;

        // Entry Coin Toss (GDD §9-3: 80% at x3 level)
        stats.coinTossCount++;
        const entryHeads = rng() < COIN_TOSS_HEADS_PROB[0];
        if (entryHeads) stats.coinTossHeads++;
        if (!entryHeads) continue;

        stats.fgEntered++;

        // Free Game chain
        const fgMarks = new Set<string>();
        let multIdx = 0;
        let fgRoundPayout = 0;

        while (true) {
            const mult = FG_MULTIPLIERS[multIdx];
            const fg = engine.simulateSpin({
                inFreeGame: true,
                fgMultiplier: mult,
                totalBet,
                lightningMarks: fgMarks,
            });

            const fgWin = fg.totalRawWin * mult;
            fgRoundPayout += fgWin;
            stats.fgPayout += fgWin;
            stats.totalPayout += fgWin;

            if (fg.maxWinCapped) {
                stats.maxWinHits++;
                break;
            }

            // Per-FG-spin Coin Toss (tiered probability)
            const headsProb = COIN_TOSS_HEADS_PROB[multIdx] ?? 0.40;
            stats.coinTossCount++;
            const heads = rng() < headsProb;
            if (heads) stats.coinTossHeads++;
            if (!heads) break;

            if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
        }
    }

    return stats;
}

// ── Tests ────────────────────────────────────────────────────────────────────

jest.setTimeout(120_000);

describe('Full-Game RTP Simulation (1M spins)', () => {

    it('Overall RTP converges to 97.5% ± 5% (1,000,000 spins)', () => {
        const N = 1_000_000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const stats = simulateFullGame(engine, rng, N, 1);

        const rtp = stats.totalPayout / stats.totalWagered;

        console.log('=== 1M Spin RTP Report ===');
        console.log(`Spins:        ${N.toLocaleString()}`);
        console.log(`Total Wagered:${stats.totalWagered.toFixed(2)}`);
        console.log(`Total Payout: ${stats.totalPayout.toFixed(2)}`);
        console.log(`Overall RTP:  ${(rtp * 100).toFixed(2)}%`);
        console.log(`Base Payout:  ${stats.basePayout.toFixed(2)} (${(stats.basePayout / stats.totalWagered * 100).toFixed(2)}%)`);
        console.log(`FG Payout:    ${stats.fgPayout.toFixed(2)} (${(stats.fgPayout / stats.totalWagered * 100).toFixed(2)}%)`);
        console.log(`FG Triggered: ${stats.fgTriggered} (${(stats.fgTriggered / N * 100).toFixed(3)}%)`);
        console.log(`FG Entered:   ${stats.fgEntered} (${(stats.fgEntered / N * 100).toFixed(3)}%)`);
        console.log(`Max Win Hits: ${stats.maxWinHits}`);
        console.log(`Coin Tosses:  ${stats.coinTossCount} (Heads: ${(stats.coinTossHeads / stats.coinTossCount * 100).toFixed(1)}%)`);

        // RTP should be within 97.5% ± 5% absolute
        expect(rtp).toBeGreaterThan(0.925);
        expect(rtp).toBeLessThan(1.025);
    });

    it('RTP stability: two 500k runs differ by < 3%', () => {
        const N = 500_000;
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

        expect(Math.abs(rtp1 - rtp2)).toBeLessThan(0.03);
    });

    it('Base game RTP is a meaningful component (> 15%)', () => {
        const N = 500_000;
        const rng = mulberry32(777);
        const engine = new SlotEngine(rng);
        const stats = simulateFullGame(engine, rng, N, 1);

        const baseRtp = stats.basePayout / stats.totalWagered;
        console.log(`Base game RTP: ${(baseRtp * 100).toFixed(2)}%`);
        expect(baseRtp).toBeGreaterThan(0.15);
    });

    it('FG contributes significantly to overall RTP', () => {
        const N = 500_000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const stats = simulateFullGame(engine, rng, N, 1);

        const fgRtp = stats.fgPayout / stats.totalWagered;
        console.log(`FG contribution to RTP: ${(fgRtp * 100).toFixed(2)}%`);
        expect(fgRtp).toBeGreaterThan(0.10);
    });
});

describe('Coin Toss Mechanics Verification', () => {

    it('Entry coin toss heads rate ≈ 80% (COIN_TOSS_HEADS_PROB[0])', () => {
        const rng = mulberry32(42);
        const N = 100_000;
        let heads = 0;
        for (let i = 0; i < N; i++) {
            if (rng() < COIN_TOSS_HEADS_PROB[0]) heads++;
        }
        const rate = heads / N;
        expect(rate).toBeGreaterThan(0.78);
        expect(rate).toBeLessThan(0.82);
    });

    it('Tiered coin toss probabilities are correctly ordered', () => {
        for (let i = 1; i < COIN_TOSS_HEADS_PROB.length; i++) {
            expect(COIN_TOSS_HEADS_PROB[i]).toBeLessThanOrEqual(COIN_TOSS_HEADS_PROB[i - 1]);
        }
    });

    it('Expected FG chain length matches theoretical calculation', () => {
        const rng = mulberry32(42);
        const N = 50_000;
        const chainLengths: number[] = [];

        for (let i = 0; i < N; i++) {
            let len = 1;
            let multIdx = 0;
            while (true) {
                const prob = COIN_TOSS_HEADS_PROB[multIdx] ?? 0.40;
                if (rng() >= prob) break;
                len++;
                if (multIdx < COIN_TOSS_HEADS_PROB.length - 1) multIdx++;
            }
            chainLengths.push(len);
        }

        const avgLen = chainLengths.reduce((a, b) => a + b, 0) / N;
        // Theoretical: E[chain] = 1 + p0 + p0*p1 + p0*p1*p2 + ...
        let theoretical = 1;
        let cumProb = 1;
        for (const p of COIN_TOSS_HEADS_PROB) {
            cumProb *= p;
            theoretical += cumProb;
        }
        // After x77, it continues with 40% each time: adds cumProb * 0.4 / (1 - 0.4)
        theoretical += cumProb * COIN_TOSS_HEADS_PROB[4] / (1 - COIN_TOSS_HEADS_PROB[4]);

        console.log(`Avg FG chain length: ${avgLen.toFixed(2)} (theoretical: ${theoretical.toFixed(2)})`);
        expect(avgLen).toBeGreaterThan(theoretical * 0.9);
        expect(avgLen).toBeLessThan(theoretical * 1.1);
    });
});

describe('Buy Feature Expected Value', () => {

    it('Buy FG has positive expected value (includes intro cascade + FG chain)', () => {
        const N = 100_000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const totalBet = 1;
        const buyCost = totalBet * 100;

        let totalCost = 0;
        let totalReturn = 0;

        for (let i = 0; i < N; i++) {
            totalCost += buyCost;

            // Intro cascade spins (up to 20) until reaching MAX_ROWS
            for (let s = 0; s < 20; s++) {
                const intro = engine.simulateSpin({ totalBet });
                totalReturn += intro.totalRawWin;
                if (intro.fgTriggered || intro.finalRows >= MAX_ROWS) break;
            }

            // Entry coin toss at 80% (guaranteed for Buy)
            if (rng() >= COIN_TOSS_HEADS_PROB[0]) continue;

            const fgMarks = new Set<string>();
            let multIdx = 0;

            while (true) {
                const mult = FG_MULTIPLIERS[multIdx];
                const fg = engine.simulateSpin({
                    inFreeGame: true,
                    fgMultiplier: mult,
                    totalBet,
                    lightningMarks: fgMarks,
                });
                totalReturn += fg.totalRawWin * mult;
                if (fg.maxWinCapped) break;

                const prob = COIN_TOSS_HEADS_PROB[multIdx] ?? 0.40;
                if (rng() >= prob) break;
                if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
            }
        }

        const buyRtp = totalReturn / totalCost;
        console.log(`Buy FG RTP: ${(buyRtp * 100).toFixed(2)}% (${N} sessions)`);
        // Buy FG should return meaningful value (>20% of cost)
        expect(buyRtp).toBeGreaterThan(0.20);
        expect(buyRtp).toBeLessThan(2.00);
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

    it('Main game weights match GDD exactly', () => {
        expect(SYMBOL_WEIGHTS[SYM.WILD]).toBe(3);
        expect(SYMBOL_WEIGHTS[SYM.SCATTER]).toBe(4);
        expect(SYMBOL_WEIGHTS[SYM.P1]).toBe(6);
        expect(SYMBOL_WEIGHTS[SYM.P2]).toBe(7);
        expect(SYMBOL_WEIGHTS[SYM.P3]).toBe(8);
        expect(SYMBOL_WEIGHTS[SYM.P4]).toBe(10);
        expect(SYMBOL_WEIGHTS[SYM.L1]).toBe(12);
        expect(SYMBOL_WEIGHTS[SYM.L2]).toBe(12);
        expect(SYMBOL_WEIGHTS[SYM.L3]).toBe(14);
        expect(SYMBOL_WEIGHTS[SYM.L4]).toBe(14);
    });

    it('FG weights match GDD exactly', () => {
        expect(SYMBOL_WEIGHTS_FG[SYM.WILD]).toBe(4);
        expect(SYMBOL_WEIGHTS_FG[SYM.SCATTER]).toBe(6);
        expect(SYMBOL_WEIGHTS_FG[SYM.P1]).toBe(9);
        expect(SYMBOL_WEIGHTS_FG[SYM.P2]).toBe(10);
        expect(SYMBOL_WEIGHTS_FG[SYM.P3]).toBe(11);
        expect(SYMBOL_WEIGHTS_FG[SYM.P4]).toBe(12);
        expect(SYMBOL_WEIGHTS_FG[SYM.L1]).toBe(9);
        expect(SYMBOL_WEIGHTS_FG[SYM.L2]).toBe(9);
        expect(SYMBOL_WEIGHTS_FG[SYM.L3]).toBe(10);
        expect(SYMBOL_WEIGHTS_FG[SYM.L4]).toBe(10);
    });

    it('FG_TRIGGER_PROB = 0.20 (GDD §10-1: 20%)', () => {
        expect(FG_TRIGGER_PROB).toBe(0.20);
    });

    it('TB_SECOND_HIT_PROB = 0.40 (GDD §5: 40%)', () => {
        expect(TB_SECOND_HIT_PROB).toBe(0.40);
    });

    it('COIN_TOSS_HEADS_PROB matches GDD §9-3 tiered probabilities', () => {
        expect(COIN_TOSS_HEADS_PROB).toEqual([0.80, 0.68, 0.56, 0.48, 0.40]);
    });

    it('FG_MULTIPLIERS matches GDD §10-2', () => {
        expect(FG_MULTIPLIERS).toEqual([3, 7, 17, 27, 77]);
    });

    it('Max win cap = 30,000x (GDD §13)', () => {
        expect(MAX_WIN_MULT).toBe(30000);
    });
});
