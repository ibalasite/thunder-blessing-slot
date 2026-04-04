"use strict";
/**
 * GameConfig.generated.ts
 * ⚠️  此檔案由 tools/slot-engine/engine_generator.js 自動產生 (2026-04-03)
 * ⚠️  請勿手動編輯 — 修改 Thunder_Config.xlsx DATA tab 後重新執行 engine_generator.js
 *
 * 來源：Thunder_Config.xlsx
 * 工具：tools/slot-engine/engine_generator.js
 *
 * 用法：
 *   驗證通過後將此檔案重新命名為 GameConfig.ts（覆蓋舊版）
 *   或修改 SlotEngine.ts import 路徑為 './GameConfig.generated'
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYMBOL_DARK = exports.SYMBOL_COLORS = exports.SYMBOL_LABELS = exports.DEFAULT_BALANCE = exports.DEFAULT_BET = exports.MAX_WIN_MULT = exports.FG_SPIN_BONUS = exports.BUY_FG_MIN_WIN_MULT = exports.BUY_COST_MULT = exports.EXTRA_BET_MULT = exports.BET_LEVELS = exports.BET_STEP = exports.BET_MAX = exports.BET_MIN = exports.LINES_MAX = exports.LINES_BASE = exports.SYMBOL_UPGRADE = exports.TB_SECOND_HIT_PROB = exports.FG_TRIGGER_PROB = exports.ENTRY_TOSS_PROB_BUY = exports.ENTRY_TOSS_PROB_MAIN = exports.COIN_TOSS_HEADS_PROB = exports.FG_MULTIPLIERS = exports.PAYLINES_BY_ROWS = exports.PAYLINES_57 = exports.PAYLINES_45 = exports.PAYLINES_33 = exports.PAYLINES_25 = exports.REEL_START_X = exports.REEL_TOP_Y = exports.CANVAS_H = exports.CANVAS_W = exports.REEL_GAP = exports.SYMBOL_GAP = exports.SYMBOL_H = exports.SYMBOL_W = exports.MAX_ROWS = exports.BASE_ROWS = exports.REEL_COUNT = exports.PAYTABLE = exports.PAYTABLE_SCALE = exports.REEL_STRIP = exports.SYMBOL_WEIGHTS_BUY_FG = exports.SYMBOL_WEIGHTS_FG = exports.SYMBOL_WEIGHTS_EB = exports.SYMBOL_WEIGHTS = exports.SYM = void 0;
// ─── 符號類型 ─────────────────────────────────────────────
exports.SYM = {
    WILD: 'W', SCATTER: 'SC',
    P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4',
    L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4',
};
// ── Main Game 符號權重（合計 90）──
exports.SYMBOL_WEIGHTS = {
    W: 3, SC: 4, P1: 6, P2: 7, P3: 8, P4: 10, L1: 12, L2: 12, L3: 14, L4: 14,
};
// ── Extra Bet 符號權重（合計 90）──
exports.SYMBOL_WEIGHTS_EB = {
    W: 4, SC: 4, P1: 7, P2: 8, P3: 9, P4: 10, L1: 11, L2: 11, L3: 13, L4: 13,
};
// ── Free Game 符號權重（合計 90）──
exports.SYMBOL_WEIGHTS_FG = {
    W: 4, SC: 6, P1: 9, P2: 10, P3: 11, P4: 12, L1: 9, L2: 9, L3: 10, L4: 10,
};
// ── Buy Free Game 符號權重（合計 90）──
exports.SYMBOL_WEIGHTS_BUY_FG = {
    W: 1, SC: 2, P1: 2, P2: 3, P3: 4, P4: 6, L1: 14, L2: 14, L3: 22, L4: 22,
};
// Reel strip（依 Main Game 權重展開，ReelManager 使用注入的 RNG 取樣）
exports.REEL_STRIP = (() => {
    const strip = [];
    Object.entries(exports.SYMBOL_WEIGHTS).forEach(([sym, w]) => {
        for (let i = 0; i < w; i++)
            strip.push(sym);
    });
    return strip;
})();
// ─── 賠率表 ──────────────────────────────────────────────
exports.PAYTABLE_SCALE = 3.622;
const _BASE_PAYTABLE = {
    W: [0, 0, 0, 0.17, 0.43, 1.17],
    SC: [0, 0, 0, 0, 0, 0],
    P1: [0, 0, 0, 0.17, 0.43, 1.17],
    P2: [0, 0, 0, 0.11, 0.27, 0.67],
    P3: [0, 0, 0, 0.09, 0.23, 0.67],
    P4: [0, 0, 0, 0.07, 0.17, 0.57],
    L1: [0, 0, 0, 0.03, 0.07, 0.17],
    L2: [0, 0, 0, 0.03, 0.07, 0.17],
    L3: [0, 0, 0, 0.02, 0.05, 0.13],
    L4: [0, 0, 0, 0.02, 0.05, 0.13],
};
exports.PAYTABLE = Object.fromEntries(Object.entries(_BASE_PAYTABLE).map(([sym, arr]) => [
    sym, arr.map(v => parseFloat((v * exports.PAYTABLE_SCALE).toFixed(6)))
]));
// ─── 盤面尺寸 ─────────────────────────────────────────────
exports.REEL_COUNT = 5;
exports.BASE_ROWS = 3;
exports.MAX_ROWS = 6;
exports.SYMBOL_W = 110;
exports.SYMBOL_H = 110;
exports.SYMBOL_GAP = 6;
exports.REEL_GAP = 6;
exports.CANVAS_W = 720;
exports.CANVAS_H = 1280;
exports.REEL_TOP_Y = 380;
exports.REEL_START_X = -232;
// ─── 連線定義 ─────────────────────────────────────────────
exports.PAYLINES_25 = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
    [1, 0, 1, 2, 1], [1, 2, 1, 0, 1],
    [0, 0, 0, 1, 2], [2, 2, 2, 1, 0],
    [1, 1, 0, 0, 1], [1, 1, 2, 2, 1],
    [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [0, 2, 2, 2, 0], [2, 0, 0, 0, 2],
    [1, 2, 1, 2, 1], [1, 0, 1, 0, 1],
    [0, 1, 2, 2, 2], [2, 1, 0, 0, 0],
];
exports.PAYLINES_33 = [...exports.PAYLINES_25,
    [0, 0, 0, 0, 3], [3, 3, 3, 3, 3],
    [1, 1, 1, 1, 3], [1, 1, 1, 1, 0],
    [2, 3, 3, 3, 2], [0, 3, 3, 3, 0],
    [3, 2, 1, 2, 3], [0, 1, 2, 3, 3],
];
exports.PAYLINES_45 = [...exports.PAYLINES_33,
    [4, 4, 4, 4, 4], [0, 1, 2, 3, 4], [4, 3, 2, 1, 0],
    [2, 2, 2, 3, 4],
    [0, 0, 1, 2, 3], [4, 4, 3, 2, 1],
    [1, 2, 3, 4, 4], [3, 2, 1, 0, 0],
    [0, 2, 4, 2, 0], [4, 2, 0, 2, 4],
    [2, 3, 4, 3, 2], [4, 3, 2, 3, 4],
];
exports.PAYLINES_57 = [...exports.PAYLINES_45,
    [5, 5, 5, 5, 5], [0, 1, 2, 3, 5], [5, 3, 2, 1, 0],
    [0, 0, 0, 1, 5], [5, 5, 5, 4, 0],
    [2, 3, 4, 5, 5], [5, 4, 3, 4, 5],
    [1, 2, 3, 4, 5], [5, 4, 3, 2, 1],
    [0, 2, 5, 2, 0], [5, 3, 0, 3, 5],
    [3, 4, 5, 4, 3],
];
exports.PAYLINES_BY_ROWS = {
    3: exports.PAYLINES_25, 4: exports.PAYLINES_33, 5: exports.PAYLINES_45, 6: exports.PAYLINES_57,
};
// ─── Free Game 倍率 & Coin Toss ───────────────────────────
exports.FG_MULTIPLIERS = [3, 7, 17, 27, 77];
exports.COIN_TOSS_HEADS_PROB = [0.8, 0.68, 0.56, 0.48, 0.4];
exports.ENTRY_TOSS_PROB_MAIN = 0.8;
exports.ENTRY_TOSS_PROB_BUY = 1;
exports.FG_TRIGGER_PROB = 0.0089;
exports.TB_SECOND_HIT_PROB = 0.4;
// ─── 符號升階表 ───────────────────────────────────────────
exports.SYMBOL_UPGRADE = {
    'L4': 'P4', 'L3': 'P4', 'L2': 'P4', 'L1': 'P4', 'P4': 'P3', 'P3': 'P2', 'P2': 'P1', 'P1': 'P1'
};
// ─── 連線數 ───────────────────────────────────────────────
exports.LINES_BASE = 25;
exports.LINES_MAX = 57;
// ─── 押分範圍 ─────────────────────────────────────────────
exports.BET_MIN = 0.25; // 25線 × betPerLine 的最小合法值
exports.BET_MAX = 10.00; // 25線 × betPerLine 的最大合法值
exports.BET_STEP = 0.25; // +/- 一次的步進量
exports.BET_LEVELS = (() => {
    const levels = [];
    for (let b = exports.BET_MIN; b <= exports.BET_MAX + 1e-9; b += exports.BET_STEP) {
        levels.push(parseFloat(b.toFixed(2)));
    }
    return levels;
})();
// ─── Extra Bet & Buy FG ───────────────────────────────────
exports.EXTRA_BET_MULT = 3;
exports.BUY_COST_MULT = 100;
exports.BUY_FG_MIN_WIN_MULT = 20;
// ─── FG Spin Bonus ────────────────────────────────────────
exports.FG_SPIN_BONUS = [
    { mult: 1, weight: 900 },
    { mult: 5, weight: 80 },
    { mult: 20, weight: 15 },
    { mult: 100, weight: 5 },
];
// ─── 最大獎金上限 ─────────────────────────────────────────
exports.MAX_WIN_MULT = 30000;
// ─── 預設值 ───────────────────────────────────────────────
exports.DEFAULT_BET = 0.25;
exports.DEFAULT_BALANCE = 1000;
// ─── 符號標籤（顯示名稱）────────────────────────────────
exports.SYMBOL_LABELS = {
    W: 'WILD', SC: 'SC',
    P1: 'ZEUS', P2: 'PEGASUS', P3: 'ATHENA', P4: 'EAGLE',
    L1: 'Z', L2: 'E', L3: 'U', L4: 'S',
};
// ─── UI 顏色（不影響數學，固定不變）──────────────────────
exports.SYMBOL_COLORS = {
    W: '#ffe866', SC: '#cc44ff',
    P1: '#ffcc00', P2: '#44aaff', P3: '#66ffcc', P4: '#ffaa44',
    L1: '#4499ff', L2: '#6688ee', L3: '#5577cc', L4: '#4466bb',
};
exports.SYMBOL_DARK = {
    W: '#1a1a55', SC: '#550055',
    P1: '#4a3a00', P2: '#003355', P3: '#003333', P4: '#3a2200',
    L1: '#001844', L2: '#001a3a', L3: '#001530', L4: '#001025',
};
