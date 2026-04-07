'use strict';
/**
 * engine_generator.js — 讀取 Thunder_Config.xlsx DATA tab，
 *                       產生 assets/scripts/GameConfig.generated.ts
 *
 * 產生的檔案可直接替換 GameConfig.ts（或 diff 後手動合併）。
 * SlotEngine.ts 無需修改 — 它只 import GameConfig 的常數。
 *
 * Usage: node tools/slot-engine/engine_generator.js
 *
 * 前置條件：
 *   - Thunder_Config.xlsx 已由企劃修改完畢
 *   - excel_simulator.js 已跑完且所有模式 RTP 通過（SIMULATION tab）
 *
 * 輸出：
 *   - assets/scripts/GameConfig.generated.ts（不覆蓋原始 GameConfig.ts）
 *   - tools/slot-engine/generated/engine_config.json（除錯用）
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH      = path.resolve(__dirname, 'Thunder_Config.xlsx');
const OUTPUT_TS        = path.resolve(__dirname, '../../assets/scripts/GameConfig.generated.ts');
const OUTPUT_JSON      = path.resolve(__dirname, 'generated/engine_config.json');
const OUTPUT_BET_RANGE = path.resolve(__dirname, '../../apps/web/src/generated/BetRangeConfig.generated.ts');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Thunder_Config.xlsx not found. Run build_config.js first.');
  process.exit(1);
}

// ─── 讀取 Excel（復用 excel_simulator.js 的解析邏輯）──────────────────────

function readConfig() {
  const wb  = XLSX.readFile(CONFIG_PATH);
  const ws  = wb.Sheets['DATA'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const findSection = (label) => {
    for (let i = 0; i < raw.length; i++) {
      if (String(raw[i][0]).startsWith(label)) return i;
    }
    return -1;
  };

  // 遊戲基本設定
  const gIdx = findSection('[遊戲基本設定]');
  const basic = {};
  for (let i = gIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    const key = String(row[0]).trim();
    const val = row[1];
    if (key === '最高獎金倍數') basic.maxWinMult    = parseInt(val, 10);
    if (key === '最小押分')    basic.betMin         = parseFloat(val);
    if (key === '最大押分')    basic.betMax         = parseFloat(val);
    if (key === '押分步進')    basic.betStep        = parseFloat(val);
    if (key === '預設押分')    basic.defaultBet     = parseFloat(val);
    if (key === '預設餘額')    basic.defaultBalance = parseInt(val, 10);
  }

  // Paytable
  const ptIdx = findSection('[Paytable');
  const basePT = {};
  for (let i = ptIdx + 2; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    const sym = String(row[0]).trim();
    if (sym === 'SC') { basePT['SC'] = [0,0,0,0,0,0]; continue; }
    basePT[sym] = [0,0,0, parseFloat(row[2])||0, parseFloat(row[3])||0, parseFloat(row[4])||0];
  }

  // Scales
  const scaleIdx = findSection('[模式校準倍率');
  const scales = {};
  for (let i = scaleIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    const key = String(row[0]).trim();
    const val = parseFloat(row[1]);
    if (key.includes('PAYTABLE_SCALE'))   scales.PAYTABLE_SCALE          = val;
  }

  // Weights
  const wIdx = findSection('[符號機率權重]');
  const weights = { mainGame:{}, extraBet:{}, freeGame:{}, buyFG:{} };
  for (let i = wIdx + 2; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[') || row[0] === '合計') break;
    const sym = String(row[0]).trim();
    weights.mainGame[sym]  = parseInt(row[1], 10) || 0;
    weights.extraBet[sym]  = parseInt(row[2], 10) || 0;
    weights.freeGame[sym]  = parseInt(row[3], 10) || 0;
    weights.buyFG[sym]     = parseInt(row[4], 10) || 0;
  }

  // FG Multipliers
  const fgIdx = findSection('[FG 倍率階梯');
  const fgMults = []; const coinProbs = [];
  for (let i = fgIdx + 2; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    if (isNaN(parseInt(row[0]))) break;
    fgMults.push(parseInt(row[1], 10));
    coinProbs.push(parseFloat(row[2]));
  }

  // Entry Toss
  const etIdx = findSection('[Entry Coin Toss');
  const entryMain = parseFloat(raw[etIdx+1][1]);
  const entryBuy  = parseFloat(raw[etIdx+2][1]);

  // Special
  const spIdx = findSection('[特殊機率參數]');
  const special = {};
  for (let i = spIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    const key = String(row[0]).trim();
    const val = row[1];
    if (key === 'FG_TRIGGER_PROB')        special.fgTriggerProb   = parseFloat(val);
    if (key === 'MG_FG_TRIGGER_PROB')    special.mgFgTriggerProb  = parseFloat(val);
    if (key === 'TB_SECOND_HIT_PROB')     special.tbSecondHit     = parseFloat(val);
    if (key === 'EXTRA_BET_MULT')         special.extraBetMult    = parseInt(val, 10);
    if (key === 'BUY_COST_MULT')          special.buyCostMult     = parseInt(val, 10);
    if (key === 'BUY_FG_MIN_WIN_MULT')    special.buyFGMinWin     = parseInt(val, 10);
  }

  // FG Spin Bonus
  const fbIdx = findSection('[FG Spin Bonus');
  const fgBonus = [];
  for (let i = fbIdx + 2; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[') || row[0] === '合計') break;
    const mult = parseInt(row[0], 10);
    const wt   = parseInt(row[1], 10);
    if (!isNaN(mult) && !isNaN(wt)) fgBonus.push({ mult, weight: wt });
  }

  // TB Upgrade
  const tbIdx = findSection('[雷霆祝福');
  const upgrade = {};
  for (let i = tbIdx + 2; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    upgrade[String(row[0]).trim()] = String(row[1]).trim();
  }

  // Bet Ranges（幣種押注範圍）
  const brIdx = findSection('[幣種押注範圍]');
  const betRanges = {};
  if (brIdx >= 0) {
    for (let i = brIdx + 2; i < raw.length; i++) {
      const row = raw[i];
      if (!row[0] || String(row[0]).startsWith('[')) break;
      const currency = String(row[0]).trim();
      if (!currency || currency === '幣種') continue;
      betRanges[currency] = {
        baseUnit:  String(row[1]).trim(),
        minLevel:  parseInt(row[2], 10),
        maxLevel:  parseInt(row[3], 10),
        stepLevel: parseInt(row[4], 10),
      };
    }
  }

  return { basic, basePT, scales, weights, fgMults, coinProbs,
           entryMain, entryBuy, special, fgBonus, upgrade, betRanges };
}

// ─── 驗證 SIMULATION tab 通過 ────────────────────────────────────────────────

function checkSimulation() {
  const wb  = XLSX.readFile(CONFIG_PATH);
  const ws  = wb.Sheets['SIMULATION'];
  if (!ws) return true; // 跳過
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hasResults = false;
  for (const row of raw) {
    if (!row[2] || typeof row[2] !== 'string') continue;
    const rtpStr = row[2];
    if (!rtpStr.endsWith('%')) continue;
    const rtp = parseFloat(rtpStr);
    if (isNaN(rtp)) continue;
    hasResults = true;
    if (rtp < 97.0 || rtp > 98.5) {
      console.warn(`⚠️  警告：${row[0]} RTP=${rtpStr} 不在 97–98.5% 範圍，建議先調整 DATA tab`);
    }
  }
  if (!hasResults) {
    console.warn('⚠️  SIMULATION tab 無資料，建議先跑 excel_simulator.js 驗證 RTP');
  }
  return true;
}

// ─── 產生 TypeScript ─────────────────────────────────────────────────────────

function genTS(cfg) {
  const { basic, basePT, scales, weights, fgMults, coinProbs,
          entryMain, entryBuy, special, fgBonus, upgrade } = cfg;

  const syms = Object.keys(weights.mainGame);

  // 工具函式
  const weightsBlock = (label, w) =>
    `export const ${label}: Record<SymType, number> = {\n` +
    `    ${syms.map(s => `${s}: ${w[s]}`).join(', ')},\n` +
    `};\n`;

  const paytableRow = (sym) => {
    const p = basePT[sym] || [0,0,0,0,0,0];
    return `    ${sym}:  [${p.join(', ')}]`;
  };

  const upgradeBlock = Object.entries(upgrade)
    .map(([k,v]) => `    '${k}':'${v}'`)
    .join(', ');

  const fgBonusBlock = fgBonus
    .map(b => `    { mult: ${b.mult},   weight: ${b.weight} }`)
    .join(',\n');

  // BET_LEVELS 計算
  const betLevels = [];
  for (let b = basic.betMin; b <= basic.betMax + 1e-9; b += basic.betStep) {
    betLevels.push(parseFloat(b.toFixed(2)));
  }

  const generatedDate = new Date().toISOString().slice(0, 10);

  return `/**
 * GameConfig.generated.ts
 * ⚠️  此檔案由 tools/slot-engine/engine_generator.js 自動產生 (${generatedDate})
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

// ── Main Game 符號權重（合計 ${Object.values(weights.mainGame).reduce((a,b)=>a+b,0)}）──
${weightsBlock('SYMBOL_WEIGHTS', weights.mainGame)}
// ── Extra Bet 符號權重（合計 ${Object.values(weights.extraBet).reduce((a,b)=>a+b,0)}）──
${weightsBlock('SYMBOL_WEIGHTS_EB', weights.extraBet)}
// ── Free Game 符號權重（合計 ${Object.values(weights.freeGame).reduce((a,b)=>a+b,0)}）──
${weightsBlock('SYMBOL_WEIGHTS_FG', weights.freeGame)}
// ── Buy Free Game 符號權重（合計 ${Object.values(weights.buyFG).reduce((a,b)=>a+b,0)}）──
${weightsBlock('SYMBOL_WEIGHTS_BUY_FG', weights.buyFG)}

// Reel strip（依 Main Game 權重展開，ReelManager 使用注入的 RNG 取樣）
export const REEL_STRIP: SymType[] = (() => {
    const strip: SymType[] = [];
    (Object.entries(SYMBOL_WEIGHTS) as [SymType, number][]).forEach(([sym, w]) => {
        for (let i = 0; i < w; i++) strip.push(sym);
    });
    return strip;
})();

// ─── 賠率表 ──────────────────────────────────────────────
export const PAYTABLE_SCALE = ${scales.PAYTABLE_SCALE};

const _BASE_PAYTABLE: Record<SymType, number[]> = {
${syms.map(paytableRow).join(',\n')},
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
export const FG_MULTIPLIERS = [${fgMults.join(', ')}];
export const COIN_TOSS_HEADS_PROB = [${coinProbs.join(', ')}];
export const ENTRY_TOSS_PROB_MAIN = ${entryMain};
export const ENTRY_TOSS_PROB_BUY  = ${entryBuy};
export const FG_TRIGGER_PROB    = ${special.fgTriggerProb};
export const MG_FG_TRIGGER_PROB = ${special.mgFgTriggerProb ?? special.fgTriggerProb};
export const TB_SECOND_HIT_PROB = ${special.tbSecondHit};

// ─── 符號升階表 ───────────────────────────────────────────
export const SYMBOL_UPGRADE: Record<string, string> = {
    ${upgradeBlock}
};

// ─── 連線數 ───────────────────────────────────────────────
export const LINES_BASE = 25;
export const LINES_MAX  = 57;

// ─── 押分範圍 ─────────────────────────────────────────────
export const BET_MIN  = ${basic.betMin};
export const BET_MAX  = ${basic.betMax};
export const BET_STEP = ${basic.betStep};
export const BET_LEVELS: number[] = [${betLevels.join(', ')}];

// ─── Extra Bet & Buy FG ───────────────────────────────────
export const EXTRA_BET_MULT  = ${special.extraBetMult};
export const BUY_COST_MULT   = ${special.buyCostMult};
export const BUY_FG_MIN_WIN_MULT = ${special.buyFGMinWin};


// ─── FG Spin Bonus ────────────────────────────────────────
export const FG_SPIN_BONUS = [
${fgBonusBlock},
];

// ─── 最大獎金上限 ─────────────────────────────────────────
export const MAX_WIN_MULT = ${basic.maxWinMult};

// ─── 預設值 ───────────────────────────────────────────────
export const DEFAULT_BET     = ${basic.defaultBet};
export const DEFAULT_BALANCE = ${basic.defaultBalance};

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
`;
}

// ─── 主程式 ──────────────────────────────────────────────────────────────────

function main() {
  console.log('\n🔧  Thunder Blessing Engine Generator\n');

  checkSimulation();

  const cfg = readConfig();
  console.log('✅  Config loaded from Thunder_Config.xlsx');

  // 驗證權重合計
  for (const [mode, w] of Object.entries(cfg.weights)) {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    if (sum !== 90) {
      console.error(`❌  ERROR: ${mode} 符號權重合計 = ${sum}（需為 90）`);
      process.exit(1);
    }
  }
  console.log('✅  符號權重合計驗證通過（各模式均為 90）');

  const ts = genTS(cfg);
  fs.writeFileSync(OUTPUT_TS, ts, 'utf-8');
  console.log(`✅  GameConfig.generated.ts → ${OUTPUT_TS}`);

  // BetRangeConfig.generated.ts（後端 BetRangeService 讀取）
  if (Object.keys(cfg.betRanges).length > 0) {
    const generatedDate = new Date().toISOString().slice(0, 10);
    const entriesBlock = Object.entries(cfg.betRanges)
      .map(([cur, r]) => {
        const bu = parseFloat(r.baseUnit);
        const minBet  = (r.minLevel  * bu).toFixed(2);
        const maxBet  = (r.maxLevel  * bu).toFixed(2);
        const stepBet = (r.stepLevel * bu).toFixed(2);
        const cnt = Math.round((r.maxLevel - r.minLevel) / r.stepLevel) + 1;
        return `  ${cur}: { baseUnit: '${r.baseUnit}', minLevel: ${r.minLevel}, maxLevel: ${r.maxLevel}, stepLevel: ${r.stepLevel} }, // ${cur} ${minBet}~${maxBet} step ${stepBet} (${cnt} levels)`;
      })
      .join('\n');
    const betRangeTs = `/**
 * BetRangeConfig.generated.ts
 * ⚠️  此檔案由 tools/slot-engine/engine_generator.js 自動產生 (${generatedDate})
 * ⚠️  請勿手動編輯 — 修改 Thunder_Config.xlsx DATA tab [幣種押注範圍] 後重新執行 engine_generator.js
 */

export type Currency = 'USD' | 'TWD';

export interface BetRangeEntry {
  baseUnit:  string;   // e.g. '0.01' (USD cent), '1' (TWD)
  minLevel:  number;   // 最小 betLevel（整數）
  maxLevel:  number;   // 最大 betLevel（整數）
  stepLevel: number;   // betLevel 步進
}

/**
 * 每幣種的押注設定。
 * betLevel = totalBet / baseUnit（整數）
 * 引擎只看 betLevel，幣種只影響金額顯示。
 */
export const BET_RANGE_CONFIG: Record<Currency, BetRangeEntry> = {
${entriesBlock}
} as const;
`;
    if (!fs.existsSync(path.dirname(OUTPUT_BET_RANGE))) {
      fs.mkdirSync(path.dirname(OUTPUT_BET_RANGE), { recursive: true });
    }
    fs.writeFileSync(OUTPUT_BET_RANGE, betRangeTs, 'utf-8');
    console.log(`✅  BetRangeConfig.generated.ts → ${OUTPUT_BET_RANGE}`);
  } else {
    console.warn('⚠️  [幣種押注範圍] 區塊未找到，跳過 BetRangeConfig.generated.ts 產生');
  }

  // JSON 除錯輸出
  if (!fs.existsSync(path.dirname(OUTPUT_JSON))) {
    fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  }
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(cfg, null, 2));
  console.log(`✅  engine_config.json → ${OUTPUT_JSON}`);

  console.log('\n下一步：');
  console.log('  1. 比較差異：diff assets/scripts/GameConfig.ts assets/scripts/GameConfig.generated.ts');
  console.log('  2. 執行驗證：node tools/slot-engine/verify.js');
  console.log('  3. 跑單元測試：pnpm test:unit');
  console.log('  4. 驗證通過後：cp assets/scripts/GameConfig.generated.ts assets/scripts/GameConfig.ts');
  console.log('  5. 提 PR：/ship');
}

main();
