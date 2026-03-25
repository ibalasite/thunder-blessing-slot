import { SlotEngine } from '../../assets/scripts/SlotEngine';
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

function check(mode: GameMode, seeds: number[], N: number): number {
    let totalWagered = 0, totalWon = 0;
    for (const s of seeds) {
        const rng = mulberry32(s);
        const engine = new SlotEngine(rng);
        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode, totalBet: 1 });
            totalWagered += o.wagered;
            totalWon += o.totalWin;
        }
    }
    return totalWon / totalWagered * 100;
}

const SEEDS_A = [42, 777, 1234, 9999, 31415];
const SEEDS_B = [100, 200, 300, 400, 500];
const SEEDS_ALL = [...SEEDS_A, ...SEEDS_B];

console.log('Quick RTP check — 10 seeds × 100k each = 1M per mode');
console.log('─'.repeat(60));

for (const mode of ['main', 'extraBet'] as GameMode[]) {
    const rtpA = check(mode, SEEDS_A, 100_000);
    const rtpB = check(mode, SEEDS_B, 100_000);
    const rtpAll = check(mode, SEEDS_ALL, 100_000);
    console.log(`${mode.padEnd(10)} seeds A: ${rtpA.toFixed(3)}%  seeds B: ${rtpB.toFixed(3)}%  combined: ${rtpAll.toFixed(3)}%`);
}
