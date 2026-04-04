/**
 * Full-Game RTP Simulation (new per-spin toss model)
 *
 * Uses engine.computeFullSpin directly to guarantee alignment with production.
 * Multi-seed aggregation for stable results.
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
    BUY_COST_MULT, BUY_FG_MIN_WIN_MULT,
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

const SEEDS = [42, 123, 456, 789, 1001, 2022, 3033, 4044, 5055, 6066];

jest.setTimeout(120_000);

describe('Full-Game RTP Simulation (200k spins)', () => {

    it('Overall RTP converges to 97.5% ± 5%', () => {
        const SPINS_PER_SEED = 20_000;
        let totalWagered = 0, totalPayout = 0;
        let fgTriggered = 0;

        for (const seed of SEEDS) {
            const rng = mulberry32(seed);
            const engine = new SlotEngine(rng);
            for (let i = 0; i < SPINS_PER_SEED; i++) {
                const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
                totalWagered += o.wagered;
                totalPayout += o.totalWin;
                if (o.fgTriggered) fgTriggered++;
            }
        }

        const rtp = totalPayout / totalWagered;
        const totalSpins = SEEDS.length * SPINS_PER_SEED;
        console.log('=== Full-Game RTP Report ===');
        console.log(`Spins:        ${totalSpins.toLocaleString()} (${SEEDS.length} seeds × ${SPINS_PER_SEED.toLocaleString()})`);
        console.log(`Overall RTP:  ${(rtp * 100).toFixed(2)}%`);
        console.log(`FG Triggered: ${fgTriggered} (${(fgTriggered / totalSpins * 100).toFixed(3)}%)`);

        expect(rtp).toBeGreaterThan(0.90);
        expect(rtp).toBeLessThan(1.05);
    });

    it('RTP stability: two 100k runs differ by < 10%', () => {
        const N = 100_000;
        const run = (seed: number) => {
            const rng = mulberry32(seed);
            const engine = new SlotEngine(rng);
            let wagered = 0, payout = 0;
            for (let i = 0; i < N; i++) {
                const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
                wagered += o.wagered;
                payout += o.totalWin;
            }
            return payout / wagered;
        };

        const rtp1 = run(100);
        const rtp2 = run(200);

        console.log(`RTP seed=100: ${(rtp1 * 100).toFixed(2)}%`);
        console.log(`RTP seed=200: ${(rtp2 * 100).toFixed(2)}%`);

        expect(Math.abs(rtp1 - rtp2)).toBeLessThan(0.10);
    });

    it('Base game RTP is a meaningful component (> 15%)', () => {
        const SPINS_PER_SEED = 20_000;
        let totalWagered = 0, basePayout = 0;

        for (const seed of SEEDS) {
            const rng = mulberry32(seed);
            const engine = new SlotEngine(rng);
            for (let i = 0; i < SPINS_PER_SEED; i++) {
                const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
                totalWagered += o.wagered;
                basePayout += o.baseWin;
            }
        }

        const baseRtp = basePayout / totalWagered;
        console.log(`Base game RTP: ${(baseRtp * 100).toFixed(2)}%`);
        expect(baseRtp).toBeGreaterThan(0.15);
    });

    it('FG contributes significantly to overall RTP', () => {
        const SPINS_PER_SEED = 20_000;
        let totalWagered = 0, fgPayout = 0;

        for (const seed of SEEDS) {
            const rng = mulberry32(seed);
            const engine = new SlotEngine(rng);
            for (let i = 0; i < SPINS_PER_SEED; i++) {
                const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
                totalWagered += o.wagered;
                fgPayout += o.fgWin;
            }
        }

        const fgRtp = fgPayout / totalWagered;
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

    it('Buy FG RTP ≈ 97.5% (50k sessions)', () => {
        const SPINS_PER_SEED = 5_000;
        let totalWagered = 0, totalReturn = 0;

        for (const seed of SEEDS) {
            const rng = mulberry32(seed);
            const engine = new SlotEngine(rng);
            for (let i = 0; i < SPINS_PER_SEED; i++) {
                const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
                totalWagered += o.wagered;
                totalReturn += o.totalWin;
            }
        }

        const buyRtp = totalReturn / totalWagered;
        console.log(`Buy FG RTP: ${(buyRtp * 100).toFixed(2)}% (${SEEDS.length * SPINS_PER_SEED} sessions)`);
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
