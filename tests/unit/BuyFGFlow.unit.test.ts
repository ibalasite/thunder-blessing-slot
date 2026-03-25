/**
 * BuyFGFlow.unit.test.ts
 * 驗證 Buy Free Game 的核心行為：
 *   1. computeFullSpin('buyFG') 必定觸發 FG（不會停在半路）
 *   2. 無入場硬幣；FG_TRIGGER 通過後保證進入 FG，tier 由升級硬幣決定
 *   3. 多次 intro spin 的 rows 會遞增累加
 *   4. FG chain 至少有 1 個 spin
 *   5. wagered = totalBet × BUY_COST_MULT
 */
import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    BASE_ROWS, MAX_ROWS, BUY_COST_MULT, BUY_FG_PAYOUT_SCALE,
    BUY_FG_MIN_WIN_MULT, FG_MULTIPLIERS, FG_ROUND_COUNTS,
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

    it('does not set entryCoinToss (automatic FG entry)', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.entryCoinToss).toBeUndefined();
        }
    });

    it('always enters FG chain (fgSpins.length >= 1)', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgSpins.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('baseSpins show progressive row expansion across intro spins', () => {
        let foundProgressive = false;
        for (let seed = 0; seed < 500; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });

            if (o.baseSpins.length > 1) {
                // At least one spin should have finalRows > BASE_ROWS
                const maxFinalRows = Math.max(...o.baseSpins.map(s => s.finalRows));
                if (maxFinalRows > BASE_ROWS) {
                    foundProgressive = true;
                }
                // Last intro spin should reach MAX_ROWS (since it triggers FG)
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

    it('mode = "buyFG" and modePayoutScale = BUY_FG_PAYOUT_SCALE', () => {
        const engine = new SlotEngine(mulberry32(42));
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
        expect(o.mode).toBe('buyFG');
        expect(o.modePayoutScale).toBe(BUY_FG_PAYOUT_SCALE);
    });

    it('FG spins 使用相同的 multiplier（tier 決定）', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(FG_MULTIPLIERS).toContain(o.fgSpins[0].multiplier);
            const mult = o.fgSpins[0].multiplier;
            for (const fg of o.fgSpins) {
                expect(fg.multiplier).toBe(mult);
            }
        }
    });

    it('FG chain 至少 8 輪（GDD minimum）', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgSpins.length).toBeGreaterThanOrEqual(8);
        }
    });

    it('fgTier.rounds 等於 fgSpins.length（除非 max win capped）', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.fgTier).toBeDefined();
            if (!o.maxWinCapped) {
                expect(o.fgSpins.length).toBe(o.fgTier!.rounds);
            }
            expect(FG_ROUND_COUNTS).toContain(o.fgTier!.rounds);
        }
    });

    it('tierUpgrades 至少有 1 筆', () => {
        for (let seed = 0; seed < TRIALS; seed++) {
            const engine = new SlotEngine(mulberry32(seed));
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
            expect(o.tierUpgrades.length).toBeGreaterThanOrEqual(1);
        }
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
            expect(o.baseSpins.length).toBeLessThanOrEqual(50);
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

        // Buy FG should ALWAYS have FG spins
        expect(buyFGCount).toBe(N);
        // Main Game triggers FG rarely
        expect(mainFGCount).toBeLessThan(N);
    });
});
