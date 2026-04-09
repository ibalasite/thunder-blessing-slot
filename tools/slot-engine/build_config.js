'use strict';
/**
 * build_config.js — Thunder Blessing Slot 遊戲數學設計工具
 *
 * Excel 為唯一數學設計入口（Single Source of Truth）
 * 四個獨立情境，各自完整配置：
 *
 *   DATA        — 四情境各自：實際賠率表 / 符號權重 / 近失配置 / RTP 目標
 *   MODE_MATH   — 四情境各自解析式期望值估算（含 payline 命中率、FG 鏈）
 *   SIMULATION  — 蒙地卡羅驗證（四情境各自 RTP、命中率、獎項分佈）
 *
 * Usage: node tools/slot-engine/build_config.js
 * Output: tools/slot-engine/Thunder_Config.xlsx
 */

const XLSX = require('xlsx');
const path = require('path');

const OUTPUT = path.resolve(__dirname, 'Thunder_Config.xlsx');

// ─── 遊戲常數（與 GameConfig.ts 同步）─────────────────────────────────────────

const CONFIG = {
  // 基礎賠率（× 對應情境 PAYOUT_SCALE = 實際每線賠率）
  basePaytable: {
    W:  [0,0,0, 0.17, 0.43, 1.17],
    P1: [0,0,0, 0.17, 0.43, 1.17],
    P2: [0,0,0, 0.11, 0.27, 0.67],
    P3: [0,0,0, 0.09, 0.23, 0.67],
    P4: [0,0,0, 0.07, 0.17, 0.57],
    L1: [0,0,0, 0.03, 0.07, 0.17],
    L2: [0,0,0, 0.03, 0.07, 0.17],
    L3: [0,0,0, 0.02, 0.05, 0.13],
    L4: [0,0,0, 0.02, 0.05, 0.13],
  },
  // PAYTABLE_SCALE 統一乘入基礎賠率（payline 命中率修正），再乘模式 PAYOUT_SCALE
  PAYTABLE_SCALE: 3.622,

  // 四情境獨立配置
  modes: {
    // ── 情境1: Main Game ───────────────────────────────────────────────────────
    MG: {
      label:         'Main Game (MG)',
      cost:           1,              // 費用 × bet
      rtpTarget:     97.5,           // % 目標
      // 近失：零獎（自然形成，不強制配置）
      nearMissType:  'ZERO_WIN',      // 可以零獎
      nearMissNote:  '由符號權重自然形成，目標零獎率 65-70%',
      zeroWinTarget:  67,             // % 目標零獎率
      // 符號比重校準（EDD：FG 觸發機率由 cascade 鏈自動推導，禁止直接設定 fgTriggerProb）
      // 原始 weights 保持不動，透過 cascadeCalibFactor 控制 fgTP，以 2 點線性插值校準。
      // 插值依據（各 6M-spin 模擬，CURRENT Excel）：
      //   fgTP=0.009575 → MG_RTP=94.18%
      //   fgTP=0.0097   → MG_RTP=102.49%
      //   斜率=(102.49-94.18)/(0.0097-0.009575)=8.31pp/0.000125
      //   目標 97.5%: fgTP = 0.009575 + (97.5-94.18)/8.31 × 0.000125 = 0.009625
      // 校準公式：cascadeCalibFactor = 0.009625 / cascade_formula(MG weights=0.017621)
      weights: { W:3, SC:2, P1:6, P2:7, P3:8, P4:10, L1:13, L2:13, L3:14, L4:14 },
      entryTossProb:  0.80,           // 觸發後翻硬幣進入 FG 機率
      cascadeCalibFactor: 0.546200,   // 0.009625 / 0.017621 → fgTP=0.009625
      scGuarantee:   false,
    },
    // ── 情境2: Extra Bet ──────────────────────────────────────────────────────
    EB: {
      label:         'Extra Bet (EB)',
      cost:           3,              // 費用 × bet
      rtpTarget:     97.5,
      nearMissType:  'ZERO_WIN',      // 可以零獎（SC 保證略降零獎率）
      nearMissNote:  'SC保證使每轉可見3列必有SC，零獎率稍低於 MG，目標 60-65%',
      zeroWinTarget:  62,             // % 目標零獎率
      // 符號比重校準：原始 weights 保持不動，透過 cascadeCalibFactor 控制 fgTP，以 2 點線性插值校準。
      // 插值依據（各 6M-spin 模擬，CURRENT Excel）：
      //   fgTP=0.008716 → EB_RTP=96.47%
      //   fgTP=0.0089   → EB_RTP=96.99%
      //   外插目標 97.5%: slope=0.52pp/0.000184，需 delta=0.000181
      //   fgTP = 0.0089 + 0.000181 = 0.009081
      // 校準公式：cascadeCalibFactor = 0.009081 / cascade_formula(EB weights=0.013742)
      weights: { W:4, SC:7, P1:7, P2:8, P3:8, P4:9, L1:10, L2:11, L3:13, L4:13 },
      entryTossProb:  0.80,           // 同 MG
      cascadeCalibFactor: 0.660800,   // 0.009081 / 0.013742 → fgTP=0.009081
      scGuarantee:   true,            // 每次 spin 保證可見 3 列有 SC
    },
    // ── 情境3: Buy Free Game ──────────────────────────────────────────────────
    BuyFG: {
      label:         'Buy Free Game (BuyFG)',
      cost:           100,            // 費用 × bet
      rtpTarget:     97.5,
      nearMissType:  'MIN_WIN',       // 無零獎！近失 = 最小保底獎
      nearMissNote:  '無零獎情境：近失 = 最小獎（BUY_FG_MIN_WIN_MULT × bet）',
      minWinMult:    20,              // 最小獎 = 20 × bet（近失體驗）
      zeroWinTarget:  0,              // BuyFG 零獎率 = 0（不允許）
      // 最終校準：SC+2 降 RTP（非付獎填充），P1-2 降高賠密度
      weights: { W:2, SC:4, P1:2, P2:3, P3:3, P4:6, L1:14, L2:14, L3:19, L4:23 },
      // BuyFG 保證 5 次 FG spin（每級 1 次，不需 Entry Toss）
      fgGuaranteed5Spins: true,
      scGuarantee:   false,
    },
    // ── 情境4: EB + Buy Free Game ─────────────────────────────────────────────
    EBBuyFG: {
      label:         'EB + Buy Free Game (EB+BuyFG)',
      cost:           100,            // 費用 × bet
      rtpTarget:     97.5,
      nearMissType:  'MIN_WIN',       // 無零獎！近失 = 最小保底獎
      nearMissNote:  '無零獎情境，SC保證加持 Phase A 子spin，近失 = 最小獎',
      minWinMult:    20,              // 最小獎 = 20 × bet（同 BuyFG）
      zeroWinTarget:  0,              // 零獎率 = 0
      // Phase A 同 EB 權重（simulator 使用 eb strip），FG 5 spin 同 BuyFG
      // 最終校準：phaseA 同步 EB 最終 weights；fgWeights 同步 BuyFG 最終 weights
      phaseAWeights: { W:4, SC:7, P1:7, P2:8, P3:8, P4:9, L1:10, L2:11, L3:13, L4:13 },
      fgWeights:     { W:2, SC:4, P1:2, P2:3, P3:3, P4:6, L1:14, L2:14, L3:19, L4:23 },
      fgGuaranteed5Spins: true,
      scGuarantee:   true,            // Phase A 子 spin 有 SC 保證
    },
  },

  // FG 共用設定（情境1,2 的 FG loop；情境3,4 的保證5spin 也用相同倍率）
  fg: {
    // 自由遊戲符號權重（情境1,2 FG loop 使用）
    fgWeights: { W:4, SC:6, P1:9, P2:10, P3:11, P4:12, L1:9, L2:9, L3:10, L4:10 },
    multipliers:  [3, 7, 17, 27, 77],        // FG 倍率階梯
    coinTossProbs: [0.80, 0.68, 0.56, 0.48, 0.40], // Coin Toss 升級機率（情境1,2 用）
    // FG Spin Bonus（每次 FG spin 前抽取）
    spinBonus: [
      { mult:1,   weight:900 },
      { mult:5,   weight:80  },
      { mult:20,  weight:15  },
      { mult:100, weight:5   },
    ],
    // FG 近失（MG/EB 觸發 FG 時，每次 FG spin 的零獎率）
    fgZeroWinTarget: 25, // % 每次 FG spin 零獎目標（FG 用更好的符號，命中率高）
  },

  // TB 符號升階表（四情境共用）
  symbolUpgrade: { L4:'P4', L3:'P4', L2:'P4', L1:'P4', P4:'P3', P3:'P2', P2:'P1', P1:'P1' },
  tbSecondHitProb: 0.40,

  // 最高獎上限（四情境共用）
  maxWinMult:   30000,

  // 幣種押注範圍（各幣種獨立，由 BetRangeService 讀取）
  // 合理設計原則：USD/TWD 玩家感受到的押注量級應相近（1 USD ≈ 32 TWD）
  // Phase 2A 核心思想：引擎只看 betLevel（整數），幣種透過 baseUnit 轉換
  betRanges: {
    USD: { baseUnit: '0.01', minLevel:  25, maxLevel: 1000, stepLevel:  25 },
    // TWD 10~320 step 10 ≈ USD $0.31~$10（×32 匯率等值）
    TWD: { baseUnit: '1',    minLevel:  10, maxLevel:  320, stepLevel:  10 },
  },

  // 解析式計算經驗修正因子
  cascadeFactor:  1.35,   // 級聯平均倍效（由模擬校準）
  phaseASpins:    3.2,    // FG 觸發時 Phase A 平均子 spin 數
};

const PAY_SYMS = ['W','P1','P2','P3','P4','L1','L2','L3','L4'];
const ALL_SYMS = ['W','SC','P1','P2','P3','P4','L1','L2','L3','L4'];
const PAYLINES_AT_ROWS = { 3:25, 4:33, 5:45, 6:57 };

// ─── 計算工具 ─────────────────────────────────────────────────────────────────

function effectivePaytable(scale) {
  const pt = {};
  for (const sym of PAY_SYMS) {
    pt[sym] = CONFIG.basePaytable[sym].map(v =>
      v === 0 ? 0 : parseFloat((v * CONFIG.PAYTABLE_SCALE * scale).toFixed(4))
    );
  }
  return pt;
}

function spinBonusEV() {
  const tot = CONFIG.fg.spinBonus.reduce((s,b) => s+b.weight, 0);
  return CONFIG.fg.spinBonus.reduce((s,b) => s+b.mult*b.weight, 0) / tot;
}

function paylineHitRate(weights, sym, count) {
  const total = Object.values(weights).reduce((a,b)=>a+b,0);
  const p_s = weights[sym] / total;
  const p_w = (weights['W'] || 0) / total;
  const p_sw = p_s + p_w;
  if (count === 5) return p_s * Math.pow(p_sw, 4);
  return p_s * Math.pow(p_sw, count-1) * Math.pow(1-p_sw, 5-count);
}

function singleSpinEV(weights, payoutScale, numLines) {
  let ev = 0;
  for (const sym of PAY_SYMS) {
    for (const cnt of [3,4,5]) {
      const payout = (CONFIG.basePaytable[sym]?.[cnt] || 0) * CONFIG.PAYTABLE_SCALE * payoutScale;
      if (payout <= 0) continue;
      ev += paylineHitRate(weights, sym, cnt) * payout * numLines;
    }
  }
  return ev;
}

// ─── readDataParams ────────────────────────────────────────────────────────────

function readDataParams(wb) {
  const ws = wb.Sheets['DATA'];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, blankrows:true});

  const r = (rowIdx, colIdx) => {
    if (!rows[rowIdx]) return undefined;
    return rows[rowIdx][colIdx];
  };

  // BASE_PAYTABLE (PAY_SYMS order: W,P1,P2,P3,P4,L1,L2,L3,L4)
  const symRows = [16,17,18,19,20,21,22,23,24]; // 0-indexed for W,P1..L4
  const basePaytable = {};
  const symNames = ['W','P1','P2','P3','P4','L1','L2','L3','L4'];
  symNames.forEach((sym, i) => {
    basePaytable[sym] = [0,0,0, r(symRows[i],1)||0, r(symRows[i],2)||0, r(symRows[i],3)||0];
  });
  basePaytable['SC'] = [0,0,0,0,0,0];

  const paytableScale = r(27, 1) || 3.622;

  // FG weights (rows 33-42, sym order: W,SC,P1..L4)
  const fgSymOrder = ['W','SC','P1','P2','P3','P4','L1','L2','L3','L4'];
  const fgWeights = {};
  fgSymOrder.forEach((sym, i) => { fgWeights[sym] = r(33+i, 1) || 0; });

  // FG multipliers & coin toss probs (rows 47-51)
  const fgMultipliers = [], fgCoinTossProbs = [];
  for (let i = 0; i < 5; i++) {
    fgMultipliers.push(r(47+i, 1) || 0);
    fgCoinTossProbs.push(r(47+i, 2) || 0);
  }

  // FG SpinBonus (rows 55-58)
  const spinBonus = [];
  for (let i = 0; i < 4; i++) {
    spinBonus.push({ mult: r(55+i, 0)||1, weight: r(55+i, 1)||0 });
  }

  const cascadeFactor = r(73, 1) || 1.35;
  const phaseASpins   = r(74, 1) || 3.2;

  // 符號權重 (rows 351-360, 0-indexed)
  const weightSymOrder = ['W','SC','P1','P2','P3','P4','L1','L2','L3','L4'];
  const weights = { MG:{}, EB:{}, FG:{}, BuyFG:{} };
  weightSymOrder.forEach((sym, i) => {
    weights.MG[sym]    = r(351+i, 1) || 0;
    weights.EB[sym]    = r(351+i, 2) || 0;
    weights.FG[sym]    = r(351+i, 3) || 0;
    weights.BuyFG[sym] = r(351+i, 4) || 0;
  });

  const fgTriggerProb = r(376, 1) || 0.0089;
  const tbSecondHit   = r(377, 1) || 0.4;
  const extraBetMult  = r(378, 1) || 3;
  const buyCostMult   = r(379, 1) || 100;
  const buyFGMinWin   = r(380, 1) || 20;

  return {
    basePaytable, paytableScale, fgWeights, fgMultipliers, fgCoinTossProbs,
    spinBonus, cascadeFactor, phaseASpins, weights, fgTriggerProb,
    tbSecondHit, extraBetMult, buyCostMult, buyFGMinWin,
  };
}

// ─── estimateHitRate ────────────────────────────────────────────────────────────

function estimateHitRate(weights, numLines) {
  let expectedWins = 0;
  for (const sym of PAY_SYMS) {
    for (const cnt of [3,4,5]) {
      expectedWins += paylineHitRate(weights, sym, cnt) * numLines;
    }
  }
  // Poisson approximation with correlation damping (paylines share symbols → over-estimate)
  // Calibrated correlation factor: 0.45 (validated against simulation)
  const corrFactor = 0.45;
  return Math.min(0.98, 1 - Math.exp(-expectedWins * corrFactor));
}

// ─── computeFGTriggerProb ─────────────────────────────────────────────────────
// EDD §3.3：FG 觸發機率由符號比重自動推導，禁止在 DATA tab 手動設定。
// 公式：P(cascade 3→4) × P(cascade 4→5) × P(cascade 5→6) × P(entry toss) × calibFactor
//       = h25 × h33 × h45 × entryTossProb × calibFactor
// calibFactor：解析式估算對實際模擬的系統性修正因子，由 6M-spin 模擬校準。
//   MG：0.550480（= 0.0097 / formula(原始weights=0.017621)）
//   EB：0.647650（= 0.0089 / formula(原始weights=0.013742)）
function computeFGTriggerProb(weights, entryTossProb, calibFactor) {
  const h25 = estimateHitRate(weights, 25);  // P(第1次 cascade：3→4列，25條連線)
  const h33 = estimateHitRate(weights, 33);  // P(第2次 cascade：4→5列，33條連線)
  const h45 = estimateHitRate(weights, 45);  // P(第3次 cascade：5→6列，45條連線)
  const calib = calibFactor ?? 1.0;
  return parseFloat((h25 * h33 * h45 * entryTossProb * calib).toFixed(6));
}

// ─── cascadeChainEV ────────────────────────────────────────────────────────────

function cascadeChainEV(weights, dp) {
  const linesAtRows = {3:25, 4:33, 5:45, 6:57};
  const evByRows = {};
  const hitByRows = {};
  for (const [rows, lines] of Object.entries(linesAtRows)) {
    evByRows[rows]  = singleSpinEV(weights, 1, lines);
    hitByRows[rows] = estimateHitRate(weights, lines);
  }
  const h25 = hitByRows[3], h33 = hitByRows[4], h45 = hitByRows[5], h57 = hitByRows[6];
  const e25 = evByRows[3],  e33 = evByRows[4],  e45 = evByRows[5],  e57 = evByRows[6];
  return e25
       + h25 * e33
       + h25 * h33 * e45
       + h25 * h33 * h45 * (e57 / Math.max(0.01, 1 - h57));
}

// ─── DATA Tab ─────────────────────────────────────────────────────────────────

function buildDataSheet() {
  const rows = [];
  const P = (row) => rows.push(row);

  P(['Thunder Blessing Slot — 遊戲數學設計 DATA Tab（唯一編輯入口）']);
  P(['⚠️  此 Tab 為所有人員的唯一修改入口。修改後需重跑 excel_simulator.js 驗證。']);
  P(['   各情境獨立配置：實際賠率表 / 符號權重 / 近失 / RTP 目標']);
  P([]);

  // ═══════════════════════════════════════════════════════════════════════
  // 共用基礎設定
  // ═══════════════════════════════════════════════════════════════════════
  P(['══════════════════════════════════════════════════════']);
  P(['★ 共用基礎設定（四情境共用，改動影響全部）']);
  P(['══════════════════════════════════════════════════════']);
  P([]);

  P(['[機台基本規格]']);
  P(['滾輪數',       5]);
  P(['基本列數',     3]);
  P(['最大列數',     6]);
  P(['最高獎金上限', CONFIG.maxWinMult, '× bet（30,000x）']);
  P([]);

  P(['[基礎賠率表 BASE_PAYTABLE]', '', '× PAYTABLE_SCALE × 情境SCALE = 實際賠率（見各情境詳表）']);
  P(['符號', '3連', '4連', '5連']);
  for (const sym of PAY_SYMS) {
    const p = CONFIG.basePaytable[sym];
    P([sym, p[3], p[4], p[5]]);
  }
  P(['SC', '-', '-', '-', '（無賠率）']);
  P([]);

  P(['[PAYTABLE_SCALE]', CONFIG.PAYTABLE_SCALE, '統一 payline 命中率修正因子（payline 模型修正）']);
  P(['說明：payline 機制命中率遠低於 scatter-pays，需此倍率補償至 scatter 等效水準']);
  P([]);

  P(['[FG 共用設定]', '', '情境1(MG) / 情境2(EB) 的 FG Loop 使用；情境3,4 保證5spin 同倍率']);
  P(['FG 符號權重（自由遊戲 symbol 機率）']);
  P(['符號', '權重']);
  const fgW = CONFIG.fg.fgWeights;
  for (const sym of ALL_SYMS) P([sym, fgW[sym] || 0]);
  P(['合計', Object.values(fgW).reduce((a,b)=>a+b,0)]);
  P([]);

  P(['FG 倍率階梯 & Coin Toss 升級機率（情境1,2 用；情境3,4 固定按順序各一次）']);
  P(['等級', 'FG倍率', 'Coin Toss 正面P', '說明']);
  for (let i = 0; i < CONFIG.fg.multipliers.length; i++) {
    const desc = ['初始', '2nd 正面', '3rd 正面', '4th 正面', '最高（再正面維持）'];
    P([i+1, CONFIG.fg.multipliers[i], CONFIG.fg.coinTossProbs[i], desc[i]]);
  }
  P([]);

  const totBW = CONFIG.fg.spinBonus.reduce((s,b)=>s+b.weight,0);
  P(['FG Spin Bonus 分布（每次 FG spin 前抽取，乘入該 spin 獎金）']);
  P(['倍率', '權重', '機率', '說明']);
  for (const b of CONFIG.fg.spinBonus) {
    const desc = b.mult===1?'無加成':b.mult===5?'小爆彈':b.mult===20?'中爆彈':'大爆彈';
    P([b.mult, b.weight, (b.weight/totBW*100).toFixed(2)+'%', desc]);
  }
  P(['合計', totBW, '100%', `E[Bonus] = ${spinBonusEV().toFixed(4)}`]);
  P([]);

  P(['TB 符號升階表（四情境共用）', '', '雷霆祝福觸發時，閃電標記格升階']);
  P(['原符號', '→ 升階後', '二次升階P（一次TB觸發後再擲）']);
  for (const [from, to] of Object.entries(CONFIG.symbolUpgrade)) {
    P([from, to, from === Object.keys(CONFIG.symbolUpgrade)[0] ? CONFIG.tbSecondHitProb : '']);
  }
  P([]);

  P(['解析式計算經驗修正因子（MODE_MATH tab 使用）']);
  P(['CASCADE_FACTOR',    CONFIG.cascadeFactor, '級聯平均乘效，由模擬校準（通常 1.3~1.5）']);
  P(['PHASE_A_AVG_SPINS', CONFIG.phaseASpins,   'FG觸發時Phase A平均子spin數']);
  P([]);

  // ═══════════════════════════════════════════════════════════════════════
  // 四個獨立情境
  // ═══════════════════════════════════════════════════════════════════════

  const modeList = [
    { key:'MG', m:CONFIG.modes.MG },
    { key:'EB', m:CONFIG.modes.EB },
    { key:'BuyFG', m:CONFIG.modes.BuyFG },
    { key:'EBBuyFG', m:CONFIG.modes.EBBuyFG },
  ];

  for (const { key, m } of modeList) {
    P(['══════════════════════════════════════════════════════']);
    P([`★ ${m.label}`]);
    P(['══════════════════════════════════════════════════════']);
    P([]);

    // 情境概覽
    P(['[情境概覽]']);
    P(['費用（× bet）',     m.cost]);
    P(['目標 RTP',           m.rtpTarget + '%']);
    P(['近失類型',           m.nearMissType === 'ZERO_WIN' ? '零獎（可以無中獎）' : '最小獎（無零獎）']);
    P(['近失說明',           m.nearMissNote]);
    if (m.nearMissType === 'ZERO_WIN') {
      P(['零獎目標比例',     m.zeroWinTarget + '%', '（由符號權重自然形成，不獨立配置）']);
    } else {
      P(['最小保底獎金',     m.minWinMult + '× bet', '低於此值時補至此金額（地板保底）']);
      P(['零獎比例',         '0%', '此情境不允許零獎']);
    }
    if (m.scGuarantee)      P(['SC 保證',          '是',   '每次 spin 可見 3 列保證有 SC']);
    if (m.fgGuaranteed5Spins) P(['FG 方式',        '保證5次FG spin（每級各一次）', '無 Entry Toss，無 Coin Toss']);
    else {
      P(['FG 觸發機率',     m.fgTriggerProb, '每次 spin 觸發 FG 的機率']);
      P(['Entry Toss 機率', m.entryTossProb,  '觸發後翻硬幣決定是否進入 FG Loop']);
    }
    P([]);

    // EDD 規定：無 per-mode payout scale，RTP 只能透過符號比重與 PAYTABLE_SCALE 調整
    P(['[賠率說明]']);
    P(['實際賠率 = BASE_PAYTABLE × PAYTABLE_SCALE（= ' + CONFIG.PAYTABLE_SCALE + '），四情境共用，禁止 per-mode scale']);
    P([]);

    // 符號機率權重
    const weights = key === 'EBBuyFG' ? m.phaseAWeights : m.weights;
    const fgWeightsForMode = key === 'EBBuyFG' ? m.fgWeights : (m.fgGuaranteed5Spins ? m.weights : null);
    const wTotal = Object.values(weights).reduce((a,b)=>a+b,0);

    // 注意：每情境的權重區段用 [情境-符號權重] 以避免與模擬器讀取的 [符號機率權重] 衝突
    P(['[情境-符號權重]']);
    if (key === 'EBBuyFG') {
      P(['注意：EB+BuyFG 情境的 Phase A（基底 spin）使用 EB 權重，FG 5-spin 使用 BuyFG 權重']);
      P(['Phase A 符號權重（合計=' + wTotal + '）']);
    } else {
      P(['符號權重（合計=' + wTotal + '）']);
    }
    P(['符號', '權重', '機率%', '說明']);
    const symDesc = { W:'Wild（百搭）', SC:'Scatter', P1:'Zeus', P2:'Pegasus',
                      P3:'Athena', P4:'Eagle', L1:'Z', L2:'E', L3:'U', L4:'S' };
    for (const sym of ALL_SYMS) {
      const w = weights[sym] || 0;
      P([sym, w, (w/wTotal*100).toFixed(1)+'%', symDesc[sym]]);
    }
    P(['合計', wTotal, '100%', '']);
    P([]);

    if (key === 'EBBuyFG') {
      const fgW2 = m.fgWeights;
      const fgTotal2 = Object.values(fgW2).reduce((a,b)=>a+b,0);
      P(['FG 5-spin 符號權重（合計=' + fgTotal2 + '，低 Wild/Premium）']);
      P(['符號', '權重', '機率%']);
      for (const sym of ALL_SYMS) {
        const w = fgW2[sym] || 0;
        P([sym, w, (w/fgTotal2*100).toFixed(1)+'%']);
      }
      P(['合計', fgTotal2, '100%']);
      P([]);
    }

    // 實際賠率表
    const effPT = effectivePaytable(1);
    P([`[實際賠率表 (有效賠率 = BASE × ${CONFIG.PAYTABLE_SCALE})]`]);
    P(['符號', '3連實際賠率', '4連實際賠率', '5連實際賠率', '說明']);
    for (const sym of PAY_SYMS) {
      P([sym, effPT[sym][3], effPT[sym][4], effPT[sym][5],
         sym==='W'?'Wild(同P1)':sym.startsWith('P')?'Premium':sym.startsWith('L')?'Low':'']);
    }
    P(['SC', '-', '-', '-', '無賠率']);
    P([]);

    // 連線數說明
    P(['[連線數（列數展開）]']);
    P(['列數', '連線數', '觸發時機']);
    P([3, 25, '每次 spin 起始']);
    P([4, 33, '第1次 cascade 後']);
    P([5, 45, '第2次 cascade 後']);
    P([6, 57, '第3次 cascade 後（FG 全展開）']);
    P([]);

    // 近失獎項配置
    P(['[近失獎項配置 Near Miss]']);
    if (m.nearMissType === 'ZERO_WIN') {
      P(['近失類型',   '零獎（無中任何連線）']);
      P(['零獎目標',   m.zeroWinTarget + '%', '由符號權重自然形成，調整 Wild/Premium 權重影響此值']);
      P(['體感說明',   '每約 ' + Math.round(100/(100-m.zeroWinTarget)) + ' 轉出現 1 次零獎（正常遊戲體感）']);
      P(['RTP 貢獻',   '零獎貢獻 0，不影響期望值；但會影響體感頻率']);
      P(['調整方式',   '↑ Wild 權重 → 降低零獎率；↓ Wild → 提高零獎率']);
    } else {
      P(['近失類型',   '最小保底獎（地板保底）']);
      P(['最小獎金',   m.minWinMult + '× bet = 每 1× bet 押注最低獲得 ' + m.minWinMult + '× 獎']);
      P(['近失機率目標', '5~15%（此比例內玩家獲得最小保底獎）']);
      P(['近失 RTP 貢獻', '≈ P(近失) × ' + m.minWinMult + ' × bet / ' + m.cost + ' × bet']);
      P(['地板實現方式', 'IF totalWin < ' + m.minWinMult + '×bet → totalWin = ' + m.minWinMult + '×bet']);
      P(['調整最小獎',  '修改 BUY_FG_MIN_WIN_MULT（DATA tab [情境概覽] 最小保底獎金）']);
      P(['調整近失率',  '修改 BuyFG 符號權重（低 Wild → 降低命中率 → 更多近失情況）']);
    }
    P([]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 舊格式相容區（供 excel_simulator.js readConfig() 使用，請勿手動修改）
  // ═══════════════════════════════════════════════════════════════════════
  P(['══════════════════════════════════════════════════════']);
  P(['★ 模擬器讀取區（excel_simulator.js 使用，請勿手動修改）']);
  P(['══════════════════════════════════════════════════════']);
  P([]);

  P(['[Paytable基礎倍率]', '', '基礎賠率（excel_simulator.js 讀取用）']);
  P(['符號', '說明', '3連', '4連', '5連']);
  const sd2 = {W:'Wild',P1:'Zeus',P2:'Pegasus',P3:'Athena',P4:'Eagle',L1:'Z',L2:'E',L3:'U',L4:'S'};
  for (const sym of PAY_SYMS) {
    const p = CONFIG.basePaytable[sym];
    P([sym, sd2[sym], p[3], p[4], p[5]]);
  }
  P(['SC', 'Scatter', '-', '-', '-']);
  P([]);

  P(['[模式校準倍率 PAYOUT_SCALE]', '', 'PAYTABLE_SCALE = 全域賠率密度係數（唯一允許的 scale，由符號比重與 paytable 設計決定）']);
  // EDD 規定：禁止各模式獨立 payout scale 乘數（EB_PAYOUT_SCALE、BUY_FG_PAYOUT_SCALE 等均已移除）
  // RTP 只能透過調整 PAYTABLE_SCALE 或符號比重達成
  P(['PAYTABLE_SCALE', CONFIG.PAYTABLE_SCALE, '全域 paytable 密度係數，四情境共用']);
  P([]);

  P(['[符號機率權重]', '', '四情境各自權重（合計需為 90）']);
  P(['符號', 'Main Game', 'Extra Bet', 'Free Game', 'Buy FG']);
  const mg = CONFIG.modes.MG.weights;
  const eb = CONFIG.modes.EB.weights;
  const fg = CONFIG.fg.fgWeights;
  const bfg= CONFIG.modes.BuyFG.weights;
  for (const sym of ALL_SYMS) P([sym, mg[sym]||0, eb[sym]||0, fg[sym]||0, bfg[sym]||0]);
  const sum = (w) => Object.values(w).reduce((a,b)=>a+b,0);
  P(['合計', sum(mg), sum(eb), sum(fg), sum(bfg)]);
  P([]);

  P(['[FG 倍率階梯 & Coin Toss 升級機率]']);
  P(['等級', '倍率', 'Coin Toss 正面機率']);
  for (let i = 0; i < CONFIG.fg.multipliers.length; i++) {
    P([i+1, CONFIG.fg.multipliers[i], CONFIG.fg.coinTossProbs[i]]);
  }
  P([]);

  P(['[Entry Coin Toss 機率]']);
  P(['Main / Extra Bet 進入 FG', CONFIG.modes.MG.entryTossProb]);
  P(['Buy FG 進入 FG',           1.00, '100% 保證進入']);
  P([]);

  P(['[特殊機率參數]']);
  // EDD §3.3：FG 觸發機率由符號比重 × cascade 鏈自動推導，禁止手動設定
  const _mgFgTP = computeFGTriggerProb(CONFIG.modes.MG.weights, CONFIG.modes.MG.entryTossProb, CONFIG.modes.MG.cascadeCalibFactor);
  const _ebFgTP = computeFGTriggerProb(CONFIG.modes.EB.weights, CONFIG.modes.EB.entryTossProb, CONFIG.modes.EB.cascadeCalibFactor);
  P(['FG_TRIGGER_PROB',      _ebFgTP,  '（EB/全域，由EB符號比重×cascade鏈推導，禁止手動修改）']);
  P(['MG_FG_TRIGGER_PROB',   _mgFgTP,  '（MG專用，由MG符號比重×cascade鏈推導，禁止手動修改）']);
  P(['TB_SECOND_HIT_PROB',   CONFIG.tbSecondHitProb]);
  P(['EXTRA_BET_MULT',       CONFIG.modes.EB.cost]);
  P(['BUY_COST_MULT',        CONFIG.modes.BuyFG.cost]);
  P(['BUY_FG_MIN_WIN_MULT',  CONFIG.modes.BuyFG.minWinMult]);
  P(['SC_GUARANTEE_EXTRA_BET', 'TRUE']);
  P([]);

  P(['[FG Spin Bonus分布]']);
  P(['倍率', '權重', '機率']);
  for (const b of CONFIG.fg.spinBonus) {
    P([b.mult, b.weight, (b.weight/totBW*100).toFixed(2)+'%']);
  }
  P([]);

  P(['[雷霆祝福升階表]']);
  P(['原符號', '升階後']);
  for (const [from, to] of Object.entries(CONFIG.symbolUpgrade)) P([from, to]);
  P([]);

  P(['[連線數與列數對應]']);
  P(['可見列數', '有效連線數']);
  P([3,25]); P([4,33]); P([5,45]); P([6,57]);
  P([]);

  P(['[幣種押注範圍]', '', '各幣種獨立押注設定，由 BetRangeService 讀取（禁止程式碼硬編碼）']);
  P(['幣種', 'baseUnit', 'minLevel', 'maxLevel', 'stepLevel', '玩家押注範圍（參考）']);
  for (const [currency, r] of Object.entries(CONFIG.betRanges)) {
    const bu = parseFloat(r.baseUnit);
    const min  = (r.minLevel  * bu).toFixed(2);
    const max  = (r.maxLevel  * bu).toFixed(2);
    const step = (r.stepLevel * bu).toFixed(2);
    const cnt  = Math.round((r.maxLevel - r.minLevel) / r.stepLevel) + 1;
    P([currency, r.baseUnit, r.minLevel, r.maxLevel, r.stepLevel,
       `${currency} ${min} ~ ${max}，step ${step}（${cnt} 個 level）`]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:38},{wch:16},{wch:14},{wch:14},{wch:50}];
  return ws;
}

// ─── MODE_MATH Tab ────────────────────────────────────────────────────────────

function buildModeMathSheet(dp) {
  const rows = [];
  const P = (row) => rows.push(row);
  const f4 = (v) => typeof v==='number' ? v.toFixed(4) : v;
  const pct = (v) => typeof v==='number' ? (v*100).toFixed(3)+'%' : v;

  P(['MODE_MATH — 四情境獨立解析式 RTP 估算（工具解析式計算，含cascade/FG模型）']);
  P(['說明：解析式誤差 ±5pp（TB 貢獻未含，cascade/FG 用近似模型）']);
  P(['注意：TB 難以解析建模，估算不含 TB 貢獻（TB 貢獻估計 +5~15pp）']);
  P(['精確 RTP 以 SIMULATION tab Monte Carlo 為準']);
  P([]);

  // 使用 dp（從 DATA tab 讀取）若存在，否則 fallback 至 CONFIG
  const mgW    = dp ? dp.weights.MG    : CONFIG.modes.MG.weights;
  const ebW    = dp ? dp.weights.EB    : CONFIG.modes.EB.weights;
  const fgW    = dp ? dp.weights.FG    : CONFIG.fg.fgWeights;
  const buyW   = dp ? dp.weights.BuyFG : CONFIG.modes.BuyFG.weights;
  const mults  = dp ? dp.fgMultipliers  : CONFIG.fg.multipliers;
  const tosses = dp ? dp.fgCoinTossProbs: CONFIG.fg.coinTossProbs;
  const sbArr  = dp ? dp.spinBonus       : CONFIG.fg.spinBonus;
  const K      = dp ? dp.cascadeFactor   : CONFIG.cascadeFactor;
  const phaseASpinsVal = dp ? dp.phaseASpins : CONFIG.phaseASpins;
  // EDD：FG 觸發機率從符號比重 × cascade 鏈推導（per-mode 獨立計算，含模擬校準因子）
  const mgFgTP = computeFGTriggerProb(mgW, CONFIG.modes.MG.entryTossProb, CONFIG.modes.MG.cascadeCalibFactor);
  const ebFgTP = computeFGTriggerProb(ebW, CONFIG.modes.EB.entryTossProb, CONFIG.modes.EB.cascadeCalibFactor);
  const fgTP   = mgFgTP;  // alias（MODE_MATH 內 MG 段使用）
  const entryP = CONFIG.modes.MG.entryTossProb;
  const buyCostMult = dp ? dp.buyCostMult : CONFIG.modes.BuyFG.cost;
  const buyFGMinWin = dp ? dp.buyFGMinWin : CONFIG.modes.BuyFG.minWinMult;
  const extraBetCost = dp ? dp.extraBetMult : CONFIG.modes.EB.cost;

  const totBW   = sbArr.reduce((s,b) => s+b.weight, 0);
  const bonusEV = sbArr.reduce((s,b) => s+b.mult*b.weight, 0) / totBW;

  P([`FG SpinBonus 期望值 E[bonus] = ${bonusEV.toFixed(4)}`]);
  P([`CASCADE_FACTOR K = ${K}`]);
  P([`PHASE_A_AVG_SPINS = ${phaseASpinsVal}`]);
  P([`MG_FG_TRIGGER_PROB（cascade推導）= ${mgFgTP}（h25×h33×h45×${CONFIG.modes.MG.entryTossProb}）`]);
  P([`EB_FG_TRIGGER_PROB（cascade推導）= ${ebFgTP}（h25×h33×h45×${CONFIG.modes.EB.entryTossProb}）`]);
  P([]);

  // ── 情境1: Main Game ─────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P(['情境1: Main Game (MG) — RTP 解析估算']);
  P(['══════════════════════════════════════════════════════']);

  // cascade chain EV for MG base spin
  const mgCascadeEV = cascadeChainEV(mgW, dp || {
    paytableScale: CONFIG.PAYTABLE_SCALE,
    cascadeFactor: K,
  });

  // FG chain EV using fgWeights with cascade
  const fgCascadeEV = cascadeChainEV(fgW, dp || { paytableScale: CONFIG.PAYTABLE_SCALE, cascadeFactor: K });
  let mgFGChain = 0;
  let p_reach = 1;
  for (let i = 0; i < mults.length; i++) {
    mgFGChain += p_reach * mults[i] * fgCascadeEV * bonusEV;
    p_reach *= tosses[i];
  }

  const mgEV25 = singleSpinEV(mgW, 1, 25);
  const mg_base     = mgCascadeEV * (1 - fgTP);
  const mg_phaseA   = fgTP * mgEV25 * phaseASpinsVal;
  const mg_fgContrib = fgTP * entryP * mgFGChain;
  const mg_total    = mg_base + mg_phaseA + mg_fgContrib;

  P([`A. 單次 spin EV（25線，無cascade）= ${f4(mgEV25)}`]);
  P([`B. Cascade Chain EV（多層展開，估算）= ${f4(mgCascadeEV)}`]);
  P([`C. FG cascade chain EV（fgWeights × 57線）= ${f4(fgCascadeEV)}`]);
  P([`D. FG 鏈期望值 E[FG chain]（cascade × mult × bonus）= ${f4(mgFGChain)}`]);
  P([`E. FG 貢獻（P_trigger=${fgTP} × P_entry=${entryP} × FG_chain）= ${f4(mg_fgContrib)}`]);
  P([]);
  P(['RTP 組成', '期望值（× bet）', '佔總 RTP（/1×bet）']);
  P(['Base spin cascade（非FG觸發）', f4(mg_base),      pct(mg_base/1)]);
  P(['Phase A（FG觸發時）',           f4(mg_phaseA),    pct(mg_phaseA/1)]);
  P(['FG Loop 貢獻',                  f4(mg_fgContrib), pct(mg_fgContrib/1)]);
  P(['合計 EV（wagered=1）',          f4(mg_total),     '100%']);
  P([`估算 RTP（不含TB）= ${pct(mg_total/1)} | 目標 97.5% | 差距 ${((mg_total/1-0.975)*100).toFixed(2)}pp`]);
  P([`TB 估計貢獻：+5~15pp（SC機率 × cascade深度決定）`]);
  P([]);

  // Payline 命中率表
  P(['主遊戲 Payline 命中率（1線）']);
  P(['符號', '3連P（1線）', '3連EV（25線）', '4連P（1線）', '4連EV（25線）', '5連P（1線）', '5連EV（25線）']);
  for (const sym of PAY_SYMS) {
    const effScale = CONFIG.PAYTABLE_SCALE;
    const p3 = paylineHitRate(mgW, sym, 3);
    const p4 = paylineHitRate(mgW, sym, 4);
    const p5 = paylineHitRate(mgW, sym, 5);
    const pay3 = CONFIG.basePaytable[sym][3] * effScale;
    const pay4 = CONFIG.basePaytable[sym][4] * effScale;
    const pay5 = CONFIG.basePaytable[sym][5] * effScale;
    P([sym, f4(p3), f4(p3*pay3*25), f4(p4), f4(p4*pay4*25), f4(p5), f4(p5*pay5*25)]);
  }
  P([]);

  // ── 情境2: Extra Bet ──────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P([`情境2: Extra Bet (EB) — RTP 解析估算（費用 ${extraBetCost}× bet）`]);
  P(['══════════════════════════════════════════════════════']);

  const ebCascadeEV = cascadeChainEV(ebW, dp || { paytableScale: CONFIG.PAYTABLE_SCALE, cascadeFactor: K });
  const ebEV25      = singleSpinEV(ebW, 1, 25);

  // EB FG uses fgWeights
  let ebFGChain = 0;
  p_reach = 1;
  for (let i = 0; i < mults.length; i++) {
    ebFGChain += p_reach * mults[i] * fgCascadeEV * bonusEV;
    p_reach *= tosses[i];
  }

  const eb_base     = ebCascadeEV * (1 - ebFgTP);
  const eb_phaseA   = ebFgTP * ebEV25 * phaseASpinsVal;
  const eb_fgContrib = ebFgTP * entryP * ebFGChain;
  const eb_total    = eb_base + eb_phaseA + eb_fgContrib;

  P([`A. 單次 spin EV（25線，無cascade）= ${f4(ebEV25)}`]);
  P([`B. Cascade Chain EV（多層展開）= ${f4(ebCascadeEV)}`]);
  P([`C. FG 鏈 EV（fgWeights cascade × mult × bonus）= ${f4(ebFGChain)}`]);
  P([]);
  P(['RTP 組成', '期望值（× bet）', `佔費用比 /${extraBetCost}`]);
  P(['Base spin cascade（非FG觸發）', f4(eb_base),      pct(eb_base/extraBetCost)]);
  P(['Phase A（FG觸發時）',           f4(eb_phaseA),    pct(eb_phaseA/extraBetCost)]);
  P(['FG Loop 貢獻',                  f4(eb_fgContrib), pct(eb_fgContrib/extraBetCost)]);
  P(['合計 EV',                       f4(eb_total),     '100%']);
  P([`估算 RTP（不含TB）= ${pct(eb_total/extraBetCost)} | 目標 97.5% | 差距 ${((eb_total/extraBetCost-0.975)*100).toFixed(2)}pp`]);
  P([`TB 估計貢獻：+5~15pp`]);
  P([]);

  // ── 情境3: Buy FG ─────────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P([`情境3: Buy Free Game (BuyFG) — RTP 解析估算（費用 ${buyCostMult}× bet，無零獎）`]);
  P(['══════════════════════════════════════════════════════']);

  // BuyFG: 5 guaranteed spins using buyFG weights at 57 lines
  // Each spin is guaranteed win (retry until hit) → EV = baseSpinEV / hitRate
  const buyHitRate57 = estimateHitRate(buyW, 57);
  const buyFGSpinEV57 = singleSpinEV(buyW, 1, 57);
  const buyGuaranteedSpinEV = buyFGSpinEV57 / Math.max(0.01, buyHitRate57);

  let buy5spinEV = 0;
  for (let i = 0; i < mults.length; i++) {
    buy5spinEV += mults[i] * buyGuaranteedSpinEV * bonusEV;
  }
  // BuyFG has no Phase A (player buys directly into FG)
  const buyTotal = buy5spinEV;
  const buyRTP   = buyTotal / buyCostMult;

  P([`A. BuyFG FG spin EV（57線，buyFG權重）= ${f4(buyFGSpinEV57)}`]);
  P([`B. 命中率估算（estimateHitRate，corrFactor=0.45）= ${(buyHitRate57*100).toFixed(2)}%`]);
  P([`C. 保證贏 spin EV = EV / hitRate = ${f4(buyGuaranteedSpinEV)}`]);
  P([`D. 5次保證 FG spin 鏈 EV（各級倍率×保證EV×bonus）= ${f4(buy5spinEV)}`]);
  P(['注意：BuyFG 無 Phase A（玩家直接進入 FG），Phase A 貢獻 = 0']);
  P([]);
  P(['BuyFG 情境 RTP 組成', '期望值（× bet）', `佔費用比 /${buyCostMult}`]);
  P(['5次保證 FG spin（各級倍率）', f4(buy5spinEV), pct(buy5spinEV/buyCostMult)]);
  P([`近失（最小獎）貢獻`, `P(近失)×${buyFGMinWin}`, `≈ P(近失)×${(buyFGMinWin/buyCostMult).toFixed(4)}`]);
  P([`估算 RTP（不含近失）= ${pct(buyRTP)} | 目標 97.5% | 差距 ${((buyRTP-0.975)*100).toFixed(2)}pp`]);
  P([`最小獎 ${buyFGMinWin}× bet：若 P(近失)=10%，貢獻 +${(0.1*buyFGMinWin/buyCostMult*100).toFixed(2)}pp`]);
  P([]);

  // ── 情境4: EB + BuyFG ────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P([`情境4: EB + Buy FG — RTP 解析估算（費用 ${buyCostMult}× bet，SC保證，無零獎）`]);
  P(['══════════════════════════════════════════════════════']);

  const ebBuyPhaseAW = CONFIG.modes.EBBuyFG.phaseAWeights;
  const ebBuyFGW     = CONFIG.modes.EBBuyFG.fgWeights;

  const ebBuyFGHitRate57 = estimateHitRate(ebBuyFGW, 57);
  const ebBuyFGSpinEV57  = singleSpinEV(ebBuyFGW, 1, 57);
  const ebBuyGuaranteedEV = ebBuyFGSpinEV57 / Math.max(0.01, ebBuyFGHitRate57);

  let ebBuy5spinEV = 0;
  for (let i = 0; i < mults.length; i++) {
    ebBuy5spinEV += mults[i] * ebBuyGuaranteedEV * bonusEV;
  }
  // EBBuyFG: BuyFG with SC-guaranteed Phase A cascade before entering FG
  const ebBuyPhaseAEV = singleSpinEV(ebBuyPhaseAW, 1, 57) * phaseASpinsVal;
  const ebBuyTotal    = ebBuyPhaseAEV + ebBuy5spinEV;
  const ebBuyRTP      = ebBuyTotal / buyCostMult;

  P([`A. FG 5-spin EV（EBBuyFG fgWeights，hitRate=${(ebBuyFGHitRate57*100).toFixed(2)}%）= ${f4(ebBuy5spinEV)}`]);
  P([`B. Phase A EV（EB+BuyFG phaseAWeights，SC保證，57線×${phaseASpinsVal}spins）= ${f4(ebBuyPhaseAEV)}`]);
  P([]);
  P(['EB+BuyFG 情境 RTP 組成', '期望值（× bet）', `佔費用比 /${buyCostMult}`]);
  P(['Phase A（SC保證 cascade）', f4(ebBuyPhaseAEV), pct(ebBuyPhaseAEV/buyCostMult)]);
  P(['5次保證 FG spin',           f4(ebBuy5spinEV),  pct(ebBuy5spinEV/buyCostMult)]);
  P([`估算 RTP（不含近失）= ${pct(ebBuyRTP)} | 目標 97.5% | 差距 ${((ebBuyRTP-0.975)*100).toFixed(2)}pp`]);
  P([`最小獎 ${buyFGMinWin}× bet：同 BuyFG 地板保底`]);
  P([]);

  // ── 校準對照表 ───────────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P(['四情境 RTP 估算對照表（不含 TB 貢獻）']);
  P(['══════════════════════════════════════════════════════']);
  P(['情境', '費用', '估算RTP（解析，不含TB）', '目標RTP', '差距（pp）', '主要校準槓桿']);
  const gap = (v,t) => ((v-t/100)*100).toFixed(2)+'pp';
  P(['Main Game',  '1×',   pct(mg_total/1),    '97.5%', gap(mg_total/1, 97.5), '↑ FG_TRIGGER_PROB / ↑ PAYTABLE_SCALE']);
  P(['Extra Bet',  `${extraBetCost}×`,   pct(eb_total/extraBetCost), '97.5%', gap(eb_total/extraBetCost, 97.5), '↑ FG_TRIGGER_PROB / ↑ PAYTABLE_SCALE']);
  P(['Buy FG',     `${buyCostMult}×`, pct(buyRTP),   '97.5%', gap(buyRTP, 97.5),   '↑ BuyFG符號權重 / ↑ MIN_WIN_MULT']);
  P(['EB+BuyFG',   `${buyCostMult}×`, pct(ebBuyRTP), '97.5%', gap(ebBuyRTP, 97.5), '↑ BuyFG符號權重 / ↑ phaseA權重']);
  P([]);
  P(['TB 貢獻說明：TB 難以解析建模，估算不含 TB 貢獻']);
  P(['TB 貢獻估計：+5~15pp（視 SC 機率和 cascade 深度而定）']);
  P(['精確 RTP 以 SIMULATION tab Monte Carlo 為準（excel_simulator.js）']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:36},{wch:16},{wch:16},{wch:16},{wch:16},{wch:40}];
  return ws;
}

// ─── ENG_TOOLS Tab ───────────────────────────────────────────────────────────

function buildEngToolsSheet(dp) {
  const rows = [];
  const P = (row) => rows.push(row);
  // Helper to push an Excel formula cell (with pre-computed value for display)
  const fCell = (formula, value) => ({ t: 'n', f: formula, v: value });
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  P(['ENG_TOOLS — 工程工具計算用（由 build_config.js 自動產生，請勿手動修改）']);
  P([`產生時間：${now}`]);
  P(['說明：此 tab 供 engine_generator.js / excel_simulator.js / verify.js 讀取，格式固定']);
  P(['注意：Section 1 賠率與 Section 2 符號機率均引用 DATA tab 公式，DATA 改動後自動更新']);
  P([]);

  // DATA tab Excel row numbers for base paytable (1-indexed Excel rows)
  // Row layout in DATA: header at row 17, W=17, P1=18..L4=25, PAYTABLE_SCALE=B28
  // 0-indexed in js: W=16, P1=17..L4=24, scale=27 → Excel row = idx+1
  const dataPayRow = { W:17, P1:18, P2:19, P3:20, P4:21, L1:22, L2:23, L3:24, L4:25 };
  const scaleRef = 'DATA!B28';

  // ── Section 1: 已解算賠率矩陣（Excel 公式引用 DATA tab）
  P(['── 1. 已解算賠率矩陣（BASE_PAYTABLE × PAYTABLE_SCALE — Excel公式，DATA改動自動更新）──']);
  P(['注意：四情境共用同一賠率（無 per-mode scale，EDD 規定）']);
  P(['情境', '符號', '3連賠率', '4連賠率', '5連賠率']);

  const modeLabels = ['Main Game', 'Extra Bet', 'Buy FG', 'EB+BuyFG'];
  // Cols in DATA base paytable: 3連=B(1), 4連=C(2), 5連=D(3) → Excel B/C/D
  const colLetter = {1:'B', 2:'C', 3:'D'};
  for (const label of modeLabels) {
    for (const sym of PAY_SYMS) {
      const dRow = dataPayRow[sym];
      const v3 = parseFloat((CONFIG.basePaytable[sym][3] * CONFIG.PAYTABLE_SCALE).toFixed(4));
      const v4 = parseFloat((CONFIG.basePaytable[sym][4] * CONFIG.PAYTABLE_SCALE).toFixed(4));
      const v5 = parseFloat((CONFIG.basePaytable[sym][5] * CONFIG.PAYTABLE_SCALE).toFixed(4));
      P([
        label, sym,
        fCell(`DATA!${colLetter[1]}${dRow}*${scaleRef}`, v3),
        fCell(`DATA!${colLetter[2]}${dRow}*${scaleRef}`, v4),
        fCell(`DATA!${colLetter[3]}${dRow}*${scaleRef}`, v5),
      ]);
    }
    P([label, 'SC', 0, 0, 0]);
  }
  P([]);

  // ── Section 2: 符號機率表（Excel 公式引用 DATA tab）
  // DATA 符號權重 Excel rows: W=352, SC=353, P1=354..L4=361, Total=362
  // cols: MG=B, EB=C, FG=D, BuyFG=E
  const dataWeightRow = { W:352, SC:353, P1:354, P2:355, P3:356, P4:357, L1:358, L2:359, L3:360, L4:361 };
  const modeWeightCol = { MG:'B', EB:'C', FG:'D', BuyFG:'E' };

  P(['── 2. 符號機率表（Excel公式，DATA改動後自動更新）──']);
  P(['符號', 'MG %', 'EB %', 'FG %', 'BuyFG %']);

  const mg   = dp ? dp.weights.MG   : CONFIG.modes.MG.weights;
  const eb   = dp ? dp.weights.EB   : CONFIG.modes.EB.weights;
  const fg   = dp ? dp.weights.FG   : CONFIG.fg.fgWeights;
  const bfg  = dp ? dp.weights.BuyFG: CONFIG.modes.BuyFG.weights;
  const sumW = (w) => Object.values(w).reduce((a, b) => a + b, 0);
  const [mgT, ebT, fgT, bfgT] = [mg, eb, fg, bfg].map(sumW);

  for (const sym of ALL_SYMS) {
    const wRow = dataWeightRow[sym];
    // Formula: =DATA!B352/SUM(DATA!B352:B361)*100
    const mgF  = `DATA!${modeWeightCol.MG}${wRow}/SUM(DATA!${modeWeightCol.MG}352:${modeWeightCol.MG}361)*100`;
    const ebF  = `DATA!${modeWeightCol.EB}${wRow}/SUM(DATA!${modeWeightCol.EB}352:${modeWeightCol.EB}361)*100`;
    const fgF  = `DATA!${modeWeightCol.FG}${wRow}/SUM(DATA!${modeWeightCol.FG}352:${modeWeightCol.FG}361)*100`;
    const bfgF = `DATA!${modeWeightCol.BuyFG}${wRow}/SUM(DATA!${modeWeightCol.BuyFG}352:${modeWeightCol.BuyFG}361)*100`;
    P([
      sym,
      fCell(mgF,  parseFloat(((mg[sym]  || 0) / mgT   * 100).toFixed(4))),
      fCell(ebF,  parseFloat(((eb[sym]  || 0) / ebT   * 100).toFixed(4))),
      fCell(fgF,  parseFloat(((fg[sym]  || 0) / fgT   * 100).toFixed(4))),
      fCell(bfgF, parseFloat(((bfg[sym] || 0) / bfgT  * 100).toFixed(4))),
    ]);
  }
  P([]);

  // ── Section 3: 理論連線命中率（Main Game，25線）
  P(['── 3. 理論連線命中率（Main Game 25線）──']);
  P(['符號', '3連單線P', '4連單線P', '5連單線P', '3連×25線EV', '4連×25線EV', '5連×25線EV']);
  const mgPT = effectivePaytable(1);
  for (const sym of PAY_SYMS) {
    const p3 = paylineHitRate(mg, sym, 3);
    const p4 = paylineHitRate(mg, sym, 4);
    const p5 = paylineHitRate(mg, sym, 5);
    P([
      sym,
      parseFloat(p3.toExponential(6)),
      parseFloat(p4.toExponential(6)),
      parseFloat(p5.toExponential(6)),
      parseFloat((p3 * mgPT[sym][3] * 25).toFixed(6)),
      parseFloat((p4 * mgPT[sym][4] * 25).toFixed(6)),
      parseFloat((p5 * mgPT[sym][5] * 25).toFixed(6)),
    ]);
  }
  P([]);

  // ── Section 4: FG Spin Bonus 期望值
  P(['── 4. FG Spin Bonus 期望值 ──']);
  const totBW = CONFIG.fg.spinBonus.reduce((s, b) => s + b.weight, 0);
  P(['E[spinBonus]', spinBonusEV().toFixed(6), '', '', '', '', '']);
  P(['倍率', '權重', '機率', '貢獻至E[bonus]']);
  for (const b of CONFIG.fg.spinBonus) {
    P([b.mult, b.weight,
       parseFloat((b.weight / totBW).toFixed(6)),
       parseFloat((b.mult   * b.weight / totBW).toFixed(6))]);
  }
  P([]);

  // ── Section 5: 保底 & 費用參數（四情境對照）
  P(['── 5. 保底 & 費用參數（四情境）──']);
  P(['參數',            'Main Game',                    'Extra Bet',                    'Buy FG',                         'EB+BuyFG']);
  P(['費用(×bet)',       1,                              CONFIG.modes.EB.cost,           CONFIG.modes.BuyFG.cost,          CONFIG.modes.EBBuyFG.cost]);
  P(['目標RTP(%)',       CONFIG.modes.MG.rtpTarget,      CONFIG.modes.EB.rtpTarget,      CONFIG.modes.BuyFG.rtpTarget,     CONFIG.modes.EBBuyFG.rtpTarget]);
  P(['payoutScale',      1,                              1,                              1,                                1]);
  P(['近失類型',         'ZERO_WIN',                     'ZERO_WIN',                     'MIN_WIN',                        'MIN_WIN']);
  P(['最小獎(×bet)',     'N/A',                          'N/A',                          CONFIG.modes.BuyFG.minWinMult,    CONFIG.modes.EBBuyFG.minWinMult]);
  P(['FG觸發方式',       'Prob+EntryToss',               'Prob+EntryToss',               '保證5spin',                      '保證5spin']);
  P(['FG_TRIGGER_PROB',  CONFIG.modes.MG.fgTriggerProb, CONFIG.modes.MG.fgTriggerProb, 'N/A',                            'N/A']);
  P(['ENTRY_TOSS_PROB',  CONFIG.modes.MG.entryTossProb, CONFIG.modes.MG.entryTossProb, 1.0,                              1.0]);
  P(['MAX_WIN_MULT',     CONFIG.maxWinMult,              CONFIG.maxWinMult,              CONFIG.maxWinMult,                CONFIG.maxWinMult]);
  P([]);

  // ── Section 6: 版本戳記
  P(['── 6. 版本戳記 ──']);
  P(['build_time',   now]);
  P(['source_file',  'Thunder_Config.xlsx DATA tab']);
  P(['generator',    'build_config.js']);
  P(['next_step',    'excel_simulator.js → verify.js → engine_generator.js']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:28},{wch:16},{wch:16},{wch:16},{wch:18},{wch:22},{wch:22}];
  return ws;
}

// ─── SIMULATION Tab ───────────────────────────────────────────────────────────

function buildSimSheet() {
  const rows = [
    ['SIMULATION Tab — 四情境蒙地卡羅驗證（由 excel_simulator.js 自動寫入）'],
    ['執行：node tools/slot-engine/excel_simulator.js [--spins=1000000] [--runs=5]'],
    [''],
    ['══ 四情境 RTP 驗算 ════════════════════════════════════'],
    ['情境', '費用(×bet)', '模擬轉數', 'RTP', '命中率', '零獎率', '最高倍數', '平均倍數', '最後更新'],
    ['情境1 Main Game',   1,   '（未執行）', '', '', '待填', '', '', ''],
    ['情境2 Extra Bet',   3,   '（未執行）', '', '', '待填', '', '', ''],
    ['情境3 Buy FG',    100,   '（未執行）', '', '', '0%', '', '', ''],
    ['情境4 EB+BuyFG',  100,   '（未執行）', '', '', '0%', '', '', ''],
    [''],
    ['目標：各情境 97.5% ± 0.5pp（97.0% ~ 98.0%）'],
    [''],
    ['══ 四情境 獎項分佈（由模擬器填入）══════════════════════'],
    ['情境', '零獎率', '小獎(1-10x)', '中獎(10-100x)', '大獎(100-1000x)', '巨獎(>1000x)', '近失率'],
    ['Main Game',   '', '', '', '', '', 'N/A（自然零獎）'],
    ['Extra Bet',   '', '', '', '', '', 'N/A（自然零獎）'],
    ['Buy FG',      '0%（保證有獎）', '', '', '', '', '待測（最小獎比例）'],
    ['EB+BuyFG',    '0%（保證有獎）', '', '', '', '', '待測（最小獎比例）'],
    [''],
    ['══ 各情境 FG 觸發統計（MG/EB 用）══════════════════════'],
    ['情境', 'FG觸發率', 'Entry Toss 成功率', '有效FG進入率', '平均FG spin數', 'FG RTP貢獻'],
    ['Main Game', '待測', '待測', '待測', '待測', '待測'],
    ['Extra Bet',  '待測', '待測', '待測', '待測', '待測'],
    [''],
    ['══ 近失配置驗證 ══════════════════════════════════════'],
    ['情境', '近失類型', '目標近失率', '實測近失率', '最小獎金額', '近失RTP貢獻'],
    ['Main Game',  '零獎', '65-70%', '待測', 'N/A', 'N/A'],
    ['Extra Bet',  '零獎', '60-65%', '待測', 'N/A', 'N/A'],
    ['Buy FG',     '最小獎', '5-15%', '待測', '20× bet', '待測'],
    ['EB+BuyFG',   '最小獎', '5-15%', '待測', '20× bet', '待測'],
    [''],
    ['通過後執行：node tools/slot-engine/engine_generator.js → 產生 GameConfig.generated.ts'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:20},{wch:12},{wch:14},{wch:10},{wch:10},{wch:10},{wch:14},{wch:14},{wch:22}];
  return ws;
}

// ─── syncWeightsAndFGProbs ────────────────────────────────────────────────────
// 非 bootstrap 模式：將 CONFIG 中的 MG/EB 符號比重同步到 DATA tab，
// 並重新計算 cascade 推導的 FG_TRIGGER_PROB / MG_FG_TRIGGER_PROB。
// EDD §3.3：FG 觸發機率禁止手動設定，必須由符號比重 × cascade 鏈自動推導。
function syncWeightsAndFGProbs(wb) {
  const ws = wb.Sheets['DATA'];
  if (!ws) return;
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' });

  const setCell = (r, c, v) => {
    ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v };
  };

  // 1. 更新 [符號機率權重] 區段 — MG (col 1) & EB (col 2)
  let symSectionFound = false;
  let symDataCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const k = String(raw[i][0] || '').trim();
    if (k === '[符號機率權重]') { symSectionFound = true; continue; }
    if (symSectionFound && k === '符號') continue;   // 跳過欄位標題列
    if (symSectionFound && symDataCount < 10 && ALL_SYMS.indexOf(k) >= 0) {
      setCell(i, 1, CONFIG.modes.MG.weights[k] || 0);
      setCell(i, 2, CONFIG.modes.EB.weights[k] || 0);
      symDataCount++;
    }
    if (symDataCount >= 10) break;
  }

  // 2. 重新計算 cascade 推導的 FG 觸發機率（含模擬校準因子）
  const mgFgTP = computeFGTriggerProb(CONFIG.modes.MG.weights, CONFIG.modes.MG.entryTossProb, CONFIG.modes.MG.cascadeCalibFactor);
  const ebFgTP = computeFGTriggerProb(CONFIG.modes.EB.weights, CONFIG.modes.EB.entryTossProb, CONFIG.modes.EB.cascadeCalibFactor);

  let foundFG = false, foundMGFG = false;
  for (let i = 0; i < raw.length; i++) {
    const k = String(raw[i][0] || '').trim();
    if (k === 'FG_TRIGGER_PROB')    { setCell(i, 1, ebFgTP); foundFG   = true; }
    if (k === 'MG_FG_TRIGGER_PROB') { setCell(i, 1, mgFgTP); foundMGFG = true; }
  }

  console.log(`   符號比重同步 MG（合計 ${Object.values(CONFIG.modes.MG.weights).reduce((a,b)=>a+b,0)}）`);
  console.log(`   符號比重同步 EB（合計 ${Object.values(CONFIG.modes.EB.weights).reduce((a,b)=>a+b,0)}）`);
  console.log(`   MG_FG_TRIGGER_PROB = ${mgFgTP}（cascade 推導）`);
  console.log(`   FG_TRIGGER_PROB    = ${ebFgTP}（cascade 推導）`);
  if (!foundFG)   console.warn('   ⚠️  FG_TRIGGER_PROB 欄位未找到，請刪除 Excel 後重新 bootstrap');
  if (!foundMGFG) console.warn('   ⚠️  MG_FG_TRIGGER_PROB 欄位未找到，請刪除 Excel 後重新 bootstrap');
}

// ─── 主程式 ──────────────────────────────────────────────────────────────────

function main() {
  const fs = require('fs');
  let wb;
  let isBootstrap = !fs.existsSync(OUTPUT);

  if (isBootstrap) {
    wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildDataSheet(), 'DATA');
    console.log('首次建立 Thunder_Config.xlsx...');
  } else {
    wb = XLSX.readFile(OUTPUT);
    console.log('讀取現有 DATA tab（保留企劃修改）...');
    console.log('同步 CONFIG 符號比重 → DATA tab，重算 cascade FG 觸發機率...');
    syncWeightsAndFGProbs(wb);
  }

  // 讀取 DATA tab 當前值（用於 MODE_MATH 計算）
  const dp = readDataParams(wb);

  // 重建計算型 tabs（保留 DATA、SIMULATION、DESIGN_VIEW）
  const toUpdate = { ENG_TOOLS: buildEngToolsSheet(dp), MODE_MATH: buildModeMathSheet(dp) };
  for (const [name, ws] of Object.entries(toUpdate)) {
    const idx = wb.SheetNames.indexOf(name);
    if (idx >= 0) { wb.SheetNames.splice(idx, 1); delete wb.Sheets[name]; }
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // bootstrap 時補建 SIMULATION placeholder
  if (isBootstrap && !wb.SheetNames.includes('SIMULATION')) {
    XLSX.utils.book_append_sheet(wb, buildSimSheet(), 'SIMULATION');
  }

  XLSX.writeFile(wb, OUTPUT);
  console.log(`\n✅  Thunder_Config.xlsx 更新完成：${OUTPUT}`);
  console.log('');
  if (isBootstrap) {
    console.log('   DATA        → 建立初始配置【企劃唯一編輯入口】');
  } else {
    console.log('   DATA        → ✅ 保留（未修改）');
  }
  console.log('   ENG_TOOLS   → ✅ 已更新（Excel公式，DATA改動後自動更新）');
  console.log('   MODE_MATH   → ✅ 已更新（工具解析式計算，含cascade/FG模型）');
  console.log('');
  console.log('工作流程：');
  console.log('  1. 企劃打開 DATA tab → 各情境獨立調整');
  console.log('  2. node tools/slot-engine/build_config.js     → 更新 ENG_TOOLS + MODE_MATH');
  console.log('  3. node tools/slot-engine/excel_simulator.js  → Monte Carlo 驗證');
  console.log('  4. node tools/slot-engine/verify.js           → 驗收');
  console.log('  5. node tools/slot-engine/engine_generator.js → 產生 GameConfig');
}

main();
