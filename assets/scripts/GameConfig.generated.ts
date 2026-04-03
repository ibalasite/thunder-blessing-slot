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

// ─── 符號類型 ─────────────────────────────────────────────
export const SYM = {
    WILD: 'W', SCATTER: 'SC',
    P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4',
    L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4',
} as const;
export type SymType = typeof SYM[keyof typeof SYM];

// ── Main Game 符號權重（合計 90）──
export const SYMBOL_WEIGHTS: Record<SymType, number> = {
    W: 3, SC: 4, P1: 6, P2: 7, P3: 8, P4: 10, L1: 12, L2: 12, L3: 14, L4: 14,
};

// ── Extra Bet 符號權重（合計 90）──
export const SYMBOL_WEIGHTS_EB: Record<SymType, number> = {
    W: 4, SC: 4, P1: 7, P2: 8, P3: 9, P4: 10, L1: 11, L2: 11, L3: 13, L4: 13,
};

// ── Free Game 符號權重（合計 90）──
export const SYMBOL_WEIGHTS_FG: Record<SymType, number> = {
    W: 4, SC: 6, P1: 9, P2: 10, P3: 11, P4: 12, L1: 9, L2: 9, L3: 10, L4: 10,
};

// ── Buy Free Game 符號權重（合計 90）──
export const SYMBOL_WEIGHTS_BUY_FG: Record<SymType, number> = {
    W: 1, SC: 2, P1: 2, P2: 3, P3: 4, P4: 6, L1: 14, L2: 14, L3: 22, L4: 22,
};


// Reel strip（依 Main Game 權重展開，ReelManager 使用注入的 RNG 取樣）
export const REEL_STRIP: SymType[] = (() => {
    const strip: SymType[] = [];
    (Object.entries(SYMBOL_WEIGHTS) as [SymType, number][]).forEach(([sym, w]) => {
        for (let i = 0; i < w; i++) strip.push(sym);
    });
    return strip;
})();

// ─── 賠率表 ──────────────────────────────────────────────
export const PAYTABLE_SCALE = 3.622;

const _BASE_PAYTABLE: Record<SymType, number[]> = {
    W:  [0, 0, 0, 0.17, 0.43, 1.17],
    SC:  [0, 0, 0, 0, 0, 0],
    P1:  [0, 0, 0, 0.17, 0.43, 1.17],
    P2:  [0, 0, 0, 0.11, 0.27, 0.67],
    P3:  [0, 0, 0, 0.09, 0.23, 0.67],
    P4:  [0, 0, 0, 0.07, 0.17, 0.57],
    L1:  [0, 0, 0, 0.03, 0.07, 0.17],
    L2:  [0, 0, 0, 0.03, 0.07, 0.17],
    L3:  [0, 0, 0, 0.02, 0.05, 0.13],
    L4:  [0, 0, 0, 0.02, 0.05, 0.13],
};

export const PAYTABLE: Record<SymType, number[]> = Object.fromEntries(
    Object.entries(_BASE_PAYTABLE).map(([sym, arr]) => [
        sym, arr.map(v => parseFloat((v * PAYTABLE_SCALE).toFixed(6)))
    ])
) as Record<SymType, number[]>;

// ─── 盤面尺寸 ─────────────────────────────────────────────
export const REEL_COUNT  = 5;
export const BASE_ROWS   = 3;
export const MAX_ROWS    = 6;
export const SYMBOL_W    = 110;
export const SYMBOL_H    = 110;
export const SYMBOL_GAP  = 6;
export const REEL_GAP    = 6;
export const CANVAS_W    = 720;
export const CANVAS_H    = 1280;
export const REEL_TOP_Y  = 380;
export const REEL_START_X = -232;

// ─── 連線定義 ─────────────────────────────────────────────
export const PAYLINES_25: number[][] = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2],
    [0,1,2,1,0], [2,1,0,1,2],
    [0,0,1,2,2], [2,2,1,0,0],
    [1,0,0,0,1], [1,2,2,2,1],
    [0,1,1,1,0], [2,1,1,1,2],
    [1,0,1,2,1], [1,2,1,0,1],
    [0,0,0,1,2], [2,2,2,1,0],
    [1,1,0,0,1], [1,1,2,2,1],
    [0,1,0,1,0], [2,1,2,1,2],
    [0,2,2,2,0], [2,0,0,0,2],
    [1,2,1,2,1], [1,0,1,0,1],
    [0,1,2,2,2], [2,1,0,0,0],
];
export const PAYLINES_33: number[][] = [...PAYLINES_25,
    [0,0,0,0,3], [3,3,3,3,3],
    [1,1,1,1,3], [1,1,1,1,0],
    [2,3,3,3,2], [0,3,3,3,0],
    [3,2,1,2,3], [0,1,2,3,3],
];
export const PAYLINES_45: number[][] = [...PAYLINES_33,
    [4,4,4,4,4], [0,1,2,3,4], [4,3,2,1,0],
    [2,2,2,3,4],
    [0,0,1,2,3], [4,4,3,2,1],
    [1,2,3,4,4], [3,2,1,0,0],
    [0,2,4,2,0], [4,2,0,2,4],
    [2,3,4,3,2], [4,3,2,3,4],
];
export const PAYLINES_57: number[][] = [...PAYLINES_45,
    [5,5,5,5,5], [0,1,2,3,5], [5,3,2,1,0],
    [0,0,0,1,5], [5,5,5,4,0],
    [2,3,4,5,5], [5,4,3,4,5],
    [1,2,3,4,5], [5,4,3,2,1],
    [0,2,5,2,0], [5,3,0,3,5],
    [3,4,5,4,3],
];
export const PAYLINES_BY_ROWS: Record<number, number[][]> = {
    3: PAYLINES_25, 4: PAYLINES_33, 5: PAYLINES_45, 6: PAYLINES_57,
};

// ─── Free Game 倍率 & Coin Toss ───────────────────────────
export const FG_MULTIPLIERS = [3, 7, 17, 27, 77];
export const COIN_TOSS_HEADS_PROB = [0.8, 0.68, 0.56, 0.48, 0.4];
export const ENTRY_TOSS_PROB_MAIN = 0.8;
export const ENTRY_TOSS_PROB_BUY  = 1;
export const FG_TRIGGER_PROB = 0.0089;
export const TB_SECOND_HIT_PROB = 0.4;

// ─── 符號升階表 ───────────────────────────────────────────
export const SYMBOL_UPGRADE: Record<string, string> = {
        'L4':'P4',     'L3':'P4',     'L2':'P4',     'L1':'P4',     'P4':'P3',     'P3':'P2',     'P2':'P1',     'P1':'P1'
};

// ─── 連線數 ───────────────────────────────────────────────
export const LINES_BASE = 25;
export const LINES_MAX  = 57;

// ─── 押分範圍 ─────────────────────────────────────────────
export const BET_MIN  = undefined;
export const BET_MAX  = undefined;
export const BET_STEP = undefined;
export const BET_LEVELS: number[] = [];

// ─── Extra Bet & Buy FG ───────────────────────────────────
export const EXTRA_BET_MULT  = 3;
export const BUY_COST_MULT   = 100;
export const BUY_FG_MIN_WIN_MULT = 20;

// ─── 模式專屬 PAYOUT_SCALE ───────────────────────────────
export const BUY_FG_PAYOUT_SCALE    = 1.073;
export const EB_PAYOUT_SCALE        = 2.67;
export const EB_BUY_FG_PAYOUT_SCALE = 1.165;

// ─── FG Spin Bonus ────────────────────────────────────────
export const FG_SPIN_BONUS = [
    { mult: 1,   weight: 900 },
    { mult: 5,   weight: 80 },
    { mult: 20,   weight: 15 },
    { mult: 100,   weight: 5 },
];

// ─── 最大獎金上限 ─────────────────────────────────────────
export const MAX_WIN_MULT = undefined;

// ─── 預設值 ───────────────────────────────────────────────
export const DEFAULT_BET     = undefined;
export const DEFAULT_BALANCE = undefined;

// ─── UI 顏色（不影響數學，固定不變）──────────────────────
export const SYMBOL_COLOR: Record<SymType, string> = {
    W:  '#ffe866', SC: '#cc44ff',
    P1: '#ffcc00', P2: '#44aaff', P3: '#66ffcc', P4: '#ffaa44',
    L1: '#4499ff', L2: '#6688ee', L3: '#5577cc', L4: '#4466bb',
};
export const SYMBOL_DARK: Record<SymType, string> = {
    W:  '#1a1a55', SC: '#550055',
    P1: '#4a3a00', P2: '#003355', P3: '#003333', P4: '#3a2200',
    L1: '#001844', L2: '#001a3a', L3: '#001530', L4: '#001025',
};
