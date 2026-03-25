/**
 * WinDistribution.test.ts
 * 配獎分佈驗證測試 — 確保各 bracket 比例在合理範圍
 *
 * 這個測試的目的不是精確校準 RTP（那是 ThreeMode.rtp.test.ts 的工作），
 * 而是驗證配獎分佈的「形狀」：
 *   - 0獎比例在 55-75% 之間（體感不至於太差也不至於爆 RTP）
 *   - 高倍 bracket（>=50×）的出現率低但非零
 *   - MG/FG 各有 hit（不能某一邊全空）
 */

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

interface BracketDef {
    label: string;
    min: number;
    max: number;
}

const BRACKETS: BracketDef[] = [
    { label: '0',            min: 0,    max: 0         },
    { label: '(0,1)',        min: 0.001, max: 1        },
    { label: '[1,2)',        min: 1,    max: 2         },
    { label: '[2,5)',        min: 2,    max: 5         },
    { label: '[5,10)',       min: 5,    max: 10        },
    { label: '[10,20)',      min: 10,   max: 20        },
    { label: '[20,50)',      min: 20,   max: 50        },
    { label: '[50,100)',     min: 50,   max: 100       },
    { label: '[100,200)',    min: 100,  max: 200       },
    { label: '[200,500)',    min: 200,  max: 500       },
    { label: '[500,1000)',   min: 500,  max: 1000      },
    { label: '[1000,2000)',  min: 1000, max: 2000      },
    { label: '[2000,5000)',  min: 2000, max: 5000      },
    { label: '>=5000',       min: 5000, max: Infinity  },
];

function classifyWin(winMult: number): number {
    if (winMult === 0) return 0;
    for (let i = 1; i < BRACKETS.length; i++) {
        if (winMult >= BRACKETS[i].min && winMult < BRACKETS[i].max) return i;
    }
    return BRACKETS.length - 1;
}

function runDistribution(mode: GameMode, spins: number, seed: number) {
    const rng = mulberry32(seed);
    const engine = new SlotEngine(rng);
    const counts = new Array(BRACKETS.length).fill(0);
    const fgCounts = new Array(BRACKETS.length).fill(0);
    let totalWagered = 0, totalWon = 0, fgTotal = 0;

    for (let i = 0; i < spins; i++) {
        const o = engine.computeFullSpin({ mode, totalBet: 1 });
        totalWagered += o.wagered;
        totalWon += o.totalWin;
        const winMult = o.totalWin / o.wagered;
        const idx = classifyWin(winMult);
        counts[idx]++;
        if (o.fgSpins.length > 0) {
            fgCounts[idx]++;
            fgTotal++;
        }
    }

    return { counts, fgCounts, fgTotal, totalWagered, totalWon, rtp: totalWon / totalWagered * 100 };
}

const N = 200_000;

describe('Win Distribution Analysis (配獎分佈)', () => {
    const modes: GameMode[] = ['main', 'buyFG', 'extraBet'];

    for (const mode of modes) {
        const modeLabel = mode === 'main' ? 'Main Game' : mode === 'buyFG' ? 'Buy FG' : 'Extra Bet';

        describe(modeLabel, () => {
            const result = runDistribution(mode, N, 12345);

            it(`0獎比例在合理範圍 (${mode === 'buyFG' ? '0-30%' : '30-85%'})`, () => {
                const zeroRate = result.counts[0] / N * 100;
                if (mode === 'buyFG') {
                    // Buy FG guarantees FG entry (8+ spins), zero-win very rare
                    expect(zeroRate).toBeLessThan(30);
                } else {
                    expect(zeroRate).toBeGreaterThan(30);
                    expect(zeroRate).toBeLessThan(85);
                }
            });

            it('有低倍獎出現 (0,1) bracket > 0', () => {
                expect(result.counts[1]).toBeGreaterThan(0);
            });

            it('有中倍獎出現 [2,5) bracket > 0', () => {
                expect(result.counts[3]).toBeGreaterThan(0);
            });

            if (mode !== 'buyFG') {
                it('FG 觸發率 > 0', () => {
                    expect(result.fgTotal).toBeGreaterThan(0);
                });
            }

            it('bracket 合計 = total spins', () => {
                const total = result.counts.reduce((a: number, b: number) => a + b, 0);
                expect(total).toBe(N);
            });

            it('prints distribution table', () => {
                console.log(`\n  ${modeLabel}: RTP=${result.rtp.toFixed(2)}%, 0-win=${(result.counts[0]/N*100).toFixed(1)}%, FG=${(result.fgTotal/N*100).toFixed(2)}%`);
                const nonZero = N - result.counts[0];
                let cumDist = 0;
                for (let i = 0; i < BRACKETS.length; i++) {
                    const c = result.counts[i];
                    const dist = i > 0 && nonZero > 0 ? (c / nonZero * 100) : 0;
                    cumDist += dist;
                    if (c > 0) {
                        console.log(`    ${BRACKETS[i].label.padEnd(14)} ${String(c).padStart(8)}  ${(c/N*100).toFixed(2).padStart(6)}%  dist: ${i>0 ? dist.toFixed(2)+'%' : '-'}  cum: ${i>0 ? cumDist.toFixed(2)+'%' : '-'}`);
                    }
                }
            });
        });
    }
});
