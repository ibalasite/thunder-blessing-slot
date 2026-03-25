/**
 * ModeRTPReport.test.ts
 *
 * 每個 MODE 獨立 RTP 模擬報表（多種子聚合版）
 *
 * 本遊戲具有極高波動率（max win 30,000x），單一種子 500k 樣本的 RTP
 * 誤差可達 ±3%。為獲得穩定結果，每個 MODE 使用多種子聚合：
 *   - 10 seeds × N spins = 總計 10N 樣本
 *   - 所有 bucket 跨種子累計
 *
 * 倍數 = totalWin / totalBet（基礎押注），所有 MODE 最大 30,000x
 *
 * @jest-environment node
 */

import { SlotEngine } from '../../assets/scripts/SlotEngine';
import type { FullSpinOutcome, GameMode } from '../../assets/scripts/contracts/types';
import {
    FG_MULTIPLIERS, BUY_COST_MULT, EXTRA_BET_MULT,
    BUY_FG_PAYOUT_SCALE, EB_PAYOUT_SCALE, MAX_WIN_MULT,
} from '../../assets/scripts/GameConfig';

jest.setTimeout(1_200_000);

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEEDS = [42, 123, 456, 789, 1001, 2022, 3033, 4044, 5055, 6066];

// ── Win multiplier ranges (based on totalBet, max 30,000x) ──────
const RANGES: { label: string; lo: number; hi: number }[] = [
    { label: '0',             lo: 0,    hi: 0 },
    { label: '(0, 1)',        lo: 0,    hi: 1 },
    { label: '[1, 2)',        lo: 1,    hi: 2 },
    { label: '[2, 5)',        lo: 2,    hi: 5 },
    { label: '[5, 10)',       lo: 5,    hi: 10 },
    { label: '[10, 20)',      lo: 10,   hi: 20 },
    { label: '[20, 50)',      lo: 20,   hi: 50 },
    { label: '[50, 100)',     lo: 50,   hi: 100 },
    { label: '[100, 200)',    lo: 100,  hi: 200 },
    { label: '[200, 500)',    lo: 200,  hi: 500 },
    { label: '[500, 1000)',   lo: 500,  hi: 1000 },
    { label: '[1000, 2000)',  lo: 1000, hi: 2000 },
    { label: '[2000, 5000)',  lo: 2000, hi: 5000 },
    { label: '[5000, 10000)', lo: 5000, hi: 10000 },
    { label: '[10000, 20000)', lo: 10000, hi: 20000 },
    { label: '[20000, 30000)', lo: 20000, hi: 30000 },
    { label: '>= 30000',     lo: 30000, hi: Infinity },
];

function classifyMult(m: number): number {
    if (m === 0) return 0;
    if (m > 0 && m < 1) return 1;
    for (let i = 2; i < RANGES.length; i++) {
        if (i === RANGES.length - 1) return i;
        if (m >= RANGES[i].lo && m < RANGES[i].hi) return i;
    }
    return RANGES.length - 1;
}

interface RangeBucket {
    count:     number;
    fgCount:   number;
    sumMult:   number;
    sumPayout: number;
}

function emptyBuckets(): RangeBucket[] {
    return RANGES.map(() => ({ count: 0, fgCount: 0, sumMult: 0, sumPayout: 0 }));
}

interface ModeReport {
    mode:           string;
    modeKey:        GameMode;
    N:              number;
    nSeeds:         number;
    totalBet:       number;
    totalWagered:   number;
    totalReturn:    number;
    rtp:            number;
    hitRate:        number;
    mgHitRate:      number;
    fgTriggerRate:  number;
    fgTriggerCount: number;
    fgAvgPayout:    number;
    fgAvgMult:      number;
    avgWinPerSpin:  number;
    avgWinPerWin:   number;
    avgCascadeSteps: number;
    scatterRate:    number;
    buckets:        RangeBucket[];
    variance:       number;
    perSeedRTPs:    number[];
}

function simulateMultiSeed(mode: GameMode, nPerSeed: number, seeds: number[]): ModeReport {
    const totalBet = 1;
    let totalWagered  = 0;
    let totalReturn   = 0;
    let hitCount      = 0;
    let mgHitCount    = 0;
    let fgTriggerCount = 0;
    let fgTotalPayout = 0;
    let fgMultSum     = 0;
    let fgMultCount   = 0;
    let totalCascadeSteps = 0;
    let scatterCount  = 0;
    const buckets     = emptyBuckets();
    const N           = nPerSeed * seeds.length;
    const perSeedRTPs: number[] = [];

    for (const seed of seeds) {
        const rng    = mulberry32(seed);
        const engine = new SlotEngine(rng);
        let seedWagered = 0;
        let seedReturn  = 0;

        for (let i = 0; i < nPerSeed; i++) {
            const o: FullSpinOutcome = engine.computeFullSpin({ mode, totalBet });
            const wagered = o.wagered;
            const win     = o.totalWin;
            const mult    = win / totalBet;

            totalWagered += wagered;
            totalReturn  += win;
            seedWagered  += wagered;
            seedReturn   += win;

            if (win > 0) hitCount++;
            if (o.baseWin > 0) mgHitCount++;

            for (const bs of o.baseSpins) {
                totalCascadeSteps += bs.cascadeSteps.length;
                if (bs.fgTriggered) scatterCount++;
            }

            if (o.fgTriggered) {
                fgTriggerCount++;
                const fgWinScaled = o.fgWin * o.modePayoutScale;
                fgTotalPayout += fgWinScaled;
                for (const fg of o.fgSpins) {
                    fgMultSum += fg.multiplier;
                    fgMultCount++;
                }
            }

            const idx = classifyMult(mult);
            buckets[idx].count++;
            buckets[idx].sumMult += mult;
            buckets[idx].sumPayout += win;
            if (o.fgTriggered && o.fgSpins.length > 0) buckets[idx].fgCount++;
        }
        perSeedRTPs.push(seedReturn / seedWagered * 100);
    }

    const rtp = totalReturn / totalWagered;

    let sumSqDev = 0;
    for (const b of buckets) {
        if (b.count === 0) continue;
        const avgM = b.sumPayout / b.count / (totalWagered / N);
        sumSqDev += b.count * (avgM - rtp) * (avgM - rtp);
    }
    const variance = sumSqDev / N;

    return {
        mode:   mode === 'main' ? 'Main Game' : mode === 'buyFG' ? 'Buy Free Game' : 'Extra Bet',
        modeKey: mode,
        N,
        nSeeds: seeds.length,
        totalBet,
        totalWagered,
        totalReturn,
        rtp,
        hitRate:         hitCount / N,
        mgHitRate:       mgHitCount / N,
        fgTriggerRate:   fgTriggerCount / N,
        fgTriggerCount,
        fgAvgPayout:     fgTriggerCount > 0 ? fgTotalPayout / fgTriggerCount : 0,
        fgAvgMult:       fgMultCount > 0 ? fgMultSum / fgMultCount : 0,
        avgWinPerSpin:   totalReturn / N,
        avgWinPerWin:    hitCount > 0 ? totalReturn / hitCount : 0,
        avgCascadeSteps: totalCascadeSteps / N,
        scatterRate:     scatterCount / N,
        buckets,
        variance,
        perSeedRTPs,
    };
}

// ── Format helpers ───────────────────────────────────────────────
const pad  = (s: string, w: number) => s.padStart(w);
const padL = (s: string, w: number) => s.padEnd(w);
const pct  = (v: number, d = 2) => (v * 100).toFixed(d) + '%';
const num  = (v: number, d = 2) => v.toFixed(d);

function printReport(r: ModeReport): void {
    const costPerSpin = r.totalWagered / r.N;
    const sep  = '═'.repeat(140);
    const line = '─'.repeat(140);

    console.log('');
    console.log(sep);
    console.log(`  MODE: ${r.mode}              Cost/Spin: ${num(costPerSpin)}x BET              循環場次: ${r.N.toLocaleString()} (${r.nSeeds} seeds × ${(r.N / r.nSeeds).toLocaleString()})`);
    console.log(sep);
    console.log(
        `  GAME 中獎率   ${pad(pct(r.hitRate), 8)}` +
        `    平均獎場每分   ${pad(num(r.avgCascadeSteps), 6)}` +
        `    平均獎場贏分   ${pad(num(r.avgWinPerWin, 2), 10)}` +
        `    循環場次   ${r.N.toLocaleString()}`);
    console.log(
        `  MG 中獎率     ${pad(pct(r.mgHitRate), 8)}` +
        `    全盤平均獎場出 ${pad(num(r.totalReturn, 2), 12)}`);
    console.log(
        `  FG 中獎率     ${pad(pct(r.fgTriggerRate), 8)}` +
        `    FG平均獎場出   ${pad(num(r.fgAvgPayout, 2), 10)}` +
        `    FG平均倍數   ${pad(num(r.fgAvgMult, 2), 8)}`);
    console.log(
        `  BG 中獎率       0.00%    BG平均獎場出         0.00    BG平均倍數       0.00`);
    console.log(
        `  JP 中獎率       0.00%    JP平均獎場出         0.00    JP平均倍數       0.00`);
    console.log(
        `  洗捕圖機率    ${pad(pct(r.scatterRate), 8)}` +
        `    平均洗分倍數   ${pad(num(r.fgTriggerCount > 0 ? r.fgAvgPayout / r.totalBet : 0, 2), 10)}` +
        `    押分/關分     ${pad(num(costPerSpin / r.rtp, 2), 6)}`);
    console.log(
        `  遊戲率(RTP)   ${pad(pct(r.rtp), 8)}` +
        `    贏分次數(10萬場) ${pad(num(r.fgTriggerCount / r.N * 100000, 0), 8)}` +
        `    平均獎場起掃 ${pad(num(r.hitRate > 0 ? 1 / r.hitRate : 0, 2), 8)}`);
    console.log('');
    console.log(`  Per-seed RTP: ${r.perSeedRTPs.map(v => v.toFixed(2) + '%').join(' | ')}`);
    const rtpMean = r.perSeedRTPs.reduce((a, b) => a + b) / r.perSeedRTPs.length;
    const rtpStd  = Math.sqrt(r.perSeedRTPs.reduce((s, v) => s + (v - rtpMean) ** 2, 0) / r.perSeedRTPs.length);
    console.log(`  RTP mean: ${rtpMean.toFixed(2)}%   std: ${rtpStd.toFixed(2)}%   95% CI: [${(rtpMean - 1.96 * rtpStd / Math.sqrt(r.nSeeds)).toFixed(2)}%, ${(rtpMean + 1.96 * rtpStd / Math.sqrt(r.nSeeds)).toFixed(2)}%]`);
    console.log(line);

    // Table header
    const hdr = [
        padL('倍數分布區間', 16),
        pad('FG出現次數', 10),
        pad('FG出現率%', 10),
        pad('BG出現次數', 10),
        pad('BG出現率%', 10),
        pad('出現次數', 10),
        pad('出現率%', 10),
        pad('出現頻率', 12),
        pad('平均倍數', 10),
        pad('富含分佈比%', 12),
        pad('累計出現頻率', 12),
        pad('累計富含分佈比%', 16),
        pad('變異數', 8),
    ];
    console.log(hdr.join('│'));
    console.log(line);

    let cumCount  = 0;
    let cumPayout = 0;
    const totalPayout  = r.buckets.reduce((s, b) => s + b.sumPayout, 0);
    const totalFGCount = r.buckets.reduce((s, b) => s + b.fgCount, 0);
    let totalVarContrib = 0;

    for (let i = 0; i < RANGES.length; i++) {
        const b    = r.buckets[i];
        const avg  = b.count > 0 ? b.sumMult / b.count : 0;
        const freq = b.count > 0 ? r.N / b.count : 0;
        const payPct = totalPayout > 0 ? b.sumPayout / totalPayout : 0;

        const avgReturn = b.count > 0 ? b.sumPayout / b.count / (r.totalWagered / r.N) : 0;
        const varContrib = b.count > 0
            ? (b.count / r.N) * (avgReturn - r.rtp) * (avgReturn - r.rtp)
            : 0;
        totalVarContrib += varContrib;

        cumCount  += b.count;
        cumPayout += b.sumPayout;

        const cumFreq   = cumCount > 0 ? r.N / cumCount : 0;
        const cumPayPct = totalPayout > 0 ? cumPayout / totalPayout : 0;
        const fgPct     = totalFGCount > 0 ? b.fgCount / totalFGCount : 0;

        const row = [
            padL(RANGES[i].label, 16),
            pad(b.fgCount.toString(), 10),
            pad(totalFGCount > 0 ? pct(fgPct) : '0.00%', 10),
            pad('0', 10),
            pad('0.00%', 10),
            pad(b.count.toString(), 10),
            pad(pct(b.count / r.N), 10),
            pad(b.count > 0 ? num(freq, 2) : '—', 12),
            pad(num(avg, 2), 10),
            pad(pct(payPct), 12),
            pad(num(cumFreq, 2), 12),
            pad(pct(cumPayPct), 16),
            pad(num(Math.sqrt(varContrib) * 100, 2), 8),
        ];
        console.log(row.join('│'));
    }

    console.log(line);

    const totalCount = r.buckets.reduce((s, b) => s + b.count, 0);
    const overallAvgMult = totalCount > 0
        ? r.buckets.reduce((s, b) => s + b.sumMult, 0) / totalCount : 0;
    const totalRow = [
        padL('Total', 16),
        pad(totalFGCount.toString(), 10),
        pad('100.00%', 10),
        pad('0', 10),
        pad('0.00%', 10),
        pad(totalCount.toString(), 10),
        pad('100.00%', 10),
        pad('', 12),
        pad(num(overallAvgMult, 2), 10),
        pad('100.00%', 12),
        pad('', 12),
        pad('', 16),
        pad(num(Math.sqrt(totalVarContrib) * 100, 2), 8),
    ];
    console.log(totalRow.join('│'));
    console.log(sep);
    console.log('');
}

// ══════════════════════════════════════════════════════════════════
// Tests — multi-seed aggregation for stable RTP estimation
// ══════════════════════════════════════════════════════════════════

const N_MAIN_PER_SEED = 200_000;
const N_BUY_PER_SEED  = 50_000;
const N_EB_PER_SEED   = 200_000;

describe('MODE 1: Main Game RTP Report', () => {
    it(`Main Game 統計報表 (${SEEDS.length} seeds × ${(N_MAIN_PER_SEED/1000)}k = ${(SEEDS.length * N_MAIN_PER_SEED / 1_000_000).toFixed(1)}M spins)`, () => {
        const r = simulateMultiSeed('main', N_MAIN_PER_SEED, SEEDS);
        printReport(r);
        expect(r.rtp).toBeGreaterThan(0.95);
        expect(r.rtp).toBeLessThan(1.00);
    });
});

describe('MODE 2: Buy Free Game RTP Report', () => {
    it(`Buy Free Game 統計報表 (${SEEDS.length} seeds × ${(N_BUY_PER_SEED/1000)}k = ${(SEEDS.length * N_BUY_PER_SEED / 1000).toFixed(0)}k sessions)`, () => {
        const r = simulateMultiSeed('buyFG', N_BUY_PER_SEED, SEEDS);
        printReport(r);
        expect(r.rtp).toBeGreaterThan(0.95);
        expect(r.rtp).toBeLessThan(1.00);
    });
});

describe('MODE 3: Extra Bet RTP Report', () => {
    it(`Extra Bet 統計報表 (${SEEDS.length} seeds × ${(N_EB_PER_SEED/1000)}k = ${(SEEDS.length * N_EB_PER_SEED / 1_000_000).toFixed(1)}M spins)`, () => {
        const r = simulateMultiSeed('extraBet', N_EB_PER_SEED, SEEDS);
        printReport(r);
        expect(r.rtp).toBeGreaterThan(0.95);
        expect(r.rtp).toBeLessThan(1.00);
    });
});
