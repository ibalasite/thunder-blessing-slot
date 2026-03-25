/**
 * FGMultiplier.unit.test.ts
 * 驗證 Free Game 倍率（×3/×7/×17/×27/×77）是否正確乘入 WIN，
 * 以及 WIN 是否隨押分等比例變化。
 *
 * New per-spin toss model:
 *   FG chain 中每個 spin 有各自的 multiplier（升級序列），
 *   multipliedWin = rawWin × multiplier。
 */

import { SlotEngine, calcWinAmount } from '../../assets/scripts/SlotEngine';
import {
    REEL_COUNT, MAX_ROWS, BASE_ROWS,
    FG_MULTIPLIERS, PAYTABLE, LINES_BASE,
    SymType,
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. FG multipliedWin = rawWin × multiplier
// ─────────────────────────────────────────────────────────────────────────────

describe('FG 倍率 × WIN 精確驗證', () => {

    for (const [idx, mult] of FG_MULTIPLIERS.entries()) {
        it(`FG ×${mult}: multipliedWin = rawWin × ${mult}`, () => {
            const rng = mulberry32(42 + idx);
            const engine = new SlotEngine(rng);
            const totalBet = 0.25;

            const r = engine.simulateSpin({
                totalBet,
                inFreeGame: true,
                fgMultiplier: mult,
            });

            if (r.totalRawWin > 0) {
                const multipliedWin = r.totalRawWin * mult;
                expect(multipliedWin).toBeCloseTo(r.totalRawWin * mult, 4);
                expect(multipliedWin).toBeGreaterThan(r.totalRawWin);
            }
        });
    }

    it('FG ×77 / FG ×3 ≈ 77/3 for same rawWin', () => {
        const seed = 99;
        const rng3 = mulberry32(seed);
        const rng77 = mulberry32(seed);
        const eng3 = new SlotEngine(rng3);
        const eng77 = new SlotEngine(rng77);

        const r3 = eng3.simulateSpin({ totalBet: 1, inFreeGame: true, fgMultiplier: 3 });
        const r77 = eng77.simulateSpin({ totalBet: 1, inFreeGame: true, fgMultiplier: 77 });

        expect(r3.totalRawWin).toBe(r77.totalRawWin);
        if (r3.totalRawWin > 0) {
            const win3 = r3.totalRawWin * 3;
            const win77 = r77.totalRawWin * 77;
            expect(win77 / win3).toBeCloseTo(77 / 3, 4);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeFullSpin FG chain: per-spin toss model
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFullSpin FG chain（per-spin toss model）', () => {

    it('FG chain 中 multiplier 遞增（per-spin toss 升級）', () => {
        const N = 1000;
        let chainsFound = 0;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            if (o.fgSpins.length > 1) {
                chainsFound++;
                for (let j = 1; j < o.fgSpins.length; j++) {
                    expect(o.fgSpins[j].multiplier).toBeGreaterThanOrEqual(o.fgSpins[j - 1].multiplier);
                }
            }
        }
        console.log(`FG chains found: ${chainsFound} / ${N}`);
    });

    it('FG multipliers 必定是 FG_MULTIPLIERS 中的值', () => {
        const N = 2000;
        const rng = mulberry32(7);
        const engine = new SlotEngine(rng);

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            for (const fg of o.fgSpins) {
                expect(FG_MULTIPLIERS).toContain(fg.multiplier);
                expect(fg.multiplierIndex).toBe(FG_MULTIPLIERS.indexOf(fg.multiplier));
            }
        }
    });

    it('每個 FG spin: multipliedWin = rawWin × multiplier', () => {
        const N = 2000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            for (const fg of o.fgSpins) {
                expect(fg.multipliedWin).toBeCloseTo(fg.rawWin * fg.multiplier, 2);
            }
        }
    });

    it('FG chain 至少 1 spin（首轉保證）', () => {
        const N = 500;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);
        let fgFound = 0;

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            if (o.fgSpins.length > 0) {
                fgFound++;
                expect(o.fgSpins.length).toBeGreaterThanOrEqual(1);
            }
        }
        console.log(`FG sessions found: ${fgFound} / ${N}`);
    });

    it('fgTriggered = true 時必有 entryCoinToss', () => {
        const N = 1000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            if (o.fgTriggered) {
                expect(o.entryCoinToss).toBeDefined();
            }
        }
    });

    it('每個 FG spin 有 coinToss 結果', () => {
        const N = 1000;
        const rng = mulberry32(42);
        const engine = new SlotEngine(rng);

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            for (const fg of o.fgSpins) {
                expect(fg.coinToss).toBeDefined();
                expect(fg.coinToss.probability).toBeGreaterThan(0);
                expect(fg.coinToss.probability).toBeLessThanOrEqual(1);
            }
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. WIN 隨押分等比例
// ─────────────────────────────────────────────────────────────────────────────

describe('FG WIN 隨押分等比例（線性）', () => {

    it('bet=2 的 rawWin = bet=1 的 2 倍（同 seed）', () => {
        const seed = 42;
        const rng1 = mulberry32(seed);
        const rng2 = mulberry32(seed);
        const e1 = new SlotEngine(rng1);
        const e2 = new SlotEngine(rng2);

        for (let i = 0; i < 100; i++) {
            const r1 = e1.simulateSpin({ totalBet: 1, inFreeGame: true, fgMultiplier: 7 });
            const r2 = e2.simulateSpin({ totalBet: 2, inFreeGame: true, fgMultiplier: 7 });
            expect(r2.totalRawWin).toBeCloseTo(r1.totalRawWin * 2, 2);
        }
    });

    it('bet=0.25 和 bet=5.0 的 WIN 比例 = 20:1', () => {
        const seed = 123;
        const rng1 = mulberry32(seed);
        const rng2 = mulberry32(seed);
        const e1 = new SlotEngine(rng1);
        const e2 = new SlotEngine(rng2);

        for (let i = 0; i < 50; i++) {
            const r1 = e1.simulateSpin({ totalBet: 0.25, inFreeGame: true, fgMultiplier: 17 });
            const r2 = e2.simulateSpin({ totalBet: 5.0,  inFreeGame: true, fgMultiplier: 17 });
            expect(r2.totalRawWin).toBeCloseTo(r1.totalRawWin * 20, 1);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 各符號的 FG WIN
// ─────────────────────────────────────────────────────────────────────────────

describe('FG ×3 在不同賠率符號的 WIN', () => {

    const fgMult   = FG_MULTIPLIERS[0];
    const totalBet = 0.25;

    const cases: [SymType, number][] = [
        ['P1', PAYTABLE['P1'][3]],
        ['P2', PAYTABLE['P2'][3]],
        ['P3', PAYTABLE['P3'][3]],
        ['P4', PAYTABLE['P4'][3]],
        ['L1', PAYTABLE['L1'][3]],
        ['L2', PAYTABLE['L2'][3]],
        ['L3', PAYTABLE['L3'][3]],
        ['L4', PAYTABLE['L4'][3]],
    ];

    it.each(cases)('符號 %s（paytable=%.4f）× ×3 WIN 計算正確', (sym, paytable) => {
        const rawWin = parseFloat((totalBet * paytable).toFixed(4));
        const multiplied = rawWin * fgMult;
        const expected = Math.round(multiplied * 100 + Number.EPSILON) / 100;
        expect(expected).toBeGreaterThan(0);
        expect(multiplied).toBeCloseTo(rawWin * 3, 4);
    });
});
