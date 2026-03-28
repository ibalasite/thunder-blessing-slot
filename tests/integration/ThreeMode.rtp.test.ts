/**
 * Four-Mode Independent RTP Simulation
 *
 * Uses engine.computeFullSpin directly for each mode to ensure perfect
 * alignment with the actual game engine. Each mode targets 97.5% RTP.
 *
 * MODE 1: Main Game           (1× bet)
 * MODE 2: Buy Free Game       (100× bet)
 * MODE 3: Extra Bet           (2× bet)
 * MODE 4: Extra Bet + Buy FG  (100× bet, SC guarantee in all spins)
 *
 * @jest-environment node
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    BUY_COST_MULT, EXTRA_BET_MULT,
} from '../../assets/scripts/GameConfig';

jest.setTimeout(300_000);

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

function simMode(mode: 'main' | 'buyFG' | 'extraBet', spinsPerSeed: number, totalBet: number) {
    let wagered = 0, payout = 0, fgEntered = 0;

    for (const seed of SEEDS) {
        const rng = mulberry32(seed);
        const engine = new SlotEngine(rng);
        for (let i = 0; i < spinsPerSeed; i++) {
            const o = engine.computeFullSpin({ mode, totalBet });
            wagered += o.wagered;
            payout += o.totalWin;
            if (o.fgTriggered) fgEntered++;
        }
    }

    return { wagered, payout, fgEntered, rtp: payout / wagered };
}

function simEBBuyFG(spinsPerSeed: number, totalBet: number) {
    let wagered = 0, payout = 0;

    for (const seed of SEEDS) {
        const rng = mulberry32(seed);
        const engine = new SlotEngine(rng);
        for (let i = 0; i < spinsPerSeed; i++) {
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet, extraBetOn: true });
            wagered += o.wagered;
            payout += o.totalWin;
        }
    }

    return { wagered, payout, rtp: payout / wagered };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('MODE 1: Main Game RTP', () => {
    it('Main Game RTP = 97.5% ± 5% (10 seeds × 200k)', () => {
        const r = simMode('main', 200_000, 1);
        console.log(`Main Game RTP: ${(r.rtp * 100).toFixed(2)}% (${SEEDS.length} seeds × 200k = ${SEEDS.length * 200}k spins)`);
        expect(r.rtp).toBeGreaterThan(0.925);
        expect(r.rtp).toBeLessThan(1.025);
    });
});

describe('MODE 2: Buy Free Game RTP', () => {
    it('Buy FG RTP = 97.5% ± 4% (10 seeds × 50k)', () => {
        const r = simMode('buyFG', 50_000, 1);
        console.log(`Buy FG RTP: ${(r.rtp * 100).toFixed(2)}% (${SEEDS.length} seeds × 50k = ${SEEDS.length * 50}k sessions)`);
        expect(r.rtp).toBeGreaterThan(0.935);
        expect(r.rtp).toBeLessThan(1.015);
    });
});

describe('MODE 3: Extra Bet RTP', () => {
    it('Extra Bet RTP = 97.5% ± 5% (10 seeds × 200k)', () => {
        const r = simMode('extraBet', 200_000, 1);
        console.log(`Extra Bet RTP: ${(r.rtp * 100).toFixed(2)}% (${SEEDS.length} seeds × 200k = ${SEEDS.length * 200}k spins)`);
        expect(r.rtp).toBeGreaterThan(0.925);
        expect(r.rtp).toBeLessThan(1.025);
    });
});

describe('MODE 4: Extra Bet ON + Buy Free Game RTP', () => {
    it('EB+BuyFG RTP = 97.5% ± 4% (10 seeds × 50k)', () => {
        const r = simEBBuyFG(50_000, 1);
        console.log(`EB+BuyFG RTP: ${(r.rtp * 100).toFixed(2)}% (${SEEDS.length} seeds × 50k = ${SEEDS.length * 50}k sessions)`);
        expect(r.rtp).toBeGreaterThan(0.935);
        expect(r.rtp).toBeLessThan(1.015);
    });
});
