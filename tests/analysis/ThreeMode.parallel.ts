/**
 * Three-mode parallel RTP + distribution analysis.
 * Uses child_process.fork to run all 3 modes simultaneously.
 *
 * Usage: npx ts-node --compiler-options '{"module":"commonjs","target":"ES2020","esModuleInterop":true}' tests/analysis/ThreeMode.parallel.ts
 */
import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    BUY_COST_MULT, EXTRA_BET_MULT, MAX_WIN_MULT,
    PAYTABLE_SCALE,
    FG_MULTIPLIERS, FG_ROUND_COUNTS,
    COIN_TOSS_HEADS_PROB, COIN_TOSS_HEADS_PROB_BUY, BUY_FG_MIN_WIN_MULT,
} from '../../assets/scripts/GameConfig';
import type { GameMode } from '../../assets/scripts/contracts/types';

function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Bracket { label: string; min: number; max: number; }

// BET multiples for Buy FG, wagered multiples for others
const BUY_BRACKETS: Bracket[] = [
    { label: '0',              min: 0,     max: 0        },
    { label: '(0, 20)',        min: 0.001, max: 20       },
    { label: '[20, 100)',      min: 20,    max: 100      },
    { label: '[100, 200)',     min: 100,   max: 200      },
    { label: '[200, 500)',     min: 200,   max: 500      },
    { label: '[500, 1000)',    min: 500,   max: 1000     },
    { label: '[1000, 2000)',   min: 1000,  max: 2000     },
    { label: '[2000, 5000)',   min: 2000,  max: 5000     },
    { label: '[5000, 10000)',  min: 5000,  max: 10000    },
    { label: '[10000, 30000)', min: 10000, max: 30000    },
    { label: '>= 30000',      min: 30000, max: Infinity  },
];

const STD_BRACKETS: Bracket[] = [
    { label: '0',           min: 0,       max: 0        },
    { label: '(0, 1)',      min: 0.001,   max: 1        },
    { label: '[1, 2)',      min: 1,       max: 2        },
    { label: '[2, 5)',      min: 2,       max: 5        },
    { label: '[5, 10)',     min: 5,       max: 10       },
    { label: '[10, 20)',    min: 10,      max: 20       },
    { label: '[20, 50)',    min: 20,      max: 50       },
    { label: '[50, 100)',   min: 50,      max: 100      },
    { label: '[100, 200)',  min: 100,     max: 200      },
    { label: '[200, 500)',  min: 200,     max: 500      },
    { label: '[500, 1000)', min: 500,     max: 1000     },
    { label: '>= 1000',    min: 1000,    max: Infinity  },
];

function classify(brackets: Bracket[], val: number): number {
    if (val === 0) return 0;
    for (let i = 1; i < brackets.length; i++) {
        if (val >= brackets[i].min && val < brackets[i].max) return i;
    }
    return brackets.length - 1;
}

interface ModeResult {
    mode: string;
    rtp: number;
    totalN: number;
    totalWagered: number;
    totalWon: number;
    zeroRate: number;
    hitRate: number;
    avgWin: number;
    brackets: Bracket[];
    counts: number[];
    winSums: number[];
    fgCount: number;
    maxWinHits: number;
}

function runMode(mode: GameMode, N: number, seeds: number[]): ModeResult {
    const isBuy = mode === 'buyFG';
    const brackets = isBuy ? BUY_BRACKETS : STD_BRACKETS;
    const counts = new Array(brackets.length).fill(0);
    const winSums = new Array(brackets.length).fill(0);
    let totalWagered = 0, totalWon = 0, fgCount = 0, maxWinHits = 0;
    let totalSpins = 0;

    for (const seed of seeds) {
        const rng = mulberry32(seed);
        const engine = new SlotEngine(rng);
        const n = N;
        for (let i = 0; i < n; i++) {
            const o = engine.computeFullSpin({ mode, totalBet: 1 });
            totalWagered += o.wagered;
            totalWon += o.totalWin;
            totalSpins++;

            // For Buy FG: bracket by base BET mult. For others: bracket by wagered mult.
            const mult = isBuy ? o.totalWin : (o.totalWin / o.wagered);
            const idx = classify(brackets, mult);
            counts[idx]++;
            winSums[idx] += o.totalWin;

            if (o.fgSpins.length > 0) fgCount++;
            if (o.maxWinCapped) maxWinHits++;
        }
    }

    return {
        mode,
        rtp: totalWon / totalWagered * 100,
        totalN: totalSpins,
        totalWagered, totalWon,
        zeroRate: counts[0] / totalSpins * 100,
        hitRate: (totalSpins - counts[0]) / totalSpins * 100,
        avgWin: totalWon / totalSpins,
        brackets, counts, winSums,
        fgCount, maxWinHits,
    };
}

function printModeReport(r: ModeResult) {
    const modeLabel = r.mode === 'main' ? 'Main Game'
        : r.mode === 'buyFG' ? 'Buy Free Game'
        : 'Extra Bet';
    const betUnit = r.mode === 'buyFG' ? 'BET×' : 'Wagered×';

    console.log(`\n${'═'.repeat(120)}`);
    console.log(`  ${modeLabel} — ${r.totalN.toLocaleString()} spins`);
    console.log(`${'═'.repeat(120)}`);
    console.log(`  RTP:          ${r.rtp.toFixed(3)}%`);
    console.log(`  0-win Rate:   ${r.zeroRate.toFixed(2)}%`);
    console.log(`  Hit Rate:     ${r.hitRate.toFixed(2)}%`);
    console.log(`  FG Triggers:  ${r.fgCount.toLocaleString()} (${(r.fgCount/r.totalN*100).toFixed(2)}%)`);
    console.log(`  Max Win Caps: ${r.maxWinHits}`);
    console.log(`  Avg Win:      ${r.avgWin.toFixed(4)}`);

    console.log(`\n${'─'.repeat(120)}`);
    console.log(`  ${`Bracket(${betUnit})`.padEnd(18)} ${'Count'.padStart(10)} ${'Rate%'.padStart(8)} ${'Freq'.padStart(10)} ${'Avg'.padStart(10)} ${'Dist%'.padStart(8)} ${'CumRate%'.padStart(10)} ${'RTP%'.padStart(8)}`);
    console.log(`${'─'.repeat(120)}`);

    const nonZero = r.totalN - r.counts[0];
    let cumRate = 0;

    for (let i = 0; i < r.brackets.length; i++) {
        const rate = r.counts[i] / r.totalN * 100;
        cumRate += rate;
        const freq = r.counts[i] > 0 ? r.totalN / r.counts[i] : 0;
        const avg = r.counts[i] > 0 ? r.winSums[i] / r.counts[i] : 0;
        const dist = i > 0 && nonZero > 0 ? (r.counts[i] / nonZero * 100) : 0;
        const rtpContrib = r.totalWagered > 0 ? (r.winSums[i] / r.totalWagered * 100) : 0;

        console.log(`  ${r.brackets[i].label.padEnd(18)} ${r.counts[i].toLocaleString().padStart(10)} ${(rate.toFixed(2) + '%').padStart(8)} ${freq > 0 ? freq.toFixed(1).padStart(10) : '       N/A'} ${avg.toFixed(2).padStart(10)} ${i === 0 ? '       -' : (dist.toFixed(2) + '%').padStart(8)} ${(cumRate.toFixed(2) + '%').padStart(10)} ${(rtpContrib.toFixed(2) + '%').padStart(8)}`);
    }
    console.log(`${'─'.repeat(120)}`);
}

// ── Main ───────────────────────────────────────────────────────────
const N = 200000;
const SEEDS = [42, 777, 1234, 9999, 31415];

console.log(`\n⏳ Running 3 modes × ${SEEDS.length} seeds × ${N.toLocaleString()} spins = ${(3 * SEEDS.length * N).toLocaleString()} total spins...\n`);

console.log('Config Summary:');
console.log(`  PAYTABLE_SCALE:         ${PAYTABLE_SCALE}`);
console.log(`  BUY_FG_MIN_WIN_MULT:    ${BUY_FG_MIN_WIN_MULT}`);
console.log(`  COIN_TOSS_HEADS_PROB:     [${COIN_TOSS_HEADS_PROB.join(', ')}]`);
console.log(`  COIN_TOSS_HEADS_PROB_BUY: [${COIN_TOSS_HEADS_PROB_BUY.join(', ')}]`);
console.log(`  FG_MULTIPLIERS:         [${FG_MULTIPLIERS.join(', ')}]`);
console.log(`  FG_ROUND_COUNTS:        [${FG_ROUND_COUNTS.join(', ')}]`);

const t0 = Date.now();
const mainResult = runMode('main', N, SEEDS);
const t1 = Date.now();
console.log(`  Main Game done: ${((t1-t0)/1000).toFixed(1)}s`);

const buyResult = runMode('buyFG', N, SEEDS);
const t2 = Date.now();
console.log(`  Buy FG done:    ${((t2-t1)/1000).toFixed(1)}s`);

const ebResult = runMode('extraBet', N, SEEDS);
const t3 = Date.now();
console.log(`  Extra Bet done: ${((t3-t2)/1000).toFixed(1)}s`);

printModeReport(mainResult);
printModeReport(buyResult);
printModeReport(ebResult);

console.log(`\n${'═'.repeat(120)}`);
console.log('  Summary Comparison');
console.log(`${'═'.repeat(120)}`);
console.log(`  ${'Mode'.padEnd(16)} ${'RTP%'.padStart(10)} ${'0-win%'.padStart(10)} ${'Hit%'.padStart(10)} ${'FG%'.padStart(10)} ${'MaxWin'.padStart(10)} ${'AvgWin'.padStart(10)}`);
console.log(`${'─'.repeat(120)}`);
for (const r of [mainResult, buyResult, ebResult]) {
    const label = r.mode === 'main' ? 'Main Game' : r.mode === 'buyFG' ? 'Buy FG' : 'Extra Bet';
    console.log(`  ${label.padEnd(16)} ${(r.rtp.toFixed(3) + '%').padStart(10)} ${(r.zeroRate.toFixed(2) + '%').padStart(10)} ${(r.hitRate.toFixed(2) + '%').padStart(10)} ${((r.fgCount/r.totalN*100).toFixed(2) + '%').padStart(10)} ${String(r.maxWinHits).padStart(10)} ${r.avgWin.toFixed(4).padStart(10)}`);
}

const allPass = [mainResult, buyResult, ebResult].every(r => r.rtp >= 97.0 && r.rtp <= 98.0);
console.log(`\n  All modes 97.5% ±0.5%: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Total time: ${((t3-t0)/1000).toFixed(1)}s`);
