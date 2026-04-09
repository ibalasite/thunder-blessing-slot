'use strict';
/**
 * excel_simulator.js — 讀取 Thunder_Config.xlsx DATA tab，
 *                      對所有 4 個遊戲模式跑 Monte Carlo，
 *                      結果寫回 SIMULATION tab。
 *
 * Usage:
 *   node tools/slot-engine/excel_simulator.js [--spins=N] [--runs=N]
 *
 * 模擬完整對應 SlotEngine.ts computeFullSpin() 邏輯：
 *   Phase A: cascade until MAX_ROWS（FG 觸發時）
 *   Entry Toss（Main/EB=ENTRY_TOSS_PROB_MAIN, Buy=100%）
 *   Main/EB FG Loop: coin toss per spin（variable length）
 *   Buy FG Loop: 保證 5 spins（每級各一次），_guaranteedWinSpin
 *   modePayoutScale 乘在 totalRawWin 上
 *   RTP = totalWin / wagered
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, 'Thunder_Config.xlsx');
const OUTPUT_JSON = path.resolve(__dirname, 'generated/sim_result.json');
const GENERATED_DIR = path.resolve(__dirname, 'generated');
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

// CLI args
let SIM_SPINS = 2000000;
let SIM_RUNS  = 3;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--spins=')) SIM_SPINS = parseInt(arg.split('=')[1], 10);
  if (arg.startsWith('--runs='))  SIM_RUNS  = parseInt(arg.split('=')[1], 10);
}

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Thunder_Config.xlsx not found. Run build_config.js first.');
  process.exit(1);
}

// ─── 讀取 Excel DATA Tab ────────────────────────────────────────────────────

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

  // Scales（只讀取 PAYTABLE_SCALE，mode-specific scales 已依 EDD 規定移除）
  const scaleIdx = findSection('[模式校準倍率');
  const scales = {};
  for (let i = scaleIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] || String(row[0]).startsWith('[')) break;
    const key = String(row[0]).trim();
    const val = parseFloat(row[1]);
    if (key.includes('PAYTABLE_SCALE')) scales.PAYTABLE_SCALE = val;
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

  // FG Multipliers & Coin Toss probs
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

  // Special params
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

  return { basePT, scales, weights, fgMults, coinProbs,
           entryMain, entryBuy, special, fgBonus, upgrade };
}

// ─── Paylines（固定，走法不在 Excel 中）──────────────────────────────────────

const PAYLINES_25 = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
  [0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],
  [1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0],[2,1,1,1,2],
  [1,0,1,2,1],[1,2,1,0,1],[0,0,0,1,2],[2,2,2,1,0],
  [1,1,0,0,1],[1,1,2,2,1],[0,1,0,1,0],[2,1,2,1,2],
  [0,2,2,2,0],[2,0,0,0,2],[1,2,1,2,1],[1,0,1,0,1],
  [0,1,2,2,2],[2,1,0,0,0],
];
const PAYLINES_33 = [...PAYLINES_25,
  [0,0,0,0,3],[3,3,3,3,3],[1,1,1,1,3],[1,1,1,1,0],
  [2,3,3,3,2],[0,3,3,3,0],[3,2,1,2,3],[0,1,2,3,3],
];
const PAYLINES_45 = [...PAYLINES_33,
  [4,4,4,4,4],[0,1,2,3,4],[4,3,2,1,0],[2,2,2,3,4],
  [0,0,1,2,3],[4,4,3,2,1],[1,2,3,4,4],[3,2,1,0,0],
  [0,2,4,2,0],[4,2,0,2,4],[2,3,4,3,2],[4,3,2,3,4],
];
const PAYLINES_57 = [...PAYLINES_45,
  [5,5,5,5,5],[0,1,2,3,5],[5,3,2,1,0],[0,0,0,1,5],[5,5,5,4,0],
  [2,3,4,5,5],[5,4,3,4,5],[1,2,3,4,5],[5,4,3,2,1],
  [0,2,5,2,0],[5,3,0,3,5],[3,4,5,4,3],
];
const PAYLINES_BY_ROWS = { 3:PAYLINES_25, 4:PAYLINES_33, 5:PAYLINES_45, 6:PAYLINES_57 };

// ─── PAYTABLE 解析式命中率計算 ────────────────────────────────────────────────
// 供 DESIGN_VIEW 的 PAYTABLE 分析頁使用

function paytableHitRate(weights, sym, count) {
  const total = Object.values(weights).reduce((a,b)=>a+b,0);
  const p_s   = (weights[sym] || 0) / total;
  const p_w   = (weights['W'] || 0)  / total;
  const p_sw  = p_s + p_w;
  if (p_s <= 0) return 0;
  if (count === 5) return p_s * Math.pow(p_sw, 4);
  return p_s * Math.pow(p_sw, count-1) * Math.pow(1-p_sw, 5-count);
}

function buildPaytableAnalysis(cfg, modeKey) {
  // modeKey: 'mainGame' | 'extraBet' | 'buyFG'（FG spin 用 freeGame weights）
  const baseWeightsMap = {
    mainGame: cfg.weights.mainGame,
    extraBet: cfg.weights.extraBet,
    buyFG:    cfg.weights.buyFG,
  };
  const baseW  = baseWeightsMap[modeKey] || cfg.weights.mainGame;
  const fgW    = cfg.weights.freeGame;
  const scale  = cfg.scales.PAYTABLE_SCALE;
  const PAY_SYMS = ['W','P1','P2','P3','P4','L1','L2','L3','L4'];
  const LINES  = [25, 33, 45, 57];

  const rows = [];
  rows.push(['符號', '連線數', '單線命中率%', '25條EV', '33條EV', '45條EV', '57條EV', '賠率(×bet)', 'RTP貢獻@25線%']);

  let totalRTPContrib = 0;
  for (const sym of PAY_SYMS) {
    for (const cnt of [3, 4, 5]) {
      const basePay = (cfg.basePT[sym]?.[cnt] || 0) * scale;
      if (basePay <= 0) continue;
      const baseHR = paytableHitRate(baseW, sym, cnt);
      const fgHR   = paytableHitRate(fgW,   sym, cnt);
      const contrib25 = baseHR * basePay * 25 * 100;
      totalRTPContrib += contrib25;
      rows.push([
        sym, cnt + '連',
        (baseHR * 100).toFixed(4) + '%',
        (baseHR * basePay * 25).toFixed(5),
        (baseHR * basePay * 33).toFixed(5),
        (baseHR * basePay * 45).toFixed(5),
        (fgHR  * basePay * 57).toFixed(5),
        basePay.toFixed(4),
        contrib25.toFixed(4) + '%',
      ]);
    }
  }
  rows.push(['合計 base spin RTP 貢獻（25線，無cascade）', '', '', '', '', '', '', '', totalRTPContrib.toFixed(3) + '%']);
  return rows;
}

// ─── RNG（Mulberry32）───────────────────────────────────────────────────────

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeSeed(run) { return ((run * 1234567 + Date.now()) >>> 0); }

// ─── 模擬引擎 ─────────────────────────────────────────────────────────────────

class ThunderSim {
  constructor(cfg, rng) {
    this.cfg = cfg;
    this.rng = rng;
    // 展開符號陣列（帶權重的 reel strip）
    this.strips = {
      main:    this._expand(cfg.weights.mainGame),
      eb:      this._expand(cfg.weights.extraBet),
      fg:      this._expand(cfg.weights.freeGame),
      buyFG:   this._expand(cfg.weights.buyFG),
    };
    // paytable（PAYTABLE_SCALE 已乘入，對應 SlotEngine 的 PAYTABLE）
    this.paytable = {};
    for (const [sym, arr] of Object.entries(cfg.basePT)) {
      this.paytable[sym] = arr.map(v => parseFloat((v * cfg.scales.PAYTABLE_SCALE).toFixed(6)));
    }
    // FG Spin Bonus strip
    this.fgBonusStrip = [];
    for (const b of cfg.fgBonus) {
      for (let i = 0; i < b.weight; i++) this.fgBonusStrip.push(b.mult);
    }
  }

  _expand(w) {
    const s = [];
    for (const [sym, cnt] of Object.entries(w)) for (let i=0; i<cnt; i++) s.push(sym);
    return s;
  }

  _r()    { return this.rng(); }
  _pick(a){ return a[Math.floor(this._r() * a.length)]; }

  // 生成 5×6 盤面（grid[reel][row]）
  _gen(stripName) {
    const s = this.strips[stripName];
    const g = [];
    for (let ri=0; ri<5; ri++) {
      const col = [];
      for (let row=0; row<6; row++) col.push(this._pick(s));
      g.push(col);
    }
    return g;
  }

  // Extra Bet SC 保證（對應 applyExtraBetSC）
  _scGuarantee(grid) {
    for (let ri=0; ri<5; ri++)
      for (let row=0; row<3; row++)
        if (grid[ri][row] === 'SC') return grid;
    const ng = grid.map(c => [...c]);
    ng[Math.floor(this._r()*5)][Math.floor(this._r()*3)] = 'SC';
    return ng;
  }

  // 掃描中獎（totalBet=1 單位，對應 checkWins + multiplier*totalBet）
  _checkWins(grid, rows) {
    const lines = PAYLINES_BY_ROWS[rows] || PAYLINES_25;
    const seenCell = new Set();
    const winCells = [];
    let totalWin = 0;

    for (const path of lines) {
      if (path.some(r => r >= rows)) continue;

      // 解析起頭符號（考慮 Wild 替代）
      let sym = grid[0][path[0]];
      if (sym === 'W') {
        for (let ri=1; ri<5; ri++) {
          const s = grid[ri][path[ri]];
          if (s !== 'W') { sym = s; break; }
        }
      }
      if (sym === 'SC') continue;

      let count = 1;
      for (let ri=1; ri<5; ri++) {
        const s = grid[ri][path[ri]];
        if (s === sym || s === 'W') count = ri + 1;
        else break;
      }
      if (count < 3) continue;

      const mult = this.paytable[sym] ? (this.paytable[sym][count] || 0) : 0;
      if (mult <= 0) continue;

      totalWin += mult; // mult already includes totalBet=1 (multiplier × 1)
      for (let ri=0; ri<count; ri++) {
        const key = `${ri},${path[ri]}`;
        if (!seenCell.has(key)) {
          seenCell.add(key);
          winCells.push({ reel: ri, row: path[ri], key });
        }
      }
    }
    return { totalWin, winCells: seenCell, winCellList: winCells };
  }

  // 雷霆祝福 TB（對應 applyTB，在無中獎且有 SC + marks 時觸發）
  _applyTB(grid, marks, rows) {
    const cfg = this.cfg;
    const ng = grid.map(c => [...c]);
    const hit = (sym) => cfg.upgrade[sym] || sym;
    for (const cell of marks) {
      const [ri, row] = cell.split(',').map(Number);
      if (row < rows) ng[ri][row] = hit(ng[ri][row]);
    }
    if (this._r() < cfg.special.tbSecondHit) {
      for (const cell of marks) {
        const [ri, row] = cell.split(',').map(Number);
        if (row < rows) ng[ri][row] = hit(ng[ri][row]);
      }
    }
    return ng;
  }

  // 補充被消除的格子（in-place refill，對應 drawSymbol）
  _refill(grid, winCellList, stripName) {
    const s = this.strips[stripName];
    for (const { reel, row } of winCellList) {
      grid[reel][row] = this._pick(s);
    }
  }

  // 單次 spin 模擬（對應 simulateSpin，回傳 totalRawWin + fgTriggered）
  // fgTriggered = 盤面擴展到 MAX_ROWS=6
  _simulateSpin(stripName, withSCGuarantee, maxCascade = 20) {
    const BASE_ROWS = 3, MAX_ROWS = 6;
    let grid = this._gen(stripName);
    if (withSCGuarantee) grid = this._scGuarantee(grid);

    let totalRawWin = 0;
    let rows = BASE_ROWS;
    let fgTriggered = false;
    let marks = new Set(); // 閃電標記

    for (let iter = 0; iter < maxCascade; iter++) {
      const { totalWin: w, winCells, winCellList } = this._checkWins(grid, rows);

      if (winCellList.length === 0) {
        // 無中獎 → 嘗試觸發 TB
        let hasSC = false;
        outer: for (let ri=0; ri<5; ri++)
          for (let row=0; row<rows; row++)
            if (grid[ri][row] === 'SC') { hasSC = true; break outer; }
        if (!hasSC || marks.size === 0) break;
        // 執行 TB → 繼續下一次 cascade 掃描
        grid = this._applyTB(grid, marks, rows);
        marks.clear();
        continue;
      }

      totalRawWin += w;
      for (const key of winCells) marks.add(key);

      // 擴展列數
      const newRows = Math.min(rows + 1, MAX_ROWS);
      if (newRows >= MAX_ROWS && rows < MAX_ROWS) fgTriggered = true;

      // 補充中獎格
      this._refill(grid, winCellList, stripName);
      rows = newRows;
    }

    return { totalRawWin, fgTriggered };
  }

  // _guaranteedWinSpin（對應 Buy FG FG Loop）：重試最多 50 次直到 win > 0
  _guaranteedWinSpin(stripName, withSCGuarantee) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const r = this._simulateSpin(stripName, withSCGuarantee, 1); // maxCascade=1
      if (r.totalRawWin > 0) return r;
    }
    return this._simulateSpin(stripName, withSCGuarantee, 1);
  }

  // FG Spin Bonus
  _fgBonus() { return this._pick(this.fgBonusStrip); }

  // ── 計算完整 spin（對應 computeFullSpin）────────────────────────────────────
  computeSpin(modeName) {
    const cfg = this.cfg;
    const MAX_WIN = 30000; // MAX_WIN_MULT × totalBet (totalBet=1)

    const isBuyFG  = modeName === 'buyFG' || modeName === 'ebBuyFG';
    const isEB     = modeName === 'extraBet' || modeName === 'ebBuyFG';
    const isFG     = modeName === 'freeGame';

    // 選 strip
    const baseStrip = isBuyFG ? 'buyFG' : isEB ? 'eb' : 'main';
    const fgStrip   = isBuyFG ? 'buyFG' : 'fg';

    // Direction A: EB wins scale with wagered (EXTRA_BET_MULT).
    // BuyFG+EB: totalBet already includes ebMult — no extra scaling needed.
    const isEBNotBuyFG = isEB && !isBuyFG;
    const ebBetMult    = isEBNotBuyFG ? cfg.special.extraBetMult : 1;
    const maxWin       = MAX_WIN * (isEBNotBuyFG ? cfg.special.extraBetMult : 1);

    // ① FG 觸發決策（MG/EB 可使用各自獨立 trigger prob）
    const fgTrigProb = (!isBuyFG && !isEB && cfg.special.mgFgTriggerProb)
                     ? cfg.special.mgFgTriggerProb   // MG 專用（若有定義）
                     : cfg.special.fgTriggerProb;    // EB / 全域 fallback
    const fgTriggeredDecision = isBuyFG ? true : this._r() < fgTrigProb;

    // ② Phase A（cascade loop）
    let baseWin = 0;
    if (fgTriggeredDecision) {
      // FG 觸發：cascade 直到 MAX_ROWS
      let currentRows = 3;
      for (let s = 0; s < 100; s++) {
        const r = this._simulateSpinFromRows(baseStrip, isEB, currentRows, 20);
        baseWin += r.totalRawWin * ebBetMult;
        currentRows = r.finalRows;
        if (currentRows >= 6) break;
      }
    } else {
      // 正常 spin
      const r = this._simulateSpin(baseStrip, isEB, 20);
      baseWin += r.totalRawWin * ebBetMult;
    }

    // ③ Entry Toss
    let enterFG = false;
    if (fgTriggeredDecision) {
      const entryProb = isBuyFG ? cfg.entryBuy : cfg.entryMain;
      enterFG = this._r() < entryProb;
    }

    // ④ FG Loop
    let fgWin = 0;
    let fgSpinCount = 0;
    if (enterFG) {
      const fgMarks = new Set();
      if (isBuyFG) {
        // Buy FG: 保證 5 spins（每級各一次），tossProb=100%
        for (let multIdx = 0; multIdx < cfg.fgMults.length; multIdx++) {
          const mult  = cfg.fgMults[multIdx];
          // SC guarantee only applies to Phase A (base spin), NOT FG spins
          const r     = this._guaranteedWinSpin(fgStrip, false);
          const bonus = this._fgBonus();
          let mWin = r.totalRawWin * ebBetMult * mult * bonus;
          if (baseWin + fgWin + mWin > maxWin) {
            mWin = Math.max(0, maxWin - baseWin - fgWin);
          }
          fgWin += mWin;
          fgSpinCount++;
          if (fgWin + baseWin >= maxWin) break;
        }
      } else {
        // Main / EB: variable FG（coin toss per spin）
        let multIdx = 0;
        for (let safety = 0; safety < 200; safety++) {
          const mult  = cfg.fgMults[multIdx];
          // MG/EB FG: keep SC guarantee (isEB=true) to enable TB via accumulated marks
          const r     = this._simulateSpin(fgStrip, isEB);
          const bonus = this._fgBonus();
          let mWin = r.totalRawWin * ebBetMult * mult * bonus;
          if (baseWin + fgWin + mWin > maxWin) {
            mWin = Math.max(0, maxWin - baseWin - fgWin);
          }
          fgWin += mWin;
          fgSpinCount++;
          if (fgWin + baseWin >= maxWin) break;

          // Coin Toss
          const tossProb = cfg.coinProbs[multIdx] ?? cfg.coinProbs[cfg.coinProbs.length - 1];
          if (this._r() < tossProb) {
            if (multIdx < cfg.fgMults.length - 1) multIdx++;
          } else break;
        }
      }
    }

    // ⑤ 計算 totalWin（無 modeScale）
    const totalRawWin = baseWin + fgWin;
    let totalWin = totalRawWin;

    // Buy FG 最低保底（記錄是否觸發 floor，再套用）
    const hitMinFloor = isBuyFG && totalWin < cfg.special.buyFGMinWin;
    if (hitMinFloor) totalWin = cfg.special.buyFGMinWin;
    if (totalWin > maxWin) totalWin = maxWin;

    return { totalWin, fgTriggered: fgTriggeredDecision, enteredFG: enterFG, fgSpinCount, hitMinFloor };
  }

  // 從指定 rows 開始的 simulateSpin（Phase A 中使用）
  _simulateSpinFromRows(stripName, withSCGuarantee, startRows, maxCascade) {
    const MAX_ROWS = 6;
    let grid = this._gen(stripName);
    if (withSCGuarantee) grid = this._scGuarantee(grid);

    let totalRawWin = 0;
    let rows = startRows;
    let marks = new Set();

    for (let iter = 0; iter < maxCascade; iter++) {
      const { totalWin: w, winCells, winCellList } = this._checkWins(grid, rows);

      if (winCellList.length === 0) {
        let hasSC = false;
        outer: for (let ri=0; ri<5; ri++)
          for (let row=0; row<rows; row++)
            if (grid[ri][row] === 'SC') { hasSC = true; break outer; }
        if (!hasSC || marks.size === 0) break;
        grid = this._applyTB(grid, marks, rows);
        marks.clear();
        continue;
      }

      totalRawWin += w;
      for (const key of winCells) marks.add(key);
      const newRows = Math.min(rows + 1, MAX_ROWS);
      this._refill(grid, winCellList, stripName);
      rows = newRows;
      if (rows >= MAX_ROWS) break; // Phase A: stop once MAX_ROWS reached
    }

    return { totalRawWin, finalRows: rows };
  }
}

// ─── 執行模擬 ─────────────────────────────────────────────────────────────────

function runMode(cfg, modeName, spins, runs, rngFactory) {
  // wagered per spin（normalised to totalBet=1）
  const wagered = modeName === 'buyFG' || modeName === 'ebBuyFG'
                  ? cfg.special.buyCostMult
                  : modeName === 'extraBet' ? cfg.special.extraBetMult
                  : 1;

  let sumRTP = 0;
  let sumHit = 0;
  let maxWin = 0;
  let sumWin = 0;

  // 詳細統計（供 DESIGN_VIEW 使用）
  const bkt = { zero: 0, tiny: 0, small: 0, medium: 0, large: 0, jackpot: 0 };
  let totalFgTrigger = 0, totalFgEnter = 0, totalFgSpins = 0, totalMinFloor = 0;

  for (let run = 0; run < runs; run++) {
    const rng = rngFactory(run);
    const sim = new ThunderSim(cfg, rng);
    let wins = 0;
    let hits = 0;

    for (let i = 0; i < spins; i++) {
      const result = sim.computeSpin(modeName);
      const win = result.totalWin;
      wins += win;
      if (win > 0) hits++;
      if (win > maxWin) maxWin = win;

      // Win brackets（以 totalBet=1 計，未除 wagered）
      if      (win === 0)   bkt.zero++;
      else if (win <= 1)    bkt.tiny++;
      else if (win <= 10)   bkt.small++;
      else if (win <= 100)  bkt.medium++;
      else if (win <= 1000) bkt.large++;
      else                  bkt.jackpot++;

      // FG 統計
      if (result.fgTriggered)  totalFgTrigger++;
      if (result.enteredFG)  { totalFgEnter++; totalFgSpins += result.fgSpinCount; }
      if (result.hitMinFloor)  totalMinFloor++;
    }

    sumRTP  += wins / (spins * wagered);
    sumHit  += hits / spins;
    sumWin  += wins / spins;
  }

  const totalSpins = spins * runs;
  const rtpVal = sumRTP / runs * 100;
  return {
    rtp:     rtpVal.toFixed(2) + '%',
    rtpVal,
    hitRate: (sumHit  / runs * 100).toFixed(2) + '%',
    maxWin:  maxWin.toFixed(2) + '× bet',
    avgWin:  (sumWin  / runs).toFixed(4) + '× bet (before scale/cost)',
    spins:   totalSpins,
    // 詳細統計（供 DESIGN_VIEW）
    brackets: {
      zero:    (bkt.zero    / totalSpins * 100).toFixed(2),
      tiny:    (bkt.tiny    / totalSpins * 100).toFixed(2),
      small:   (bkt.small   / totalSpins * 100).toFixed(2),
      medium:  (bkt.medium  / totalSpins * 100).toFixed(2),
      large:   (bkt.large   / totalSpins * 100).toFixed(2),
      jackpot: (bkt.jackpot / totalSpins * 100).toFixed(2),
    },
    fgTriggerRate:  (totalFgTrigger / totalSpins * 100).toFixed(2),
    fgEnterRate:    (totalFgEnter   / totalSpins * 100).toFixed(2),
    avgFgSpinCount: totalFgEnter > 0 ? (totalFgSpins / totalFgEnter).toFixed(2) : '0',
    minFloorRate:   (totalMinFloor  / totalSpins * 100).toFixed(2),
  };
}

// ─── DESIGN_VIEW Tab ──────────────────────────────────────────────────────────

function buildDesignViewSheet(cfg, results, simSpins, simRuns) {
  const rows = [];
  const P = (row) => rows.push(row);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const totalSpins = simSpins * simRuns;

  P(['DESIGN_VIEW — 企劃視覺化預覽（由 excel_simulator.js 自動寫入，請勿手動修改）']);
  P([`模擬時間：${now}`, `模擬轉數：${totalSpins.toLocaleString()} per mode（${simSpins.toLocaleString()} × ${simRuns} runs）`]);
  P([]);

  const modeOrder  = ['mainGame', 'extraBet', 'buyFG', 'ebBuyFG'];
  const modeLabels = {
    mainGame: '情境1 Main Game',
    extraBet: '情境2 Extra Bet',
    buyFG:    '情境3 Buy FG',
    ebBuyFG:  '情境4 EB+BuyFG',
  };
  const costs      = {
    mainGame: 1,
    extraBet: cfg.special.extraBetMult,
    buyFG:    cfg.special.buyCostMult,
    ebBuyFG:  cfg.special.buyCostMult,
  };
  const TARGET_RTP = 97.5;

  // ── 1. RTP 總覽
  P(['══ 1. RTP 總覽 ═══════════════════════════════════════════════']);
  P(['情境', '費用(×bet)', '模擬RTP', '目標RTP', '差距(pp)', '判定']);
  for (const key of modeOrder) {
    const r   = results[key];
    const gap = (r.rtpVal - TARGET_RTP).toFixed(2);
    const ok  = r.rtpVal >= 96.5 && r.rtpVal <= 98.5;
    P([modeLabels[key], costs[key], r.rtp, TARGET_RTP + '%', gap + 'pp', ok ? '✅ PASS' : '⚠️ FAIL']);
  }
  P([]);

  // ── 2. 獎項分佈（win brackets）
  P(['══ 2. 獎項分佈（% of total spins）══════════════════════════']);
  P(['情境', '零獎(0x)', '≤1x', '1-10x', '10-100x', '100-1000x', '>1000x（巨獎）']);
  for (const key of modeOrder) {
    const b = results[key].brackets;
    P([modeLabels[key],
       b.zero    + '%',
       b.tiny    + '%',
       b.small   + '%',
       b.medium  + '%',
       b.large   + '%',
       b.jackpot + '%']);
  }
  P([]);

  // ── 3. FG 觸發統計
  P(['══ 3. FG 觸發統計 ════════════════════════════════════════════']);
  P(['情境', 'FG觸發率', 'FG進入率（有效）', '平均FG spin數', '近失/Floor觸發率']);
  for (const key of modeOrder) {
    const r       = results[key];
    const isBuyFG = key === 'buyFG' || key === 'ebBuyFG';
    P([
      modeLabels[key],
      isBuyFG ? '100%（保證）'    : r.fgTriggerRate + '%',
      isBuyFG ? '100%（保證）'    : r.fgEnterRate + '%',
      r.avgFgSpinCount,
      isBuyFG ? r.minFloorRate + '%（20×bet floor觸發率）' : 'N/A（零獎型）',
    ]);
  }
  P([]);

  // ── 4. 近失配置確認
  P(['══ 4. 近失配置確認 ══════════════════════════════════════════']);
  P(['情境', '近失類型', '目標零獎率', '實測零獎率', '命中率(win>0)', '判定']);
  const nearMissTargets = {
    mainGame: { type: 'ZERO_WIN', targetRange: [65, 70] },
    extraBet: { type: 'ZERO_WIN', targetRange: [60, 65] },
    buyFG:    { type: 'MIN_WIN',  targetRange: [0,  0]  },
    ebBuyFG:  { type: 'MIN_WIN',  targetRange: [0,  0]  },
  };
  for (const key of modeOrder) {
    const nm       = nearMissTargets[key];
    const r        = results[key];
    const zeroRate = parseFloat(r.brackets.zero);
    let judgeStr;
    if (nm.type === 'ZERO_WIN') {
      const [lo, hi] = nm.targetRange;
      judgeStr = (zeroRate >= lo && zeroRate <= hi + 2) ? '✅' : '⚠️ 偏離目標';
    } else {
      judgeStr = zeroRate === 0 ? '✅' : '⚠️ 有零獎！需調整';
    }
    P([
      modeLabels[key],
      nm.type,
      nm.type === 'ZERO_WIN' ? `${nm.targetRange[0]}-${nm.targetRange[1]}%` : '0%（不允許）',
      r.brackets.zero + '%',
      r.hitRate,
      judgeStr,
    ]);
  }
  P([]);

  // ── 5. 最高獎金分析
  P(['══ 5. 最高獎金分析 ══════════════════════════════════════════']);
  P(['情境', '最高倍數', '巨獎率(>1000x)', '平均每次押注獲得（raw）']);
  for (const key of modeOrder) {
    const r = results[key];
    P([modeLabels[key], r.maxWin, r.brackets.jackpot + '%', r.avgWin]);
  }
  P([]);

  // ── 6. 企劃調整指引
  P(['══ 6. 企劃調整指引 ══════════════════════════════════════════']);
  P(['狀況',                  '調整方式']);
  P(['RTP 偏低',              '↑ Wild/Premium 符號比重（出現率）']);
  P(['RTP 偏高',              '↓ Wild/Premium 符號比重（出現率），↑ L3/L4 比重']);
  P(['零獎率過高（MG/EB）',   '↑ Wild 權重（Wild 替代增加命中）']);
  P(['零獎率過低（MG/EB）',   '↓ Wild 權重']);
  P(['BuyFG 近失率過高',      '↑ BuyFG Wild 權重（使更多 spin 自然超過 floor）']);
  P(['BuyFG 近失率過低',      '↓ BuyFG Wild 權重（使更多 spin 落在 floor 附近）']);
  P(['巨獎率過低',            '↑ Wild 5連命中率；或調整 FG Spin Bonus 分佈']);
  P(['每次調整後：',          'node build_config.js → node excel_simulator.js → 確認 DESIGN_VIEW + SIMULATION 結果']);
  P([]);

  // ── 7. PAYTABLE 命中率與 RTP 貢獻（解析式，各情境獨立）
  P(['══ 7. PAYTABLE 命中率分析（解析式，base spin × 25 條連線）══════════════════']);
  P(['說明：單線命中率×25線×賠率 = base spin RTP 貢獻；cascade/FG/TB 另外加成（見 MODE_MATH tab）']);
  P([]);

  const paytableModes = [
    { key: 'mainGame', label: '情境1 Main Game' },
    { key: 'extraBet', label: '情境2 Extra Bet' },
    { key: 'buyFG',    label: '情境3/4 BuyFG（base spin）' },
  ];
  for (const { key, label } of paytableModes) {
    P([`── ${label} ──`]);
    const ptRows = buildPaytableAnalysis(cfg, key);
    for (const r of ptRows) P(r);
    P([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:24},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:28}];
  return ws;
}

// ─── 主程式 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎰  Thunder Blessing Simulator`);
  console.log(`    ${SIM_SPINS.toLocaleString()} spins × ${SIM_RUNS} runs per mode\n`);

  const cfg = readConfig();
  console.log(`✅  Config loaded from Thunder_Config.xlsx`);
  console.log(`    PAYTABLE_SCALE=${cfg.scales.PAYTABLE_SCALE}`);
  console.log(`    FG_TRIGGER_PROB(EB/全域)=${cfg.special.fgTriggerProb}  MG_FG_TRIGGER_PROB=${cfg.special.mgFgTriggerProb ?? cfg.special.fgTriggerProb}`);
  console.log(`    （FG觸發機率由符號比重×cascade鏈自動推導，非手動設定）\n`);

  const modes = [
    { key: 'mainGame',  label: 'Main Game',  wagered: 1 },
    { key: 'extraBet',  label: 'Extra Bet',  wagered: cfg.special.extraBetMult },
    { key: 'buyFG',     label: 'Buy FG',     wagered: cfg.special.buyCostMult },
    { key: 'ebBuyFG',   label: 'EB + BuyFG', wagered: cfg.special.buyCostMult },
  ];

  const results = {};
  for (const mode of modes) {
    process.stdout.write(`  Running ${mode.label.padEnd(12)}(wagered ${mode.wagered}× bet)...`);
    const t0 = Date.now();
    const r = runMode(cfg, mode.key, SIM_SPINS, SIM_RUNS, (run) => mulberry32(makeSeed(run)));
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    results[mode.key] = { ...r, label: mode.label };
    const pass = r.rtpVal >= 97.0 && r.rtpVal <= 98.0 ? '✅' : '⚠️ ';
    console.log(` ${pass} RTP=${r.rtp}  HitRate=${r.hitRate}  Max=${r.maxWin}  (${elapsed}s)`);
  }

  // 寫回 SIMULATION tab
  const wb = XLSX.readFile(CONFIG_PATH);
  const simRows = [
    ['SIMULATION Tab — 由 excel_simulator.js 自動寫入'],
    [''],
    ['執行方式：', `node tools/slot-engine/excel_simulator.js --spins=${SIM_SPINS} --runs=${SIM_RUNS}`],
    [''],
    ['模式', '模擬轉數', 'RTP', '命中率', '最高倍數', '平均倍數(原始)', '最後更新'],
  ];
  const modeOrder = ['mainGame', 'extraBet', 'buyFG', 'ebBuyFG'];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  for (const key of modeOrder) {
    const r = results[key];
    simRows.push([r.label, r.spins.toLocaleString(), r.rtp, r.hitRate, r.maxWin, r.avgWin, now]);
  }
  simRows.push([]);
  simRows.push(['RTP 目標：各模式 97.5%±1%（接受範圍 96.5%–98.5%）']);
  simRows.push(['通過 → 可執行 engine_generator.js 產生 GameConfig.generated.ts']);

  const simWs = XLSX.utils.aoa_to_sheet(simRows);
  simWs['!cols'] = [{wch:18},{wch:14},{wch:10},{wch:10},{wch:16},{wch:22},{wch:22}];
  wb.Sheets['SIMULATION'] = simWs;
  if (!wb.SheetNames.includes('SIMULATION')) wb.SheetNames.push('SIMULATION');

  // 寫入 DESIGN_VIEW tab（企劃視覺化預覽）
  const designWs = buildDesignViewSheet(cfg, results, SIM_SPINS, SIM_RUNS);
  wb.Sheets['DESIGN_VIEW'] = designWs;
  if (!wb.SheetNames.includes('DESIGN_VIEW')) wb.SheetNames.push('DESIGN_VIEW');

  XLSX.writeFile(wb, CONFIG_PATH);
  console.log(`\n✅  SIMULATION tab 更新完成`);
  console.log(`✅  DESIGN_VIEW tab 更新完成（企劃視覺化預覽）`);

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
  console.log(`✅  sim_result.json → ${OUTPUT_JSON}`);

  console.log('\n── 結果摘要 ──────────────────────────────────────────────────');
  let allPass = true;
  for (const key of modeOrder) {
    const r = results[key];
    const pass = r.rtpVal >= 96.5 && r.rtpVal <= 98.5;
    allPass = allPass && pass;
    console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}  ${r.label.padEnd(14)} RTP=${r.rtp}`);
  }
  console.log('──────────────────────────────────────────────────────────────');
  if (allPass) {
    console.log('  ✅ 所有模式通過 → node tools/slot-engine/engine_generator.js');
  } else {
    console.log('  ⚠️  部分模式 RTP 不達標 → 調整 DATA tab 後重跑');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
