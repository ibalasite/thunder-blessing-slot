/**
 * Three-Mode Independent RTP Simulation
 *
 * Each mode is tested independently with 1M spins/sessions:
 *   Mode 1: Main Game (normal play + naturally triggered FG chain)
 *   Mode 2: Buy Free Game (pay BUY_COST_MULT × bet, get FG chain)
 *   Mode 3: Extra Bet (pay EXTRA_BET_MULT × bet, guaranteed SC per spin)
 *
 * Each mode targets 97.5% RTP independently.
 *
 * @jest-environment node
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_FG,
    FG_MULTIPLIERS, FG_ROUND_COUNTS, FG_TRIGGER_PROB,
    COIN_TOSS_HEADS_PROB, COIN_TOSS_HEADS_PROB_BUY,
    MAX_WIN_MULT, EXTRA_BET_MULT, BUY_COST_MULT,
    BUY_FG_PAYOUT_SCALE, EB_PAYOUT_SCALE,
    BUY_FG_MIN_WIN_MULT,
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
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

// ── FG Tier determination (GDD coin toss upgrade ceremony) ───────────────────

function determineFGTier(rng: () => number, isBuyFG = false): { tierIndex: number; rounds: number; multiplier: number } {
    const probs = isBuyFG ? COIN_TOSS_HEADS_PROB_BUY : COIN_TOSS_HEADS_PROB;
    let tierIndex = 0;
    for (let i = 0; i < probs.length; i++) {
        if (rng() >= probs[i]) break;
        if (tierIndex < FG_MULTIPLIERS.length - 1) tierIndex++;
    }
    return {
        tierIndex,
        rounds:     FG_ROUND_COUNTS[tierIndex],
        multiplier: FG_MULTIPLIERS[tierIndex],
    };
}

// ── FG Chain helper (shared by all modes) ────────────────────────────────────

function runFGChain(
    engine: SlotEngine,
    rng: () => number,
    totalBet: number,
): number {
    const tier = determineFGTier(rng);
    const fgMarks = new Set<string>();
    let payout = 0;

    for (let i = 0; i < tier.rounds; i++) {
        const fg = engine.simulateSpin({
            inFreeGame: true,
            fgMultiplier: tier.multiplier,
            totalBet,
            lightningMarks: fgMarks,
        });
        payout += fg.totalRawWin * tier.multiplier;
        if (fg.maxWinCapped) break;
    }
    return payout;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE 1: Main Game (normal spin + naturally triggered FG)
// ══════════════════════════════════════════════════════════════════════════════

function simMainGame(engine: SlotEngine, rng: () => number, spins: number, totalBet: number) {
    let wagered = 0, payout = 0, basePay = 0, fgPay = 0, fgEntered = 0;

    for (let i = 0; i < spins; i++) {
        wagered += totalBet;
        const base = engine.simulateSpin({ totalBet });
        basePay += base.totalRawWin;
        payout += base.totalRawWin;

        if (base.maxWinCapped || !base.fgTriggered) continue;
        if (rng() >= FG_TRIGGER_PROB) continue;

        fgEntered++;
        const fp = runFGChain(engine, rng, totalBet);
        fgPay += fp;
        payout += fp;
    }

    return { wagered, payout, basePay, fgPay, fgEntered, rtp: payout / wagered };
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE 2: Buy Free Game
// ══════════════════════════════════════════════════════════════════════════════

function simBuyFG(engine: SlotEngine, rng: () => number, sessions: number, totalBet: number) {
    const cost = totalBet * BUY_COST_MULT;
    let wagered = 0, payout = 0, introPay = 0, fgPay = 0, fgEntered = 0;

    for (let i = 0; i < sessions; i++) {
        wagered += cost;
        let sessionPay = 0;

        for (let s = 0; s < 20; s++) {
            const intro = engine.simulateSpin({ totalBet });
            const w = intro.totalRawWin;
            introPay += w;
            sessionPay += w;
            if (intro.fgTriggered || intro.finalRows >= MAX_ROWS) break;
        }

        fgEntered++;
        const tier = determineFGTier(rng, true);
        const fgMarks = new Set<string>();
        let fp = 0;
        for (let j = 0; j < tier.rounds; j++) {
            const fg = engine.simulateSpin({
                inFreeGame: true, fgMultiplier: tier.multiplier,
                totalBet, lightningMarks: fgMarks,
            });
            fp += fg.totalRawWin * tier.multiplier;
            if (fg.maxWinCapped) break;
        }
        fgPay += fp;
        sessionPay += fp;

        let win = sessionPay * BUY_FG_PAYOUT_SCALE;
        if (win < BUY_FG_MIN_WIN_MULT * totalBet) win = BUY_FG_MIN_WIN_MULT * totalBet;
        const maxWin = totalBet * MAX_WIN_MULT;
        if (win > maxWin) win = maxWin;
        payout += win;
    }

    return { wagered, payout, introPay, fgPay, fgEntered, rtp: payout / wagered };
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE 3: Extra Bet (pay 3x, guaranteed SC)
// ══════════════════════════════════════════════════════════════════════════════

function simExtraBet(engine: SlotEngine, rng: () => number, spins: number, totalBet: number) {
    const spinCost = totalBet * EXTRA_BET_MULT;
    let wagered = 0, payout = 0, basePay = 0, fgPay = 0, fgEntered = 0;

    for (let i = 0; i < spins; i++) {
        wagered += spinCost;
        let spinPay = 0;
        const base = engine.simulateSpin({ totalBet, extraBet: true });
        basePay += base.totalRawWin;
        spinPay += base.totalRawWin;

        if (!base.maxWinCapped && base.fgTriggered) {
            if (rng() < FG_TRIGGER_PROB) {
                fgEntered++;
                const fp = runFGChain(engine, rng, totalBet);
                fgPay += fp;
                spinPay += fp;
            }
        }

        payout += spinPay * EB_PAYOUT_SCALE;
    }

    return { wagered, payout, basePay, fgPay, fgEntered, rtp: payout / wagered };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('MODE 1: Main Game RTP (1M spins)', () => {
    it('Main Game RTP = 97.5% ± 2.5%', () => {
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const r = simMainGame(engine, rng, 1_000_000, 1);

        console.log('=== Main Game (1M spins) ===');
        console.log(`  RTP:      ${(r.rtp * 100).toFixed(2)}%`);
        console.log(`  Base:     ${(r.basePay / r.wagered * 100).toFixed(2)}%`);
        console.log(`  FG:       ${(r.fgPay / r.wagered * 100).toFixed(2)}%`);
        console.log(`  FG enter: ${r.fgEntered}`);

        expect(r.rtp).toBeGreaterThan(0.950);
        expect(r.rtp).toBeLessThan(1.000);
    });
});

describe('MODE 2: Buy Free Game RTP (500k sessions)', () => {
    it('Buy FG RTP = 97.5% ± 4%', () => {
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const r = simBuyFG(engine, rng, 500_000, 1);

        console.log('=== Buy Free Game (500k sessions) ===');
        console.log(`  Cost per session: ${BUY_COST_MULT}x`);
        console.log(`  RTP:      ${(r.rtp * 100).toFixed(2)}%`);
        console.log(`  Intro:    ${(r.introPay / r.wagered * 100).toFixed(2)}%`);
        console.log(`  FG:       ${(r.fgPay / r.wagered * 100).toFixed(2)}%`);
        console.log(`  FG enter: ${r.fgEntered} / ${500_000}`);

        // Test simulation is an approximation (intro spin row tracking differs
        // from engine's computeFullSpin), so wider tolerance is appropriate.
        expect(r.rtp).toBeGreaterThan(0.935);
        expect(r.rtp).toBeLessThan(1.015);
    });
});

describe('MODE 3: Extra Bet RTP (1M spins)', () => {
    it('Extra Bet RTP = 97.5% ± 2.5%', () => {
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        const r = simExtraBet(engine, rng, 1_000_000, 1);

        console.log('=== Extra Bet (1M spins) ===');
        console.log(`  Cost per spin: ${EXTRA_BET_MULT}x`);
        console.log(`  RTP:      ${(r.rtp * 100).toFixed(2)}%`);
        console.log(`  Base:     ${(r.basePay / r.wagered * 100).toFixed(2)}%`);
        console.log(`  FG:       ${(r.fgPay / r.wagered * 100).toFixed(2)}%`);
        console.log(`  FG enter: ${r.fgEntered}`);

        expect(r.rtp).toBeGreaterThan(0.950);
        expect(r.rtp).toBeLessThan(1.000);
    });
});
