/**
 * BuyFG.distribution.ts
 * Buy Free Game 配獎分佈分析（以基礎 BET 倍數為單位）
 *
 * 用法：npx ts-node --compiler-options '{"module":"commonjs","target":"ES2020","esModuleInterop":true}' tests/analysis/BuyFG.distribution.ts [spins] [seed]
 *
 * Buy FG 花 100x BET，所以 brackets 以 BET 為單位：
 *   (0, 20) → 太少，體感差
 *   [20, 100) → 低於成本，但可接受
 *   [100, 200) → 打平到小贏，驚喜開始
 *   [200, 500) → 好贏
 *   [500, 1000) → 大贏
 *   [1000, 2000) → 巨贏
 *   [2000, 5000) → 超級
 *   [5000, 10000) → 傳說
 *   [10000, 30000] → 最大獎區間
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    BUY_COST_MULT, MAX_WIN_MULT,
    FG_MULTIPLIERS, FG_ROUND_COUNTS, COIN_TOSS_HEADS_PROB,
} from '../../assets/scripts/GameConfig';

function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Brackets (in base BET multiples) ───────────────────────────────

interface Bracket { label: string; min: number; max: number; }

const BRACKETS: Bracket[] = [
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

function classify(betMult: number): number {
    if (betMult === 0) return 0;
    for (let i = 1; i < BRACKETS.length; i++) {
        if (betMult >= BRACKETS[i].min && betMult < BRACKETS[i].max) return i;
    }
    return BRACKETS.length - 1;
}

interface BracketData {
    count: number;
    winSum: number;      // sum of betMult
    winSqSum: number;    // sum of betMult^2 (for variance)
    tierCounts: number[];  // per-tier breakdown
}

// ── Single seed run ────────────────────────────────────────────────

function runSeed(seed: number, N: number) {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);
    const stats: BracketData[] = BRACKETS.map(() => ({
        count: 0, winSum: 0, winSqSum: 0,
        tierCounts: new Array(FG_MULTIPLIERS.length).fill(0),
    }));

    let totalWagered = 0, totalWon = 0;
    let mgHits = 0;      // main game cascade hits (intro spins)
    let fgHits = 0;       // FG spins with win > 0
    let fgTotalSpins = 0;
    const tierHist = new Array(FG_MULTIPLIERS.length).fill(0);

    for (let i = 0; i < N; i++) {
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
        totalWagered += o.wagered;
        totalWon += o.totalWin;

        // Win in base BET multiples
        const betMult = o.totalWin;  // totalBet = 1, so totalWin IS the bet multiple

        const idx = classify(betMult);
        stats[idx].count++;
        stats[idx].winSum += betMult;
        stats[idx].winSqSum += betMult * betMult;

        // Track tier
        if (o.fgTier) {
            const ti = o.fgTier.tierIndex;
            tierHist[ti]++;
            stats[idx].tierCounts[ti]++;
        }

        // Count MG intro hits
        for (const bs of o.baseSpins) {
            if (bs.totalWin > 0) mgHits++;
        }

        // Count FG spin hits
        for (const fs of o.fgSpins) {
            fgTotalSpins++;
            if (fs.rawWin > 0) fgHits++;
        }
    }

    return { stats, totalWagered, totalWon, mgHits, fgHits, fgTotalSpins, tierHist, N };
}

// ── Merge results from parallel seeds ──────────────────────────────

function mergeResults(results: ReturnType<typeof runSeed>[]) {
    const merged: BracketData[] = BRACKETS.map(() => ({
        count: 0, winSum: 0, winSqSum: 0,
        tierCounts: new Array(FG_MULTIPLIERS.length).fill(0),
    }));
    let totalWagered = 0, totalWon = 0, mgHits = 0, fgHits = 0;
    let fgTotalSpins = 0, totalN = 0;
    const tierHist = new Array(FG_MULTIPLIERS.length).fill(0);

    for (const r of results) {
        totalWagered += r.totalWagered;
        totalWon += r.totalWon;
        mgHits += r.mgHits;
        fgHits += r.fgHits;
        fgTotalSpins += r.fgTotalSpins;
        totalN += r.N;
        for (let i = 0; i < BRACKETS.length; i++) {
            merged[i].count += r.stats[i].count;
            merged[i].winSum += r.stats[i].winSum;
            merged[i].winSqSum += r.stats[i].winSqSum;
            for (let t = 0; t < FG_MULTIPLIERS.length; t++) {
                merged[i].tierCounts[t] += r.stats[i].tierCounts[t];
            }
        }
        for (let t = 0; t < FG_MULTIPLIERS.length; t++) {
            tierHist[t] += r.tierHist[t];
        }
    }

    return { merged, totalWagered, totalWon, mgHits, fgHits, fgTotalSpins, tierHist, totalN };
}

// ── Print ──────────────────────────────────────────────────────────

function printReport(data: ReturnType<typeof mergeResults>) {
    const { merged, totalWagered, totalWon, mgHits, fgHits, fgTotalSpins, tierHist, totalN } = data;

    console.log('\n' + '═'.repeat(130));
    console.log(`  Buy Free Game Distribution — ${totalN.toLocaleString()} spins (base BET multiples)`);
    console.log('═'.repeat(130));
    console.log(`  RTP:               ${(totalWon / totalWagered * 100).toFixed(3)}%`);
    console.log(`  Cost:              ${BUY_COST_MULT}× BET per spin`);
    console.log(`  Avg Win/Spin:      ${(totalWon / totalN).toFixed(2)}× BET`);
    console.log(`  Avg Win/Wagered:   ${(totalWon / totalWagered).toFixed(4)}×`);
    console.log(`  MG Hit Rate:       ${(mgHits / totalN * 100).toFixed(2)}% (intro cascade)`);
    console.log(`  FG Spin Hit Rate:  ${(fgHits / fgTotalSpins * 100).toFixed(2)}% (${fgHits}/${fgTotalSpins})`);
    console.log(`  FG Avg Spins/Buy:  ${(fgTotalSpins / totalN).toFixed(2)}`);

    // Tier distribution
    console.log('\n  Tier Distribution:');
    for (let t = 0; t < FG_MULTIPLIERS.length; t++) {
        const pct = (tierHist[t] / totalN * 100).toFixed(2);
        console.log(`    Tier ${t} (×${FG_MULTIPLIERS[t]}, ${FG_ROUND_COUNTS[t]} rounds): ${tierHist[t].toLocaleString().padStart(10)} (${pct}%)`);
    }

    // Win distribution table
    console.log('\n' + '─'.repeat(130));
    const hdr = [
        'Bracket(BET×)'.padEnd(16),
        'Count'.padStart(10),
        'Rate%'.padStart(8),
        'Freq'.padStart(10),
        'AvgBET×'.padStart(10),
        'Dist%'.padStart(8),
        'CumRate%'.padStart(10),
        'CumDist%'.padStart(10),
        'RTP%'.padStart(8),
        'Variance'.padStart(10),
    ].join(' ');
    console.log(hdr);
    console.log('─'.repeat(130));

    const nonZero = totalN - merged[0].count;
    let cumRate = 0, cumDist = 0;

    for (let i = 0; i < BRACKETS.length; i++) {
        const s = merged[i];
        const rate = s.count / totalN * 100;
        cumRate += rate;
        const dist = i > 0 && nonZero > 0 ? (s.count / nonZero * 100) : 0;
        cumDist += dist;
        const avg = s.count > 0 ? s.winSum / s.count : 0;
        const freq = s.count > 0 ? totalN / s.count : 0;
        const rtpContrib = totalWagered > 0 ? (s.winSum / totalWagered * 100) : 0;

        // Variance
        const mean = s.count > 0 ? s.winSum / s.count : 0;
        const variance = s.count > 1
            ? (s.winSqSum / s.count - mean * mean)
            : 0;

        const row = [
            BRACKETS[i].label.padEnd(16),
            s.count.toLocaleString().padStart(10),
            rate.toFixed(2).padStart(7) + '%',
            freq > 0 ? freq.toFixed(2).padStart(10) : '      N/A ',
            avg.toFixed(2).padStart(10),
            i === 0 ? '       -' : (dist.toFixed(2) + '%').padStart(8),
            cumRate.toFixed(2).padStart(9) + '%',
            i === 0 ? '         -' : (cumDist.toFixed(2) + '%').padStart(10),
            rtpContrib.toFixed(2).padStart(7) + '%',
            variance > 0 ? variance.toFixed(2).padStart(10) : '      0.00',
        ].join(' ');
        console.log(row);
    }
    console.log('─'.repeat(130));

    // Warnings
    console.log('\n  體感分析：');
    const below20 = merged[0].count + merged[1].count;
    const below20pct = below20 / totalN * 100;
    console.log(`    < 20× BET: ${below20.toLocaleString()} (${below20pct.toFixed(2)}%) ${below20pct > 5 ? '⚠ 偏高' : '✓ OK'}`);

    const above100 = merged.slice(3).reduce((a, b) => a + b.count, 0);
    console.log(`    > 100× BET: ${above100.toLocaleString()} (${(above100/totalN*100).toFixed(2)}%) — 驚喜區間`);

    const above1000 = merged.slice(6).reduce((a, b) => a + b.count, 0);
    console.log(`    > 1000× BET: ${above1000.toLocaleString()} (${(above1000/totalN*100).toFixed(2)}%) — 大獎區間`);

    const above10000 = merged.slice(9).reduce((a, b) => a + b.count, 0);
    console.log(`    > 10000× BET: ${above10000.toLocaleString()} (${(above10000/totalN*100).toFixed(2)}%) — MAX WIN 區間`);
}

// ── Also run Main Game FG comparison ───────────────────────────────

function runMainGameFG(seed: number, N: number) {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);
    const counts: number[] = new Array(BRACKETS.length).fill(0);
    let fgCount = 0;

    for (let i = 0; i < N; i++) {
        const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
        if (o.fgSpins.length > 0) {
            fgCount++;
            const betMult = o.totalWin;
            counts[classify(betMult)]++;
        }
    }
    return { counts, fgCount, N };
}

// ── Main ───────────────────────────────────────────────────────────

const N = parseInt(process.argv[2] || '200000', 10);
const SEEDS = [42, 777, 1234, 9999, 31415];

console.log(`Running ${SEEDS.length} seeds × ${N.toLocaleString()} spins each (total: ${(SEEDS.length * N).toLocaleString()})...`);

// Run Buy FG analysis
const buyResults = SEEDS.map(s => runSeed(s, N));
const buyMerged = mergeResults(buyResults);
printReport(buyMerged);

// Run Main Game FG comparison (smaller sample — just FG triggers)
console.log('\n\n  Main Game FG 對照（only FG-triggered spins）:');
console.log('─'.repeat(80));
let mgFGCounts = new Array(BRACKETS.length).fill(0);
let mgFGTotal = 0, mgSpinTotal = 0;
for (const seed of SEEDS) {
    const r = runMainGameFG(seed, N);
    for (let i = 0; i < BRACKETS.length; i++) mgFGCounts[i] += r.counts[i];
    mgFGTotal += r.fgCount;
    mgSpinTotal += r.N;
}
console.log(`  Main Game FG 觸發: ${mgFGTotal.toLocaleString()} / ${mgSpinTotal.toLocaleString()} (${(mgFGTotal/mgSpinTotal*100).toFixed(2)}%)`);
for (let i = 0; i < BRACKETS.length; i++) {
    if (mgFGCounts[i] > 0) {
        console.log(`    ${BRACKETS[i].label.padEnd(16)} ${String(mgFGCounts[i]).padStart(8)} (${(mgFGCounts[i]/mgFGTotal*100).toFixed(2)}%)`);
    }
}
console.log('─'.repeat(80));

// Compare 30000x BET probability
const buy30k = buyMerged.merged[BRACKETS.length - 1].count;
const mg30k = mgFGCounts[BRACKETS.length - 1];
console.log(`\n  30000× BET 比較：`);
console.log(`    Buy FG:   ${buy30k} / ${buyMerged.totalN} = ${(buy30k / buyMerged.totalN * 100).toFixed(6)}%`);
console.log(`    Main FG:  ${mg30k} / ${mgFGTotal} = ${mgFGTotal > 0 ? (mg30k / mgFGTotal * 100).toFixed(6) : 0}%`);
