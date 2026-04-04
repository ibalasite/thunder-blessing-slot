/**
 * WinDistribution.analysis.ts
 * 配獎分佈分析框架
 *
 * 用法：npx ts-node --compiler-options '{"module":"commonjs","target":"ES2020","esModuleInterop":true}' tests/analysis/WinDistribution.analysis.ts
 *
 * 產出：對照 GDD 配獎分佈表的完整統計報告
 *   - 各 bracket 出現次數、出現比率、累計分佈
 *   - MG / FG / BG 各情境命中率
 *   - 平均倍數、RTP 貢獻
 *   - 0獎比例分析
 *
 * 調機率策略：
 *   1. 先跑分析，觀察各 bracket 出現比例
 *   2. 調整觸發比例（FG_TRIGGER_PROB、cascade 展開率、TB_SECOND_HIT_PROB）
 *   3. 用 0獎比例來收斂 RTP（目標 60-70% 0獎，97.5% RTP）
 *   4. 不用 PAYTABLE_SCALE 等全域乘數
 */

import { SlotEngine, createEngine, calcWinAmount, WinLine } from '../../assets/scripts/SlotEngine';
import {
    GameMode, FullSpinOutcome,
} from '../../assets/scripts/contracts/types';
import {
    PAYTABLE_SCALE,
    FG_TRIGGER_PROB, BUY_COST_MULT, EXTRA_BET_MULT,
    FG_MULTIPLIERS, FG_ROUND_COUNTS, COIN_TOSS_HEADS_PROB,
    MAX_WIN_MULT,
} from '../../assets/scripts/GameConfig';

// ── Win Distribution Brackets (per GDD math sheet) ─────────────────

interface Bracket {
    label: string;
    min: number;   // inclusive, in multiples of bet
    max: number;   // exclusive, Infinity for last bracket
}

const BRACKETS: Bracket[] = [
    { label: '0',            min: 0,    max: 0      },  // exact zero
    { label: '(0, 1)',       min: 0.001, max: 1     },  // win > 0, win < 1×bet
    { label: '[1, 2)',       min: 1,    max: 2      },
    { label: '[2, 5)',       min: 2,    max: 5      },
    { label: '[5, 10)',      min: 5,    max: 10     },
    { label: '[10, 20)',     min: 10,   max: 20     },
    { label: '[20, 50)',     min: 20,   max: 50     },
    { label: '[50, 100)',    min: 50,   max: 100    },
    { label: '[100, 200)',   min: 100,  max: 200    },
    { label: '[200, 500)',   min: 200,  max: 500    },
    { label: '[500, 1000)',  min: 500,  max: 1000   },
    { label: '[1000, 2000)', min: 1000, max: 2000   },
    { label: '[2000, 5000)', min: 2000, max: 5000   },
    { label: '>= 5000',     min: 5000, max: Infinity},
];

function classifyWin(winMult: number): number {
    if (winMult === 0) return 0;
    for (let i = 1; i < BRACKETS.length; i++) {
        const b = BRACKETS[i];
        if (winMult >= b.min && winMult < b.max) return i;
    }
    return BRACKETS.length - 1;
}

// ── Per-bracket stats ──────────────────────────────────────────────

interface BracketStats {
    count: number;
    mgCount: number;        // Main Game only (no FG)
    fgCount: number;        // Spins that triggered FG
    totalWinSum: number;    // sum of win amounts in this bracket
}

interface DistributionReport {
    mode: string;
    totalSpins: number;
    totalWagered: number;
    totalWon: number;
    rtp: number;
    gameHitRate: number;        // % of spins with win > 0
    avgPayoutPerWin: number;    // average payout per winning spin (in bet multiples)
    avgWinPerSpin: number;      // average payout per spin (in bet multiples)
    fgHitRate: number;          // % of spins that entered FG
    fgAvgPayout: number;        // average FG payout (in bet multiples)
    zeroWinRate: number;        // % of spins with 0 win
    brackets: {
        label: string;
        count: number;
        rate: string;           // percentage of total spins
        mgCount: number;
        fgCount: number;
        avgPayout: string;      // average payout in bet multiples
        distPct: string;        // distribution % (of non-zero wins)
        cumDistPct: string;     // cumulative distribution %
        rtpContrib: string;     // RTP contribution from this bracket
    }[];
}

// ── Seeded RNG ─────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Simulation ─────────────────────────────────────────────────────

function runAnalysis(
    mode: GameMode,
    totalSpins: number,
    seed: number,
): DistributionReport {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);
    const totalBet = 1;  // normalize to 1 for bet-multiple analysis

    const stats: BracketStats[] = BRACKETS.map(() => ({
        count: 0, mgCount: 0, fgCount: 0, totalWinSum: 0,
    }));

    let totalWagered = 0;
    let totalWon = 0;
    let fgTriggerCount = 0;
    let winningSpins = 0;

    for (let i = 0; i < totalSpins; i++) {
        const outcome = engine.computeFullSpin({ mode, totalBet });
        const wagered = outcome.wagered;
        const win = outcome.totalWin;
        totalWagered += wagered;
        totalWon += win;

        const winMult = win / wagered; // win as multiple of wagered
        const bracketIdx = classifyWin(winMult);
        stats[bracketIdx].count++;
        stats[bracketIdx].totalWinSum += winMult;

        const hadFG = outcome.fgSpins.length > 0;
        if (hadFG) {
            stats[bracketIdx].fgCount++;
            fgTriggerCount++;
        } else {
            stats[bracketIdx].mgCount++;
        }

        if (win > 0) winningSpins++;
    }

    // Build report
    const nonZeroTotal = totalSpins - stats[0].count;
    let cumDist = 0;

    const brackets = BRACKETS.map((b, idx) => {
        const s = stats[idx];
        const rate = (s.count / totalSpins * 100);
        const avg = s.count > 0 ? s.totalWinSum / s.count : 0;
        const distPct = idx > 0 && nonZeroTotal > 0
            ? (s.count / nonZeroTotal * 100) : 0;
        cumDist += distPct;
        const rtpContrib = s.totalWinSum / totalSpins * 100; // as % of wagered

        return {
            label:      b.label,
            count:      s.count,
            rate:       rate.toFixed(2) + '%',
            mgCount:    s.mgCount,
            fgCount:    s.fgCount,
            avgPayout:  avg.toFixed(2),
            distPct:    idx === 0 ? '-' : distPct.toFixed(2) + '%',
            cumDistPct: idx === 0 ? '-' : cumDist.toFixed(2) + '%',
            rtpContrib: rtpContrib.toFixed(2) + '%',
        };
    });

    return {
        mode: mode === 'main' ? 'Main Game' : mode === 'buyFG' ? 'Buy Free Game' : 'Extra Bet',
        totalSpins,
        totalWagered,
        totalWon,
        rtp:              totalWon / totalWagered * 100,
        gameHitRate:      winningSpins / totalSpins * 100,
        avgPayoutPerWin:  winningSpins > 0 ? totalWon / winningSpins / (totalWagered / totalSpins) : 0,
        avgWinPerSpin:    totalWon / totalSpins / (totalWagered / totalSpins),
        fgHitRate:        fgTriggerCount / totalSpins * 100,
        fgAvgPayout:      0, // filled below
        zeroWinRate:      stats[0].count / totalSpins * 100,
        brackets,
    };
}

// ── Pretty Print ───────────────────────────────────────────────────

function printReport(r: DistributionReport): void {
    console.log('\n' + '═'.repeat(90));
    console.log(`  ${r.mode} — ${r.totalSpins.toLocaleString()} spins`);
    console.log('═'.repeat(90));
    console.log(`  RTP:              ${r.rtp.toFixed(3)}%`);
    console.log(`  Game Hit Rate:    ${r.gameHitRate.toFixed(2)}%`);
    console.log(`  0-Win Rate:       ${r.zeroWinRate.toFixed(2)}%`);
    console.log(`  FG Trigger Rate:  ${r.fgHitRate.toFixed(2)}%`);
    console.log(`  Avg Payout/Win:   ${r.avgPayoutPerWin.toFixed(2)}×`);
    console.log(`  Avg Win/Spin:     ${r.avgWinPerSpin.toFixed(4)}×`);
    console.log('─'.repeat(90));

    const hdr = [
        'Bracket'.padEnd(16),
        'Count'.padStart(10),
        'Rate'.padStart(8),
        'MG'.padStart(8),
        'FG'.padStart(8),
        'AvgMult'.padStart(10),
        'Dist%'.padStart(8),
        'CumDist%'.padStart(10),
        'RTP%'.padStart(8),
    ].join(' ');
    console.log(hdr);
    console.log('─'.repeat(90));

    for (const b of r.brackets) {
        const row = [
            b.label.padEnd(16),
            String(b.count).padStart(10),
            b.rate.padStart(8),
            String(b.mgCount).padStart(8),
            String(b.fgCount).padStart(8),
            b.avgPayout.padStart(10),
            b.distPct.padStart(8),
            b.cumDistPct.padStart(10),
            b.rtpContrib.padStart(8),
        ].join(' ');
        console.log(row);
    }
    console.log('─'.repeat(90));
}

// ── Current Config Summary ─────────────────────────────────────────

function printConfigSummary(): void {
    console.log('\n' + '═'.repeat(90));
    console.log('  Current Probability Config');
    console.log('═'.repeat(90));
    console.log(`  PAYTABLE_SCALE:       ${PAYTABLE_SCALE}`);
    console.log(`  FG_TRIGGER_PROB:      ${FG_TRIGGER_PROB} (${(FG_TRIGGER_PROB * 100).toFixed(0)}%)`);
    console.log(`  COIN_TOSS_HEADS_PROB: [${COIN_TOSS_HEADS_PROB.join(', ')}]`);
    console.log(`  FG_MULTIPLIERS:       [${FG_MULTIPLIERS.join(', ')}]`);
    console.log(`  FG_ROUND_COUNTS:      [${FG_ROUND_COUNTS.join(', ')}]`);
    console.log(`  MAX_WIN_MULT:         ${MAX_WIN_MULT}`);
    console.log(`  BUY_COST_MULT:        ${BUY_COST_MULT}`);
    console.log(`  EXTRA_BET_MULT:       ${EXTRA_BET_MULT}`);
    console.log('─'.repeat(90));
}

// ── Tuning Recommendations ─────────────────────────────────────────

function printTuningAdvice(reports: DistributionReport[]): void {
    console.log('\n' + '═'.repeat(90));
    console.log('  Tuning Recommendations（調機率建議）');
    console.log('═'.repeat(90));

    for (const r of reports) {
        const zeroRate = r.zeroWinRate;
        console.log(`\n  [${r.mode}]`);
        console.log(`    0獎比例: ${zeroRate.toFixed(2)}%`);

        if (zeroRate > 70) {
            console.log(`    ⚠ 0獎比例偏高 (>70%)，體感不佳。建議：`);
            console.log(`      - 降低 FG_TRIGGER_PROB 門檻（增加有獎 spin 次數）`);
            console.log(`      - 或調整低倍 bracket 的命中率`);
        } else if (zeroRate < 55) {
            console.log(`    ⚠ 0獎比例偏低 (<55%)，可能造成 RTP 偏高。建議：`);
            console.log(`      - 提高 0獎比例至 60-70% 範圍`);
        } else {
            console.log(`    ✓ 0獎比例在合理範圍 (55-70%)`);
        }

        const currentRtp = r.rtp;
        const targetRtp = 97.5;
        const diff = currentRtp - targetRtp;
        if (Math.abs(diff) > 0.5) {
            console.log(`    RTP 偏差: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}%`);
            if (diff > 0) {
                console.log(`    建議：增加 0獎比例 或 降低高倍 bracket 觸發率`);
            } else {
                console.log(`    建議：減少 0獎比例 或 提高中倍 bracket 觸發率`);
            }
        } else {
            console.log(`    ✓ RTP ${currentRtp.toFixed(2)}% 在目標 ±0.5% 範圍內`);
        }
    }

    console.log('\n' + '─'.repeat(90));
    console.log('  調機率流程：');
    console.log('    1. 觀察上方各 bracket 的 Dist% → 這是「有獎分佈」的 100%');
    console.log('    2. 用 0獎比例 控制 RTP（目標 60-70% 0獎 → 97.5% RTP）');
    console.log('    3. 如果要提高 RTP：減少 0獎比例（更多 spin 有獎）');
    console.log('    4. 如果要降低 RTP：增加 0獎比例（更多 spin 無獎）');
    console.log('    5. 調整手段：FG_TRIGGER_PROB、cascade 展開機率、符號權重');
    console.log('    6. 不建議用全域 SCALE 乘數（影響所有 bracket 比例）');
    console.log('═'.repeat(90));
}

// ── Main ───────────────────────────────────────────────────────────

const N = parseInt(process.argv[2] || '500000', 10);
const SEED = parseInt(process.argv[3] || '42', 10);

printConfigSummary();

const modes: GameMode[] = ['main', 'buyFG', 'extraBet'];
const reports: DistributionReport[] = [];

for (const mode of modes) {
    const report = runAnalysis(mode, N, SEED);
    reports.push(report);
    printReport(report);
}

printTuningAdvice(reports);

console.log(`\nDone. ${(N * 3).toLocaleString()} total spins analyzed.`);
