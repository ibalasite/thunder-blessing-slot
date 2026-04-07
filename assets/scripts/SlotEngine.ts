/**
 * SlotEngine.ts
 * ★ 機率核心引擎 — 純 TypeScript，無任何 Cocos Creator 依賴
 *
 * 職責：
 *   1. 生成盤面（genGrid）
 *   2. 抽符號（drawSymbol）
 *   3. Extra Bet SC 保證（applyExtraBetSC）
 *   4. 掃描連線中獎（checkWins — 支援 PAYLINES_BY_ROWS）
 *   5. 雷霆祝福（applyTB — 含第二擊機率）
 *   6. 完整 spin 模擬（simulateSpin — 供獨立 Node.js 測試使用）
 *
 * 使用方法（前端）：
 *   import { SlotEngine } from './SlotEngine';
 *   import { createCSPRNG } from './services/RNGProvider';
 *   const engine = new SlotEngine(createCSPRNG());
 *   const grid = engine.generateGrid();
 *   const wins = engine.checkWins(grid, rows);
 *   const newSym = engine.drawSymbol();
 *   const tbGrid = engine.applyTB(grid, marks, rows);
 *
 * 使用方法（獨立測試，Node.js）：
 *   const { SlotEngine } = require('./SlotEngine');
 *   const engine = new SlotEngine(mulberry32(42));  // seeded RNG for tests
 *   let total = 0;
 *   for (let i = 0; i < 1_000_000; i++) {
 *     const r = engine.simulateSpin({ totalBet: 1 });
 *     total += r.totalRawWin;
 *   }
 *   console.log('RTP:', (total / 1_000_000 * 100).toFixed(2) + '%');
 */

import {
    SymType, SYM,
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_EB, SYMBOL_WEIGHTS_FG, SYMBOL_WEIGHTS_BUY_FG,
    PAYTABLE, PAYLINES_BY_ROWS,
    FG_MULTIPLIERS, SYMBOL_UPGRADE, TB_SECOND_HIT_PROB,
    REEL_COUNT, BASE_ROWS, MAX_ROWS, MAX_WIN_MULT,
    FG_TRIGGER_PROB, MG_FG_TRIGGER_PROB, COIN_TOSS_HEADS_PROB,
    ENTRY_TOSS_PROB_MAIN, ENTRY_TOSS_PROB_BUY,
    BUY_COST_MULT, EXTRA_BET_MULT,
    BUY_FG_MIN_WIN_MULT, FG_SPIN_BONUS,
} from './GameConfig';

import type {
    GameMode, CoinTossOutcome, FGSpinOutcome, FullSpinOutcome,
    SpinResponse,
} from './contracts/types';

// ─── 公開資料型別 ─────────────────────────────────────────────────────────────

/** 一條中獎連線（與 WinChecker.WinResult 形狀相容） */
export interface WinLine {
    lineIndex:  number;
    rowPath:    number[];
    symbol:     SymType;
    count:      number;        // 3 / 4 / 5 連
    multiplier: number;        // 賠率（分數，× totalBet = 獎金）
    cells:      { reel: number; row: number }[];
}

/** 一個 Cascade 步驟 */
export interface CascadeStep {
    wins:      WinLine[];
    winCells:  { reel: number; row: number }[];  // 去重後的中獎格
    rawWin:    number;                            // 本步驟原始賠付（totalBet 已乘入）
    rowsAfter: number;                            // 展開後列數
}

/** 雷霆祝福步驟 */
export interface TBStep {
    markedCells: { reel: number; row: number }[];  // 被升階的格子
    gridAfter:   SymType[][];                       // 升階後盤面
}

/**
 * WinResult — WinLine 的別名，向後相容 WinChecker 的使用方
 * （WinChecker.ts 已合併至此檔案）
 */
export type WinResult = WinLine;

/** 計算獎金：totalBet × multiplier */
export function calcWinAmount(res: WinLine, totalBet: number): number {
    return parseFloat((totalBet * res.multiplier).toFixed(4));
}

/** 取得盤面上所有 Scatter 位置 */
export function findScatters(grid: SymType[][], rows: number): { reel: number; row: number }[] {
    const pos: { reel: number; row: number }[] = [];
    for (let ri = 0; ri < grid.length; ri++) {
        for (let row = 0; row < rows; row++) {
            if (grid[ri][row] === SYM.SCATTER) pos.push({ reel: ri, row });
        }
    }
    return pos;
}

/** simulateSpin 回傳的完整 spin 結果 */
export interface SpinResult {
    initialGrid:  SymType[][];
    finalGrid:    SymType[][];     // 最終盤面（所有 cascade 完成後）
    cascadeSteps: CascadeStep[];
    tbStep?:      TBStep;          // TB 最多發生一次，在 cascade 尾端
    totalRawWin:  number;          // 所有步驟賠付總和（totalBet 已乘入；FG 倍率不含）
    fgTriggered:  boolean;         // 本 spin 達到 MAX_ROWS
    finalRows:    number;
    maxWinCapped: boolean;
}

// ─── SlotEngine ───────────────────────────────────────────────────────────────

export class SlotEngine {

    /**
     * @param rng 隨機數來源（必傳）。
     *   Production: 傳入 createCSPRNG()
     *   Test: 傳入 mulberry32(seed)
     *   禁止使用 Math.random。
     */
    constructor(private rng: () => number) {}

    // ── 抽一個符號 ────────────────────────────────────────────────────────────

    drawSymbol(useFG = false, useEB = false, useBuyFG = false): SymType {
        const weights = useBuyFG ? SYMBOL_WEIGHTS_BUY_FG
                      : useFG   ? SYMBOL_WEIGHTS_FG
                      : useEB   ? SYMBOL_WEIGHTS_EB
                      : SYMBOL_WEIGHTS;
        const total   = (Object.values(weights) as number[]).reduce((a, b) => a + b, 0);
        let r = this.rng() * total;
        for (const [sym, w] of Object.entries(weights) as [SymType, number][]) {
            r -= w;
            if (r <= 0) return sym;
        }
        const keys = Object.keys(weights);
        return keys[keys.length - 1] as SymType;
    }

    // ── 生成 5×6 盤面 ─────────────────────────────────────────────────────────

    generateGrid(useFG = false, useEB = false, useBuyFG = false): SymType[][] {
        const grid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            grid[ri] = [];
            for (let row = 0; row < MAX_ROWS; row++) {
                grid[ri][row] = this.drawSymbol(useFG, useEB, useBuyFG);
            }
        }
        return grid;
    }

    // ── Extra Bet：保證基底列（row 0~2）有 SC ─────────────────────────────────

    applyExtraBetSC(grid: SymType[][]): SymType[][] {
        let hasSC = false;
        outer: for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < BASE_ROWS; row++) {
                if (grid[ri][row] === SYM.SCATTER) { hasSC = true; break outer; }
            }
        }
        if (hasSC) return grid;

        const newGrid = grid.map(col => [...col]) as SymType[][];
        const ri  = Math.floor(this.rng() * REEL_COUNT);
        const row = Math.floor(this.rng() * BASE_ROWS);
        newGrid[ri][row] = SYM.SCATTER;
        return newGrid;
    }

    // ── 掃描連線中獎（使用 PAYLINES_BY_ROWS，自動匹配當前列數）─────────────────

    checkWins(grid: SymType[][], rows: number): WinLine[] {
        const lines   = PAYLINES_BY_ROWS[rows] ?? PAYLINES_BY_ROWS[BASE_ROWS];
        const results: WinLine[] = [];

        for (let li = 0; li < lines.length; li++) {
            const rowPath = lines[li];
            if (rowPath.some(r => r >= rows)) continue;

            const firstSym = grid[0][rowPath[0]];
            // Resolve matchSym first: Wild substitutes for the first non-Wild symbol
            let matchSym: SymType = firstSym;
            if (firstSym === SYM.WILD) {
                for (let ri = 1; ri < REEL_COUNT; ri++) {
                    const s = grid[ri][rowPath[ri]];
                    if (s !== SYM.WILD) { matchSym = s; break; }
                }
            }
            if (matchSym === SYM.SCATTER) continue;

            // Count consecutive matching symbols (matchSym or Wild) from the left
            let count = 1;
            for (let ri = 1; ri < REEL_COUNT; ri++) {
                const sym = grid[ri][rowPath[ri]];
                if (sym === matchSym || sym === SYM.WILD) {
                    count = ri + 1;
                } else break;
            }
            if (count < 3) continue;

            const multiplier = PAYTABLE[matchSym][count];
            if (!multiplier || multiplier <= 0) continue;

            const cells: { reel: number; row: number }[] = [];
            for (let ri = 0; ri < count; ri++) {
                cells.push({ reel: ri, row: rowPath[ri] });
            }
            results.push({ lineIndex: li, rowPath, symbol: matchSym, count, multiplier, cells });
        }
        return results;
    }

    // ── 雷霆祝福：升階所有閃電標記格（含第二擊機率）────────────────────────────

    applyTB(grid: SymType[][], marks: Set<string>, rows: number): SymType[][] {
        const newGrid = grid.map(col => [...col]) as SymType[][];
        const upgrade = (sym: SymType): SymType =>
            ((SYMBOL_UPGRADE[sym as string] ?? sym) as SymType);

        // 第一擊：所有閃電標記格升階一次
        // First hit: every marked cell is upgraded once via SYMBOL_UPGRADE chain.
        // Example: L1 → P4 (low-tier lightning symbol becomes mid-tier premium)
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < rows; row++) {
                if (marks.has(`${ri},${row}`)) {
                    newGrid[ri][row] = upgrade(newGrid[ri][row]);
                }
            }
        }

        // 第二擊（機率 TB_SECOND_HIT_PROB）：同一批標記格再升階一次
        //
        // Second hit (TB_SECOND_HIT_PROB ≈ 40% chance): the SAME marked cells
        // are upgraded AGAIN — applied to the already-upgraded symbols from the first hit.
        // This is intentional design: the second hit chains on top of the first hit.
        //
        // Example chain:
        //   L1  →(first hit)→  P4  →(second hit)→  P3
        //   P4  →(first hit)→  P3  →(second hit)→  P2
        //   P3  →(first hit)→  P2  →(second hit)→  P1  (highest premium)
        //
        // This double-upgrade mechanic creates the "Thunder Blessing" excitement:
        // players can go from a low-symbol grid to high-premium symbols in one activation,
        // significantly boosting win potential on the same cascade step.
        if (this.rng() < TB_SECOND_HIT_PROB) {
            for (let ri = 0; ri < REEL_COUNT; ri++) {
                for (let row = 0; row < rows; row++) {
                    if (marks.has(`${ri},${row}`)) {
                        newGrid[ri][row] = upgrade(newGrid[ri][row]);
                    }
                }
            }
        }
        return newGrid;
    }

    // ── 完整 spin 模擬（無視覺，供獨立測試 / Node.js 使用）────────────────────
    //
    //  注意：此方法使用「就地補充（in-place refill）」策略，
    //  與 Python simulator 行為一致。遊戲前端（GameBootstrap）使用
    //  drawSymbol() + cascadeLoop() 驅動，會有視覺上的重力落下效果，
    //  但長期 RTP 結果與此模擬相同。

    simulateSpin(opts: {
        extraBet?:       boolean;
        inFreeGame?:     boolean;
        buyFG?:          boolean;
        fgMultiplier?:   number;
        lightningMarks?: Set<string>;
        totalBet?:       number;
        startRows?:      number;
        /** Max cascade iterations (default 20). Set to 1 to disable cascading. */
        maxCascade?:     number;
    } = {}): SpinResult {
        const useFG    = opts.inFreeGame   ?? false;
        const useEB    = opts.extraBet     ?? false;
        const useBuyFG = opts.buyFG        ?? false;
        const fgMult   = opts.fgMultiplier ?? 1;
        const totalBet = opts.totalBet     ?? 1;
        const maxCascade = opts.maxCascade ?? 20;

        // Direction A fix: EB wins scale with wagered (= totalBet × EXTRA_BET_MULT).
        // BuyFG+EB: totalBet already includes ebMult from GameFlowController, no extra scaling.
        const effectiveBet = (useEB && !useBuyFG) ? totalBet * EXTRA_BET_MULT : totalBet;

        const marks = opts.lightningMarks ?? new Set<string>();

        let grid = this.generateGrid(useFG, useEB, useBuyFG);
        if (useEB) grid = this.applyExtraBetSC(grid);
        const initialGrid = grid.map(c => [...c]) as SymType[][];

        const cascadeSteps: CascadeStep[] = [];
        let totalRawWin  = 0;
        let rows         = opts.startRows ?? BASE_ROWS;
        let fgTriggered  = false;
        let maxWinCapped = false;
        let tbStep: TBStep | undefined;

        for (let iter = 0; iter < maxCascade; iter++) {
            const wins = this.checkWins(grid, rows);

            if (wins.length === 0) {
                // 無中獎 → 嘗試觸發 TB
                let hasScatter = false;
                outer: for (let ri = 0; ri < REEL_COUNT; ri++) {
                    for (let row = 0; row < rows; row++) {
                        if (grid[ri][row] === SYM.SCATTER) { hasScatter = true; break outer; }
                    }
                }
                if (!hasScatter || marks.size === 0) break;  // 完全無中獎，結束

                // 執行 TB
                const markedList: { reel: number; row: number }[] = [];
                for (const key of marks) {
                    const [ri, row] = key.split(',').map(Number);
                    if (row < rows) markedList.push({ reel: ri, row });
                }
                const tbGrid = this.applyTB(grid, marks, rows);
                marks.clear();
                grid = tbGrid;
                tbStep = {
                    markedCells: markedList,
                    gridAfter:   grid.map(c => [...c]) as SymType[][],
                };
                continue;  // 繼續下一輪 cascade 檢查
            }

            // 去重 win cells，累計賠付
            const seenCell = new Set<string>();
            const winCells: { reel: number; row: number }[] = [];
            let rawWin = 0;

            for (const w of wins) {
                rawWin += w.multiplier * effectiveBet;
                for (const c of w.cells) {
                    const key = `${c.reel},${c.row}`;
                    if (!seenCell.has(key)) {
                        seenCell.add(key);
                        winCells.push(c);
                        marks.add(key);
                    }
                }
            }

            totalRawWin += rawWin;

            // 檢查 Max Win 上限
            if (totalRawWin * fgMult >= effectiveBet * MAX_WIN_MULT) {
                maxWinCapped = true;
                cascadeSteps.push({ wins, winCells, rawWin, rowsAfter: rows });
                break;
            }

            const newRows = Math.min(rows + 1, MAX_ROWS);
            if (newRows >= MAX_ROWS && rows < MAX_ROWS) fgTriggered = true;

            for (const c of winCells) {
                grid[c.reel][c.row] = this.drawSymbol(useFG, useEB, useBuyFG);
            }

            cascadeSteps.push({ wins, winCells, rawWin, rowsAfter: newRows });
            rows = newRows;
        }

        return {
            initialGrid, finalGrid: grid.map(c => [...c]) as SymType[][],
            cascadeSteps, tbStep,
            totalRawWin, fgTriggered,
            finalRows: rows, maxWinCapped,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Atomic full-spin: 一次算完所有結果（含 FG chain），UI 只負責播放
    // ══════════════════════════════════════════════════════════════════════════

    private _toSpinResponse(r: SpinResult, fgMult: number, marks: Set<string>): SpinResponse {
        return {
            grid:         r.finalGrid,
            cascadeSteps: r.cascadeSteps,
            tbStep:       r.tbStep,
            totalWin:     parseFloat((r.totalRawWin * fgMult).toFixed(4)),
            fgTriggered:  r.fgTriggered,
            finalRows:    r.finalRows,
            maxWinCapped: r.maxWinCapped,
            newMarks:     Array.from(marks),
        };
    }

    /**
     * 原子轉動（新模型）：
     * ① Spin 開始時決定是否觸發 FG
     * ② 若觸發 → Phase A: 保證 cascade 至 MAX_ROWS（收集 FREE）
     * ③ Entry Toss（Main/EB=80%, Buy=100%）
     * ④ FG Loop: spin → toss → 升級或結束
     * Phase A 分數一定算入 TOTAL WIN，即使 Entry Toss 失敗。
     */
    computeFullSpin(opts: {
        mode:        GameMode;
        totalBet:    number;
        extraBetOn?: boolean;  // orthogonal flag: EB SC guarantee active (even in buyFG mode)
    }): FullSpinOutcome {
        const { mode, totalBet } = opts;
        const isBuyFG  = mode === 'buyFG';
        // extraBet flag: true for 'extraBet' mode OR when extraBetOn is explicitly set
        const extraBet = mode === 'extraBet' || opts.extraBetOn === true;

        const wagered = isBuyFG  ? totalBet * BUY_COST_MULT
                      : extraBet ? totalBet * EXTRA_BET_MULT
                      : totalBet;
        // Max win = displayed total bet × MAX_WIN_MULT.
        // EB: displayed bet = wagered (baseBet × EXTRA_BET_MULT); BuyFG: totalBet already has ebMult.
        const maxWinTotal = (mode === 'extraBet') ? wagered * MAX_WIN_MULT : totalBet * MAX_WIN_MULT;

        // ① Decide FG trigger at spin start（MG 使用獨立 trigger prob 以校準至 97.5% RTP）
        const fgProb = (mode === 'main') ? MG_FG_TRIGGER_PROB : FG_TRIGGER_PROB;
        const fgTriggered = isBuyFG ? true : this.rng() < fgProb;

        // ② Phase A: cascade spins
        const baseSpins: SpinResponse[] = [];
        const baseMarks = new Set<string>();
        let baseWin = 0;

        if (fgTriggered) {
            let currentRows = BASE_ROWS;
            for (let s = 0; s < 100; s++) {
                const r = this.simulateSpin({
                    totalBet,
                    extraBet,      // pass SC guarantee for extraBet AND extraBetOn+buyFG
                    buyFG: isBuyFG,
                    startRows: currentRows,
                    lightningMarks: baseMarks,
                });
                baseSpins.push(this._toSpinResponse(r, 1, baseMarks));
                baseWin += r.totalRawWin;
                currentRows = r.finalRows;
                if (currentRows >= MAX_ROWS) break;
            }
        } else {
            // Normal single spin
            const r = this.simulateSpin({ totalBet, extraBet });
            baseSpins.push(this._toSpinResponse(r, 1, baseMarks));
            baseWin += r.totalRawWin;
        }

        // ③ Entry Toss (only if FG triggered)
        let entryCoinToss: CoinTossOutcome | undefined;
        let enterFG = false;
        if (fgTriggered) {
            const prob = isBuyFG ? ENTRY_TOSS_PROB_BUY : ENTRY_TOSS_PROB_MAIN;
            const heads = this.rng() < prob;
            entryCoinToss = { probability: prob, heads };
            enterFG = heads;
        }

        // ④ FG Spin Loop: spin → toss → upgrade or end
        const fgSpins: FGSpinOutcome[] = [];
        let fgWin = 0;
        let maxWinCapped = false;

        if (enterFG) {
            const fgMarks = new Set<string>();
            let multIdx = 0;

            for (let safety = 0; safety < 200; safety++) {
                const mult = FG_MULTIPLIERS[multIdx];

                const r = this.simulateSpin({
                    inFreeGame: true, fgMultiplier: mult,
                    buyFG: isBuyFG,
                    totalBet, lightningMarks: fgMarks,
                    // BuyFG: no SC guarantee (marks always 0 at spin start, TB can't fire)
                    // EB/MG FG: preserve SC guarantee to enable TB via accumulated marks
                    extraBet: isBuyFG ? false : extraBet,
                });

                const rawWin = r.totalRawWin;
                const spinBonus = this._drawFGSpinBonus();
                let multipliedWin = rawWin * mult * spinBonus;

                if (baseWin + fgWin + multipliedWin >= maxWinTotal) {
                    multipliedWin = Math.max(0, maxWinTotal - baseWin - fgWin);
                    maxWinCapped = true;
                }
                fgWin += multipliedWin;

                // Coin toss after this spin
                // Buy FG: toss is always heads (guaranteed full progression)
                const tossProb = isBuyFG ? 1.0
                    : (COIN_TOSS_HEADS_PROB[multIdx] ?? COIN_TOSS_HEADS_PROB[COIN_TOSS_HEADS_PROB.length - 1]);
                const tossHeads = isBuyFG ? true : this.rng() < tossProb;

                fgSpins.push({
                    multiplierIndex: multIdx,
                    multiplier: mult,
                    spin: this._toSpinResponse(r, mult, fgMarks),
                    rawWin,
                    multipliedWin,
                    spinBonus,
                    coinToss: { probability: tossProb, heads: tossHeads },
                });

                if (maxWinCapped || !tossHeads) break;

                // Buy FG: ends after completing the max multiplier (guaranteed full progression)
                if (isBuyFG && multIdx >= FG_MULTIPLIERS.length - 1) break;

                // Upgrade multiplier (stay at max if already there)
                if (multIdx < FG_MULTIPLIERS.length - 1) multIdx++;
            }
        }

        // ⑤ Calculate totals
        const totalRawWin = baseWin + fgWin;
        let totalWin = totalRawWin;

        if (isBuyFG && totalWin < BUY_FG_MIN_WIN_MULT * totalBet) {
            totalWin = BUY_FG_MIN_WIN_MULT * totalBet;
        }
        if (totalWin > maxWinTotal) {
            totalWin = maxWinTotal;
            maxWinCapped = true;
        }
        totalWin = parseFloat(totalWin.toFixed(2));

        return {
            mode, extraBetOn: extraBet, totalBet, wagered,
            baseSpins, baseWin,
            fgTriggered,
            entryCoinToss,
            fgSpins, fgWin,
            totalRawWin, totalWin, maxWinCapped,
        };
    }

    private _drawFGSpinBonus(): number {
        const total = FG_SPIN_BONUS.reduce((s, t) => s + t.weight, 0);
        let r = this.rng() * total;
        for (const tier of FG_SPIN_BONUS) {
            r -= tier.weight;
            if (r <= 0) return tier.mult;
        }
        return FG_SPIN_BONUS[FG_SPIN_BONUS.length - 1].mult;
    }

}

/** 建立引擎實例（rng 為必傳參數） */
export function createEngine(rng: () => number): SlotEngine {
    return new SlotEngine(rng);
}

/**
 * 自由函式版 checkWins（向後相容 WinChecker import）
 * 第三個參數 totalBet 為保留參數，邏輯上不使用（獎金計算由 calcWinAmount 負責）
 *
 * NOTE: 此函式僅用於 pure win detection（不消耗 RNG）。
 * checkWins() 方法只做 PAYLINES 掃描，完全不呼叫 this.rng()，
 * 因此 _sharedEngine 使用一個永遠拋出的 guard RNG 是安全的。
 * 若未來有人誤將需要 RNG 的邏輯加入此路徑，guard 會立即報錯。
 */
export function checkWins(grid: SymType[][], rows: number, _totalBet?: number): WinLine[] {
    return _sharedEngine.checkWins(grid, rows);
}

/**
 * Guard RNG: _sharedEngine 僅供 checkWins()（pure logic，不需要隨機數）。
 * 如果任何路徑意外呼叫了這個 RNG，立刻丟出錯誤以便快速定位問題。
 */
const _guardRng = () => { throw new Error('_sharedEngine RNG should never be called — checkWins() is pure'); };
const _sharedEngine = new SlotEngine(_guardRng);
