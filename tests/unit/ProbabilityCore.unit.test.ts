/**
 * Probability Core — 強化單元測試
 *
 * 驗證機率核心各元件是否符合 GDD 規格：
 *   1. 符號權重 (GDD §2)
 *   2. 賠率表結構 (GDD §4)
 *   3. Coin Toss 分層機率 (GDD §9-3)
 *   4. TB 升階規則 (GDD §5)
 *   5. FG 倍率序列 (GDD §10-2)
 *   6. Max Win Cap (GDD §13)
 *   7. Payline 定義完整性 (GDD §5)
 *   8. calcWinAmount / findScatters 邊界值
 */

import { SlotEngine, calcWinAmount, findScatters, WinLine } from '../../assets/scripts/SlotEngine';
import {
    SYM, SymType,
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_FG,
    PAYTABLE, PAYTABLE_SCALE,
    PAYLINES_25, PAYLINES_33, PAYLINES_45, PAYLINES_57, PAYLINES_BY_ROWS,
    FG_MULTIPLIERS, COIN_TOSS_HEADS_PROB, FG_TRIGGER_PROB,
    TB_SECOND_HIT_PROB, SYMBOL_UPGRADE,
    MAX_WIN_MULT, REEL_COUNT, BASE_ROWS, MAX_ROWS,
    BET_MIN, BET_MAX, BET_STEP, EXTRA_BET_MULT,
} from '../../assets/scripts/GameConfig';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function emptyGrid(sym: SymType = SYM.L4): SymType[][] {
    return Array.from({ length: REEL_COUNT }, () =>
        Array.from({ length: MAX_ROWS }, () => sym));
}

// ── 1. Symbol Weights (GDD §2) ──────────────────────────────────────────────

describe('Symbol Weights — GDD §2 Compliance', () => {

    it('Main game weights sum to 90', () => {
        expect(Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(90);
    });

    it('FG weights sum to 90', () => {
        expect(Object.values(SYMBOL_WEIGHTS_FG).reduce((a, b) => a + b, 0)).toBe(90);
    });

    it('Main game: all 10 symbols defined with correct values', () => {
        const expected: Record<string, number> = {
            W: 3, SC: 4, P1: 6, P2: 7, P3: 8, P4: 10,
            L1: 12, L2: 12, L3: 14, L4: 14,
        };
        for (const [sym, w] of Object.entries(expected)) {
            expect(SYMBOL_WEIGHTS[sym as SymType]).toBe(w);
        }
    });

    it('FG: all 10 symbols defined with correct values', () => {
        const expected: Record<string, number> = {
            W: 4, SC: 6, P1: 9, P2: 10, P3: 11, P4: 12,
            L1: 9, L2: 9, L3: 10, L4: 10,
        };
        for (const [sym, w] of Object.entries(expected)) {
            expect(SYMBOL_WEIGHTS_FG[sym as SymType]).toBe(w);
        }
    });

    it('FG has higher W+SC rate than main game', () => {
        const mainWSC = (SYMBOL_WEIGHTS[SYM.WILD] + SYMBOL_WEIGHTS[SYM.SCATTER]) / 90;
        const fgWSC = (SYMBOL_WEIGHTS_FG[SYM.WILD] + SYMBOL_WEIGHTS_FG[SYM.SCATTER]) / 90;
        expect(fgWSC).toBeGreaterThan(mainWSC);
    });

    it('FG has higher premium (P1-P4) rate than main game', () => {
        const mainP = [SYM.P1, SYM.P2, SYM.P3, SYM.P4]
            .reduce((s, sym) => s + SYMBOL_WEIGHTS[sym], 0) / 90;
        const fgP = [SYM.P1, SYM.P2, SYM.P3, SYM.P4]
            .reduce((s, sym) => s + SYMBOL_WEIGHTS_FG[sym], 0) / 90;
        expect(fgP).toBeGreaterThan(mainP);
    });

    it('FG has lower low-pay (L1-L4) rate than main game', () => {
        const mainL = [SYM.L1, SYM.L2, SYM.L3, SYM.L4]
            .reduce((s, sym) => s + SYMBOL_WEIGHTS[sym], 0) / 90;
        const fgL = [SYM.L1, SYM.L2, SYM.L3, SYM.L4]
            .reduce((s, sym) => s + SYMBOL_WEIGHTS_FG[sym], 0) / 90;
        expect(fgL).toBeLessThan(mainL);
    });
});

// ── 2. Paytable Structure (GDD §4) ──────────────────────────────────────────

describe('Paytable — GDD §4 Compliance', () => {

    it('PAYTABLE_SCALE is positive', () => {
        expect(PAYTABLE_SCALE).toBeGreaterThan(0);
    });

    it('All non-SC symbols have 3-of-kind, 4-of-kind, 5-of-kind payouts > 0', () => {
        const paySymbols: SymType[] = [SYM.WILD, SYM.P1, SYM.P2, SYM.P3, SYM.P4, SYM.L1, SYM.L2, SYM.L3, SYM.L4];
        for (const sym of paySymbols) {
            expect(PAYTABLE[sym][3]).toBeGreaterThan(0);
            expect(PAYTABLE[sym][4]).toBeGreaterThan(0);
            expect(PAYTABLE[sym][5]).toBeGreaterThan(0);
        }
    });

    it('SC has zero payout for all counts', () => {
        for (let i = 0; i < 6; i++) {
            expect(PAYTABLE[SYM.SCATTER][i]).toBe(0);
        }
    });

    it('0-count and 1-count always pay 0', () => {
        for (const sym of Object.keys(PAYTABLE) as SymType[]) {
            expect(PAYTABLE[sym][0]).toBe(0);
            expect(PAYTABLE[sym][1]).toBe(0);
        }
    });

    it('Payouts increase monotonically with count (3 ≤ 4 ≤ 5)', () => {
        const paySymbols: SymType[] = [SYM.WILD, SYM.P1, SYM.P2, SYM.P3, SYM.P4, SYM.L1, SYM.L2, SYM.L3, SYM.L4];
        for (const sym of paySymbols) {
            expect(PAYTABLE[sym][3]).toBeLessThanOrEqual(PAYTABLE[sym][4]);
            expect(PAYTABLE[sym][4]).toBeLessThanOrEqual(PAYTABLE[sym][5]);
        }
    });

    it('Premium symbols pay more than low symbols at every count', () => {
        for (const count of [3, 4, 5]) {
            expect(PAYTABLE[SYM.P1][count]).toBeGreaterThan(PAYTABLE[SYM.L1][count]);
            expect(PAYTABLE[SYM.P1][count]).toBeGreaterThan(PAYTABLE[SYM.L4][count]);
        }
    });

    it('W and P1 share the same base payout (highest tier)', () => {
        for (const count of [3, 4, 5]) {
            expect(PAYTABLE[SYM.WILD][count]).toBeCloseTo(PAYTABLE[SYM.P1][count], 4);
        }
    });

    it('Paytable values are correctly scaled from base', () => {
        const baseP1_5 = 1.17;
        expect(PAYTABLE[SYM.P1][5]).toBeCloseTo(baseP1_5 * PAYTABLE_SCALE, 2);
    });
});

// ── 3. Coin Toss (GDD §9-3) ─────────────────────────────────────────────────

describe('Coin Toss — GDD §9-3 Compliance', () => {

    it('5 levels of coin toss probability', () => {
        expect(COIN_TOSS_HEADS_PROB).toHaveLength(5);
    });

    it('Exact values: [0.80, 0.68, 0.56, 0.48, 0.40]', () => {
        expect(COIN_TOSS_HEADS_PROB).toEqual([0.80, 0.68, 0.56, 0.48, 0.40]);
    });

    it('Probabilities decrease monotonically (higher multiplier = harder)', () => {
        for (let i = 1; i < COIN_TOSS_HEADS_PROB.length; i++) {
            expect(COIN_TOSS_HEADS_PROB[i]).toBeLessThanOrEqual(COIN_TOSS_HEADS_PROB[i - 1]);
        }
    });

    it('Entry coin toss (index 0) = 80%', () => {
        expect(COIN_TOSS_HEADS_PROB[0]).toBe(0.80);
    });

    it('Highest level (x77) = 40%', () => {
        expect(COIN_TOSS_HEADS_PROB[4]).toBe(0.40);
    });

    it('All probabilities are valid (0 < p < 1)', () => {
        for (const p of COIN_TOSS_HEADS_PROB) {
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThan(1);
        }
    });

    it('Simulated coin toss at each level matches probability (100k trials)', () => {
        const rng = mulberry32(42);
        const N = 100_000;
        for (let level = 0; level < COIN_TOSS_HEADS_PROB.length; level++) {
            let heads = 0;
            for (let i = 0; i < N; i++) {
                if (rng() < COIN_TOSS_HEADS_PROB[level]) heads++;
            }
            const rate = heads / N;
            const expected = COIN_TOSS_HEADS_PROB[level];
            expect(rate).toBeGreaterThan(expected - 0.02);
            expect(rate).toBeLessThan(expected + 0.02);
        }
    });
});

// ── 4. Thunder Blessing Upgrade (GDD §5) ────────────────────────────────────

describe('TB Symbol Upgrade — GDD §5 Compliance', () => {

    it('All L symbols upgrade to P4', () => {
        expect(SYMBOL_UPGRADE['L4']).toBe('P4');
        expect(SYMBOL_UPGRADE['L3']).toBe('P4');
        expect(SYMBOL_UPGRADE['L2']).toBe('P4');
        expect(SYMBOL_UPGRADE['L1']).toBe('P4');
    });

    it('P4 → P3 → P2 → P1 → P1 chain', () => {
        expect(SYMBOL_UPGRADE['P4']).toBe('P3');
        expect(SYMBOL_UPGRADE['P3']).toBe('P2');
        expect(SYMBOL_UPGRADE['P2']).toBe('P1');
        expect(SYMBOL_UPGRADE['P1']).toBe('P1');
    });

    it('TB_SECOND_HIT_PROB = 0.40 (GDD §5: 40%)', () => {
        expect(TB_SECOND_HIT_PROB).toBe(0.40);
    });

    it('Double upgrade: L4 → P4 → P3 (two hits)', () => {
        const engine = new SlotEngine(() => 0);
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['2,2']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[2][2]).toBe(SYM.P3);
    });

    it('Single upgrade: L4 → P4 (one hit, second miss)', () => {
        const engine = new SlotEngine(() => 0.999);
        const g = emptyGrid(SYM.L4);
        const marks = new Set(['2,2']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[2][2]).toBe(SYM.P4);
    });

    it('Full chain: P2 → P1 (first hit) → P1 (second hit, already max)', () => {
        const engine = new SlotEngine(() => 0);
        const g = emptyGrid(SYM.P2);
        const marks = new Set(['0,0']);
        const result = engine.applyTB(g, marks, 3);
        expect(result[0][0]).toBe(SYM.P1);
    });

    it('TB second hit rate converges to 40% over 100k trials', () => {
        const N = 100_000;
        let hits = 0;
        const rng = mulberry32(42);
        for (let i = 0; i < N; i++) {
            const engine = new SlotEngine(rng);
            const g = emptyGrid(SYM.L4);
            const marks = new Set(['0,0']);
            const result = engine.applyTB(g, marks, 3);
            if (result[0][0] === SYM.P3) hits++;
        }
        const rate = hits / N;
        expect(rate).toBeGreaterThan(0.38);
        expect(rate).toBeLessThan(0.42);
    });
});

// ── 5. FG Multipliers (GDD §10-2) ───────────────────────────────────────────

describe('FG Multipliers — GDD §10-2 Compliance', () => {

    it('5 multiplier levels', () => {
        expect(FG_MULTIPLIERS).toHaveLength(5);
    });

    it('Exact sequence: [3, 7, 17, 27, 77]', () => {
        expect(FG_MULTIPLIERS).toEqual([3, 7, 17, 27, 77]);
    });

    it('Multipliers are strictly increasing', () => {
        for (let i = 1; i < FG_MULTIPLIERS.length; i++) {
            expect(FG_MULTIPLIERS[i]).toBeGreaterThan(FG_MULTIPLIERS[i - 1]);
        }
    });

    it('Initial multiplier is x3', () => {
        expect(FG_MULTIPLIERS[0]).toBe(3);
    });

    it('Maximum multiplier is x77', () => {
        expect(FG_MULTIPLIERS[FG_MULTIPLIERS.length - 1]).toBe(77);
    });
});

// ── 6. Max Win Cap (GDD §13) ─────────────────────────────────────────────────

describe('Max Win Cap — GDD §13 Compliance', () => {

    it('MAX_WIN_MULT = 30000', () => {
        expect(MAX_WIN_MULT).toBe(30000);
    });

    it('simulateSpin caps at MAX_WIN_MULT (extreme scenario)', () => {
        const engine = new SlotEngine(mulberry32(42));
        for (let i = 0; i < 10_000; i++) {
            const r = engine.simulateSpin({ totalBet: 1, inFreeGame: true, fgMultiplier: 77 });
            if (r.maxWinCapped) {
                expect(r.totalRawWin * 77).toBeLessThanOrEqual(MAX_WIN_MULT + 100);
                return;
            }
        }
    });
});

// ── 7. Payline Definitions ───────────────────────────────────────────────────

describe('Payline Definitions Completeness', () => {

    it('25 paylines for 3 rows', () => {
        expect(PAYLINES_25).toHaveLength(25);
    });

    it('33 paylines for 4 rows', () => {
        expect(PAYLINES_33).toHaveLength(33);
    });

    it('45 paylines for 5 rows', () => {
        expect(PAYLINES_45).toHaveLength(45);
    });

    it('57 paylines for 6 rows', () => {
        expect(PAYLINES_57).toHaveLength(57);
    });

    it('Each payline has exactly 5 positions (one per reel)', () => {
        for (const pl of PAYLINES_57) {
            expect(pl).toHaveLength(5);
        }
    });

    it('PAYLINES_BY_ROWS maps correctly', () => {
        expect(PAYLINES_BY_ROWS[3]).toBe(PAYLINES_25);
        expect(PAYLINES_BY_ROWS[4]).toBe(PAYLINES_33);
        expect(PAYLINES_BY_ROWS[5]).toBe(PAYLINES_45);
        expect(PAYLINES_BY_ROWS[6]).toBe(PAYLINES_57);
    });

    it('All row indices in 25-paylines are < 3', () => {
        for (const pl of PAYLINES_25) {
            for (const r of pl) expect(r).toBeLessThan(3);
        }
    });

    it('All row indices in 57-paylines are < 6', () => {
        for (const pl of PAYLINES_57) {
            for (const r of pl) expect(r).toBeLessThan(6);
        }
    });

    it('No duplicate paylines within each set', () => {
        const sets = [PAYLINES_25, PAYLINES_33, PAYLINES_45, PAYLINES_57];
        for (const pls of sets) {
            const keys = pls.map(pl => pl.join(','));
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

// ── 8. calcWinAmount / findScatters ──────────────────────────────────────────

describe('calcWinAmount', () => {

    it('totalBet * multiplier = correct win', () => {
        const line: WinLine = {
            lineIndex: 0, rowPath: [1,1,1,1,1],
            symbol: SYM.P1, count: 5,
            multiplier: PAYTABLE[SYM.P1][5],
            cells: [],
        };
        const win = calcWinAmount(line, 0.25);
        expect(win).toBeCloseTo(0.25 * PAYTABLE[SYM.P1][5], 3);
    });

    it('Zero multiplier = zero win', () => {
        const line: WinLine = {
            lineIndex: 0, rowPath: [1,1,1,1,1],
            symbol: SYM.SCATTER, count: 5,
            multiplier: 0,
            cells: [],
        };
        expect(calcWinAmount(line, 1)).toBe(0);
    });
});

describe('findScatters', () => {

    it('Returns correct SC positions', () => {
        const g = emptyGrid(SYM.L4);
        g[0][0] = SYM.SCATTER;
        g[2][1] = SYM.SCATTER;
        g[4][5] = SYM.SCATTER;

        const sc3 = findScatters(g, 3);
        expect(sc3).toHaveLength(2);
        expect(sc3).toContainEqual({ reel: 0, row: 0 });
        expect(sc3).toContainEqual({ reel: 2, row: 1 });

        const sc6 = findScatters(g, 6);
        expect(sc6).toHaveLength(3);
    });

    it('Returns empty array when no SC', () => {
        const g = emptyGrid(SYM.P1);
        expect(findScatters(g, 3)).toHaveLength(0);
    });
});

// ── 9. Game Constants ────────────────────────────────────────────────────────

describe('Game Constants', () => {

    it('REEL_COUNT = 5', () => { expect(REEL_COUNT).toBe(5); });
    it('BASE_ROWS = 3', () => { expect(BASE_ROWS).toBe(3); });
    it('MAX_ROWS = 6', () => { expect(MAX_ROWS).toBe(6); });

    it('FG_TRIGGER_PROB = 0.20 (GDD §10-1)', () => {
        expect(FG_TRIGGER_PROB).toBe(0.20);
    });

    it('BET range is valid', () => {
        expect(BET_MIN).toBeLessThan(BET_MAX);
        expect(BET_STEP).toBeGreaterThan(0);
    });

    it('EXTRA_BET_MULT = 3 (GDD §11-2)', () => {
        expect(EXTRA_BET_MULT).toBe(3);
    });
});

// ── 10. checkWins Edge Cases ─────────────────────────────────────────────────

describe('checkWins — Edge Cases', () => {

    const engine = new SlotEngine(mulberry32(42));

    it('Wild on reel 0 + P1 on reels 1-4 → P1 5-of-kind', () => {
        const g = emptyGrid(SYM.L4);
        for (let ri = 0; ri < 5; ri++) {
            g[ri][1] = ri === 0 ? SYM.WILD : SYM.P1;
        }
        const wins = engine.checkWins(g, 3);
        const hit = wins.find(w => w.symbol === SYM.P1 && w.count === 5);
        expect(hit).toBeDefined();
    });

    it('Wild-Wild-P1-P1-P1 → P1 5-of-kind', () => {
        const g = emptyGrid(SYM.L4);
        g[0][1] = SYM.WILD;
        g[1][1] = SYM.WILD;
        g[2][1] = SYM.P1;
        g[3][1] = SYM.P1;
        g[4][1] = SYM.P1;
        const wins = engine.checkWins(g, 3);
        const hit = wins.find(w => w.symbol === SYM.P1 && w.count === 5);
        expect(hit).toBeDefined();
    });

    it('P1-P1-SC-P1-P1 → only P1 2-of-kind (count < 3, no win)', () => {
        const g = emptyGrid(SYM.L4);
        g[0][1] = SYM.P1;
        g[1][1] = SYM.P1;
        g[2][1] = SYM.SCATTER;
        g[3][1] = SYM.P1;
        g[4][1] = SYM.P1;
        const wins = engine.checkWins(g, 3);
        const p1wins = wins.filter(w => w.symbol === SYM.P1 && w.lineIndex === 0);
        if (p1wins.length > 0) {
            expect(p1wins[0].count).toBeLessThanOrEqual(2);
        }
    });

    it('All cells same symbol (non-SC) → max possible wins', () => {
        const g = emptyGrid(SYM.P1);
        const wins = engine.checkWins(g, 3);
        expect(wins.length).toBeGreaterThan(0);
        expect(wins.every(w => w.count === 5)).toBe(true);
    });

    it('rows=6 with 57 lines: more wins than rows=3 with 25 lines', () => {
        const g = emptyGrid(SYM.P2);
        const wins3 = engine.checkWins(g, 3);
        const wins6 = engine.checkWins(g, 6);
        expect(wins6.length).toBeGreaterThanOrEqual(wins3.length);
    });
});
