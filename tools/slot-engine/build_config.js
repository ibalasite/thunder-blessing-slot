'use strict';
/**
 * build_config.js — 從 GameConfig.ts 提取當前設定，建立 Thunder_Config.xlsx
 *
 * Excel 為唯一數學設計入口（Single Source of Truth）：
 *   DATA        — 所有可調參數（賠率、符號權重、機率、近失配置）
 *   MODE_MATH   — 四個模式完整期望值分析（解析式計算 + 組合 RTP）
 *   NEAR_MISS   — 零獎 / 最小獎配置（BuyFG/EB+BuyFG 不可零獎）
 *   SIMULATION  — 佔位，由 excel_simulator.js 寫入蒙地卡羅驗證結果
 *
 * Usage: node tools/slot-engine/build_config.js
 * Output: tools/slot-engine/Thunder_Config.xlsx
 */

const XLSX = require('xlsx');
const path = require('path');

const OUTPUT = path.resolve(__dirname, 'Thunder_Config.xlsx');

// ─── 當前 GameConfig 數值（維持與 GameConfig.ts 同步）────────────────────────
const CONFIG = {
  basePaytable: {
    W:  [0, 0, 0, 0.17, 0.43, 1.17],
    P1: [0, 0, 0, 0.17, 0.43, 1.17],
    P2: [0, 0, 0, 0.11, 0.27, 0.67],
    P3: [0, 0, 0, 0.09, 0.23, 0.67],
    P4: [0, 0, 0, 0.07, 0.17, 0.57],
    L1: [0, 0, 0, 0.03, 0.07, 0.17],
    L2: [0, 0, 0, 0.03, 0.07, 0.17],
    L3: [0, 0, 0, 0.02, 0.05, 0.13],
    L4: [0, 0, 0, 0.02, 0.05, 0.13],
  },
  scales: {
    PAYTABLE_SCALE:          3.622,
    BUY_FG_PAYOUT_SCALE:     0.995,
    EB_PAYOUT_SCALE:         2.75,
    EB_BUY_FG_PAYOUT_SCALE:  1.065,
  },
  weights: {
    mainGame: { W:3,  SC:4,  P1:6,  P2:7,  P3:8,  P4:10, L1:12, L2:12, L3:14, L4:14 },
    extraBet: { W:4,  SC:4,  P1:7,  P2:8,  P3:9,  P4:10, L1:11, L2:11, L3:13, L4:13 },
    freeGame: { W:4,  SC:6,  P1:9,  P2:10, P3:11, P4:12, L1:9,  L2:9,  L3:10, L4:10 },
    buyFG:    { W:1,  SC:2,  P1:2,  P2:3,  P3:4,  P4:6,  L1:14, L2:14, L3:22, L4:22 },
  },
  fgMultipliers:    [3, 7, 17, 27, 77],
  coinTossProbs:    [0.80, 0.68, 0.56, 0.48, 0.40],
  entryTossMain:    0.80,
  entryTossBuy:     1.00,
  fgSpinBonus: [
    { mult: 1,   weight: 900 },
    { mult: 5,   weight: 80  },
    { mult: 20,  weight: 15  },
    { mult: 100, weight: 5   },
  ],
  fgTriggerProb:    0.008,
  tbSecondHitProb:  0.40,
  buyCostMult:      100,
  extraBetMult:     3,
  buyFGMinWinMult:  20,   // Buy FG 近失最小獎（× bet）— 無零獎
  maxWinMult:       30000,
  betMin:           0.25,
  betMax:           10.00,
  betStep:          0.25,
  defaultBet:       0.25,
  defaultBalance:   1000,
  symbolUpgrade: {
    L4: 'P4', L3: 'P4', L2: 'P4', L1: 'P4',
    P4: 'P3', P3: 'P2', P2: 'P1', P1: 'P1',
  },
  // 解析式計算用經驗修正因子
  cascadeFactor:    1.35,   // 級聯平均乘效（相對單次掃描 EV）
  phaseASpins:      3.2,    // Phase A 平均子 spin 數（FG 觸發時）
};

const SYMBOLS    = ['W','SC','P1','P2','P3','P4','L1','L2','L3','L4'];
const PAY_SYMS   = ['W','P1','P2','P3','P4','L1','L2','L3','L4'];
const PAYLINES_AT_ROWS = { 3:25, 4:33, 5:45, 6:57 };
const TARGET_RTP = 97.5;

// ─── 解析式計算工具 ──────────────────────────────────────────────────────────

/**
 * 計算特定權重組合下的單線中獎機率（含 Wild 替換，左到右連線）
 * 公式：P(S×C on one payline) = p_s × p_sw^(C-1) × (1-p_sw)^(5-C)
 * 其中 p_sw = p_s + p_w（S 或 Wild 的機率）
 * 近似假設：Wild 只替換非首位，首位需為 S 才能確定賠付符號
 */
function paylineHitRate(weights, sym, count) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const p_s = weights[sym] / total;
  const p_w = weights['W']  / total;
  const p_sw = p_s + p_w;
  if (count === 5) return p_s * Math.pow(p_sw, 4);
  return p_s * Math.pow(p_sw, count - 1) * Math.pow(1 - p_sw, 5 - count);
}

/**
 * 計算特定權重下單次 spin 期望值（N 條連線，不含 cascade 加成）
 * scale 為對應模式的 PAYTABLE_SCALE
 */
function singleSpinEV(weights, scale, numPaylines) {
  let ev = 0;
  for (const sym of PAY_SYMS) {
    for (const count of [3, 4, 5]) {
      const payout = (CONFIG.basePaytable[sym]?.[count] || 0) * scale;
      if (payout <= 0) continue;
      const hitRate = paylineHitRate(weights, sym, count);
      ev += hitRate * payout * numPaylines;
    }
  }
  return ev;
}

/** FG Spin Bonus 期望值 */
function spinBonusEV() {
  const totalW = CONFIG.fgSpinBonus.reduce((s, b) => s + b.weight, 0);
  return CONFIG.fgSpinBonus.reduce((s, b) => s + b.mult * b.weight, 0) / totalW;
}

/**
 * Main/EB FG 鏈期望值（coin toss 模型）
 * 在 FG 中使用 freeGame 權重，賠率用 PAYTABLE_SCALE（FG 不另加 scale）
 */
function fgChainEV(weights, scale) {
  const bonusEV = spinBonusEV();
  const baseEV  = singleSpinEV(weights, scale, PAYLINES_AT_ROWS[6]); // FG 最多 57 線

  let chainEV   = 0;
  let p_reach   = 1;
  for (let i = 0; i < CONFIG.fgMultipliers.length; i++) {
    const mult = CONFIG.fgMultipliers[i];
    chainEV += p_reach * mult * baseEV * bonusEV;
    p_reach *= CONFIG.coinTossProbs[i]; // 升級機率
  }
  return chainEV;
}

/**
 * Buy FG 5-spin 保證中獎鏈期望值
 * 用 buyFG 權重，每 spin 保證有贏（EV ÷ hit_rate 修正）
 */
function buyFGChainEV(weights, scale) {
  const bonusEV   = spinBonusEV();
  const baseEV    = singleSpinEV(weights, scale, PAYLINES_AT_ROWS[6]);
  // 命中率估算：P(至少一條連線中獎)
  // 近似：P(無中獎) = Π(1 - P(one payline wins)) — 假設各線獨立（粗估）
  // 更精確估算：用模擬值 0.28（buyFG 低 Wild 低 Premium）
  const hitRate   = 0.28; // empirical; overridden by simulation
  const guaranteedEV = baseEV / hitRate;

  let chainEV = 0;
  for (let i = 0; i < CONFIG.fgMultipliers.length; i++) {
    chainEV += CONFIG.fgMultipliers[i] * guaranteedEV * bonusEV;
  }
  return chainEV;
}

// ─── DATA Tab ─────────────────────────────────────────────────────────────────

function buildDataSheet() {
  const rows = [];
  const push = (row) => rows.push(row);

  push(['Thunder Blessing Slot — 遊戲設定 DATA Tab（唯一數學設計入口）']);
  push(['⚠️  企劃編輯此 Tab，所有欄位變更後需重跑 excel_simulator.js 驗證 RTP']);
  push(['   查看 MODE_MATH tab 了解解析式 RTP 估算 | NEAR_MISS tab 了解零獎/最小獎配置']);
  push([]);

  // 遊戲基本設定
  push(['[遊戲基本設定]']);
  push(['滾輪數',                       5]);
  push(['基本列數',                     3]);
  push(['最大列數',                     6]);
  push(['最高獎金倍數',                 CONFIG.maxWinMult]);
  push(['最小押分',                     CONFIG.betMin]);
  push(['最大押分',                     CONFIG.betMax]);
  push(['押分步進',                     CONFIG.betStep]);
  push(['預設押分',                     CONFIG.defaultBet]);
  push(['預設餘額',                     CONFIG.defaultBalance]);
  push([]);

  // Paytable
  push(['[Paytable 基礎倍率]', '', '實際賠率 = 基礎值 × 對應 PAYOUT_SCALE']);
  push(['符號', '說明', '3連', '4連', '5連']);
  const symDesc = {
    W:'Wild（百搭，同 P1 賠率）', SC:'Scatter（無賠率）',
    P1:'P1 Zeus（宙斯）', P2:'P2 Pegasus（天馬）',
    P3:'P3 Athena（雅典娜）', P4:'P4 Eagle（雄鷹）',
    L1:'L1 Z', L2:'L2 E', L3:'L3 U', L4:'L4 S',
  };
  for (const sym of PAY_SYMS) {
    const p = CONFIG.basePaytable[sym];
    push([sym, symDesc[sym], p[3], p[4], p[5]]);
  }
  push(['SC', symDesc['SC'], '-', '-', '-']);
  push([]);

  // 模式校準倍率（注意：下方 section 名稱與欄位格式需與 excel_simulator.js readConfig() 保持一致）
  push(['[模式校準倍率 PAYOUT_SCALE]', '', '調整此值不改變獎金分佈形狀，只縮放總 RTP | 各模式費用: MG×1 / EB×3 / BuyFG×100']);
  push(['Main Game PAYTABLE_SCALE',          CONFIG.scales.PAYTABLE_SCALE,
        '費用 1× bet，目標 97.5% | 調整此值可直接縮放 MG 所有賠率']);
  push(['Buy FG BUY_FG_PAYOUT_SCALE',        CONFIG.scales.BUY_FG_PAYOUT_SCALE,
        '費用 100× bet，目標 97.5%']);
  push(['Extra Bet EB_PAYOUT_SCALE',          CONFIG.scales.EB_PAYOUT_SCALE,
        '費用 3× bet，目標 97.5%']);
  push(['EB+BuyFG EB_BUY_FG_PAYOUT_SCALE',  CONFIG.scales.EB_BUY_FG_PAYOUT_SCALE,
        'SC 保證在低 SC 環境下降低原始贏分，>1.0 補償']);
  push([]);

  // 符號機率權重
  push(['[符號機率權重]', '', '合計需為 90（各欄獨立驗證）']);
  push(['符號', 'Main Game', 'Extra Bet', 'Free Game', 'Buy FG']);
  for (const sym of SYMBOLS) {
    push([sym,
      CONFIG.weights.mainGame[sym],
      CONFIG.weights.extraBet[sym],
      CONFIG.weights.freeGame[sym],
      CONFIG.weights.buyFG[sym],
    ]);
  }
  push(['合計',
    Object.values(CONFIG.weights.mainGame).reduce((a,b)=>a+b,0),
    Object.values(CONFIG.weights.extraBet).reduce((a,b)=>a+b,0),
    Object.values(CONFIG.weights.freeGame).reduce((a,b)=>a+b,0),
    Object.values(CONFIG.weights.buyFG).reduce((a,b)=>a+b,0),
  ]);
  push([]);

  // FG 倍率階梯
  push(['[FG 倍率階梯 & Coin Toss 升級機率]']);
  push(['等級', '倍率', 'Coin Toss 正面機率', '說明']);
  const lvlDesc = ['初始', '第2次正面', '第3次正面', '第4次正面', '最高（維持）'];
  for (let i = 0; i < CONFIG.fgMultipliers.length; i++) {
    push([i+1, CONFIG.fgMultipliers[i], CONFIG.coinTossProbs[i], lvlDesc[i]]);
  }
  push([]);

  // Entry Toss
  push(['[Entry Coin Toss 機率]', '', '觸發 FG → 翻硬幣決定是否進入 FG Loop']);
  push(['Main / Extra Bet', CONFIG.entryTossMain, '失敗仍保留 Phase A 累積獎金']);
  push(['Buy FG',           CONFIG.entryTossBuy,  '100% 保證進入 FG Loop']);
  push([]);

  // 特殊機率參數
  push(['[特殊機率參數]']);
  push(['FG_TRIGGER_PROB',      CONFIG.fgTriggerProb,    '每次 spin 觸發 FG（主要 RTP 校準槓桿）']);
  push(['TB_SECOND_HIT_PROB',   CONFIG.tbSecondHitProb,  '雷霆祝福第二擊機率（GDD §5: 40%）']);
  push(['EXTRA_BET_MULT',       CONFIG.extraBetMult,     'Extra Bet 費用倍率（每轉 3× bet）']);
  push(['BUY_COST_MULT',        CONFIG.buyCostMult,      'Buy FG 費用倍率（100× bet）']);
  push(['SC_GUARANTEE',         'TRUE',                  'Extra Bet ON → 可見 3 列保證有 SC']);
  push([]);

  // 近失配置
  push(['[近失配置 Near Miss]', '', '影響玩家體感與 RTP 分佈底端']);
  push(['BUY_FG_MIN_WIN_MULT',     CONFIG.buyFGMinWinMult,
        'Buy FG / EB+BuyFG 最小保底獎（× bet）→ 無零獎（見 NEAR_MISS tab）']);
  push(['Main Game 零獎目標',        '≈70%（由權重自然形成）',
        '由符號權重決定，非獨立配置項']);
  push(['Extra Bet 零獎目標',        '≈65%（SC保證略降零獎率）',
        'SC 保證使每轉必有 SC，略增 cascade 機會']);
  push([]);

  // FG Spin Bonus
  push(['[FG Spin Bonus 分布]', '', '每次 FG spin 前抽取，放大單 spin 最高獎']);
  push(['倍率', '權重', '機率', '說明']);
  const totalBW = CONFIG.fgSpinBonus.reduce((s, b) => s + b.weight, 0);
  for (const b of CONFIG.fgSpinBonus) {
    const pct = (b.weight / totalBW * 100).toFixed(2) + '%';
    const desc = b.mult === 1 ? '無加成（大多數）'
               : b.mult === 5 ? '小爆彈' : b.mult === 20 ? '中爆彈' : '大爆彈';
    push([b.mult, b.weight, pct, desc]);
  }
  const bonusEV = CONFIG.fgSpinBonus.reduce((s, b) => s + b.mult * b.weight, 0) / totalBW;
  push(['合計', totalBW, '100%', `E[SpinBonus] = ${bonusEV.toFixed(4)}`]);
  push([]);

  // TB 升階表
  push(['[雷霆祝福 TB 符號升階表]']);
  push(['原符號', '升階後']);
  for (const [from, to] of Object.entries(CONFIG.symbolUpgrade)) push([from, to]);
  push([]);

  // 連線數說明
  push(['[連線數與列數對應]', '（Paylines 陣列定義於 GameConfig.ts，需改程式碼）']);
  push(['可見列數', '有效連線數', '觸發時機']);
  push([3, 25, '每次 SPIN 起始']);
  push([4, 33, '第 1 次 Cascade']);
  push([5, 45, '第 2 次 Cascade']);
  push([6, 57, '第 3 次 Cascade / FG']);

  // 解析式經驗修正因子
  push([]);
  push(['[解析式計算修正因子]', '', '供 MODE_MATH tab 估算使用，由模擬校準後填入']);
  push(['CASCADE_FACTOR',    CONFIG.cascadeFactor,
        '級聯平均倍效（E[帶cascade贏分] / E[單次掃描贏分]），通常 1.3~1.5']);
  push(['PHASE_A_AVG_SPINS', CONFIG.phaseASpins,
        'FG 觸發時 Phase A 平均子 spin 數（spins until rows=6）']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch:32 },{ wch:20 },{ wch:12 },{ wch:60 }];
  return ws;
}

// ─── MODE_MATH Tab ────────────────────────────────────────────────────────────
// 四個遊戲模式完整解析式 RTP 估算

function buildModeMathSheet() {
  const rows = [];
  const push = (row) => rows.push(row);
  const pct = (v) => (v * 100).toFixed(4) + '%';
  const n4  = (v) => v.toFixed(4);

  push(['MODE_MATH — 四模式完整解析式 RTP 估算（期望值分解）']);
  push(['說明：此 tab 提供解析式估算，精確驗證請查看 SIMULATION tab（蒙地卡羅）']);
  push(['修改 DATA tab 的參數後，需手動更新此 tab 或重跑 build_config.js 同步']);
  push([]);

  // ── A. 符號機率矩陣
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['A. 符號出現機率（各模式 weight/90）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['符號', 'Main Game (90)', 'Extra Bet (90)', 'Free Game (90)', 'Buy FG (90)']);
  for (const sym of SYMBOLS) {
    const mg  = CONFIG.weights.mainGame[sym];
    const eb  = CONFIG.weights.extraBet[sym];
    const fg  = CONFIG.weights.freeGame[sym];
    const buy = CONFIG.weights.buyFG[sym];
    push([sym,
      `${mg} (${(mg/90*100).toFixed(1)}%)`,
      `${eb} (${(eb/90*100).toFixed(1)}%)`,
      `${fg} (${(fg/90*100).toFixed(1)}%)`,
      `${buy} (${(buy/90*100).toFixed(1)}%)`,
    ]);
  }
  push([]);

  // ── B. 解析式單線中獎機率與 EV（Main Game 示例）
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['B. 解析式單線中獎機率與 EV（Main Game @ 25 線，SCALE=3.622）']);
  push(['   公式：P(S×C on one line) = p_s × p_sw^(C-1) × (1-p_sw)^(5-C)']);
  push(['         p_sw = p_sym + p_wild（Wild 可替換非首位）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['符號', '3連P', '3連賠率', '3連EV×25', '4連P', '4連賠率', '4連EV×25', '5連P', '5連賠率', '5連EV×25', '合計EV']);

  const scale = CONFIG.scales.PAYTABLE_SCALE;
  const mgW   = CONFIG.weights.mainGame;
  let mgTotalEV = 0;
  for (const sym of PAY_SYMS) {
    const p    = CONFIG.basePaytable[sym];
    const evParts = [];
    let symEV = 0;
    for (const count of [3, 4, 5]) {
      const hr    = paylineHitRate(mgW, sym, count);
      const payout = p[count] * scale;
      const ev    = hr * payout * 25;
      evParts.push(n4(hr * 25), n4(payout), n4(ev));
      symEV += ev;
    }
    mgTotalEV += symEV;
    push([sym, ...evParts, n4(symEV)]);
  }
  push(['合計', '', '', '', '', '', '', '', '', '', n4(mgTotalEV)]);
  push([`  → Main Game 單次 spin 解析式 EV（不含 cascade/FG）= ${pct(mgTotalEV)}`]);
  push([]);

  // ── C. 四模式單次 Spin EV（解析式）
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['C. 四模式單次 Spin EV（解析式，不含 Cascade / TB 加成）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const modeConfigs = [
    { label:'Main Game',   w:CONFIG.weights.mainGame,  scale:CONFIG.scales.PAYTABLE_SCALE,         lines:25 },
    { label:'Extra Bet',   w:CONFIG.weights.extraBet,  scale:CONFIG.scales.EB_PAYOUT_SCALE,        lines:25 },
    { label:'Free Game',   w:CONFIG.weights.freeGame,  scale:CONFIG.scales.PAYTABLE_SCALE,         lines:57 },
    { label:'Buy FG spin', w:CONFIG.weights.buyFG,     scale:CONFIG.scales.BUY_FG_PAYOUT_SCALE,   lines:57 },
  ];

  push(['模式', '連線數', '單次 EV', 'Cascade Factor K', 'EV × K（含級聯）']);
  const K = CONFIG.cascadeFactor;
  for (const m of modeConfigs) {
    const ev = singleSpinEV(m.w, m.scale, m.lines);
    push([m.label, m.lines, n4(ev), n4(K), n4(ev * K)]);
  }
  push([]);
  push(['  * Cascade Factor K = 1 + 平均每 spin 觸發額外 cascade 次數 × 平均 cascade EV 比']);
  push([`    目前 K = ${K}（由 DATA tab [解析式計算修正因子] 設定，需蒙地卡羅校準）`]);
  push([]);

  // ── D. FG 鏈期望值（Main/EB 模式）
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['D. FG 鏈期望值分析（Main / Extra Bet — Coin Toss 可變長度 FG）']);
  push(['   FG 使用 Free Game 符號權重 + PAYTABLE_SCALE']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const fgBaseEV57 = singleSpinEV(CONFIG.weights.freeGame, CONFIG.scales.PAYTABLE_SCALE, 57);
  const bonusEV    = spinBonusEV();
  push([`SpinBonus 期望值 E[bonus] = ${n4(bonusEV)} （${CONFIG.fgSpinBonus.map(b=>`${b.mult}×:${(b.weight/1000*100).toFixed(1)}%`).join(' | ')}）`]);
  push([`FG 單次 spin 基礎 EV（57線，SCALE=${CONFIG.scales.PAYTABLE_SCALE}）= ${n4(fgBaseEV57)}`]);
  push([]);
  push(['等級', 'FG倍率', 'Coin Toss 升級P', 'P(到達此級)', 'P(到達) × 倍率 × EV × Bonus', '累計貢獻']);

  let p_reach  = 1;
  let cumFGEV  = 0;
  for (let i = 0; i < CONFIG.fgMultipliers.length; i++) {
    const mult      = CONFIG.fgMultipliers[i];
    const contrib   = p_reach * mult * fgBaseEV57 * bonusEV;
    cumFGEV += contrib;
    push([
      `Level ${i+1}`,
      mult,
      i < CONFIG.fgMultipliers.length - 1 ? CONFIG.coinTossProbs[i] : '終止',
      n4(p_reach),
      n4(contrib),
      n4(cumFGEV),
    ]);
    p_reach *= CONFIG.coinTossProbs[i];
  }
  push([`  → FG 鏈總期望值 E[FG chain] = ${n4(cumFGEV)}`]);
  push([]);

  // ── E. 五次保證 FG（Buy FG 模式）
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['E. Buy FG — 五次保證中獎 FG Spin 期望值']);
  push(['   使用 Buy FG 符號權重（低 Wild / 低 Premium），每 spin 重試直到有獎']);
  push(['   BUY_FG_PAYOUT_SCALE 乘入總贏分']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const buyFGBaseEV = singleSpinEV(CONFIG.weights.buyFG, CONFIG.scales.BUY_FG_PAYOUT_SCALE, 57);
  const hitRate     = 0.28; // empirical estimate for buy FG weights
  const guaranteedEV = buyFGBaseEV / hitRate;
  push([`Buy FG 單次 spin 基礎 EV（57線）= ${n4(buyFGBaseEV)}`]);
  push([`命中率估算（empirical）= ${(hitRate*100).toFixed(1)}%（低 Wild 低 Premium 環境）`]);
  push([`保證中獎 spin EV（EV / hit_rate）= ${n4(guaranteedEV)}`]);
  push(['等級', 'FG倍率', '保證EV×倍率×Bonus', '累計貢獻']);
  let buyFGChain = 0;
  for (let i = 0; i < CONFIG.fgMultipliers.length; i++) {
    const contrib = CONFIG.fgMultipliers[i] * guaranteedEV * bonusEV;
    buyFGChain += contrib;
    push([`Spin ${i+1}`, CONFIG.fgMultipliers[i], n4(contrib), n4(buyFGChain)]);
  }
  push([`  → Buy FG 5-spin 鏈期望值 = ${n4(buyFGChain)}`]);
  push([`  → 最小保底（BUY_FG_MIN_WIN_MULT × bet）= ${CONFIG.buyFGMinWinMult}（見 NEAR_MISS tab）`]);
  push([]);

  // ── F. 各模式 Phase A 貢獻（FG 觸發時）
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['F. Phase A 貢獻（FG 觸發時，級聯至 MAX_ROWS=6 的累積贏分）']);
  push(['   Phase A 跑多個 sub-spin 直到 rows=6，每個 sub-spin 累積贏分']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const avgSubSpins   = CONFIG.phaseASpins;
  push([`Phase A 平均子 spin 數 = ${avgSubSpins}（由 DATA tab [解析式計算修正因子] 設定）`]);
  const mgEV25  = singleSpinEV(CONFIG.weights.mainGame,  CONFIG.scales.PAYTABLE_SCALE, 25);
  const ebEV25  = singleSpinEV(CONFIG.weights.extraBet,  CONFIG.scales.EB_PAYOUT_SCALE, 25);
  const buyEV57 = singleSpinEV(CONFIG.weights.buyFG,     CONFIG.scales.BUY_FG_PAYOUT_SCALE, 57);
  push(['模式', '每 sub-spin EV', '平均子 spin 數', '估算 Phase A EV']);
  push(['Main Game',   n4(mgEV25),  n4(avgSubSpins), n4(mgEV25  * avgSubSpins)]);
  push(['Extra Bet',   n4(ebEV25),  n4(avgSubSpins), n4(ebEV25  * avgSubSpins)]);
  push(['Buy FG',      n4(buyEV57), n4(avgSubSpins), n4(buyEV57 * avgSubSpins)]);
  push([]);

  // ── G. 各模式完整 RTP 估算
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['G. 各模式完整 RTP 估算（解析式組合，與蒙地卡羅誤差 ±3pp）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const mg_baseEV    = mgEV25 * K;
  const mg_phaseA_EV = mgEV25 * avgSubSpins;
  const mg_FG_EV     = CONFIG.fgTriggerProb * CONFIG.entryTossMain * cumFGEV;
  const mg_FG_phaseA = CONFIG.fgTriggerProb * mg_phaseA_EV;
  const mg_total_EV  = mg_baseEV * (1 - CONFIG.fgTriggerProb) + mg_FG_phaseA + mg_FG_EV;
  const mg_RTP       = mg_total_EV / 1;  // wagered=1

  const eb_baseEV    = ebEV25 * K;
  const eb_FG_EV     = CONFIG.fgTriggerProb * CONFIG.entryTossMain * fgChainEV(CONFIG.weights.freeGame, CONFIG.scales.EB_PAYOUT_SCALE);
  const eb_phaseA    = CONFIG.fgTriggerProb * ebEV25 * avgSubSpins;
  const eb_total_EV  = eb_baseEV * (1 - CONFIG.fgTriggerProb) + eb_phaseA + eb_FG_EV;
  const eb_RTP       = eb_total_EV / CONFIG.extraBetMult;

  const buy_phaseA   = buyEV57 * avgSubSpins;
  const buy_chain    = buyFGChain;
  const buy_total_EV = (buy_phaseA + buy_chain) * CONFIG.scales.BUY_FG_PAYOUT_SCALE;
  const buy_RTP      = buy_total_EV / CONFIG.buyCostMult;

  const ebBuy_chain   = buyFGChain * CONFIG.scales.EB_BUY_FG_PAYOUT_SCALE;
  const ebBuy_phaseA  = ebEV25 * avgSubSpins * CONFIG.scales.EB_BUY_FG_PAYOUT_SCALE;
  const ebBuy_total   = ebBuy_phaseA + ebBuy_chain;
  const ebBuy_RTP     = ebBuy_total / CONFIG.buyCostMult;

  push(['模式', '費用(×bet)', 'Base EV(cascade)', 'Phase A EV', 'FG鏈 EV', '總 EV', '估算RTP', '目標RTP', '差距']);

  const gap = (v) => ((v - TARGET_RTP/100) * 100).toFixed(2) + 'pp';
  push(['Main Game',   1,   n4(mg_baseEV),  n4(mg_FG_phaseA), n4(mg_FG_EV),  n4(mg_total_EV),  pct(mg_RTP),   '97.5%', gap(mg_RTP)]);
  push(['Extra Bet',   3,   n4(eb_baseEV),  n4(eb_phaseA),    n4(eb_FG_EV),  n4(eb_total_EV),  pct(eb_RTP),   '97.5%', gap(eb_RTP)]);
  push(['Buy FG',    100,   '-',            n4(buy_phaseA),   n4(buy_chain), n4(buy_total_EV), pct(buy_RTP),  '97.5%', gap(buy_RTP)]);
  push(['EB+BuyFG',  100,   '-',            n4(ebBuy_phaseA), n4(ebBuy_chain), n4(ebBuy_total), pct(ebBuy_RTP), '97.5%', gap(ebBuy_RTP)]);
  push([]);
  push(['⚠️  解析式誤差 ±3pp（Cascade/TB 使用近似因子）。精確 RTP 請看 SIMULATION tab']);
  push([]);

  // ── H. 校準建議
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['H. 校準建議（RTP 偏低時）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['問題',                   '建議動作',                          '影響模式']);
  push(['MG RTP 偏低',           '↑ FG_TRIGGER_PROB（主槓桿）',       'Main Game（FG 貢獻最大）']);
  push(['MG RTP 偏低',           '↑ PAYTABLE_SCALE',                  'Main Game（等比縮放所有賠率）']);
  push(['EB RTP 偏低',           '↑ EB_PAYOUT_SCALE',                 'Extra Bet（獨立調整）']);
  push(['Buy FG RTP 偏低',       '↑ BUY_FG_PAYOUT_SCALE',            'Buy FG（不影響 MG）']);
  push(['所有模式 RTP 偏低',     '↑ 高賠符號(P1/P2)權重 in FG',       '所有含 FG 模式']);
  push(['FG 觸發太稀少',         '↑ FG_TRIGGER_PROB ↓ 其他 SCALE',   '維持 RTP 不變，增加 FG 頻率']);
  push(['Buy FG 大獎太少',       '↑ fgSpinBonus 高倍層權重',          'Buy FG / EB+BuyFG']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:32},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:8},{wch:10},
  ];
  return ws;
}

// ─── NEAR_MISS Tab ────────────────────────────────────────────────────────────
// 零獎與最小獎配置（BuyFG / EB+BuyFG 不允許零獎）

function buildNearMissSheet() {
  const rows = [];
  const push = (row) => rows.push(row);
  const pct = (v) => (v * 100).toFixed(3) + '%';

  push(['NEAR_MISS — 零獎（近失）與最小獎配置']);
  push(['說明：near miss 是 RTP 設計的重要組成部分，決定底端體感。']);
  push(['  Main / Extra Bet：可以零獎（自然形成），近失 = 不中任何連線']);
  push(['  Buy FG / EB+BuyFG：無零獎，近失 = 最小保底獎（BUY_FG_MIN_WIN_MULT × bet）']);
  push([]);

  // ── Main Game 零獎分析
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['1. Main Game — 零獎（無中任何連線）機率估算']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  // P(zero win single payline) = 1 - P(any win single payline)
  // P(zero win overall) ≈ P(no payline wins) ≈ (1 - mean_payline_hit_rate)^25
  const mgW = CONFIG.weights.mainGame;
  let mgTotalSingleLineHR = 0;
  for (const sym of PAY_SYMS) {
    for (const count of [3, 4, 5]) {
      mgTotalSingleLineHR += paylineHitRate(mgW, sym, count);
    }
  }
  // Approx P(zero win) — independent paylines assumption
  const mgZeroWin = Math.pow(1 - mgTotalSingleLineHR, 25);
  push([`各線平均中獎率（one payline, any win）= ${pct(mgTotalSingleLineHR)}`]);
  push([`估算零獎率（25線獨立近似）= (1 - P_single)^25 ≈ ${pct(mgZeroWin)}`]);
  push(['注意：此為粗估（payline 間有重疊格，實際零獎率略高）']);
  push(['精確零獎率請查看 SIMULATION tab 的 hitRate 欄（1 - hitRate = 零獎率）']);
  push([]);
  push(['Main Game 零獎時的玩家體感：每約 3 轉出現 1 次零獎（視 cascade 效果）']);
  push(['若零獎率過高（>80%）→ 增加 Wild / Premium 符號權重']);
  push([]);

  // ── Extra Bet 零獎分析
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['2. Extra Bet — 零獎機率（SC 保證修正）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const ebW = CONFIG.weights.extraBet;
  let ebTotalLineHR = 0;
  for (const sym of PAY_SYMS) {
    for (const count of [3, 4, 5]) {
      ebTotalLineHR += paylineHitRate(ebW, sym, count);
    }
  }
  const ebZeroWin = Math.pow(1 - ebTotalLineHR, 25);
  push([`Extra Bet 各線平均中獎率 = ${pct(ebTotalLineHR)}`]);
  push([`估算零獎率（未考慮 SC 保證）≈ ${pct(ebZeroWin)}`]);
  push(['SC 保證效果：每轉可見 3 列必有 1 個 SC → 增加 cascade 觸發機會 → 零獎率降低']);
  push(['Extra Bet 零獎率約比 Main Game 低 5-10pp（SC 帶來的 TB 機會）']);
  push([]);

  // ── Buy FG 最小獎配置
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['3. Buy FG — 無零獎保底配置（near miss = 最小獎）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);

  const minWin = CONFIG.buyFGMinWinMult;  // × bet
  const buyCost = CONFIG.buyCostMult;      // × bet
  push([`Buy FG 費用 = ${buyCost}× bet`]);
  push([`最小保底獎 = BUY_FG_MIN_WIN_MULT × bet = ${minWin}× bet`]);
  push([`最小獎佔費用比 = ${minWin}/${buyCost} = ${(minWin/buyCost*100).toFixed(1)}%`]);
  push([]);
  push(['保底機制說明：']);
  push(['  ① Phase A 5個 sub-spin 累積基礎贏分（保證每 sub-spin 有獎，retry 50次）']);
  push(['  ② FG Loop 5個保證贏分 spin × 對應倍率 × SpinBonus']);
  push(['  ③ totalWin = totalRawWin × BUY_FG_PAYOUT_SCALE']);
  push([`  ④ IF totalWin < ${minWin}× bet → totalWin = ${minWin}× bet（地板保底）`]);
  push([]);
  push([`  目標：P(totalWin < ${minWin}) 應在 5-15% 範圍（近失率）`]);
  push([`        低於 5% → 最小獎設太高（影響 RTP 分配）`]);
  push([`        高於 20% → 最小獎設太低（玩家觀感不佳）`]);
  push([]);

  // 最小獎對 RTP 的貢獻
  // Buy FG RTP 組成：
  //   winning_spins_EV + P(floor) × min_win_contribution
  const bonusEV      = spinBonusEV();
  const buyFGbaseEV  = singleSpinEV(CONFIG.weights.buyFG, CONFIG.scales.BUY_FG_PAYOUT_SCALE, 57);
  const hitRate      = 0.28; // empirical
  const guaranteedEV = buyFGbaseEV / hitRate;
  const chain5EV     = CONFIG.fgMultipliers.reduce((s, m) => s + m * guaranteedEV * bonusEV, 0);
  const phaseAEV     = buyFGbaseEV * CONFIG.phaseASpins;
  const totalExpectedEV = (phaseAEV + chain5EV) * CONFIG.scales.BUY_FG_PAYOUT_SCALE;

  push(['Buy FG 期望值組成（解析估算）：']);
  push([`  Phase A EV = ${(phaseAEV * CONFIG.scales.BUY_FG_PAYOUT_SCALE).toFixed(4)}`]);
  push([`  5-spin FG chain EV = ${(chain5EV * CONFIG.scales.BUY_FG_PAYOUT_SCALE).toFixed(4)}`]);
  push([`  總期望值 ≈ ${totalExpectedEV.toFixed(4)} (RTP ≈ ${(totalExpectedEV/buyCost*100).toFixed(2)}%)`]);
  push([`  若 P(hit min win floor) ≈ 10%，最小獎貢獻 ≈ 0.10 × ${minWin} = ${(0.1*minWin).toFixed(1)}`]);
  push([]);

  // ── EB+BuyFG 最小獎
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['4. EB + Buy FG — 最小獎配置（同 Buy FG，SC 保證額外增益）']);
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push([`最小保底獎 = ${minWin}× bet（同 Buy FG）`]);
  push(['額外效果：Extra Bet SC 保證 → Phase A 每個 sub-spin 可見 SC → 更高 cascade 機率']);
  push([`EB_BUY_FG_PAYOUT_SCALE = ${CONFIG.scales.EB_BUY_FG_PAYOUT_SCALE}（>1.0 補償 SC 保證的原始贏分稀釋）`]);
  push([]);

  // ── 調整指引
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['5. 調整指引']);
  push(['═══════════════════════════════════════════════════════════════════════════']);
  push(['目標',               '操作',                              'tab']);
  push(['調整 MG 零獎率',     '修改 mainGame 符號權重 W/P1/P2',   'DATA']);
  push(['調整 BuyFG 近失率',  '修改 BUY_FG_MIN_WIN_MULT',         'DATA']);
  push(['調整 BuyFG 近失率',  '修改 buyFG 符號權重（低Premium）', 'DATA']);
  push(['驗證近失率',         '查看 SIMULATION tab hitRate',       'SIMULATION']);
  push(['精確 Buy FG 命中率', '看 SIMULATION tab 的 hitRate',      'SIMULATION']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:52},{wch:20},{wch:20},{wch:20}];
  return ws;
}

// ─── SIMULATION Tab ───────────────────────────────────────────────────────────

function buildSimSheet() {
  const rows = [
    ['SIMULATION Tab — 由 excel_simulator.js 自動寫入，請勿手動修改'],
    [''],
    ['執行方式：', 'node tools/slot-engine/excel_simulator.js [--spins=1000000] [--runs=5]'],
    [''],
    ['模式', '模擬轉數', 'RTP', '命中率', '最高倍數', '平均倍數(原始)', '最後更新'],
    ['Main Game',   '（未執行）', '', '', '', '', ''],
    ['Extra Bet',   '（未執行）', '', '', '', '', ''],
    ['Buy FG',      '（未執行）', '', '', '', '', ''],
    ['EB + BuyFG',  '（未執行）', '', '', '', '', ''],
    [''],
    ['目標：各模式 97.5% ± 0.5pp（97.0% – 98.0%）'],
    ['通過 → 執行 engine_generator.js → 產生 GameConfig.generated.ts'],
    [''],
    ['RTP 不達標的調整步驟：'],
    ['  1. 查看 MODE_MATH tab G 節了解哪個模式差距多少'],
    ['  2. 依 H 節校準建議修改 DATA tab 對應參數'],
    ['  3. 重跑 excel_simulator.js 驗證'],
    ['  4. 確認 NEAR_MISS tab 近失率在目標範圍'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:18},{wch:14},{wch:10},{wch:10},{wch:14},{wch:22},{wch:22}];
  return ws;
}

// ─── 主程式 ──────────────────────────────────────────────────────────────────

function main() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildDataSheet(),      'DATA');
  XLSX.utils.book_append_sheet(wb, buildModeMathSheet(),  'MODE_MATH');
  XLSX.utils.book_append_sheet(wb, buildNearMissSheet(),  'NEAR_MISS');
  XLSX.utils.book_append_sheet(wb, buildSimSheet(),       'SIMULATION');

  XLSX.writeFile(wb, OUTPUT);
  console.log(`\n✅  Thunder_Config.xlsx 建立完成（4 tabs）：${OUTPUT}`);
  console.log('');
  console.log('   DATA      → 所有可調參數（唯一編輯入口）');
  console.log('   MODE_MATH → 四模式完整解析式 RTP 估算');
  console.log('   NEAR_MISS → 零獎 / 最小獎配置說明');
  console.log('   SIMULATION → 蒙地卡羅驗證（由 excel_simulator.js 寫入）');
  console.log('');
  console.log('工作流程：');
  console.log('  1. 企劃開啟 DATA tab → 調整參數');
  console.log('  2. 查看 MODE_MATH G節 確認解析式 RTP 方向');
  console.log('  3. node tools/slot-engine/excel_simulator.js   → 精確蒙地卡羅驗證');
  console.log('  4. node tools/slot-engine/engine_generator.js  → 產生 GameConfig.generated.ts');
  console.log('  5. node tools/slot-engine/verify.js            → 最終 RTP 確認');
}

main();
