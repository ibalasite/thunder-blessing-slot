/**
 * MaxWin.analysis.ts
 * Theoretical and empirical analysis of 30000× BET reachability.
 *
 * For Buy FG: wagered = 100× BET, max win = 30000× BET = 300× wagered
 * For Main FG: wagered = 1× BET, max win = 30000× BET = 30000× wagered
 */
import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    FG_MULTIPLIERS, FG_ROUND_COUNTS,
    COIN_TOSS_HEADS_PROB, COIN_TOSS_HEADS_PROB_BUY,
    BUY_FG_PAYOUT_SCALE, MAX_WIN_MULT, PAYTABLE_SCALE,
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

function tierProb(probs: number[]): number[] {
    const p: number[] = [];
    let cum = 1;
    for (let i = 0; i < probs.length; i++) {
        const pFail = 1 - probs[i];
        p.push(cum * pFail);
        cum *= probs[i];
    }
    p.push(cum);
    return p;
}

// Theoretical tier probabilities
const mainTierProbs = tierProb(COIN_TOSS_HEADS_PROB);
const buyTierProbs  = tierProb(COIN_TOSS_HEADS_PROB_BUY);

console.log('═══════════════════════════════════════════════════════════');
console.log('  30000× BET MAX WIN 理論分析');
console.log('═══════════════════════════════════════════════════════════');

console.log('\n  Tier 到達機率比較：');
console.log('  Tier  Mult  Rounds  Main Game     Buy FG     Buy/Main');
console.log('  ─────────────────────────────────────────────────────────');
for (let t = 0; t < FG_MULTIPLIERS.length; t++) {
    const mp = mainTierProbs[t];
    const bp = buyTierProbs[t];
    const ratio = bp / mp;
    console.log(`    ${t}    ×${String(FG_MULTIPLIERS[t]).padEnd(3)} ${String(FG_ROUND_COUNTS[t]).padEnd(7)} ${(mp*100).toFixed(4)}%    ${(bp*100).toFixed(4)}%    ${ratio.toFixed(1)}×`);
}

// Raw win needed to reach max win at each tier
console.log('\n  MAX WIN (30000× BET) 所需的 raw win per FG round：');
console.log('  Tier  Mult  Rounds  SCALE   Need Raw Total  Need Raw/Round  Avg Raw/Round  Ratio');
console.log('  ─────────────────────────────────────────────────────────────────────────────────────');
const avgRawPerRound = 0.33; // empirical average raw win per FG round (in BET)
for (let t = 0; t < FG_MULTIPLIERS.length; t++) {
    const mult = FG_MULTIPLIERS[t];
    const rounds = FG_ROUND_COUNTS[t];
    const scale = BUY_FG_PAYOUT_SCALE;

    // totalWin = totalRawWin * scale >= 30000
    // totalRawWin = baseWin + fgWin (fgWin = sum(roundRaw * mult))
    // Ignore baseWin (~small): sum(roundRaw) * mult >= 30000 / scale
    const needRawTotal = MAX_WIN_MULT / scale;
    const needFGRaw = needRawTotal / mult;
    const perRound = needFGRaw / rounds;
    const ratio = perRound / avgRawPerRound;

    console.log(`    ${t}    ×${String(mult).padEnd(3)} ${String(rounds).padEnd(7)} ${scale.toFixed(2)}    ${needRawTotal.toFixed(0).padStart(12)}    ${perRound.toFixed(2).padStart(12)}   ${avgRawPerRound.toFixed(2).padStart(13)}   ${ratio.toFixed(0)}×`);
}

// Empirical: Run focused high-tier analysis
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  高 tier 實測分佈（只看 tier 3-4）');
console.log('═══════════════════════════════════════════════════════════\n');

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const N_PER_SEED = 200_000;
let buyTop: { win: number; tier: number; seed: number; idx: number }[] = [];
let mainTop: { win: number; tier: number; seed: number; idx: number }[] = [];
let buyTierCount = [0, 0, 0, 0, 0];
let mainTierCount = [0, 0, 0, 0, 0];
let mainFGTotal = 0;

for (const seed of SEEDS) {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);

    for (let i = 0; i < N_PER_SEED; i++) {
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });
        if (o.fgTier) {
            buyTierCount[o.fgTier.tierIndex]++;
            if (o.totalWin >= 5000) {
                buyTop.push({ win: o.totalWin, tier: o.fgTier.tierIndex, seed, idx: i });
            }
        }
    }
}

for (const seed of SEEDS) {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);

    for (let i = 0; i < N_PER_SEED; i++) {
        const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
        if (o.fgTier) {
            mainTierCount[o.fgTier.tierIndex]++;
            mainFGTotal++;
            if (o.totalWin >= 100) {
                mainTop.push({ win: o.totalWin, tier: o.fgTier.tierIndex, seed, idx: i });
            }
        }
    }
}

const buyTotal = SEEDS.length * N_PER_SEED;
const mainTotal = SEEDS.length * N_PER_SEED;

console.log(`Buy FG: ${buyTotal.toLocaleString()} spins`);
for (let t = 0; t < 5; t++) {
    console.log(`  Tier ${t}: ${buyTierCount[t].toLocaleString()} (${(buyTierCount[t]/buyTotal*100).toFixed(4)}%)`);
}
buyTop.sort((a, b) => b.win - a.win);
console.log(`\nBuy FG Top wins (>= 5000× BET):  ${buyTop.length}`);
for (const w of buyTop.slice(0, 20)) {
    console.log(`  ${w.win.toFixed(2)}× BET  tier=${w.tier}  seed=${w.seed}  spin=${w.idx}`);
}

console.log(`\nMain FG: ${mainFGTotal.toLocaleString()} FG entries out of ${mainTotal.toLocaleString()} spins`);
for (let t = 0; t < 5; t++) {
    console.log(`  Tier ${t}: ${mainTierCount[t].toLocaleString()} (${mainTierCount[t] > 0 ? (mainTierCount[t]/mainFGTotal*100).toFixed(2) : 0}%)`);
}
mainTop.sort((a, b) => b.win - a.win);
console.log(`\nMain FG Top wins (>= 100× BET):  ${mainTop.length}`);
for (const w of mainTop.slice(0, 20)) {
    console.log(`  ${w.win.toFixed(2)}× BET  tier=${w.tier}  seed=${w.seed}  spin=${w.idx}`);
}

// Compare tier 4 probability
const buyT4rate = buyTierCount[4] / buyTotal;
const mainT4rate = mainTierCount[4] / mainFGTotal;
console.log(`\n  Buy FG tier 4 rate: ${(buyT4rate * 100).toFixed(6)}% (${buyTierCount[4]} hits in ${buyTotal.toLocaleString()})`);
console.log(`  Main FG tier 4 rate: ${mainFGTotal > 0 && mainTierCount[4] > 0 ? (mainT4rate * 100).toFixed(6) : '<0.001'}% (${mainTierCount[4]} hits in ${mainFGTotal.toLocaleString()} FG entries)`);
console.log(`  Buy/Main tier 4 ratio: ${mainT4rate > 0 ? (buyT4rate / mainT4rate).toFixed(1) : '>100'}×`);
