/**
 * GameConfig.ts
 * 所有遊戲常數定義 — 賠率、符號、連線、尺寸
 */

// ─── 符號類型 ─────────────────────────────────────────────
export const SYM = {
    WILD: 'W', SCATTER: 'SC',
    P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4',
    L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4',
} as const;
export type SymType = typeof SYM[keyof typeof SYM];

// ── Main Game 符號權重（GDD §2-1: 合計 90）───────────────
export const SYMBOL_WEIGHTS: Record<SymType, number> = {
    W: 3, SC: 4,
    P1: 6, P2: 7, P3: 8, P4: 10,
    L1: 12, L2: 12, L3: 14, L4: 14,
};

// ── Extra Bet 符號權重（合計 90）─────────────────────────────────────────────
// Wild +1、Premium +3、Low -4：提高消除命中率 → 降低 0獎比例至 <70%
export const SYMBOL_WEIGHTS_EB: Record<SymType, number> = {
    W: 4, SC: 4,
    P1: 7, P2: 8, P3: 9, P4: 10,
    L1: 11, L2: 11, L3: 13, L4: 13,
};

// ── Free Game 符號權重（GDD §2-2: 合計 90）────────────────────────────────
export const SYMBOL_WEIGHTS_FG: Record<SymType, number> = {
    W: 4, SC: 6,
    P1: 9, P2: 10, P3: 11, P4: 12,
    L1: 9, L2: 9, L3: 10, L4: 10,
};

// ── Buy Free Game 專用符號權重（合計 90）─────────────────────────────────
// WILD/Premium 大幅降低 → 平均每 spin 產出低，但理論最高仍可達 30,000x
// 搭配 BUY_FG_PAYOUT_SCALE = 1.0 使用（不壓縮獎金）
export const SYMBOL_WEIGHTS_BUY_FG: Record<SymType, number> = {
    W: 1, SC: 2,
    P1: 2, P2: 3, P3: 4, P4: 6,
    L1: 14, L2: 14, L3: 22, L4: 22,
};

// Reel strip — 依照權重展開（每個滾輪共用同一張 strip，可日後分開）
// 注意：不在 module 載入時洗牌（避免 seeded 測試不穩定）；
// ReelManager 透過注入的 RNG 函式取樣。禁止直接使用 Math.random()。
export const REEL_STRIP: SymType[] = (() => {
    const strip: SymType[] = [];
    (Object.entries(SYMBOL_WEIGHTS) as [SymType, number][]).forEach(([sym, w]) => {
        for (let i = 0; i < w; i++) strip.push(sym);
    });
    return strip;
})();

// ─── 賠率表 ─────────────────────────────────────────────
// 索引 0=0個, 1=1個, 2=無效, 3=3個連線, 4=4個連線, 5=5個連線
//
// GDD 基礎倍率是為 scatter-pays（任意位置中獎）設計的。
// 本遊戲使用 payline 機制（左到右連線），命中率遠低於 scatter-pays，
// 因此需要 PAYTABLE_SCALE 校準因子來補償，維持目標 RTP 97.5%。
// 基礎值比例保持 GDD 規格不變，scale 由 Monte Carlo 模擬校準。
/**
 * PAYTABLE_SCALE: Multiplier applied to all base paytable values.
 * Value 3.622 calibrated so that the payline-based win system (25-57 lines)
 * achieves 97.5% RTP. Payline games require higher per-symbol values than
 * scatter-pays systems because wins only occur on specific line paths.
 * Derived via Monte Carlo simulation (2M+ spins). See Probability_Design.md §3.
 */
export const PAYTABLE_SCALE = 3.622;

const _BASE_PAYTABLE: Record<SymType, number[]> = {
    W:  [0, 0, 0, 0.17, 0.43, 1.17],
    SC: [0, 0, 0, 0,    0,    0],
    P1: [0, 0, 0, 0.17, 0.43, 1.17],
    P2: [0, 0, 0, 0.11, 0.27, 0.67],
    P3: [0, 0, 0, 0.09, 0.23, 0.67],
    P4: [0, 0, 0, 0.07, 0.17, 0.57],
    L1: [0, 0, 0, 0.03, 0.07, 0.17],
    L2: [0, 0, 0, 0.03, 0.07, 0.17],
    L3: [0, 0, 0, 0.02, 0.05, 0.13],
    L4: [0, 0, 0, 0.02, 0.05, 0.13],
};

export const PAYTABLE: Record<SymType, number[]> = (() => {
    const scaled = {} as Record<SymType, number[]>;
    for (const [sym, pays] of Object.entries(_BASE_PAYTABLE) as [SymType, number[]][]) {
        scaled[sym] = pays.map(v => v === 0 ? 0 : parseFloat((v * PAYTABLE_SCALE).toFixed(4)));
    }
    return scaled;
})();

// ─── 符號顯示名稱（希臘神話主題）────────────────────────
// P1=宙斯 P2=天馬 P3=雅典娜 P4=雄鷹 L1/L2/L3/L4=Z/E/U/S 字母
export const SYMBOL_LABELS: Record<SymType, string> = {
    W:  'WILD',    SC: 'SC',
    P1: 'ZEUS',   P2: 'PEGASUS', P3: 'ATHENA', P4: 'EAGLE',
    L1: 'Z',      L2: 'E',      L3: 'U',      L4: 'S',
};

// ─── 符號顏色（希臘神話風格：金/閃電藍/鋼鐵）─────────────
export const SYMBOL_COLORS: Record<SymType, string> = {
    W:  '#ccddff', SC: '#ff44ff',
    P1: '#ffe066', // Zeus — 金光
    P2: '#88ddff', // Pegasus — 天空藍白
    P3: '#66ffcc', // Athena — 智慧碧綠
    P4: '#ffaa44', // Eagle — 琥珀棕
    L1: '#4499ff', // Z
    L2: '#6688ee', // E
    L3: '#5577cc', // U
    L4: '#4466bb', // S
};
export const SYMBOL_DARK: Record<SymType, string> = {
    W:  '#1a1a55', SC: '#550055',
    P1: '#4a3a00', // Zeus
    P2: '#003355', // Pegasus
    P3: '#003333', // Athena
    P4: '#3a2200', // Eagle
    L1: '#001844', L2: '#001a3a', L3: '#001530', L4: '#001025',
};

// ─── 盤面尺寸 ─────────────────────────────────────────────
export const REEL_COUNT  = 5;
export const BASE_ROWS   = 3;
export const MAX_ROWS    = 6;
export const SYMBOL_W    = 110;  // square cell
export const SYMBOL_H    = 110;  // square cell
export const SYMBOL_GAP  = 6;
export const REEL_GAP    = 6;
export const CANVAS_W    = 720;
export const CANVAS_H    = 1280;
export const REEL_TOP_Y  = 380;    // reel area top Y from canvas center (frame top)
export const REEL_START_X = -232;  // leftmost reel center X

// ─── 25 條連線定義 (每個值 = 第N滾輪在第幾列，從0開始)  ──
// ─── 連線定義（row 0 = 底部，row 增加 = 往上；與 Python simulator 完全同步）──────

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

// 4 列可見（+8 條，含 row 3）
export const PAYLINES_33: number[][] = [...PAYLINES_25,
    [0,0,0,0,3], [3,3,3,3,3],
    [1,1,1,1,3], [1,1,1,1,0],
    [2,3,3,3,2], [0,3,3,3,0],
    [3,2,1,2,3], [0,1,2,3,3],
];

// 5 列可見（+12 條，含 row 4）
export const PAYLINES_45: number[][] = [...PAYLINES_33,
    [4,4,4,4,4], [0,1,2,3,4], [4,3,2,1,0],
    [2,2,2,3,4],
    [0,0,1,2,3], [4,4,3,2,1],
    [1,2,3,4,4], [3,2,1,0,0],
    [0,2,4,2,0], [4,2,0,2,4],
    [2,3,4,3,2], [4,3,2,3,4],
];

// 6 列可見（+12 條，含 row 5）
export const PAYLINES_57: number[][] = [...PAYLINES_45,
    [5,5,5,5,5], [0,1,2,3,5], [5,3,2,1,0],
    [0,0,0,1,5], [5,5,5,4,0],
    [2,3,4,5,5], [5,4,3,4,5],
    [1,2,3,4,5], [5,4,3,2,1],
    [0,2,5,2,0], [5,3,0,3,5],
    [3,4,5,4,3],
];

/** 根據可見列數取得對應連線組 */
export const PAYLINES_BY_ROWS: Record<number, number[][]> = {
    3: PAYLINES_25, 4: PAYLINES_33, 5: PAYLINES_45, 6: PAYLINES_57,
};

// Free Game 倍率升級序列
export const FG_MULTIPLIERS = [3, 7, 17, 27, 77];

/**
 * Per-spin Coin Toss 升級機率（GDD §9-3）。
 * FG 每轉結束後翻硬幣決定是否升級並繼續：
 *   [0] x3 → x7:   80% heads
 *   [1] x7 → x17:  68% heads
 *   [2] x17 → x27: 56% heads
 *   [3] x27 → x77: 48% heads
 *   [4] x77 維持:   40% heads
 * 翻到反面即 FG 結束。
 */
export const COIN_TOSS_HEADS_PROB = [0.80, 0.68, 0.56, 0.48, 0.40];

/**
 * Entry Coin Toss 機率：進入 FG 前翻硬幣。
 * Main/EB: 80% → 可能失敗（Phase A 分數仍保留）。
 * Buy FG:  100% → 保證進入。
 */
export const ENTRY_TOSS_PROB_MAIN = 0.80;
export const ENTRY_TOSS_PROB_BUY  = 1.00;

/**
 * FG_TRIGGER_PROB: Free Game trigger probability per spin (spin-start decision).
 * Value 0.008 (0.8%) calibrated so that, combined with FG_MULTIPLIERS and
 * COIN_TOSS_HEADS_PROB, the overall RTP contribution from FG rounds reaches
 * the 97.5% target. Higher values increase jackpot frequency but reduce
 * base-game hit frequency. This is the primary RTP calibration lever.
 * 新模型：每次 spin 一開始就 roll 此機率，決定是否觸發 FG。
 * 若觸發，cascade 保證展開至 MAX_ROWS（兩段表演合一）。
 * Buy FG 不受此限制（付費 = 100% 觸發）。
 */
export const FG_TRIGGER_PROB = 0.008;
// 雷霆祝福：第二擊觸發機率（GDD §5: 40%）
export const TB_SECOND_HIT_PROB = 0.40;

export const SYMBOL_UPGRADE: Record<string, string> = {
    'L4':'P4','L3':'P4','L2':'P4','L1':'P4',
    'P4':'P3','P3':'P2','P2':'P1','P1':'P1'
};

// 基礎連線數（3 列可見：25 條；展開後：57 條）
export const LINES_BASE = 25;   // BASE_ROWS 時的活躍連線數
export const LINES_MAX  = 57;   // MAX_ROWS  時的活躍連線數

// 押分範圍（以 25 線基礎遊戲為參考單位）
export const BET_MIN = 0.25;    // 25線 × betPerLine 的最小合法值
export const BET_MAX = 10.00;   // 25線 × betPerLine 的最大合法值
export const BET_STEP = 0.25;   // +/- 一次的步進量

/** 所有合法押分等級（由 BET_MIN 到 BET_MAX，步進 BET_STEP） */
export const BET_LEVELS: number[] = (() => {
    const levels: number[] = [];
    for (let b = BET_MIN; b <= BET_MAX + 1e-9; b += BET_STEP) {
        levels.push(parseFloat(b.toFixed(2)));
    }
    return levels;
})();

// Extra Bet 倍率（玩家每轉付 totalBet × EXTRA_BET_MULT）
export const EXTRA_BET_MULT = 3;

// Buy Free Game 費用（玩家付 totalBet × BUY_COST_MULT 購買 FG）
export const BUY_COST_MULT = 100;

/**
 * Buy FG 最低保底獎金（BET 倍數）。
 * 花 100× BET 購買，至少回 20× BET（20% 保底），避免體感過差。
 * Engine 在 computeFullSpin 結算時，若 totalWin < 此值 × totalBet，補至此值。
 */
export const BUY_FG_MIN_WIN_MULT = 20;

// ── 模式專屬派獎倍率（各模式獨立校準至 97.5% RTP）───────────────
/**
 * BUY_FG_PAYOUT_SCALE: Additional scale applied to Buy FG wins.
 * Value 0.995 calibrated to achieve 97.5% RTP for the Buy FG mode,
 * accounting for the guaranteed FG entry and tier-reaching bonus.
 * See Phase 1.5B calibration in docs/EDD-refactor-architecture.md §6.
 */
export const BUY_FG_PAYOUT_SCALE = 0.995;
/**
 * EB_PAYOUT_SCALE: Scale applied to Extra Bet mode wins.
 * Value 2.75 verified by Monte Carlo (10 seeds × 100k = 1M spins) to achieve ~97.5% RTP.
 * Extra Bet costs 3× base bet (EXTRA_BET_MULT=3), pays at 2.75× raw win.
 * Note: stale compiled GameConfig.js (if present) shadows this — delete .js files to ensure
 * ts-jest loads this TypeScript source.
 */
export const EB_PAYOUT_SCALE = 2.75;
/**
 * EB_BUY_FG_PAYOUT_SCALE: Scale applied to Extra Bet ON + Buy FG combined mode wins.
 * Value 1.065 calibrated to achieve 97.5% RTP when both EB and Buy FG are active.
 * SC guarantee (applyExtraBetSC) applies to all spins in this mode, including FG spins.
 * Because SC replaces cells in the BUY_FG weight grid (low premium symbols), the raw
 * win is reduced relative to plain BuyFG; scale > 1.0 compensates.
 * Wagered = BUY_COST_MULT × bet (100×); no additional EB surcharge.
 * Derived via Monte Carlo simulation (500k sessions × 10 seeds). See GDD §12-3.
 */
export const EB_BUY_FG_PAYOUT_SCALE = 1.065;

/**
 * FG 每 spin 閃電加成（所有模式共用）。
 * 每次 FG spin 前隨機抽取，乘入該 spin 的 multipliedWin。
 * E[bonus] ≈ 2.10，搭配各模式 PAYOUT_SCALE / FG_TRIGGER_PROB 校準 RTP。
 * 讓分配表能自然延伸至 30,000x max win。
 */
export const FG_SPIN_BONUS = [
    { mult: 1,   weight: 900 },
    { mult: 5,   weight: 80 },
    { mult: 20,  weight: 15 },
    { mult: 100, weight: 5 },
];

// 最大獎金上限
export const MAX_WIN_MULT = 30000;

// 預設投注額
export const DEFAULT_BET = 0.25;
export const DEFAULT_BALANCE = 1000;

