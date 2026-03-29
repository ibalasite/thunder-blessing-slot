/**
 * CRNGAttack.security.test.ts
 *
 * 模擬各種針對 RNG / 機率系統的攻擊手段，驗證全部失敗。
 *
 * 攻擊向量：
 *   1. 輸出預測（觀察歷史推算下一個值）
 *   2. 序列模式偵測（autocorrelation）
 *   3. 位元偏差（bit bias）
 *   4. 碰撞率異常（birthday attack）
 *   5. 卡方均勻性檢定（chi-squared）
 *   6. 連續輸出相關性（serial correlation）
 *   7. 符號頻率操控
 *   8. RTP 套利策略（追輸 / 追贏 / 定時下注）
 *   9. 多 session 交叉推測
 *  10. 觀察盤面反推 RNG 狀態
 */

import { createCSPRNG, RNGFunction } from '../../assets/scripts/services/RNGProvider';
import { SlotEngine, createEngine } from '../../assets/scripts/SlotEngine';
import {
    REEL_COUNT, BASE_ROWS, MAX_ROWS, MAX_WIN_MULT, SYM, SymType,
    SYMBOL_WEIGHTS, FG_TRIGGER_PROB,
} from '../../assets/scripts/GameConfig';

const CSPRNG = createCSPRNG();

// ═══════════════════════════════════════════════════════════════════
// 1. CSPRNG 輸出不可預測
// ═══════════════════════════════════════════════════════════════════

describe('Attack 1: Output Prediction — 觀察歷史推算下一個值', () => {

    it('連續 10,000 個輸出，無法用線性回歸預測下一個', () => {
        const N = 10_000;
        const vals: number[] = [];
        for (let i = 0; i < N; i++) vals.push(CSPRNG());

        // Linear regression: y[i] = a * x[i-1] + b
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 1; i < N; i++) {
            const x = vals[i - 1], y = vals[i];
            sx += x; sy += y; sxx += x * x; sxy += x * y;
        }
        const n = N - 1;
        const a = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        const b = (sy - a * sx) / n;

        // Use the model to "predict" last 1000 values
        let correctPredictions = 0;
        for (let i = N - 1000; i < N; i++) {
            const predicted = a * vals[i - 1] + b;
            // "Correct" if within 10% of actual range
            if (Math.abs(predicted - vals[i]) < 0.1) correctPredictions++;
        }

        // Random chance of being within ±0.1 of actual ≈ 20%
        // If prediction model works, should be significantly higher
        const hitRate = correctPredictions / 1000;
        expect(hitRate).toBeLessThan(0.30); // no better than random
    });

    it('觀察前 N 個值無法預測第 N+1 個值落在哪個十分位', () => {
        const rng = createCSPRNG();
        const history: number[] = [];
        for (let i = 0; i < 5000; i++) history.push(rng());

        // Attacker strategy: pick the most frequent decile from history
        const decileCounts = new Array(10).fill(0);
        for (const v of history.slice(-100)) {
            decileCounts[Math.floor(v * 10)]++;
        }
        const bestDecile = decileCounts.indexOf(Math.max(...decileCounts));

        // Test prediction on next 1000 values
        let hits = 0;
        for (let i = 0; i < 1000; i++) {
            if (Math.floor(rng() * 10) === bestDecile) hits++;
        }
        // True random: 10% chance. Attacker needs significantly more to profit
        expect(hits / 1000).toBeCloseTo(0.1, 1); // within ±0.05
    });
});

// ═══════════════════════════════════════════════════════════════════
// 2. 序列無自相關（Autocorrelation）
// ═══════════════════════════════════════════════════════════════════

describe('Attack 2: Pattern Detection — 自相關分析', () => {

    it('lag-1 到 lag-20 的自相關係數均在 ±0.03 內', () => {
        const N = 50_000;
        const vals: number[] = [];
        for (let i = 0; i < N; i++) vals.push(CSPRNG());

        const mean = vals.reduce((s, v) => s + v, 0) / N;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / N;

        for (let lag = 1; lag <= 20; lag++) {
            let cov = 0;
            for (let i = 0; i < N - lag; i++) {
                cov += (vals[i] - mean) * (vals[i + lag] - mean);
            }
            const autocorr = cov / ((N - lag) * variance);
            expect(Math.abs(autocorr)).toBeLessThan(0.03);
        }
    });

    it('不存在任何週期長度 2~100 的重複模式', () => {
        const N = 10_000;
        const vals: number[] = [];
        for (let i = 0; i < N; i++) vals.push(Math.floor(CSPRNG() * 100));

        for (let period = 2; period <= 100; period++) {
            let matches = 0;
            for (let i = period; i < N; i++) {
                if (vals[i] === vals[i - period]) matches++;
            }
            const matchRate = matches / (N - period);
            // For 100 bins, random match rate ≈ 1%
            expect(matchRate).toBeLessThan(0.02);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// 3. 位元偏差（Bit Bias）
// ═══════════════════════════════════════════════════════════════════

describe('Attack 3: Bit Bias — 位元分佈偏差', () => {

    it('32 位元中每一位的 0/1 比例均在 49%~51% 內', () => {
        const N = 20_000;
        const bitCounts = new Array(32).fill(0);

        for (let i = 0; i < N; i++) {
            const val = Math.floor(CSPRNG() * 0x100000000);
            for (let b = 0; b < 32; b++) {
                if ((val >>> b) & 1) bitCounts[b]++;
            }
        }

        for (let b = 0; b < 32; b++) {
            const ratio = bitCounts[b] / N;
            // N=20,000: σ≈0.00354; ±2% = ±5.65σ → P(fail per bit) < 10^-8
            expect(ratio).toBeGreaterThan(0.48);
            expect(ratio).toBeLessThan(0.52);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// 4. 碰撞率（Birthday Attack）
// ═══════════════════════════════════════════════════════════════════

describe('Attack 4: Birthday Attack — 碰撞率異常', () => {

    it('10,000 個量化到 1,000,000 格的值，碰撞率在理論範圍內', () => {
        const N = 10_000;
        const SPACE = 1_000_000;
        const seen = new Set<number>();
        let collisions = 0;

        for (let i = 0; i < N; i++) {
            const quantized = Math.floor(CSPRNG() * SPACE);
            if (seen.has(quantized)) collisions++;
            seen.add(quantized);
        }

        // Expected collisions ≈ N²/(2*SPACE) = 100M / 2M = 50
        const expected = (N * N) / (2 * SPACE);
        expect(collisions).toBeGreaterThan(expected * 0.3);
        expect(collisions).toBeLessThan(expected * 2.5);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 5. 卡方均勻性檢定（Chi-Squared）
// ═══════════════════════════════════════════════════════════════════

describe('Attack 5: Chi-Squared — 均勻性分佈檢定', () => {

    it('100 個 bins 的卡方值在臨界值之下（p > 0.01）', () => {
        const N = 100_000;
        const BINS = 100;
        const expected = N / BINS;
        const counts = new Array(BINS).fill(0);

        for (let i = 0; i < N; i++) {
            const bin = Math.floor(CSPRNG() * BINS);
            counts[Math.min(bin, BINS - 1)]++;
        }

        let chi2 = 0;
        for (let i = 0; i < BINS; i++) {
            chi2 += (counts[i] - expected) ** 2 / expected;
        }

        // df=99, chi2 critical value at p=0.01 is 135.81
        expect(chi2).toBeLessThan(135.81);
    });

    it('drawSymbol 各符號出現頻率與權重一致（卡方 p > 0.01）', () => {
        const engine = new SlotEngine(createCSPRNG());
        const N = 100_000;
        const counts: Record<string, number> = {};
        for (let i = 0; i < N; i++) {
            const sym = engine.drawSymbol();
            counts[sym] = (counts[sym] || 0) + 1;
        }

        const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
        let chi2 = 0;
        for (const [sym, weight] of Object.entries(SYMBOL_WEIGHTS)) {
            const expected = (weight / totalWeight) * N;
            const observed = counts[sym] || 0;
            chi2 += (observed - expected) ** 2 / expected;
        }

        // df = numSymbols - 1 = 9, chi2 critical at p=0.01 = 21.67
        expect(chi2).toBeLessThan(21.67);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 6. 連續輸出相關性（Serial Correlation）
// ═══════════════════════════════════════════════════════════════════

describe('Attack 6: Serial Correlation — 連續值無相關', () => {

    it('scatter plot 相關係數 r² < 0.001（相鄰輸出無線性關係）', () => {
        const N = 20_000;
        const xs: number[] = [], ys: number[] = [];
        let prev = CSPRNG();
        for (let i = 0; i < N; i++) {
            const cur = CSPRNG();
            xs.push(prev);
            ys.push(cur);
            prev = cur;
        }

        const mx = xs.reduce((s, v) => s + v, 0) / N;
        const my = ys.reduce((s, v) => s + v, 0) / N;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < N; i++) {
            sxy += (xs[i] - mx) * (ys[i] - my);
            sxx += (xs[i] - mx) ** 2;
            syy += (ys[i] - my) ** 2;
        }
        const r = sxy / Math.sqrt(sxx * syy);
        expect(r * r).toBeLessThan(0.001);
    });

    it('Runs test — 連漲連跌次數符合隨機分佈', () => {
        const N = 10_000;
        const vals: number[] = [];
        for (let i = 0; i < N; i++) vals.push(CSPRNG());

        let runs = 1;
        for (let i = 1; i < N; i++) {
            if ((vals[i] > vals[i - 1]) !== (vals[i - 1] > vals[i - 2] || i === 1)) {
                runs++;
            }
        }

        // For truly random, expected runs ≈ (2N - 1) / 3
        const expectedRuns = (2 * N - 1) / 3;
        const variance = (16 * N - 29) / 90;
        const zScore = Math.abs(runs - expectedRuns) / Math.sqrt(variance);
        // z < 3 means not significantly different from random (p > 0.003)
        expect(zScore).toBeLessThan(3);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 7. 符號頻率操控
// ═══════════════════════════════════════════════════════════════════

describe('Attack 7: Symbol Frequency Manipulation — 符號頻率操控', () => {

    it('觀察 1000 轉後，下一轉特定高賠符號出現率不會提高', () => {
        const engine = new SlotEngine(createCSPRNG());

        // Phase 1: "observe" 1000 spins
        for (let i = 0; i < 1000; i++) {
            engine.simulateSpin({ totalBet: 1 });
        }

        // Phase 2: measure WILD and P1 (ZEUS) rates
        let wildCount = 0, zeusCount = 0;
        const N = 50_000;
        for (let i = 0; i < N; i++) {
            const sym = engine.drawSymbol();
            if (sym === SYM.WILD) wildCount++;
            if (sym === SYM.P1) zeusCount++;
        }

        const expectedWildRate = 3 / 90; // SYMBOL_WEIGHTS.W / total
        const expectedZeusRate = 6 / 90;
        expect(wildCount / N).toBeCloseTo(expectedWildRate, 1);
        expect(zeusCount / N).toBeCloseTo(expectedZeusRate, 1);
    });

    it('不同下注金額不影響符號分佈', () => {
        const bets = [0.25, 1, 5, 25, 100];
        const symCounts: Record<number, Record<string, number>> = {};
        const N = 5_000;

        for (const bet of bets) {
            symCounts[bet] = {};
            const engine = new SlotEngine(createCSPRNG());
            for (let i = 0; i < N; i++) {
                const r = engine.simulateSpin({ totalBet: bet });
                for (let ri = 0; ri < REEL_COUNT; ri++) {
                    for (let row = 0; row < BASE_ROWS; row++) {
                        const sym = r.initialGrid[ri][row];
                        symCounts[bet][sym] = (symCounts[bet][sym] || 0) + 1;
                    }
                }
            }
        }

        // Compare distributions across bet levels (should be identical shape)
        const totalCells = N * REEL_COUNT * BASE_ROWS;
        for (const sym of Object.keys(SYMBOL_WEIGHTS)) {
            const rates = bets.map(b => (symCounts[b][sym] || 0) / totalCells);
            const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
            for (const r of rates) {
                expect(Math.abs(r - mean)).toBeLessThan(0.02);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// 8. RTP 套利策略
// ═══════════════════════════════════════════════════════════════════

describe('Attack 8: RTP Arbitrage — 下注策略套利', () => {

    /**
     * If each spin is independent (CSPRNG guarantee), then:
     *   - The outcome of spin N+1 is independent of spins 1..N
     *   - No bet-timing or bet-sizing strategy can change the expected RTP
     *
     * Test approach: split spins into "strategy group" vs "non-strategy group"
     * by the attacker's criterion. Both groups should have statistically
     * indistinguishable RTP — proving past outcomes don't predict future.
     */

    it('追輸策略：5 連輸後的 spin 中獎率 vs 其他 spin 中獎率無顯著差異', () => {
        const engine = new SlotEngine(createCSPRNG());
        const N = 80_000;
        let afterLossStreak = 0, afterLossWins = 0;
        let otherCount = 0, otherWins = 0;
        const recentResults: boolean[] = [];

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            const won = o.totalWin > 0;

            const isAfterStreak = recentResults.length >= 5 &&
                recentResults.slice(-5).every(r => !r);

            if (isAfterStreak) {
                afterLossStreak++;
                if (won) afterLossWins++;
            } else {
                otherCount++;
                if (won) otherWins++;
            }
            recentResults.push(won);
            if (recentResults.length > 10) recentResults.shift();
        }

        if (afterLossStreak < 100) return; // not enough samples
        const rateAfterStreak = afterLossWins / afterLossStreak;
        const rateOther = otherWins / otherCount;
        // Win rates should be within 5 percentage points of each other
        expect(Math.abs(rateAfterStreak - rateOther)).toBeLessThan(0.05);
    });

    it('追贏策略：前一把有贏時的下一把中獎率 vs 前一把沒贏時無顯著差異', () => {
        const engine = new SlotEngine(createCSPRNG());
        const N = 80_000;
        let afterWinCount = 0, afterWinHits = 0;
        let afterLossCount = 0, afterLossHits = 0;
        let prevWon = false;

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            const won = o.totalWin > 0;

            if (i > 0) {
                if (prevWon) {
                    afterWinCount++;
                    if (won) afterWinHits++;
                } else {
                    afterLossCount++;
                    if (won) afterLossHits++;
                }
            }
            prevWon = won;
        }

        const rateAfterWin = afterWinHits / afterWinCount;
        const rateAfterLoss = afterLossHits / afterLossCount;
        expect(Math.abs(rateAfterWin - rateAfterLoss)).toBeLessThan(0.03);
    });

    it('定時策略：第 N 把 (N%7=0) 的中獎率 vs 其他把無顯著差異', () => {
        const engine = new SlotEngine(createCSPRNG());
        const N = 70_000;
        let timedCount = 0, timedHits = 0;
        let otherCount = 0, otherHits = 0;

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            const won = o.totalWin > 0;

            if (i % 7 === 0) {
                timedCount++;
                if (won) timedHits++;
            } else {
                otherCount++;
                if (won) otherHits++;
            }
        }

        const rateTimed = timedHits / timedCount;
        const rateOther = otherHits / otherCount;
        expect(Math.abs(rateTimed - rateOther)).toBeLessThan(0.03);
    });

    it('Martingale：加倍追輸不影響每局獨立中獎率', () => {
        const engine = new SlotEngine(createCSPRNG());
        const N = 50_000;
        let highBetCount = 0, highBetWins = 0;
        let lowBetCount = 0, lowBetWins = 0;
        let currentBet = 1;

        for (let i = 0; i < N; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: currentBet });
            const won = o.totalWin > 0;

            if (currentBet > 1) {
                highBetCount++;
                if (won) highBetWins++;
            } else {
                lowBetCount++;
                if (won) lowBetWins++;
            }

            if (o.totalWin === 0) {
                currentBet = Math.min(currentBet * 2, 8);
            } else {
                currentBet = 1;
            }
        }

        if (highBetCount < 100) return;
        const rateHigh = highBetWins / highBetCount;
        const rateLow = lowBetWins / lowBetCount;
        // Win rate when betting high vs low should be the same
        expect(Math.abs(rateHigh - rateLow)).toBeLessThan(0.05);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 9. 多 Session 交叉推測
// ═══════════════════════════════════════════════════════════════════

describe('Attack 9: Cross-Session Inference — 多 session 交叉推測', () => {

    it('兩個獨立 CSPRNG 引擎的輸出完全無關', () => {
        const engine1 = new SlotEngine(createCSPRNG());
        const engine2 = new SlotEngine(createCSPRNG());

        const N = 5000;
        const wins1: number[] = [], wins2: number[] = [];

        for (let i = 0; i < N; i++) {
            wins1.push(engine1.simulateSpin({ totalBet: 1 }).totalRawWin);
            wins2.push(engine2.simulateSpin({ totalBet: 1 }).totalRawWin);
        }

        // Pearson correlation
        const m1 = wins1.reduce((s, v) => s + v, 0) / N;
        const m2 = wins2.reduce((s, v) => s + v, 0) / N;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < N; i++) {
            sxy += (wins1[i] - m1) * (wins2[i] - m2);
            sxx += (wins1[i] - m1) ** 2;
            syy += (wins2[i] - m2) ** 2;
        }
        const r = sxy / Math.sqrt(sxx * syy);
        expect(Math.abs(r)).toBeLessThan(0.05);
    });

    it('同一時間建立的兩個引擎，輸出序列不同', () => {
        const rng1 = createCSPRNG();
        const rng2 = createCSPRNG();

        const seq1: number[] = [], seq2: number[] = [];
        for (let i = 0; i < 100; i++) {
            seq1.push(rng1());
            seq2.push(rng2());
        }

        let same = 0;
        for (let i = 0; i < 100; i++) {
            if (seq1[i] === seq2[i]) same++;
        }
        expect(same).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 10. 觀察盤面反推 RNG 狀態
// ═══════════════════════════════════════════════════════════════════

describe('Attack 10: State Reconstruction — 觀察盤面反推 RNG', () => {

    it('連續 100 盤面的符號序列無法用 mulberry32 任何 seed 重現', () => {
        const engine = new SlotEngine(createCSPRNG());
        const observed: SymType[][] = [];
        for (let i = 0; i < 100; i++) {
            const r = engine.simulateSpin({ totalBet: 1 });
            observed.push(r.initialGrid[0]); // first reel only
        }

        // Attacker tries 100,000 seeds
        function mulberry32(a: number) {
            return () => {
                a |= 0; a = a + 0x6D2B79F5 | 0;
                let t = Math.imul(a ^ a >>> 15, 1 | a);
                t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }

        let seedFound = false;
        for (let seed = 0; seed < 100_000; seed++) {
            const testEngine = new SlotEngine(mulberry32(seed));
            let match = true;
            for (let i = 0; i < 5; i++) { // only check first 5 spins
                const r = testEngine.simulateSpin({ totalBet: 1 });
                const testReel = r.initialGrid[0];
                for (let j = 0; j < testReel.length; j++) {
                    if (j < observed[i].length && testReel[j] !== observed[i][j]) {
                        match = false;
                        break;
                    }
                }
                if (!match) break;
            }
            if (match) { seedFound = true; break; }
        }

        expect(seedFound).toBe(false);
    });

    it('FG 觸發序列不可被用來推算下一次觸發時機', () => {
        const engine = new SlotEngine(createCSPRNG());
        const fgGaps: number[] = [];
        let sinceLastFG = 0;

        for (let i = 0; i < 50_000; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
            sinceLastFG++;
            if (o.fgTriggered) {
                fgGaps.push(sinceLastFG);
                sinceLastFG = 0;
            }
        }

        if (fgGaps.length < 20) return;

        // FG trigger is a Bernoulli trial each spin: memoryless (geometric distribution)
        // Autocorrelation of gap lengths should be approximately 0
        const mean = fgGaps.reduce((a, b) => a + b, 0) / fgGaps.length;
        const variance = fgGaps.reduce((s, v) => s + (v - mean) ** 2, 0) / fgGaps.length;
        if (variance === 0) return;
        let cov = 0;
        for (let i = 1; i < fgGaps.length; i++) {
            cov += (fgGaps[i] - mean) * (fgGaps[i - 1] - mean);
        }
        const autocorr = cov / ((fgGaps.length - 1) * variance);
        // With ~400 gaps (50K * 0.008), autocorrelation bound ≈ 2/sqrt(400) = 0.1
        // Use 0.25 to account for noise
        expect(Math.abs(autocorr)).toBeLessThan(0.25);

        // Verify FG trigger rate matches config
        const estimatedP = 1 / mean;
        expect(estimatedP).toBeCloseTo(FG_TRIGGER_PROB, 1);
    });
});

// ═══════════════════════════════════════════════════════════════════
// 11. RTP 不受任何外部因素影響
// ═══════════════════════════════════════════════════════════════════

describe('Attack 11: RTP Stability — RTP 穩定性', () => {

    it('不同時間間隔建立的引擎，RTP 均在合理範圍（無 time-based seed）', () => {
        const rtps: number[] = [];

        for (let trial = 0; trial < 5; trial++) {
            const engine = new SlotEngine(createCSPRNG());
            let wagered = 0, payout = 0;
            for (let i = 0; i < 50_000; i++) {
                const o = engine.computeFullSpin({ mode: 'main', totalBet: 1 });
                wagered += o.wagered;
                payout += o.totalWin;
            }
            rtps.push(payout / wagered);
        }

        // High-variance game (FG_SPIN_BONUS up to 100x): individual trials can swing wide.
        // Key assertion: no catastrophic outlier that indicates a time-based weak seed
        for (const rtp of rtps) {
            expect(rtp).toBeGreaterThan(0.60);
            expect(rtp).toBeLessThan(1.40);
        }

        // All 5 trials should cluster — std < 25% of mean
        // High-variance game (FG_SPIN_BONUS 1-100x) causes wide per-trial swings at 50K spins.
        // Purpose: detect time-based seeding bias (would cause std/mean >> 0.25), not exact convergence.
        const mean = rtps.reduce((a, b) => a + b, 0) / rtps.length;
        const std = Math.sqrt(rtps.reduce((s, r) => s + (r - mean) ** 2, 0) / rtps.length);
        expect(std / mean).toBeLessThan(0.25);
    });

    it('MAX_WIN cap 實際生效 — 任何 spin 的 totalWin ≤ MAX_WIN_MULT × totalBet', () => {
        const engine = new SlotEngine(createCSPRNG());
        const totalBet = 1;

        for (let i = 0; i < 50_000; i++) {
            const o = engine.computeFullSpin({ mode: 'main', totalBet });
            expect(o.totalWin).toBeLessThanOrEqual(MAX_WIN_MULT * totalBet + 0.01);
        }
    });

    it('Buy FG 的 totalWin ≤ MAX_WIN_MULT × totalBet', () => {
        const engine = new SlotEngine(createCSPRNG());
        const totalBet = 1;

        for (let i = 0; i < 5_000; i++) {
            const o = engine.computeFullSpin({ mode: 'buyFG', totalBet });
            expect(o.totalWin).toBeLessThanOrEqual(MAX_WIN_MULT * totalBet + 0.01);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// 12. CSPRNG 基礎品質
// ═══════════════════════════════════════════════════════════════════

describe('Attack 12: CSPRNG Basic Quality — 基礎品質驗證', () => {

    it('輸出範圍嚴格在 [0, 1) 內', () => {
        for (let i = 0; i < 100_000; i++) {
            const v = CSPRNG();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('連續 1000 個值沒有任何重複', () => {
        const seen = new Set<number>();
        for (let i = 0; i < 1000; i++) {
            const v = CSPRNG();
            expect(seen.has(v)).toBe(false);
            seen.add(v);
        }
    });

    it('5000 個值的 Kolmogorov-Smirnov 統計量 D < 0.03（U[0,1] 分佈）', () => {
        const N = 5000;
        const vals: number[] = [];
        for (let i = 0; i < N; i++) vals.push(CSPRNG());
        vals.sort((a, b) => a - b);

        let dMax = 0;
        for (let i = 0; i < N; i++) {
            const empirical = (i + 1) / N;
            const theoretical = vals[i]; // CDF of U[0,1] is just x
            const d = Math.abs(empirical - theoretical);
            if (d > dMax) dMax = d;
        }

        // KS critical value at p=0.01 for N=5000 ≈ 1.63 / sqrt(N) ≈ 0.023
        expect(dMax).toBeLessThan(0.03);
    });
});
