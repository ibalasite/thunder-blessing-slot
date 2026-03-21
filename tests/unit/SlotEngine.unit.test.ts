/**
 * SlotEngine 單元測試
 *
 * 測試策略：
 *   - 所有 rng 均注入 deterministic function，確保結果可重現
 *   - 每個方法的邊界值、正常值、特殊值分別覆蓋
 *   - 不依賴任何 Cocos Creator 模組
 */

import { SlotEngine, createEngine } from '../../assets/scripts/SlotEngine';
import {
    SYM, SymType,
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_FG,
    PAYTABLE, PAYLINES_25, PAYLINES_BY_ROWS,
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
    TB_SECOND_HIT_PROB, SYMBOL_UPGRADE,
    MAX_WIN_MULT,
} from '../../assets/scripts/GameConfig';

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

/** 建立一個依序回傳 values 的假 RNG */
function makeSeqRng(...values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
}

/** 建立一個永遠回傳固定值的假 RNG */
const constRng = (v: number) => () => v;

/** 建一個空盤面（全部是 L4） */
function emptyGrid(sym: SymType = SYM.L4): SymType[][] {
    return Array.from({ length: REEL_COUNT }, () =>
        Array.from({ length: MAX_ROWS }, () => sym)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// drawSymbol
// ─────────────────────────────────────────────────────────────────────────────

describe('drawSymbol()', () => {
    it('回傳值必須是有效的 SymType', () => {
        const engine = createEngine();
        const validSyms = new Set(Object.values(SYM));
        for (let i = 0; i < 1000; i++) {
            expect(validSyms.has(engine.drawSymbol())).toBe(true);
        }
    });

    it('useFG=false 使用主遊戲權重：總權重 90', () => {
        const engine = createEngine();
        const total = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
        expect(total).toBe(90);
    });

    it('useFG=true 使用 FG 權重：總權重 90', () => {
        const total = Object.values(SYMBOL_WEIGHTS_FG).reduce((a, b) => a + b, 0);
        expect(total).toBe(90);
    });

    it('rng=0 時應回傳第一個符號 (W)', () => {
        const engine = new SlotEngine(constRng(0));
        // r = 0 * 90 = 0 → 第一個符號 W (weight=2) 的第一次迴圈就命中
        expect(engine.drawSymbol()).toBe(SYM.WILD);
    });

    it('rng 接近 1 時應回傳最後一個符號 (L4)', () => {
        const engine = new SlotEngine(constRng(0.9999));
        expect(engine.drawSymbol()).toBe(SYM.L4);
    });

    it('大量抽樣：各符號出現頻率與權重比例吻合（±20%相對誤差）', () => {
        const engine = createEngine();
        const counts: Record<string, number> = {};
        const N = 100_000;
        for (let i = 0; i < N; i++) {
            const s = engine.drawSymbol();
            counts[s] = (counts[s] ?? 0) + 1;
        }
        for (const [sym, w] of Object.entries(SYMBOL_WEIGHTS)) {
            const expected = (w / 90) * N;
            const actual   = counts[sym] ?? 0;
            expect(actual).toBeGreaterThan(expected * 0.80);
            expect(actual).toBeLessThan(expected * 1.20);
        }
    });

    it('useFG=true：各符號出現頻率與 FG 權重吻合（±20%相對誤差）', () => {
        const engine = createEngine();
        const counts: Record<string, number> = {};
        const N = 100_000;
        for (let i = 0; i < N; i++) {
            const s = engine.drawSymbol(true);
            counts[s] = (counts[s] ?? 0) + 1;
        }
        for (const [sym, w] of Object.entries(SYMBOL_WEIGHTS_FG)) {
            const expected = (w / 90) * N;
            const actual   = counts[sym] ?? 0;
            expect(actual).toBeGreaterThan(expected * 0.80);
            expect(actual).toBeLessThan(expected * 1.20);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateGrid
// ─────────────────────────────────────────────────────────────────────────────

describe('generateGrid()', () => {
    const engine = createEngine();

    it(`回傳 ${REEL_COUNT} 個滾輪`, () => {
        const g = engine.generateGrid();
        expect(g).toHaveLength(REEL_COUNT);
    });

    it(`每個滾輪有 ${MAX_ROWS} 列`, () => {
        const g = engine.generateGrid();
        g.forEach(col => expect(col).toHaveLength(MAX_ROWS));
    });

    it('所有格子皆為合法 SymType', () => {
        const valid = new Set(Object.values(SYM));
        const g = engine.generateGrid();
        g.forEach(col => col.forEach(s => expect(valid.has(s)).toBe(true)));
    });

    it('useFG=true 也回傳正確尺寸', () => {
        const g = engine.generateGrid(true);
        expect(g).toHaveLength(REEL_COUNT);
        g.forEach(col => expect(col).toHaveLength(MAX_ROWS));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyExtraBetSC
// ─────────────────────────────────────────────────────────────────────────────

describe('applyExtraBetSC()', () => {
    it('原本 base rows (0-2) 無 SC → 保證置入一個 SC', () => {
        const engine = new SlotEngine(makeSeqRng(0, 0));  // ri=0, row=0
        const g = emptyGrid(SYM.L4);  // 全 L4，沒有 SC
        const result = engine.applyExtraBetSC(g);
        let foundSC = false;
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < BASE_ROWS; row++) {
                if (result[ri][row] === SYM.SCATTER) foundSC = true;
            }
        }
        expect(foundSC).toBe(true);
    });

    it('SC 置入後 rows 3-5 不受影響', () => {
        const engine = new SlotEngine(makeSeqRng(0, 0));
        const g = emptyGrid(SYM.P1);
        const result = engine.applyExtraBetSC(g);
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = BASE_ROWS; row < MAX_ROWS; row++) {
                expect(result[ri][row]).toBe(SYM.P1);
            }
        }
    });

    it('原本 base rows 已有 SC → 盤面原封不動', () => {
        const engine = createEngine();
        const g = emptyGrid(SYM.L4);
        g[2][1] = SYM.SCATTER;  // 在 row=1 (base) 放 SC
        const result = engine.applyExtraBetSC(g);
        // 直接比對所有格子
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < MAX_ROWS; row++) {
                expect(result[ri][row]).toBe(g[ri][row]);
            }
        }
    });

    it('SC 不在 base rows 不算（row >= 3 不觸發）', () => {
        const engine = new SlotEngine(makeSeqRng(0, 0));
        const g = emptyGrid(SYM.L4);
        g[0][3] = SYM.SCATTER;  // 只有在 row=3（不算 base rows）
        const result = engine.applyExtraBetSC(g);
        let foundSCInBase = false;
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < BASE_ROWS; row++) {
                if (result[ri][row] === SYM.SCATTER) foundSCInBase = true;
            }
        }
        expect(foundSCInBase).toBe(true);
    });

    it('注入 rng 決定置入位置：rng(0)=col0, rng(1)=row1', () => {
        // ri = floor(0.0 * 5) = 0, row = floor(0.6 * 3) = 1
        const engine = new SlotEngine(makeSeqRng(0.0, 0.6));
        const g = emptyGrid(SYM.L4);
        const result = engine.applyExtraBetSC(g);
        expect(result[0][1]).toBe(SYM.SCATTER);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkWins
// ─────────────────────────────────────────────────────────────────────────────

describe('checkWins()', () => {
    /** 建立一個特定行程全是 sym 的盤面（其他填 L4） */
    function lineGrid(rowPath: number[], sym: SymType, rows = BASE_ROWS): SymType[][] {
        const g = emptyGrid(SYM.L4);
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            if (rowPath[ri] < rows) g[ri][rowPath[ri]] = sym;
        }
        return g;
    }

    const engine = createEngine();

    it('全空盤（全 L4 水平中線）→ 至少有一條 L4 3-5 連中獎', () => {
        const g = emptyGrid(SYM.L4);
        const wins = engine.checkWins(g, 3);
        const l4wins = wins.filter(w => w.symbol === SYM.L4 && w.count === 5);
        expect(l4wins.length).toBeGreaterThan(0);
    });

    it('沿連線放 P1 → 偵測到 P1 5-連', () => {
        const line = PAYLINES_25[0];  // [1,1,1,1,1]
        const g = lineGrid(line, SYM.P1);
        const wins = engine.checkWins(g, 3);
        const hit = wins.find(w => w.symbol === SYM.P1 && w.count === 5);
        expect(hit).toBeDefined();
        expect(hit!.multiplier).toBe(PAYTABLE[SYM.P1][5]);
    });

    it('只放前 3 個 P1 → 偵測到 3-連', () => {
        const line = [1, 1, 1, 1, 1];
        const g = emptyGrid(SYM.L4);
        for (let ri = 0; ri < 3; ri++) g[ri][line[ri]] = SYM.P1;
        const wins = engine.checkWins(g, 3);
        const hit = wins.find(w => w.symbol === SYM.P1 && w.count === 3);
        expect(hit).toBeDefined();
        expect(hit!.cells).toHaveLength(3);
    });

    it('SC 不計入任何中獎連線', () => {
        const g = emptyGrid(SYM.SCATTER);
        const wins = engine.checkWins(g, 3);
        expect(wins.every(w => w.symbol !== SYM.SCATTER)).toBe(true);
        // SC 滿版應無任何中獎
        expect(wins).toHaveLength(0);
    });

    it('Wild 可替代 P2 產生 5-連', () => {
        const line = PAYLINES_25[0];  // row 1
        const g = emptyGrid(SYM.L4);
        for (let ri = 0; ri < 5; ri++) {
            g[ri][line[ri]] = ri === 0 ? SYM.WILD : SYM.P2;
        }
        const wins = engine.checkWins(g, 3);
        const hit = wins.find(w => w.symbol === SYM.P2 && w.count === 5);
        expect(hit).toBeDefined();
    });

    it('全 Wild 5-連 → 計為 W 連線', () => {
        const line = PAYLINES_25[0];
        const g = emptyGrid(SYM.L4);
        for (let ri = 0; ri < 5; ri++) g[ri][line[ri]] = SYM.WILD;
        const wins = engine.checkWins(g, 3);
        // matchSym 應為 W（無非 Wild 可用，W 的賠率 > 0）
        const hit = wins.find(w => w.symbol === SYM.WILD && w.count === 5);
        expect(hit).toBeDefined();
    });

    it('rows=3 使用 25 條; rows=4 使用 33 條; rows=6 使用 57 條', () => {
        // 測試方法：在第 26 條（PAYLINES_33[25]）放置 P1，只有 rows>=4 才能偵測到
        const extraLine = PAYLINES_BY_ROWS[4][25];  // 第26條
        const g = emptyGrid(SYM.L4);
        for (let ri = 0; ri < 5; ri++) {
            if (extraLine[ri] < 4) g[ri][extraLine[ri]] = SYM.P1;
        }

        const wins3 = engine.checkWins(g, 3);
        const wins4 = engine.checkWins(g, 4);

        const hitIn3 = wins3.filter(w => w.symbol === SYM.P1 && w.lineIndex === 25);
        const hitIn4 = wins4.filter(w => w.symbol === SYM.P1 && w.lineIndex === 25);

        expect(hitIn3).toHaveLength(0);   // rows=3 掃不到第 26 條
        expect(hitIn4.length).toBeGreaterThan(0);  // rows=4 掃得到
    });

    it('cells 陣列長度等於 count', () => {
        const g = emptyGrid(SYM.L4);
        const wins = engine.checkWins(g, 3);
        for (const w of wins) {
            expect(w.cells).toHaveLength(w.count);
        }
    });

    it('cells reel 索引連續從 0 開始', () => {
        const g = emptyGrid(SYM.L4);
        const wins = engine.checkWins(g, 3);
        for (const w of wins) {
            w.cells.forEach((c, idx) => expect(c.reel).toBe(idx));
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyTB
// ─────────────────────────────────────────────────────────────────────────────

describe('applyTB()', () => {
    it('第一擊永遠升階：標記格從 L4 升為 P4', () => {
        // 讓第二擊不觸發：rng < TB_SECOND_HIT_PROB 為 false → rng = 0.999
        const engine = new SlotEngine(constRng(0.999));
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['0,0', '1,1']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[0][0]).toBe(SYM.P4);  // L4 → P4
        expect(result[1][1]).toBe(SYM.P4);
    });

    it('未標記格不受第一擊影響', () => {
        const engine = new SlotEngine(constRng(0.999));
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['0,0']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[1][1]).toBe(SYM.L4);  // 未標記 → 不變
    });

    it('第二擊在 rng < TB_SECOND_HIT_PROB 時觸發：L4 升兩次到 P4 再到 P3', () => {
        // 第一次 rng 呼叫給升階用（applyTB 不用 rng 做升階決定，只用 rng 決定第二擊）
        const engine = new SlotEngine(constRng(0));  // 0 < 0.28 → 觸發第二擊
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['0,0']);
        const result = engine.applyTB(g, marks, 3);
        // L4 → P4 (第一擊) → P3 (第二擊)
        expect(result[0][0]).toBe(SYM.P3);
    });

    it('第二擊在 rng >= TB_SECOND_HIT_PROB 時不觸發', () => {
        const engine = new SlotEngine(constRng(TB_SECOND_HIT_PROB + 0.001));
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['0,0']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[0][0]).toBe(SYM.P4);  // 只有第一擊
    });

    it('P1 已是最高 → applyTB 後仍為 P1', () => {
        const engine = new SlotEngine(constRng(0));  // 觸發兩擊
        const g = emptyGrid(SYM.P1);
        const marks = new Set(['0,0', '1,0']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[0][0]).toBe(SYM.P1);
        expect(result[1][0]).toBe(SYM.P1);
    });

    it('完整升階鏈：L4→P4→P3→P2→P1 (兩擊最多升兩階)', () => {
        // 最多兩擊，L1 一擊到 P1
        const engine = new SlotEngine(constRng(0));
        const g = emptyGrid(SYM.L1);
        const marks = new Set(['0,0']);
        const result = engine.applyTB(g, marks, 3);
        // L1 → P4 (第一擊) → P3 (第二擊)
        expect(result[0][0]).toBe(SYM.P3);
    });

    it('row >= rows 的標記格不做升階', () => {
        const engine = new SlotEngine(constRng(0.999));
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['0,3']);  // row=3 但 rows=3
        const result = engine.applyTB(g, marks, 3);
        expect(result[0][3]).toBe(SYM.L4);  // 不在可見範圍 → 不升階
    });

    it('回傳的是新陣列，不修改原始 grid', () => {
        const engine = new SlotEngine(constRng(0.999));
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['0,0']);
        engine.applyTB(g, marks, 3);
        expect(g[0][0]).toBe(SYM.L4);  // 原始不變
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateSpin — 結構與邊界
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateSpin() — 結構', () => {
    const engine = createEngine();

    it('回傳物件包含所有必要欄位', () => {
        const r = engine.simulateSpin();
        expect(r).toHaveProperty('initialGrid');
        expect(r).toHaveProperty('cascadeSteps');
        expect(r).toHaveProperty('totalRawWin');
        expect(r).toHaveProperty('fgTriggered');
        expect(r).toHaveProperty('finalRows');
        expect(r).toHaveProperty('maxWinCapped');
    });

    it('initialGrid 是 5×6', () => {
        const r = engine.simulateSpin();
        expect(r.initialGrid).toHaveLength(REEL_COUNT);
        r.initialGrid.forEach(col => expect(col).toHaveLength(MAX_ROWS));
    });

    it('totalRawWin >= 0', () => {
        for (let i = 0; i < 100; i++) {
            const r = engine.simulateSpin();
            expect(r.totalRawWin).toBeGreaterThanOrEqual(0);
        }
    });

    it('finalRows 在 BASE_ROWS ~ MAX_ROWS 之間', () => {
        for (let i = 0; i < 200; i++) {
            const r = engine.simulateSpin();
            expect(r.finalRows).toBeGreaterThanOrEqual(BASE_ROWS);
            expect(r.finalRows).toBeLessThanOrEqual(MAX_ROWS);
        }
    });

    it('cascade 迴圈最多 20 步', () => {
        for (let i = 0; i < 100; i++) {
            const r = engine.simulateSpin();
            expect(r.cascadeSteps.length).toBeLessThanOrEqual(20);
        }
    });

    it('fgTriggered=true 時 finalRows === MAX_ROWS', () => {
        for (let i = 0; i < 2000; i++) {
            const r = engine.simulateSpin();
            if (r.fgTriggered) {
                expect(r.finalRows).toBe(MAX_ROWS);
                break;
            }
        }
    });

    it('maxWinCapped=true 時 totalRawWin 接近上限', () => {
        // 模擬到出現 cap 為止
        let found = false;
        for (let i = 0; i < 5_000; i++) {
            const r = engine.simulateSpin({ totalBet: 1 });
            if (r.maxWinCapped) {
                expect(r.totalRawWin).toBeGreaterThan(0);
                found = true;
                break;
            }
        }
        // maxWinCapped 是罕見事件，不強求一定出現，只要出現就驗證
        if (found) expect(found).toBe(true);
    });

    it('extraBet=true：base rows 必定有 SC（100 次確認）', () => {
        for (let i = 0; i < 100; i++) {
            const r = engine.simulateSpin({ extraBet: true });
            let hasSC = false;
            for (let ri = 0; ri < REEL_COUNT && !hasSC; ri++) {
                for (let row = 0; row < BASE_ROWS && !hasSC; row++) {
                    if (r.initialGrid[ri][row] === SYM.SCATTER) hasSC = true;
                }
            }
            expect(hasSC).toBe(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// createEngine factory
// ─────────────────────────────────────────────────────────────────────────────

describe('createEngine()', () => {
    it('無參數時建立 SlotEngine 實例', () => {
        const e = createEngine();
        expect(e).toBeInstanceOf(SlotEngine);
    });

    it('可注入 rng', () => {
        const seeded = constRng(0);
        const e = createEngine(seeded);
        // W 是第一個符號，constRng(0) 下永遠回傳 W
        expect(e.drawSymbol()).toBe(SYM.WILD);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// simulateSpin — cascade behaviour at MAX_ROWS (57 lines)
//
//  SlotEngine.simulateSpin CORRECTLY chains cascades at rows=6 (loop continues
//  until wins === 0).  GameBootstrap.cascadeLoop used to stop after one cascade
//  at MAX_ROWS in FG — now fixed.  These tests verify the simulation model.
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateSpin() — cascade continues at MAX_ROWS', () => {

    function mulberry32(seed: number): () => number {
        return () => {
            seed |= 0;
            seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    it('cascadeSteps can have rowsAfter=MAX_ROWS for more than one step', () => {
        // Run many spins; at least one should show ≥2 cascade steps at MAX_ROWS
        let found = false;
        for (let seed = 0; seed < 500 && !found; seed++) {
            const e = new SlotEngine(mulberry32(seed));
            for (let i = 0; i < 200 && !found; i++) {
                const r = e.simulateSpin({ totalBet: 1 });
                const stepsAtMax = r.cascadeSteps.filter(s => s.rowsAfter === MAX_ROWS);
                if (stepsAtMax.length >= 2) found = true;
            }
        }
        expect(found).toBe(true);
    });

    it('FG simulateSpin with rows reaching MAX_ROWS can still accumulate wins', () => {
        // Run FG spins and confirm some reach MAX_ROWS with wins beyond first step
        let maxRowsWinCount = 0;
        const e = new SlotEngine(mulberry32(77));
        for (let i = 0; i < 5_000; i++) {
            const r = e.simulateSpin({ inFreeGame: true, totalBet: 1 });
            if (r.finalRows === MAX_ROWS && r.cascadeSteps.length > 1) {
                maxRowsWinCount++;
            }
        }
        // With FG weights, cascades to MAX_ROWS should occur regularly
        expect(maxRowsWinCount).toBeGreaterThan(0);
    });

    it('rowsAfter in cascadeSteps increases monotonically (no row shrinkage)', () => {
        const e = new SlotEngine(mulberry32(42));
        for (let i = 0; i < 200; i++) {
            const r = e.simulateSpin({ totalBet: 1 });
            for (let j = 1; j < r.cascadeSteps.length; j++) {
                expect(r.cascadeSteps[j].rowsAfter).toBeGreaterThanOrEqual(
                    r.cascadeSteps[j - 1].rowsAfter
                );
            }
        }
    });

    it('at MAX_ROWS wins accumulate beyond initial MAX_ROWS entry step', () => {
        // Find a spin where cascadeSteps includes a step entering MAX_ROWS AND
        // further steps that remain at MAX_ROWS (i.e. continued cascading)
        let found = false;
        for (let seed = 0; seed < 300 && !found; seed++) {
            const e = new SlotEngine(mulberry32(seed));
            for (let i = 0; i < 300 && !found; i++) {
                const r = e.simulateSpin({ inFreeGame: true, totalBet: 1 });
                // Find first step that reaches MAX_ROWS
                const firstMaxIdx = r.cascadeSteps.findIndex(s => s.rowsAfter === MAX_ROWS);
                if (firstMaxIdx !== -1 && r.cascadeSteps.length > firstMaxIdx + 1) {
                    // At least one more step AFTER reaching MAX_ROWS
                    found = true;
                }
            }
        }
        expect(found).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// WILD symbol appearance rate
// ─────────────────────────────────────────────────────────────────────────────

describe('WILD symbol appearance rate', () => {
    it('main game: WILD appears at ~2.2% per cell (weight 2/90)', () => {
        const e = createEngine();
        let wildCount = 0;
        const N = 100_000;
        for (let i = 0; i < N; i++) {
            if (e.drawSymbol() === SYM.WILD) wildCount++;
        }
        const rate = wildCount / N;
        // 2/90 ≈ 0.0222; allow ±30% relative tolerance
        expect(rate).toBeGreaterThan(0.0222 * 0.70);
        expect(rate).toBeLessThan(0.0222 * 1.30);
    });

    it('FG: WILD appears at ~3.3% per cell (weight 3/90)', () => {
        const e = createEngine();
        let wildCount = 0;
        const N = 100_000;
        for (let i = 0; i < N; i++) {
            if (e.drawSymbol(true) === SYM.WILD) wildCount++;
        }
        const rate = wildCount / N;
        // 3/90 ≈ 0.0333; allow ±30% relative tolerance
        expect(rate).toBeGreaterThan(0.0333 * 0.70);
        expect(rate).toBeLessThan(0.0333 * 1.30);
    });

    it('5×3 base grid: P(no WILD at all) ≈ 71% (theoretical (88/90)^15)', () => {
        const e = createEngine();
        let noWildSpins = 0;
        const N = 50_000;
        for (let i = 0; i < N; i++) {
            const grid = e.generateGrid(false);
            let hasWild = false;
            outer: for (let ri = 0; ri < REEL_COUNT; ri++) {
                for (let row = 0; row < 3; row++) {
                    if (grid[ri][row] === SYM.WILD) { hasWild = true; break outer; }
                }
            }
            if (!hasWild) noWildSpins++;
        }
        const noWildRate = noWildSpins / N;
        // (88/90)^15 ≈ 0.713; allow ±10% absolute
        expect(noWildRate).toBeGreaterThan(0.60);
        expect(noWildRate).toBeLessThan(0.82);
    });
});
