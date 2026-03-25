/**
 * Quick SCALE calibration for Buy FG — tries multiple values to find 97.5% RTP.
 * Runs smaller samples per SCALE, reports RTP for each.
 */
import { SlotEngine } from '../../assets/scripts/SlotEngine';
import {
    BUY_FG_PAYOUT_SCALE, BUY_COST_MULT, MAX_WIN_MULT,
    BUY_FG_MIN_WIN_MULT,
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

function testScale(scale: number, N: number, seed: number): { rtp: number; avgWin: number; below20pct: number } {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);

    // Monkey-patch the SCALE for this run
    const origScale = (engine as any)._buyFGScale;

    let totalWagered = 0, totalWon = 0;
    let below20 = 0;

    for (let i = 0; i < N; i++) {
        const o = engine.computeFullSpin({ mode: 'buyFG', totalBet: 1 });

        // Recompute totalWin with the test scale
        const rawWin = o.totalRawWin;
        let win = rawWin * scale;
        if (win < BUY_FG_MIN_WIN_MULT) win = BUY_FG_MIN_WIN_MULT;
        if (win > MAX_WIN_MULT) win = MAX_WIN_MULT;

        totalWagered += o.wagered;
        totalWon += win;
        if (win < 20) below20++;
    }

    return {
        rtp: totalWon / totalWagered * 100,
        avgWin: totalWon / N,
        below20pct: below20 / N * 100,
    };
}

// Run calibration
const SCALES = [1.50, 1.60, 1.70, 1.80, 1.85, 1.90, 1.95, 2.00, 2.10, 2.20];
const N = 100000;
const SEED = 42;

console.log('Buy FG SCALE Calibration');
console.log(`Samples per SCALE: ${N.toLocaleString()}, seed: ${SEED}`);
console.log('─'.repeat(70));
console.log('  SCALE     RTP%      Avg Win(BET)  <20× BET%');
console.log('─'.repeat(70));

for (const scale of SCALES) {
    const r = testScale(scale, N, SEED);
    const marker = r.rtp >= 97.0 && r.rtp <= 98.0 ? ' ← TARGET' : '';
    console.log(`  ${scale.toFixed(2)}     ${r.rtp.toFixed(3)}%     ${r.avgWin.toFixed(2)}           ${r.below20pct.toFixed(2)}%${marker}`);
}
console.log('─'.repeat(70));
