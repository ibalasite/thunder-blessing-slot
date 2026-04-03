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
      payoutScale:    1.0,            // 最終 totalWin = totalRawWin × payoutScale
      // 近失：零獎（自然形成，不強制配置）
      nearMissType:  'ZERO_WIN',      // 可以零獎
      nearMissNote:  '由符號權重自然形成，目標零獎率 65-70%',
      zeroWinTarget:  67,             // % 目標零獎率
      // 符號權重（合計 = 90）
      weights: { W:3, SC:4, P1:6, P2:7, P3:8, P4:10, L1:12, L2:12, L3:14, L4:14 },
      fgTriggerProb:  0.0089,         // 每次 spin 觸發 FG 機率（最小二乘擬合 4 點 → MG≈97.5%）
      entryTossProb:  0.80,           // 觸發後翻硬幣進入 FG 機率
      scGuarantee:   false,
    },
    // ── 情境2: Extra Bet ──────────────────────────────────────────────────────
    EB: {
      label:         'Extra Bet (EB)',
      cost:           3,              // 費用 × bet
      rtpTarget:     97.5,
      payoutScale:    2.67,           // 校準：10M spins平均 raw_wins=109.5%→ 97.5×3/109.5=2.67
      nearMissType:  'ZERO_WIN',      // 可以零獎（SC 保證略降零獎率）
      nearMissNote:  'SC保證使每轉可見3列必有SC，零獎率稍低於 MG，目標 60-65%',
      zeroWinTarget:  62,             // % 目標零獎率
      weights: { W:4, SC:4, P1:7, P2:8, P3:9, P4:10, L1:11, L2:11, L3:13, L4:13 },
      fgTriggerProb:  0.0089,         // 同 MG（共用參數）
      entryTossProb:  0.80,           // 同 MG
      scGuarantee:   true,            // 每次 spin 保證可見 3 列有 SC
    },
    // ── 情境3: Buy Free Game ──────────────────────────────────────────────────
    BuyFG: {
      label:         'Buy Free Game (BuyFG)',
      cost:           100,            // 費用 × bet
      rtpTarget:     97.5,
      payoutScale:    1.073,          // 校準：98.17%→97.5%（微調）
      nearMissType:  'MIN_WIN',       // 無零獎！近失 = 最小保底獎
      nearMissNote:  '無零獎情境：近失 = 最小獎（BUY_FG_MIN_WIN_MULT × bet）',
      minWinMult:    20,              // 最小獎 = 20 × bet（近失體驗）
      zeroWinTarget:  0,              // BuyFG 零獎率 = 0（不允許）
      weights: { W:1, SC:2, P1:2, P2:3, P3:4, P4:6, L1:14, L2:14, L3:22, L4:22 },
      // BuyFG 保證 5 次 FG spin（每級 1 次，不需 Entry Toss）
      fgGuaranteed5Spins: true,
      scGuarantee:   false,
    },
    // ── 情境4: EB + Buy Free Game ─────────────────────────────────────────────
    EBBuyFG: {
      label:         'EB + Buy Free Game (EB+BuyFG)',
      cost:           100,            // 費用 × bet
      rtpTarget:     97.5,
      payoutScale:    1.165,          // 校準：96.86%→97.5%（升自 1.157）
      nearMissType:  'MIN_WIN',       // 無零獎！近失 = 最小保底獎
      nearMissNote:  '無零獎情境，SC保證加持 Phase A 子spin，近失 = 最小獎',
      minWinMult:    20,              // 最小獎 = 20 × bet（同 BuyFG）
      zeroWinTarget:  0,              // 零獎率 = 0
      // Phase A 用 EB 權重（SC 保證），FG 5 spin 用 BuyFG 權重
      phaseAWeights: { W:4, SC:4, P1:7, P2:8, P3:9, P4:10, L1:11, L2:11, L3:13, L4:13 },
      fgWeights:     { W:1, SC:2, P1:2, P2:3, P3:4, P4:6, L1:14, L2:14, L3:22, L4:22 },
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

    // PAYOUT_SCALE
    const scaleLabel = key === 'MG' ? 'PAYTABLE_SCALE' :
                       key === 'EB' ? 'EB_PAYOUT_SCALE' :
                       key === 'BuyFG' ? 'BUY_FG_PAYOUT_SCALE' : 'EB_BUY_FG_PAYOUT_SCALE';
    P(['[PAYOUT_SCALE]']);
    P([scaleLabel, m.payoutScale, '最終 totalWin = totalRawWin × 此值（主要 RTP 校準槓桿）']);
    P(['實際賠率 = BASE_PAYTABLE × PAYTABLE_SCALE × ' + scaleLabel]);
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
    const effPT = effectivePaytable(m.payoutScale);
    P([`[實際賠率表 (有效賠率 = BASE × ${CONFIG.PAYTABLE_SCALE} × ${m.payoutScale})]`]);
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

  P(['[模式校準倍率 PAYOUT_SCALE]', '', '模擬器讀取區：PAYTABLE_SCALE + 各情境 payoutScale']);
  // 注意：模擬器將 "Main Game" 那行的值視為全域 PAYTABLE_SCALE（payline 命中率修正 3.622）
  // 其餘三行是各情境最終 totalWin 縮放
  P(['Main Game PAYTABLE_SCALE',          CONFIG.PAYTABLE_SCALE]);
  P(['Buy FG BUY_FG_PAYOUT_SCALE',        CONFIG.modes.BuyFG.payoutScale]);
  P(['Extra Bet EB_PAYOUT_SCALE',          CONFIG.modes.EB.payoutScale]);
  P(['EB+BuyFG EB_BUY_FG_PAYOUT_SCALE',  CONFIG.modes.EBBuyFG.payoutScale]);
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
  P(['FG_TRIGGER_PROB',      CONFIG.modes.MG.fgTriggerProb]);
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

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:38},{wch:16},{wch:14},{wch:14},{wch:50}];
  return ws;
}

// ─── MODE_MATH Tab ────────────────────────────────────────────────────────────

function buildModeMathSheet() {
  const rows = [];
  const P = (row) => rows.push(row);
  const f4 = (v) => typeof v==='number' ? v.toFixed(4) : v;
  const pct = (v) => typeof v==='number' ? (v*100).toFixed(3)+'%' : v;

  P(['MODE_MATH — 四情境獨立解析式 RTP 估算']);
  P(['說明：解析式誤差 ±3pp（cascade/TB 用近似因子），精確驗證見 SIMULATION tab']);
  P([]);

  const bonusEV = spinBonusEV();
  P([`FG SpinBonus 期望值 E[bonus] = ${bonusEV.toFixed(4)}`]);
  P([]);

  // ── 情境1: Main Game ─────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P(['情境1: Main Game (MG) — RTP 解析估算']);
  P(['══════════════════════════════════════════════════════']);

  const mgW = CONFIG.modes.MG.weights;
  const mgScale = CONFIG.modes.MG.payoutScale;
  const mgEV25 = singleSpinEV(mgW, mgScale, 25);
  const K = CONFIG.cascadeFactor;
  const fgTP = CONFIG.modes.MG.fgTriggerProb;
  const entryP = CONFIG.modes.MG.entryTossProb;

  // FG chain EV (with fgWeights, MG payoutScale=1)
  const fgW = CONFIG.fg.fgWeights;
  const fgEV57 = singleSpinEV(fgW, 1, 57); // FG用PAYTABLE_SCALE×1
  let mgFGChain = 0, p_reach = 1;
  for (let i = 0; i < CONFIG.fg.multipliers.length; i++) {
    mgFGChain += p_reach * CONFIG.fg.multipliers[i] * fgEV57 * bonusEV;
    p_reach *= CONFIG.fg.coinTossProbs[i];
  }

  const mg_base = mgEV25 * K * (1 - fgTP);
  const mg_phaseA = fgTP * mgEV25 * CONFIG.phaseASpins;
  const mg_fgContrib = fgTP * entryP * mgFGChain;
  const mg_total = mg_base + mg_phaseA + mg_fgContrib;

  P([`A. 單次 spin 解析式 EV（25線，SCALE=${mgScale}，無cascade）= ${f4(mgEV25)}`]);
  P([`B. 含 Cascade（× K=${K}）= ${f4(mgEV25*K)}`]);
  P([`C. FG 鏈期望值 E[FG chain]（fgWeights × 57線）= ${f4(mgFGChain)}`]);
  P([`D. FG 貢獻（P_trigger=${fgTP} × P_entry=${entryP} × FG_chain）= ${f4(mg_fgContrib)}`]);
  P([]);
  P(['RTP 組成', '期望值（× bet）', '佔總 RTP']);
  P(['Base spin（非FG觸發）', f4(mg_base), pct(mg_base/1)]);
  P(['Phase A（FG觸發時）',   f4(mg_phaseA), pct(mg_phaseA/1)]);
  P(['FG Loop 貢獻',          f4(mg_fgContrib), pct(mg_fgContrib/1)]);
  P(['合計 EV（wagered=1）',  f4(mg_total), '100%']);
  P([`估算 RTP = ${pct(mg_total/1)} | 目標 97.5% | 差距 ${((mg_total/1-0.975)*100).toFixed(2)}pp`]);
  P([]);

  // Payline 命中率表
  P(['主遊戲 Payline 命中率（1線）']);
  P(['符號', '3連P（1線）', '3連EV（25線）', '4連P（1線）', '4連EV（25線）', '5連P（1線）', '5連EV（25線）']);
  for (const sym of PAY_SYMS) {
    const effScale = CONFIG.PAYTABLE_SCALE * mgScale;
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
  P(['情境2: Extra Bet (EB) — RTP 解析估算（費用 3× bet）']);
  P(['══════════════════════════════════════════════════════']);

  const ebW = CONFIG.modes.EB.weights;
  const ebScale = CONFIG.modes.EB.payoutScale;
  const ebEV25 = singleSpinEV(ebW, ebScale, 25);
  const eb_base = ebEV25 * K * (1 - fgTP);
  const eb_phaseA = fgTP * ebEV25 * CONFIG.phaseASpins;

  // EB FG uses fgWeights × EB payoutScale
  const ebFGEV57 = singleSpinEV(fgW, ebScale, 57);
  let ebFGChain = 0; p_reach = 1;
  for (let i = 0; i < CONFIG.fg.multipliers.length; i++) {
    ebFGChain += p_reach * CONFIG.fg.multipliers[i] * ebFGEV57 * bonusEV;
    p_reach *= CONFIG.fg.coinTossProbs[i];
  }
  const eb_fgContrib = fgTP * entryP * ebFGChain;
  const eb_total = eb_base + eb_phaseA + eb_fgContrib;

  P([`A. 單次 spin EV（25線，SCALE=${ebScale}，無cascade）= ${f4(ebEV25)}`]);
  P([`B. FG 鏈 EV（fgWeights × EB SCALE × 57線）= ${f4(ebFGChain)}`]);
  P([]);
  P(['RTP 組成', '期望值（× bet）', '佔費用比 /3']);
  P(['Base spin（非FG觸發）', f4(eb_base),      pct(eb_base/3)]);
  P(['Phase A（FG觸發時）',   f4(eb_phaseA),    pct(eb_phaseA/3)]);
  P(['FG Loop 貢獻',          f4(eb_fgContrib), pct(eb_fgContrib/3)]);
  P(['合計 EV',               f4(eb_total),     '100%']);
  P([`估算 RTP = ${pct(eb_total/3)} | 目標 97.5% | 差距 ${((eb_total/3-0.975)*100).toFixed(2)}pp`]);
  P([]);

  // ── 情境3: Buy FG ─────────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P(['情境3: Buy Free Game (BuyFG) — RTP 解析估算（費用 100× bet，無零獎）']);
  P(['══════════════════════════════════════════════════════']);

  const buyW   = CONFIG.modes.BuyFG.weights;
  const buyScale = CONFIG.modes.BuyFG.payoutScale;
  const buyEV57 = singleSpinEV(buyW, buyScale, 57);
  // hit rate estimation: P(at least one payline wins) — empirical ≈ 28%
  const buyHitRate = 0.28;
  const buyGuaranteedEV = buyEV57 / buyHitRate; // guaranteed win spin EV
  let buy5spinEV = 0;
  for (let i = 0; i < CONFIG.fg.multipliers.length; i++) {
    buy5spinEV += CONFIG.fg.multipliers[i] * buyGuaranteedEV * bonusEV;
  }
  const buyPhaseA = buyEV57 * CONFIG.phaseASpins * buyScale;
  const buyTotal  = (buyPhaseA + buy5spinEV) * buyScale;
  const buyRTP    = buyTotal / 100;

  P([`A. BuyFG FG spin EV（57線，低Premium buyFG權重，SCALE=${buyScale}）= ${f4(buyEV57)}`]);
  P([`B. 命中率估算（empirical）= ${(buyHitRate*100).toFixed(0)}%，保證贏 spin EV = ${f4(buyGuaranteedEV)}`]);
  P([`C. 5次保證 FG spin 鏈 EV（各級倍率×保證EV×bonus）= ${f4(buy5spinEV)}`]);
  P([`D. Phase A EV（cascade至MAX_ROWS）= ${f4(buyPhaseA)}`]);
  P([]);
  P(['BuyFG 情境 RTP 組成', '期望值（× bet）', '佔費用比 /100']);
  P(['Phase A（cascade至滿格）', f4(buyPhaseA), pct(buyPhaseA*buyScale/100)]);
  P(['5次保證 FG spin', f4(buy5spinEV), pct(buy5spinEV*buyScale/100)]);
  P([`近失（最小獎）貢獻`, `P(近失)×${CONFIG.modes.BuyFG.minWinMult}`, '≈ P(近失)×0.20']);
  P([`估算 RTP（無近失）= ${pct(buyRTP)} | 目標 97.5%`]);
  P([`最小獎 ${CONFIG.modes.BuyFG.minWinMult}× bet：若 P(近失)=10%，貢獻 +${(0.1*CONFIG.modes.BuyFG.minWinMult/100*100).toFixed(1)}pp`]);
  P([]);

  // ── 情境4: EB + BuyFG ────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P(['情境4: EB + Buy FG — RTP 解析估算（費用 100× bet，SC保證，無零獎）']);
  P(['══════════════════════════════════════════════════════']);

  const ebBuyScale = CONFIG.modes.EBBuyFG.payoutScale;
  const ebBuyPhaseAW = CONFIG.modes.EBBuyFG.phaseAWeights;
  const ebBuyFGW     = CONFIG.modes.EBBuyFG.fgWeights;
  const ebPhaseAEV57 = singleSpinEV(ebBuyPhaseAW, ebBuyScale, 57); // SC guarantee Phase A at max rows
  const ebBuyFGEV57  = singleSpinEV(ebBuyFGW, ebBuyScale, 57);
  let ebBuy5spinEV   = 0;
  for (let i = 0; i < CONFIG.fg.multipliers.length; i++) {
    ebBuy5spinEV += CONFIG.fg.multipliers[i] * (ebBuyFGEV57 / buyHitRate) * bonusEV;
  }
  const ebBuyPhaseA = ebPhaseAEV57 * CONFIG.phaseASpins;
  const ebBuyTotal  = (ebBuyPhaseA + ebBuy5spinEV) * ebBuyScale;
  const ebBuyRTP    = ebBuyTotal / 100;

  P([`A. Phase A EV（EB權重，SC保證，57線，SCALE=${ebBuyScale}）= ${f4(ebPhaseAEV57)}`]);
  P([`B. FG 5-spin EV（BuyFG權重，SCALE=${ebBuyScale}）= ${f4(ebBuy5spinEV)}`]);
  P([]);
  P(['EB+BuyFG 情境 RTP 組成', '期望值（× bet）', '佔費用比 /100']);
  P(['Phase A（SC保證 cascade）', f4(ebBuyPhaseA*ebBuyScale), pct(ebBuyPhaseA*ebBuyScale/100)]);
  P(['5次保證 FG spin', f4(ebBuy5spinEV*ebBuyScale), pct(ebBuy5spinEV*ebBuyScale/100)]);
  P([`估算 RTP（無近失）= ${pct(ebBuyRTP)} | 目標 97.5%`]);
  P([`最小獎 ${CONFIG.modes.EBBuyFG.minWinMult}× bet：同 BuyFG 地板保底`]);
  P([]);

  // ── 校準對照表 ───────────────────────────────────────────────────────────────
  P(['══════════════════════════════════════════════════════']);
  P(['四情境 RTP 估算對照表']);
  P(['══════════════════════════════════════════════════════']);
  P(['情境', '費用', '估算RTP（解析）', '目標RTP', '差距（pp）', '主要校準槓桿']);
  const gap = (v,t) => ((v-t/100)*100).toFixed(2)+'pp';
  P(['Main Game',  '1×',   pct(mg_total/1),    '97.5%', gap(mg_total/1, 97.5), '↑ FG_TRIGGER_PROB / ↑ PAYTABLE_SCALE']);
  P(['Extra Bet',  '3×',   pct(eb_total/3),    '97.5%', gap(eb_total/3, 97.5), '↑ EB_PAYOUT_SCALE']);
  P(['Buy FG',     '100×', pct(buyRTP),        '97.5%', gap(buyRTP, 97.5),     '↑ BUY_FG_PAYOUT_SCALE / ↑ MIN_WIN_MULT']);
  P(['EB+BuyFG',   '100×', pct(ebBuyRTP),      '97.5%', gap(ebBuyRTP, 97.5),   '↑ EB_BUY_FG_PAYOUT_SCALE']);
  P([]);
  P(['⚠️ 解析式誤差 ±3pp。精確結果見 SIMULATION tab（蒙地卡羅驗證）']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:36},{wch:16},{wch:16},{wch:16},{wch:16},{wch:40}];
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

// ─── 主程式 ──────────────────────────────────────────────────────────────────

function main() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildDataSheet(),     'DATA');
  XLSX.utils.book_append_sheet(wb, buildModeMathSheet(), 'MODE_MATH');
  XLSX.utils.book_append_sheet(wb, buildSimSheet(),      'SIMULATION');

  XLSX.writeFile(wb, OUTPUT);
  console.log(`\n✅  Thunder_Config.xlsx 建立完成（3 tabs）：${OUTPUT}`);
  console.log('');
  console.log('   DATA       → 四情境各自配置（賠率表/符號權重/近失）');
  console.log('   MODE_MATH  → 四情境獨立解析式 RTP 估算');
  console.log('   SIMULATION → 蒙地卡羅驗證（由 excel_simulator.js 寫入）');
  console.log('');
  console.log('工作流程：');
  console.log('  1. 企劃打開 DATA tab → 各情境獨立調整');
  console.log('  2. MODE_MATH 對照表確認方向');
  console.log('  3. node tools/slot-engine/excel_simulator.js  → 精確驗證（SIMULATION tab）');
  console.log('  4. node tools/slot-engine/engine_generator.js → 產生 GameConfig');
  console.log('  5. node tools/slot-engine/verify.js           → 最終確認');
}

main();
