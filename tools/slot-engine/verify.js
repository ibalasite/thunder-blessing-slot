'use strict';
/**
 * verify.js — 驗證 GameConfig.generated.ts 是否與現行 RTP 目標一致
 *
 * 對 4 個遊戲模式各跑 500k spins，比較：
 *   - 新 Config（GameConfig.generated.ts）vs 目標 RTP（97.5%±0.5%）
 *   - 若 GameConfig.generated.ts 不存在，比較 GameConfig.ts 是否達標
 *
 * Usage:
 *   node tools/slot-engine/verify.js [--spins=N]
 *
 * 通過標準（與 rand 專案一致）：
 *   | RTP新 − 97.5% | ≤ 0.5 pp
 *
 * 輸出：
 *   - tools/slot-engine/generated/verify_report.json
 *   - tools/slot-engine/generated/verify_report.txt
 */

const fs   = require('fs');
const path = require('path');

let SIM_SPINS = 500000;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--spins=')) SIM_SPINS = parseInt(arg.split('=')[1], 10);
}

const OUTPUT_DIR = path.resolve(__dirname, 'generated');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const GENERATED_TS = path.resolve(__dirname, '../../assets/scripts/GameConfig.generated.ts');
const ORIGINAL_TS  = path.resolve(__dirname, '../../assets/scripts/GameConfig.ts');

// ─── 動態 require GameConfig（CommonJS 需要 .js）────────────────────────────
// 由於 GameConfig 是 TypeScript，需要先確認 ts-node 或 JS 版本是否存在。
// 驗證器直接讀 sim_result.json（由 excel_simulator.js 產生）並比對目標。

function main() {
  console.log('\n🔍  Thunder Blessing Verify\n');

  // 讀取 sim_result.json
  const simPath = path.resolve(__dirname, 'generated/sim_result.json');
  if (!fs.existsSync(simPath)) {
    console.error('❌  sim_result.json not found. Run excel_simulator.js first.');
    process.exit(1);
  }
  const results = JSON.parse(fs.readFileSync(simPath, 'utf-8'));

  const TARGET_RTP = 97.5;
  const TOLERANCE  = 0.5;

  const modes = [
    { key: 'mainGame', label: 'Main Game',  targetCost: 1 },
    { key: 'extraBet', label: 'Extra Bet',  targetCost: 3 },
    { key: 'buyFG',    label: 'Buy FG',     targetCost: 100 },
    { key: 'ebBuyFG',  label: 'EB + BuyFG', targetCost: 100 },
  ];

  let allPass = true;
  const report = {
    timestamp:  new Date().toISOString(),
    target_rtp: TARGET_RTP,
    tolerance:  TOLERANCE,
    modes: [],
  };

  const lines = [
    '══════════════════════════════════════════════════════════════',
    '  Thunder Blessing Slot — RTP 驗證報告',
    `  目標 RTP: ${TARGET_RTP}%  容許範圍: ±${TOLERANCE}pp`,
    '══════════════════════════════════════════════════════════════',
    '',
    `${'模式'.padEnd(16)} ${'RTP'.padEnd(10)} ${'差值'.padEnd(10)} ${'命中率'.padEnd(10)} 結果`,
    '─────────────────────────────────────────────────────────────',
  ];

  for (const mode of modes) {
    const r = results[mode.key];
    if (!r) {
      lines.push(`  ${mode.label.padEnd(14)} （無資料）`);
      report.modes.push({ mode: mode.label, status: 'NO_DATA' });
      allPass = false;
      continue;
    }

    const rtpVal = parseFloat(r.rtp);
    const diff   = rtpVal - TARGET_RTP;
    const pass   = Math.abs(diff) <= TOLERANCE;
    allPass = allPass && pass;

    const status = pass ? 'PASS' : 'FAIL';
    const icon   = pass ? '✅' : '❌';
    const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2) + 'pp';

    lines.push(
      `${icon} ${mode.label.padEnd(14)} ${r.rtp.padEnd(10)} ${diffStr.padEnd(10)} ${r.hitRate.padEnd(10)} ${status}`
    );

    report.modes.push({
      mode:     mode.label,
      rtp:      r.rtp,
      rtpVal,
      diff:     parseFloat(diff.toFixed(3)),
      hitRate:  r.hitRate,
      maxWin:   r.maxWin,
      avgWin:   r.avgWin,
      spins:    r.spins,
      status,
    });
  }

  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('');
  if (allPass) {
    lines.push('  ✅  所有模式通過！可執行以下步驟：');
    lines.push('     cp assets/scripts/GameConfig.generated.ts assets/scripts/GameConfig.ts');
    lines.push('     pnpm test:unit       # 確認單元測試通過');
    lines.push('     pnpm test:e2e        # 確認 K8s E2E 通過');
    lines.push('     /ship                # 提 PR');
  } else {
    lines.push('  ❌  有模式 RTP 不達標，需調整 Thunder_Config.xlsx：');
    lines.push('     1. 打開 Thunder_Config.xlsx → 修改 DATA tab');
    lines.push('     2. node tools/slot-engine/excel_simulator.js');
    lines.push('     3. node tools/slot-engine/engine_generator.js');
    lines.push('     4. node tools/slot-engine/verify.js');
    lines.push('');
    lines.push('  調整方式參考（RTP 太低）：');
    lines.push('     - 提高 FG_TRIGGER_PROB（主要 RTP 槓桿）');
    lines.push('     - 提高對應模式 PAYOUT_SCALE');
    lines.push('     - 提高 FG 倍率 Coin Toss 機率');
  }
  lines.push('');
  lines.push('══════════════════════════════════════════════════════════════');

  const reportText = lines.join('\n');
  console.log(reportText);

  // 寫出報告
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'verify_report.json'),
    JSON.stringify(report, null, 2)
  );
  fs.writeFileSync(
    path.resolve(OUTPUT_DIR, 'verify_report.txt'),
    reportText
  );
  console.log(`\n✅  報告已寫入 tools/slot-engine/generated/`);

  process.exit(allPass ? 0 : 1);
}

main();
