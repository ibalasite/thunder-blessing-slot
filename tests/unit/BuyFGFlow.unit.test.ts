/**
 * BuyFGFlow.unit.test.ts
 * 驗證 Buy Free Game 的核心行為（new per-spin toss model）:
 *   1. computeFullSpin('buyFG') 必定觸發 FG（fgTriggered = true）
 *   2. Entry toss = 100%（保證進入）
 *   3. 多次 intro spin 的 rows 會遞增累加
 *   4. FG chain 至少有 1 個 spin
 *   5. wagered = totalBet × BUY_COST_MULT
 *   6. FG spins 的 multiplier 遞增（per-spin toss model）
 */
import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    BASE_ROWS, MAX_ROWS, BUY_COST_MULT,
    BUY_FG_MIN_WIN_MULT, FG_MULTIPLIERS,
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

describe('Buy Free Game — computeFullSpin', () => {

    const TRIALS = 200;

    it('entryCoinToss is defined and always heads (100% entry)', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.entryCoinToss).toBeDefined();
            expect(o.entryCoinToss!.heads).toBe(true);
        }
    });

    it('fgTriggered is always true', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgTriggered).toBe(true);
        }
    });

    it('has at most 5 FG spins (full progression or max win cap)', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgSpins.length).toBeGreaterThanOrEqual(1);
            expect(o.fgSpins.length).toBeLessThanOrEqual(FG_MULTIPLIERS.length);
        }
    });

    it('baseSpins show progressive row expansion across intro spins', () => {
        let foundProgressive = false;
        for (let seed = 0; seed < 500; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });

            if (o.baseSpins.length > 1) {
                const maxFinalRows = Math.max(...o.baseSpins.map(s => s.finalRows));
                if (maxFinalRows > BASE_ROWS) {
                    foundProgressive = true;
                }
                const lastSpin = o.baseSpins[o.baseSpins.length - 1];
                expect(lastSpin.finalRows).toBeGreaterThanOrEqual(MAX_ROWS);
            }
        }
        expect(foundProgressive).toBe(true);
    });

    it('wagered = totalBet × BUY_COST_MULT', () => {
        const engine = new SlotEngine(mulberry32(42));
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 2 });
        expect(o.wagered).toBe(2 * BUY_COST_MULT);
    });

    it('mode = "buyFG" is set correctly', () => {
        const engine = new SlotEngine(mulberry32(42));
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
        expect(o.mode).toBe('buyFG');
    });

    it('FG spins use multipliers from FG_MULTIPLIERS in non-decreasing order', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            for (let i = 0; i < o.fgSpins.length; i++) {
                expect(FG_MULTIPLIERS).toContain(o.fgSpins[i].multiplier);
                if (i > 0) {
                    expect(o.fgSpins[i].multiplier).toBeGreaterThanOrEqual(o.fgSpins[i - 1].multiplier);
                }
            }
        }
    });

    it('first FG spin starts at x3', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgSpins[0].multiplier).toBe(3);
        }
    });

    it('all FG spin coin tosses are heads (guaranteed progression)', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            for (const fg of o.fgSpins) {
                expect(fg.coinToss.heads).toBe(true);
                expect(fg.coinToss.probability).toBe(1.0);
            }
        }
    });

    it('FG spins cover all 5 multiplier levels: x3, x7, x17, x27, x77', () => {
        const engine = new SlotEngine(mulberry32(42));
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
        const mults = o.fgSpins.map(fg => fg.multiplier);
        expect(mults).toEqual(FG_MULTIPLIERS);
    });

    it(`totalWin >= ${BUY_FG_MIN_WIN_MULT}× BET (minimum floor)`, () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.totalWin).toBeGreaterThanOrEqual(BUY_FG_MIN_WIN_MULT);
        }
    });

    it('does not get stuck (completes within reasonable intro spins)', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.baseSpins.length).toBeLessThanOrEqual(100);
            expect(o.baseSpins.length).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('Buy Free Game vs Main Game comparison', () => {

    it('Buy FG always has fgSpins; Main Game usually does not', () => {
        let mainFGCount = 0;
        let buyFGCount = 0;
        const N = 100;

        for (let seed = 0; seed < N; seed++) {
            const eng1 = new SlotEngine(mulberry32(seed));
            const eng2 = new SlotEngine(mulberry32(seed));

            const main = eng1.computeFullSpin({ mode: 'main', totalBet: 1 });
            const buy  = eng2.computeFullSpin({ mode: 'buyFG', totalBet: 1 });

            if (main.fgSpins.length > 0) mainFGCount++;
            if (buy.fgSpins.length > 0) buyFGCount++;
        }

        expect(buyFGCount).toBe(N);
        expect(mainFGCount).toBeLessThan(N);
    });
});
