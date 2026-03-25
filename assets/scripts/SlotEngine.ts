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
 *   const engine = new SlotEngine();
 *   const grid = engine.generateGrid();
 *   const wins = engine.checkWins(grid, rows);
 *   const newSym = engine.drawSymbol();
 *   const tbGrid = engine.applyTB(grid, marks, rows);
 *
 * 使用方法（獨立測試，Node.js）：
 *   const { SlotEngine } = require('./SlotEngine');
 *   const engine = new SlotEngine(() => Math.random());
 *   let total = 0;
 *   for (let i = 0; i < 1_000_000; i++) {
 *     const r = engine.simulateSpin({ totalBet: 1 });
 *     total += r.totalRawWin;
 *   }
 *   console.log('RTP:', (total / 1_000_000 * 100).toFixed(2) + '%');
 */

import {
    SymType, SYM,
    SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_EB, SYMBOL_WEIGHTS_FG,
    PAYTABLE, PAYLINES_BY_ROWS,
    FG_MULTIPLIERS, FG_ROUND_COUNTS, SYMBOL_UPGRADE, TB_SECOND_HIT_PROB,
    REEL_COUNT, BASE_ROWS, MAX_ROWS, MAX_WIN_MULT,
    FG_TRIGGER_PROB, COIN_TOSS_HEADS_PROB, COIN_TOSS_HEADS_PROB_BUY,
    BUY_COST_MULT, EXTRA_BET_MULT,
    BUY_FG_PAYOUT_SCALE, EB_PAYOUT_SCALE,
    BUY_FG_MIN_WIN_MULT,
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
     * @param rng 隨機數來源（預設 Math.random），測試時可注入 seeded RNG
     */
    constructor(private rng: () => number = Math.random) {}

    // ── 抽一個符號 ────────────────────────────────────────────────────────────

    drawSymbol(useFG = false, useEB = false): SymType {
        const weights = useFG ? SYMBOL_WEIGHTS_FG
                      : useEB ? SYMBOL_WEIGHTS_EB
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

    generateGrid(useFG = false, useEB = false): SymType[][] {
        const grid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            grid[ri] = [];
            for (let row = 0; row < MAX_ROWS; row++) {
                grid[ri][row] = this.drawSymbol(useFG, useEB);
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

        // 第一擊
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < rows; row++) {
                if (marks.has(`${ri},${row}`)) {
                    newGrid[ri][row] = upgrade(newGrid[ri][row]);
                }
            }
        }
        // 第二擊（機率 TB_SECOND_HIT_PROB）
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
        fgMultiplier?:   number;
        lightningMarks?: Set<string>;
        totalBet?:       number;
        /** Override starting rows (e.g. Buy FG intro carries rows across spins) */
        startRows?:      number;
    } = {}): SpinResult {
        const useFG    = opts.inFreeGame   ?? false;
        const useEB    = opts.extraBet     ?? false;
        const fgMult   = opts.fgMultiplier ?? 1;
        const totalBet = opts.totalBet     ?? 1;

        // 持久化 marks (FG 中跨 spin 保留)
        const marks = opts.lightningMarks ?? new Set<string>();

        // 生成初始盤面（EB 使用 SYMBOL_WEIGHTS_EB 提高消除命中率）
        let grid = this.generateGrid(useFG, useEB);
        if (useEB) grid = this.applyExtraBetSC(grid);
        const initialGrid = grid.map(c => [...c]) as SymType[][];

        const cascadeSteps: CascadeStep[] = [];
        let totalRawWin  = 0;
        let rows         = opts.startRows ?? BASE_ROWS;
        let fgTriggered  = false;
        let maxWinCapped = false;
        let tbStep: TBStep | undefined;

        for (let iter = 0; iter < 20; iter++) {
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
                rawWin += w.multiplier * totalBet;
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
            if (totalRawWin * fgMult >= totalBet * MAX_WIN_MULT) {
                maxWinCapped = true;
                cascadeSteps.push({ wins, winCells, rawWin, rowsAfter: rows });
                break;
            }

            const newRows = Math.min(rows + 1, MAX_ROWS);
            if (newRows >= MAX_ROWS && rows < MAX_ROWS) fgTriggered = true;

            // 就地補充被消除格子
            for (const c of winCells) {
                grid[c.reel][c.row] = this.drawSymbol(useFG, useEB);
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
     * Coin Toss 升級儀式：決定 FG tier（輪數 + 倍率）。
     * 從 tier 0（8次 ×3）開始，每次 heads 升一級，tails 停止。
     * Buy FG 使用更高的升級機率（COIN_TOSS_HEADS_PROB_BUY）。
     */
    private _determineFGTier(isBuyFG = false): {
        tierIndex: number; rounds: number; multiplier: number;
        upgrades: CoinTossOutcome[];
    } {
        const probs = isBuyFG ? COIN_TOSS_HEADS_PROB_BUY : COIN_TOSS_HEADS_PROB;
        let tierIndex = 0;
        const upgrades: CoinTossOutcome[] = [];
        const maxUpgrades = FG_MULTIPLIERS.length - 1;

        for (let i = 0; i < maxUpgrades; i++) {
            const prob = probs[i] ?? probs[probs.length - 1];
            const heads = this.rng() < prob;
            upgrades.push({ probability: prob, heads });
            if (!heads) break;
            tierIndex++;
        }

        return {
            tierIndex,
            rounds:     FG_ROUND_COUNTS[tierIndex],
            multiplier: FG_MULTIPLIERS[tierIndex],
            upgrades,
        };
    }

    /**
     * 執行固定輪數的 FG chain（由 tier 決定輪數和倍率）。
     */
    private _runFGChain(totalBet: number, maxWinBudget: number,
                         rounds: number, multiplier: number, tierIndex: number): {
        spins: FGSpinOutcome[]; totalWin: number; maxWinCapped: boolean;
    } {
        const marks = new Set<string>();
        const spins: FGSpinOutcome[] = [];
        let accumulated = 0;
        let capped = false;

        for (let i = 0; i < rounds; i++) {
            const r = this.simulateSpin({
                inFreeGame: true, fgMultiplier: multiplier,
                totalBet, lightningMarks: marks,
            });
            const rawWin = r.totalRawWin;
            let multipliedWin = rawWin * multiplier;

            if (accumulated + multipliedWin >= maxWinBudget) {
                multipliedWin = Math.max(0, maxWinBudget - accumulated);
                capped = true;
            }
            accumulated += multipliedWin;

            spins.push({
                multiplierIndex: tierIndex,
                multiplier,
                spin:            this._toSpinResponse(r, multiplier, marks),
                rawWin,
                multipliedWin,
                coinToss:        { probability: 0, heads: false },
            });

            if (capped) break;
        }

        return { spins, totalWin: accumulated, maxWinCapped: capped };
    }

    /**
     * 原子轉動：一次算完 base spin + FG trigger + coin toss + FG chain。
     * UI 收到後只需依序播放動畫。
     */
    computeFullSpin(opts: {
        mode:     GameMode;
        totalBet: number;
    }): FullSpinOutcome {
        const { mode, totalBet } = opts;
        const extraBet = mode === 'extraBet';
        const isBuyFG  = mode === 'buyFG';

        const modePayoutScale = isBuyFG  ? BUY_FG_PAYOUT_SCALE
                              : extraBet ? EB_PAYOUT_SCALE
                              : 1;
        const wagered = isBuyFG  ? totalBet * BUY_COST_MULT
                      : extraBet ? totalBet * EXTRA_BET_MULT
                      : totalBet;
        const maxWinTotal = totalBet * MAX_WIN_MULT;

        const baseSpins: SpinResponse[] = [];
        let baseWin = 0;
        let fgTriggeredByBase = false;
        const baseMarks = new Set<string>();

        if (isBuyFG) {
            // Buy FG intro: rows accumulate across spins until MAX_ROWS
            let currentRows = BASE_ROWS;
            for (let s = 0; s < 50; s++) {
                const r = this.simulateSpin({ totalBet, startRows: currentRows });
                baseSpins.push(this._toSpinResponse(r, 1, baseMarks));
                baseWin += r.totalRawWin;
                currentRows = r.finalRows;
                if (r.fgTriggered || currentRows >= MAX_ROWS) {
                    fgTriggeredByBase = true;
                    break;
                }
            }
            // Safety: guarantee FG entry even if 50 spins wasn't enough
            if (!fgTriggeredByBase) {
                fgTriggeredByBase = true;
            }
        } else {
            // Main / Extra Bet: single base spin
            const r = this.simulateSpin({ totalBet, extraBet });
            baseSpins.push(this._toSpinResponse(r, 1, baseMarks));
            baseWin += r.totalRawWin;
            fgTriggeredByBase = r.fgTriggered;
        }

        // FG trigger check (main/EB: need to pass FG_TRIGGER_PROB; buyFG: always)
        let fgTriggerCheck: FullSpinOutcome['fgTriggerCheck'];
        let triggerPassed = false;
        if (fgTriggeredByBase) {
            if (isBuyFG) {
                triggerPassed = true;
            } else {
                const triggerRoll = this.rng();
                triggerPassed = triggerRoll < FG_TRIGGER_PROB;
                fgTriggerCheck = {
                    reachedMaxRows: true,
                    triggerRoll,
                    passed: triggerPassed,
                };
            }
        }

        // GDD: trigger passed → guaranteed entry. Coin toss only determines tier.
        const enterFG = triggerPassed;
        let entryCoinToss: CoinTossOutcome | undefined;

        // Tier upgrade coin toss ceremony + FG chain
        let tierUpgrades: CoinTossOutcome[] = [];
        let fgTier: FullSpinOutcome['fgTier'];
        let fgSpins: FGSpinOutcome[] = [];
        let fgWin = 0;
        let maxWinCapped = false;
        if (enterFG) {
            const tier = this._determineFGTier(isBuyFG);
            tierUpgrades = tier.upgrades;
            fgTier = { tierIndex: tier.tierIndex, rounds: tier.rounds, multiplier: tier.multiplier };

            const budget = maxWinTotal - baseWin * modePayoutScale;
            const chain = this._runFGChain(
                totalBet, budget > 0 ? budget / modePayoutScale : 0,
                tier.rounds, tier.multiplier, tier.tierIndex,
            );
            fgSpins = chain.spins;
            fgWin = chain.totalWin;
            maxWinCapped = chain.maxWinCapped;
        }

        const totalRawWin = baseWin + fgWin;
        let totalWin = totalRawWin * modePayoutScale;

        // Buy FG 最低保底：至少回 BUY_FG_MIN_WIN_MULT × totalBet
        if (isBuyFG && totalWin < BUY_FG_MIN_WIN_MULT * totalBet) {
            totalWin = BUY_FG_MIN_WIN_MULT * totalBet;
        }

        if (totalWin > maxWinTotal) {
            totalWin = maxWinTotal;
            maxWinCapped = true;
        }
        totalWin = parseFloat(totalWin.toFixed(2));

        return {
            mode, totalBet, wagered, modePayoutScale,
            baseSpins, baseWin,
            fgTriggerCheck,
            entryCoinToss,
            tierUpgrades, fgTier,
            fgSpins, fgWin,
            totalRawWin, totalWin, maxWinCapped,
        };
    }
}

/** 建立預設設定的引擎實例 */
export function createEngine(rng?: () => number): SlotEngine {
    return new SlotEngine(rng);
}

/**
 * 自由函式版 checkWins（向後相容 WinChecker import）
 * 第三個參數 totalBet 為保留參數，邏輯上不使用（獎金計算由 calcWinAmount 負責）
 */
export function checkWins(grid: SymType[][], rows: number, _totalBet?: number): WinLine[] {
    return _sharedEngine.checkWins(grid, rows);
}

// 內部共用單例，避免 checkWins 自由函式每次 new SlotEngine
const _sharedEngine = new SlotEngine();
