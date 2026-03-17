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

// 普通符號權重（每個符號在 reel strip 出現的相對頻率）
export const SYMBOL_WEIGHTS: Record<SymType, number> = {
    W: 3, SC: 4,
    P1: 6, P2: 7, P3: 8, P4: 10,
    L1: 12, L2: 12, L3: 14, L4: 14,
};

// Reel strip — 依照權重展開（每個滾輪共用同一張 strip，可日後分開）
export const REEL_STRIP: SymType[] = (() => {
    const strip: SymType[] = [];
    (Object.entries(SYMBOL_WEIGHTS) as [SymType, number][]).forEach(([sym, w]) => {
        for (let i = 0; i < w; i++) strip.push(sym);
    });
    // 打亂
    for (let i = strip.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [strip[i], strip[j]] = [strip[j], strip[i]];
    }
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
export const SYMBOL_W    = 96;
export const SYMBOL_H    = 84;
export const SYMBOL_GAP  = 6;
export const REEL_GAP    = 8;
export const CANVAS_W    = 960;
export const CANVAS_H    = 640;
export const REEL_TOP_Y  = 260;    // reel area top Y from canvas center
export const REEL_START_X = -238;  // leftmost reel center X

// ─── 25 條連線定義 (每個值 = 第N滾輪在第幾列，從0開始)  ──
export const PAYLINES_25: number[][] = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2],   // 直線 3 條
    [0,1,2,1,0], [2,1,0,1,2],                 // 對角線 2 條
    [0,0,1,2,2], [2,2,1,0,0],                 // 斜線 2 條
    [1,0,0,0,1], [1,2,2,2,1],                 // V 形 2 條
    [0,1,1,1,0], [2,1,1,1,2],                 // 倒 V 2 條
    [1,0,1,2,1], [1,2,1,0,1],                 // 波浪 2 條
    [0,0,0,1,2], [2,2,2,1,0],                 // 斜漸 2 條
    [1,1,0,0,1], [1,1,2,2,1],                 // 不規則 2 條
    [0,1,0,1,0], [2,1,2,1,2],                 // 交叉 2 條
    [0,2,2,2,0], [2,0,0,0,2],                 // W/M 形 2 條
    [1,2,1,2,1], [1,0,1,0,1],                 // 波 2 條
    [0,1,2,2,2], [2,1,0,0,0],                 // 末段 2 條
];

// Free Game 倍率升級序列
export const FG_MULTIPLIERS = [3, 7, 17, 27, 77];
export const SYMBOL_UPGRADE: Record<string, string> = {
    'L4':'P4','L3':'P4','L2':'P4','L1':'P4',
    'P4':'P3','P3':'P2','P2':'P1','P1':'P1'
};

// Extra Bet 倍率
export const EXTRA_BET_MULT = 3;

// 最大獎金上限
export const MAX_WIN_MULT = 30000;

// 預設投注額
export const DEFAULT_BET = 0.25;
export const DEFAULT_BALANCE = 1000;

