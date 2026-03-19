/**
 * SlotEngine 整合測試（統計性測試）
 *
 * 測試策略：
 *   - 使用固定 seed 的 seeded PRNG（mulberry32）確保可重現
 *   - 足夠大的樣本讓統計值穩定
 *   - 容忍範圍依 3σ 原則或實際遊戲容忍度設定
 *
 * 注意：JS SlotEngine 與 Python simulator 的 TB 觸發時機不同：
 *   - Python TB：有中獎時也可在 cascade 中段觸發（mid-cascade）
 *   - JS TB：只在無中獎時觸發（end-of-cascade，做為補救機制）
 *   兩者 base RTP 數字因此不同，但各元件（drawSymbol/checkWins/applyTB）
 *   行為已由 unit tests 嚴格驗證。整合測試驗證統計特性在合理範圍內。
 *
 * Jest timeout: 60s
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    SYM, SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_FG,
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
    TB_SECOND_HIT_PROB, FG_MULTIPLIERS, MAX_WIN_MULT,
    COIN_TOSS_HEADS_PROB, FG_TRIGGER_PROB,
} from '../../assets/scripts/GameConfig';

// ─────────────────────────────────────────────────────────────────────────────
// 可重現的 seeded PRNG（mulberry32）
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function assertRate(
    actual: number,
    expected: number,
    tolerancePct: number,
    label: string
) {
    const lo = expected * (1 - tolerancePct / 100);
    const hi = expected * (1 + tolerancePct / 100);
    if (actual < lo || actual > hi) {
        throw new Error(
            `${label}: expected ${(expected * 100).toFixed(3)}% ±${tolerancePct}%, ` +
            `got ${(actual * 100).toFixed(3)}%`
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 基礎遊戲 RTP 合理性（base game only，不含 FG 倍率）
//
//    JS end-of-cascade TB 架構下，實測 base RTP ≈ 59~61%（seed=42, N=100k）。
//    以 [25%, 80%] 作為合理範圍（比 Python 39% 高是因 TB 時機不同）。
// ─────────────────────────────────────────────────────────────────────────────

describe('基礎遊戲 RTP 合理性', () => {
    const N = 200_000;

    it(`simulateSpin base RTP 在 [25%, 80%] 合理範圍內（${N.toLocaleString()} spins, seed=42）`, () => {
        const rng    = mulberry32(42);
        const engine = new SlotEngine(rng);
        let totalWin = 0;
        for (let i = 0; i < N; i++) {
            totalWin += engine.simulateSpin({ totalBet: 1 }).totalRawWin;
        }
        const rtp = totalWin / N;
        expect(rtp).toBeGreaterThan(0.25);
        expect(rtp).toBeLessThan(0.80);
    });

    it('base RTP 穩定：兩組 100k spins RTP 差距 < 5%', () => {
        const e1 = new SlotEngine(mulberry32(100));
        const e2 = new SlotEngine(mulberry32(200));
        const n = 100_000;
        let w1 = 0, w2 = 0;
        for (let i = 0; i < n; i++) {
            w1 += e1.simulateSpin({ totalBet: 1 }).totalRawWin;
            w2 += e2.simulateSpin({ totalBet: 1 }).totalRawWin;
        }
        expect(Math.abs(w1 / n - w2 / n)).toBeLessThan(0.05);
    });

    it('FG 模式 RTP（base，不含倍率）高於主遊戲 — FG 有更好的符號權重', () => {
        const n = 100_000;
        const eBase = new SlotEngine(mulberry32(42));
        const eFG   = new SlotEngine(mulberry32(42));
        let winBase = 0, winFG = 0;
        for (let i = 0; i < n; i++) {
            winBase += eBase.simulateSpin({ totalBet: 1 }).totalRawWin;
            winFG   += eFG.simulateSpin({ inFreeGame: true, totalBet: 1 }).totalRawWin;
        }
        // FG 使用更高付費符號權重，即使不算倍率也應高於主遊戲
        expect(winFG / n).toBeGreaterThan(winBase / n * 1.05);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FG 倍率效果驗證
// ─────────────────────────────────────────────────────────────────────────────

describe('FG 倍率效果', () => {
    it('FG ×3 倍率後總收益比 base 高 200%+', () => {
        const n = 100_000;
        const eFG   = new SlotEngine(mulberry32(99));
        const eBase = new SlotEngine(mulberry32(99));
        let winFGmult = 0, winBase = 0;
        for (let i = 0; i < n; i++) {
            winFGmult += eFG.simulateSpin({ inFreeGame: true, fgMultiplier: 3, totalBet: 1 }).totalRawWin * 3;
            winBase   += eBase.simulateSpin({ totalBet: 1 }).totalRawWin;
        }
        // FG ×3 倍率後，期望收益至少是主遊戲 2× 以上
        expect(winFGmult / n).toBeGreaterThan(winBase / n * 2.0);
    });

    it('FG 各倍率期望收益遞增', () => {
        const wins = FG_MULTIPLIERS.map(fm => {
            const e = new SlotEngine(mulberry32(777));
            let w = 0;
            for (let i = 0; i < 50_000; i++) {
                w += e.simulateSpin({ inFreeGame: true, totalBet: 1 }).totalRawWin * fm;
            }
            return w / 50_000;
        });
        for (let i = 1; i < wins.length; i++) {
            expect(wins[i]).toBeGreaterThan(wins[i - 1]);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 符號分佈驗證
// ─────────────────────────────────────────────────────────────────────────────

describe('符號分佈驗證', () => {
    const N = 300_000;

    it(`主遊戲：drawSymbol() 分佈吻合權重（±5% 相對，${N.toLocaleString()} 次）`, () => {
        const rng    = mulberry32(1337);
        const engine = new SlotEngine(rng);
        const counts: Record<string, number> = {};
        for (let i = 0; i < N; i++) {
            const s = engine.drawSymbol();
            counts[s] = (counts[s] ?? 0) + 1;
        }
        const total = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
        for (const [sym, w] of Object.entries(SYMBOL_WEIGHTS)) {
            assertRate(counts[sym] / N, w / total, 5, `Main ${sym}`);
        }
    });

    it(`FG：drawSymbol(true) 分佈吻合 FG 權重（±5% 相對，${N.toLocaleString()} 次）`, () => {
        const rng    = mulberry32(7777);
        const engine = new SlotEngine(rng);
        const counts: Record<string, number> = {};
        for (let i = 0; i < N; i++) {
            const s = engine.drawSymbol(true);
            counts[s] = (counts[s] ?? 0) + 1;
        }
        const total = Object.values(SYMBOL_WEIGHTS_FG).reduce((a, b) => a + b, 0);
        for (const [sym, w] of Object.entries(SYMBOL_WEIGHTS_FG)) {
            assertRate(counts[sym] / N, w / total, 5, `FG ${sym}`);
        }
    });

    it('FG 中 W 出現率高於主遊戲', () => {
        const mainW = SYMBOL_WEIGHTS[SYM.WILD] / Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
        const fgW   = SYMBOL_WEIGHTS_FG[SYM.WILD] / Object.values(SYMBOL_WEIGHTS_FG).reduce((a, b) => a + b, 0);
        expect(fgW).toBeGreaterThan(mainW);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Extra Bet / SC 驗證
// ─────────────────────────────────────────────────────────────────────────────

describe('Extra Bet / SC 驗證', () => {
    const N = 100_000;

    it(`Extra Bet：100% spin 在 base rows(0-2) 有 SC（${N.toLocaleString()} spins）`, () => {
        const engine = new SlotEngine(mulberry32(2024));
        for (let i = 0; i < N; i++) {
            const r = engine.simulateSpin({ extraBet: true });
            let found = false;
            for (let ri = 0; ri < REEL_COUNT && !found; ri++) {
                for (let row = 0; row < BASE_ROWS && !found; row++) {
                    if (r.initialGrid[ri][row] === SYM.SCATTER) found = true;
                }
            }
            if (!found) throw new Error(`Spin ${i}: no SC in base rows after applyExtraBetSC`);
        }
    });

    it('非 Extra Bet 時 SC 出現率 ≈ 理論值 3/90 per cell（±10%）', () => {
        const engine = new SlotEngine(mulberry32(555));
        const scRate = SYMBOL_WEIGHTS[SYM.SCATTER] / 90;
        let scCells = 0;
        const spins = 50_000;
        const totalCells = spins * REEL_COUNT * MAX_ROWS;
        for (let i = 0; i < spins; i++) {
            const r = engine.simulateSpin();
            for (let ri = 0; ri < REEL_COUNT; ri++)
                for (let row = 0; row < MAX_ROWS; row++)
                    if (r.initialGrid[ri][row] === SYM.SCATTER) scCells++;
        }
        assertRate(scCells / totalCells, scRate, 10, 'SC cell rate');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FG 觸發條件驗證
// ─────────────────────────────────────────────────────────────────────────────

describe('FG 觸發條件', () => {
    it('fgTriggered 出現率 > 0 且 < 30%', () => {
        const engine = new SlotEngine(mulberry32(888));
        let fg = 0;
        const N = 50_000;
        for (let i = 0; i < N; i++) {
            if (engine.simulateSpin().fgTriggered) fg++;
        }
        expect(fg / N).toBeGreaterThan(0);
        expect(fg / N).toBeLessThan(0.30);
    });

    it('fgTriggered=true ↔ finalRows = MAX_ROWS', () => {
        const engine = new SlotEngine(mulberry32(12345));
        for (let i = 0; i < 5_000; i++) {
            const r = engine.simulateSpin();
            if (r.fgTriggered)  expect(r.finalRows).toBe(MAX_ROWS);
            if (!r.fgTriggered) expect(r.finalRows).toBeLessThanOrEqual(MAX_ROWS);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Thunder Blessing 第二擊機率
// ─────────────────────────────────────────────────────────────────────────────

describe('Thunder Blessing 第二擊機率', () => {
    it(`applyTB 第二擊觸發率 ≈ TB_SECOND_HIT_PROB (${TB_SECOND_HIT_PROB}) ±5%`, () => {
        let hits = 0;
        const N = 200_000;
        for (let i = 0; i < N; i++) {
            const r = Math.random();
            const engine = new SlotEngine(() => r);
            const g = Array.from({ length: REEL_COUNT }, () =>
                Array.from({ length: MAX_ROWS }, () => SYM.L4)
            ) as import('../../assets/scripts/GameConfig').SymType[][];
            const marks = new Set(['0,0']);
            const result = engine.applyTB(g, marks, MAX_ROWS);
            // L4→P4 (第一擊), →P3 (第二擊)
            if (result[0][0] === SYM.P3) hits++;
        }
        assertRate(hits / N, TB_SECOND_HIT_PROB, 5, 'TB second hit rate');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cascade 結構性質
// ─────────────────────────────────────────────────────────────────────────────

describe('Cascade 結構性質', () => {
    it('中獎後 rowsAfter = min(rowsBefore+1, MAX_ROWS)', () => {
        const engine = new SlotEngine(mulberry32(123));
        for (let i = 0; i < 500; i++) {
            const r = engine.simulateSpin();
            let expectedRows = BASE_ROWS;
            for (const step of r.cascadeSteps) {
                expect(step.rowsAfter).toBe(Math.min(expectedRows + 1, MAX_ROWS));
                expectedRows = step.rowsAfter;
            }
        }
    });

    it('winCells 在每個 cascade step 中無重複', () => {
        const engine = new SlotEngine(mulberry32(456));
        for (let i = 0; i < 500; i++) {
            for (const step of engine.simulateSpin().cascadeSteps) {
                const seen = new Set<string>();
                for (const c of step.winCells) {
                    const key = `${c.reel},${c.row}`;
                    expect(seen.has(key)).toBe(false);
                    seen.add(key);
                }
            }
        }
    });

    it('totalRawWin = Σ cascadeSteps[].rawWin', () => {
        const engine = new SlotEngine(mulberry32(999));
        for (let i = 0; i < 500; i++) {
            const r = engine.simulateSpin({ totalBet: 1 });
            const sum = r.cascadeSteps.reduce((acc, s) => acc + s.rawWin, 0);
            expect(r.totalRawWin).toBeCloseTo(sum, 8);
        }
    });

    it('rawWin >= 0 for all cascade steps', () => {
        const engine = new SlotEngine(mulberry32(789));
        for (let i = 0; i < 500; i++)
            for (const s of engine.simulateSpin({ totalBet: 1 }).cascadeSteps)
                expect(s.rawWin).toBeGreaterThanOrEqual(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Max Win Cap
// ─────────────────────────────────────────────────────────────────────────────

describe('Max Win Cap', () => {
    it('未觸發 cap 的 spin：totalRawWin <= MAX_WIN_MULT × totalBet', () => {
        const engine = new SlotEngine(mulberry32(111));
        for (let i = 0; i < 1_000; i++) {
            const r = engine.simulateSpin({ totalBet: 1 });
            if (!r.maxWinCapped)
                expect(r.totalRawWin).toBeLessThanOrEqual(MAX_WIN_MULT);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. 完整遊戲 RTP（Base + FG chain，含 Coin Toss 機率）
// ─────────────────────────────────────────────────────────────────────────────

describe('完整遊戲 RTP（Base + FG chain，含 Coin Toss 機率）', () => {
    it('Full-game RTP 高於純 Base RTP（FG chain 確實有貢獻）', () => {
        const N        = 200_000;
        const rng      = mulberry32(42);
        const rngBase  = mulberry32(42);
        const engine   = new SlotEngine(rng);
        const eBase    = new SlotEngine(rngBase);
        const totalBet = 1;
        let fullPayout = 0, basePayout = 0;

        for (let i = 0; i < N; i++) {
            const base = engine.simulateSpin({ totalBet });
            fullPayout += base.totalRawWin;
            basePayout += eBase.simulateSpin({ totalBet }).totalRawWin;

            if (!base.fgTriggered) continue;
            if (rng() >= FG_TRIGGER_PROB) continue;   // FG 觸發門檻
            if (rng() >= 0.50) continue;               // 進場 Coin Toss 50%

            const fgMarks = new Set<string>();
            let multIdx = 0;
            while (true) {
                const mult = FG_MULTIPLIERS[multIdx];
                const fg   = engine.simulateSpin({
                    inFreeGame: true, fgMultiplier: mult,
                    totalBet, lightningMarks: fgMarks,
                });
                fullPayout += fg.totalRawWin * mult;
                if (fg.maxWinCapped) break;
                const headsProb = COIN_TOSS_HEADS_PROB[multIdx] ?? 0.40;
                if (rng() >= headsProb) break;
                if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
            }
        }

        const fullRTP = fullPayout / N;
        const baseRTP = basePayout / N;
        // FG chain 必須比純 base 高
        expect(fullRTP).toBeGreaterThan(baseRTP * 1.2);
        // 不應超過 1000%（infinity guard）
        expect(fullRTP).toBeLessThan(10.0);
    });

    it('Full-game RTP 在 [80%, 120%] 內（具體 RTP 驗證，500k spins, seed=42）', () => {
        const N       = 500_000;
        const rng     = mulberry32(42);
        const engine  = new SlotEngine(rng);
        const totalBet = 1;
        let totalPayout = 0;

        for (let i = 0; i < N; i++) {
            const base = engine.simulateSpin({ totalBet });
            totalPayout += base.totalRawWin;
            if (!base.fgTriggered) continue;
            if (rng() >= FG_TRIGGER_PROB) continue;
            if (rng() >= 0.50) continue;

            const fgMarks = new Set<string>();
            let multIdx = 0;
            while (true) {
                const mult = FG_MULTIPLIERS[multIdx];
                const fg   = engine.simulateSpin({
                    inFreeGame: true, fgMultiplier: mult,
                    totalBet, lightningMarks: fgMarks,
                });
                totalPayout += fg.totalRawWin * mult;
                if (fg.maxWinCapped) break;
                const headsProb = COIN_TOSS_HEADS_PROB[multIdx] ?? 0.40;
                if (rng() >= headsProb) break;
                if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
            }
        }

        const rtp = totalPayout / N;
        // 目標 97.5% ±20%
        assertRate(rtp, 0.975, 20, 'Full-game RTP (base+FG chain, 500k spins, seed=42) ≈ 97.5%');
    });
});
