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

// ── Phase 5 最終確認機率設定（Main Game，目標 RTP 97.5%，驗證 98.53%）───────────────
export const SYMBOL_WEIGHTS: Record<SymType, number> = {
    W: 2, SC: 3,
    P1: 4, P2: 5, P3: 7, P4: 9,
    L1: 14, L2: 14, L3: 16, L4: 16,
};

// ── Phase 5 Free Game 機率（高賠符號出現率提升）────────────────────────────────
export const SYMBOL_WEIGHTS_FG: Record<SymType, number> = {
    W: 3, SC: 4,
    P1: 7, P2: 8, P3: 10, P4: 11,
    L1: 11, L2: 11, L3: 12, L4: 13,
};

// Reel strip — 依照權重展開（每個滾輪共用同一張 strip，可日後分開）
// 注意：不在 module 載入時洗牌（避免 seeded 測試不穩定）；
// ReelManager 每次存取時自行 Math.random() 取樣，洗牌無意義。
export const REEL_STRIP: SymType[] = (() => {
    const strip: SymType[] = [];
    (Object.entries(SYMBOL_WEIGHTS) as [SymType, number][]).forEach(([sym, w]) => {
        for (let i = 0; i < w; i++) strip.push(sym);
    });
    return strip;
})();

// ─── 賠率表 ─────────────────────────────────────────────
// 索引 0=0個, 1=1個, 2=無效, 3=3個連線, 4=4個連線, 5=5個連線
export const PAYTABLE: Record<SymType, number[]> = {
    W:  [0, 0, 0, 0.17, 0.43, 1.17],
    SC: [0, 0, 0, 0,    0,    0],   // Scatter 無直接賠率，觸發特效
    P1: [0, 0, 0, 0.17, 0.43, 1.17],
    P2: [0, 0, 0, 0.11, 0.27, 0.67],
    P3: [0, 0, 0, 0.09, 0.23, 0.67],
    P4: [0, 0, 0, 0.07, 0.17, 0.57],
    L1: [0, 0, 0, 0.03, 0.07, 0.17],
    L2: [0, 0, 0, 0.03, 0.07, 0.17],
    L3: [0, 0, 0, 0.02, 0.05, 0.13],
    L4: [0, 0, 0, 0.02, 0.05, 0.13],
};

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
 * 每局 FG Spin 後 Coin Toss 翻到 ZEUS（Heads）的機率。
 * 進場 Coin Toss 也使用 index 0（80%），正常與 Buy FG 相同。
 * 越低倍率越容易，每升一級漸難，讓玩家感受張力逐漸升高。
 * index 對應 FG_MULTIPLIERS 的倍率等級：
 *   [0] ×3  → 80%  (進場 & x3 後升到 x7)
 *   [1] ×7  → 68%  (x7 後升到 x17)
 *   [2] ×17 → 56%  (x17 後升到 x27)
 *   [3] ×27 → 48%  (x27 後升到 x77)
 *   [4] ×77 → 40%  (最高等級，維持 x77 繼續)
 */
export const COIN_TOSS_HEADS_PROB = [0.80, 0.68, 0.56, 0.48, 0.40];
/**
 * 正常遊戲自然觸發 FREE GAME 的門檻機率。
 * 基礎遊戲 Cascade 達到 MAX_ROWS 並再次勝出時，還需通過此機率檢查，才能進入 Coin Toss。
 * 調低此值可降低 FG 觸發頻率，是控制整體 RTP 的主要旋鈕。
 * Buy Free Game 不受此限制（付費保證）。
 * 倒率序列改為 [3,7,17,27,77] 後重新測算：
 * 設定 0.11（11%）→ 預估全局 RTP ≈ 97%
 */
export const FG_TRIGGER_PROB = 0.11;
// 雷霆祝福：第二擊觸發機率（Phase 5 設定）
export const TB_SECOND_HIT_PROB = 0.28;

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

// Extra Bet 倍率
export const EXTRA_BET_MULT = 3;

// 最大獎金上限
export const MAX_WIN_MULT = 30000;

// 預設投注額
export const DEFAULT_BET = 0.25;
export const DEFAULT_BALANCE = 1000;

