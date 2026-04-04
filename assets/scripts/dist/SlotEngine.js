"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlotEngine = void 0;
exports.calcWinAmount = calcWinAmount;
exports.findScatters = findScatters;
exports.createEngine = createEngine;
exports.checkWins = checkWins;
const GameConfig_1 = require("./GameConfig");
/** 計算獎金：totalBet × multiplier */
function calcWinAmount(res, totalBet) {
    return parseFloat((totalBet * res.multiplier).toFixed(4));
}
/** 取得盤面上所有 Scatter 位置 */
function findScatters(grid, rows) {
    const pos = [];
    for (let ri = 0; ri < grid.length; ri++) {
        for (let row = 0; row < rows; row++) {
            if (grid[ri][row] === GameConfig_1.SYM.SCATTER)
                pos.push({ reel: ri, row });
        }
    }
    return pos;
}
// ─── SlotEngine ───────────────────────────────────────────────────────────────
class SlotEngine {
    /**
     * @param rng 隨機數來源（必傳）。
     *   Production: 傳入 createCSPRNG()
     *   Test: 傳入 mulberry32(seed)
     *   禁止使用 Math.random。
     */
    constructor(rng) {
        this.rng = rng;
    }
    // ── 抽一個符號 ────────────────────────────────────────────────────────────
    drawSymbol(useFG = false, useEB = false, useBuyFG = false) {
        const weights = useBuyFG ? GameConfig_1.SYMBOL_WEIGHTS_BUY_FG
            : useFG ? GameConfig_1.SYMBOL_WEIGHTS_FG
                : useEB ? GameConfig_1.SYMBOL_WEIGHTS_EB
                    : GameConfig_1.SYMBOL_WEIGHTS;
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        let r = this.rng() * total;
        for (const [sym, w] of Object.entries(weights)) {
            r -= w;
            if (r <= 0)
                return sym;
        }
        const keys = Object.keys(weights);
        return keys[keys.length - 1];
    }
    // ── 生成 5×6 盤面 ─────────────────────────────────────────────────────────
    generateGrid(useFG = false, useEB = false, useBuyFG = false) {
        const grid = [];
        for (let ri = 0; ri < GameConfig_1.REEL_COUNT; ri++) {
            grid[ri] = [];
            for (let row = 0; row < GameConfig_1.MAX_ROWS; row++) {
                grid[ri][row] = this.drawSymbol(useFG, useEB, useBuyFG);
            }
        }
        return grid;
    }
    // ── Extra Bet：保證基底列（row 0~2）有 SC ─────────────────────────────────
    applyExtraBetSC(grid) {
        let hasSC = false;
        outer: for (let ri = 0; ri < GameConfig_1.REEL_COUNT; ri++) {
            for (let row = 0; row < GameConfig_1.BASE_ROWS; row++) {
                if (grid[ri][row] === GameConfig_1.SYM.SCATTER) {
                    hasSC = true;
                    break outer;
                }
            }
        }
        if (hasSC)
            return grid;
        const newGrid = grid.map(col => [...col]);
        const ri = Math.floor(this.rng() * GameConfig_1.REEL_COUNT);
        const row = Math.floor(this.rng() * GameConfig_1.BASE_ROWS);
        newGrid[ri][row] = GameConfig_1.SYM.SCATTER;
        return newGrid;
    }
    // ── 掃描連線中獎（使用 PAYLINES_BY_ROWS，自動匹配當前列數）─────────────────
    checkWins(grid, rows) {
        var _a;
        const lines = (_a = GameConfig_1.PAYLINES_BY_ROWS[rows]) !== null && _a !== void 0 ? _a : GameConfig_1.PAYLINES_BY_ROWS[GameConfig_1.BASE_ROWS];
        const results = [];
        for (let li = 0; li < lines.length; li++) {
            const rowPath = lines[li];
            if (rowPath.some(r => r >= rows))
                continue;
            const firstSym = grid[0][rowPath[0]];
            // Resolve matchSym first: Wild substitutes for the first non-Wild symbol
            let matchSym = firstSym;
            if (firstSym === GameConfig_1.SYM.WILD) {
                for (let ri = 1; ri < GameConfig_1.REEL_COUNT; ri++) {
                    const s = grid[ri][rowPath[ri]];
                    if (s !== GameConfig_1.SYM.WILD) {
                        matchSym = s;
                        break;
                    }
                }
            }
            if (matchSym === GameConfig_1.SYM.SCATTER)
                continue;
            // Count consecutive matching symbols (matchSym or Wild) from the left
            let count = 1;
            for (let ri = 1; ri < GameConfig_1.REEL_COUNT; ri++) {
                const sym = grid[ri][rowPath[ri]];
                if (sym === matchSym || sym === GameConfig_1.SYM.WILD) {
                    count = ri + 1;
                }
                else
                    break;
            }
            if (count < 3)
                continue;
            const multiplier = GameConfig_1.PAYTABLE[matchSym][count];
            if (!multiplier || multiplier <= 0)
                continue;
            const cells = [];
            for (let ri = 0; ri < count; ri++) {
                cells.push({ reel: ri, row: rowPath[ri] });
            }
            results.push({ lineIndex: li, rowPath, symbol: matchSym, count, multiplier, cells });
        }
        return results;
    }
    // ── 雷霆祝福：升階所有閃電標記格（含第二擊機率）────────────────────────────
    applyTB(grid, marks, rows) {
        const newGrid = grid.map(col => [...col]);
        const upgrade = (sym) => { var _a; return ((_a = GameConfig_1.SYMBOL_UPGRADE[sym]) !== null && _a !== void 0 ? _a : sym); };
        // 第一擊：所有閃電標記格升階一次
        // First hit: every marked cell is upgraded once via SYMBOL_UPGRADE chain.
        // Example: L1 → P4 (low-tier lightning symbol becomes mid-tier premium)
        for (let ri = 0; ri < GameConfig_1.REEL_COUNT; ri++) {
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
        if (this.rng() < GameConfig_1.TB_SECOND_HIT_PROB) {
            for (let ri = 0; ri < GameConfig_1.REEL_COUNT; ri++) {
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
    simulateSpin(opts = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const useFG = (_a = opts.inFreeGame) !== null && _a !== void 0 ? _a : false;
        const useEB = (_b = opts.extraBet) !== null && _b !== void 0 ? _b : false;
        const useBuyFG = (_c = opts.buyFG) !== null && _c !== void 0 ? _c : false;
        const fgMult = (_d = opts.fgMultiplier) !== null && _d !== void 0 ? _d : 1;
        const totalBet = (_e = opts.totalBet) !== null && _e !== void 0 ? _e : 1;
        const maxCascade = (_f = opts.maxCascade) !== null && _f !== void 0 ? _f : 20;
        const marks = (_g = opts.lightningMarks) !== null && _g !== void 0 ? _g : new Set();
        let grid = this.generateGrid(useFG, useEB, useBuyFG);
        if (useEB)
            grid = this.applyExtraBetSC(grid);
        const initialGrid = grid.map(c => [...c]);
        const cascadeSteps = [];
        let totalRawWin = 0;
        let rows = (_h = opts.startRows) !== null && _h !== void 0 ? _h : GameConfig_1.BASE_ROWS;
        let fgTriggered = false;
        let maxWinCapped = false;
        let tbStep;
        for (let iter = 0; iter < maxCascade; iter++) {
            const wins = this.checkWins(grid, rows);
            if (wins.length === 0) {
                // 無中獎 → 嘗試觸發 TB
                let hasScatter = false;
                outer: for (let ri = 0; ri < GameConfig_1.REEL_COUNT; ri++) {
                    for (let row = 0; row < rows; row++) {
                        if (grid[ri][row] === GameConfig_1.SYM.SCATTER) {
                            hasScatter = true;
                            break outer;
                        }
                    }
                }
                if (!hasScatter || marks.size === 0)
                    break; // 完全無中獎，結束
                // 執行 TB
                const markedList = [];
                for (const key of marks) {
                    const [ri, row] = key.split(',').map(Number);
                    if (row < rows)
                        markedList.push({ reel: ri, row });
                }
                const tbGrid = this.applyTB(grid, marks, rows);
                marks.clear();
                grid = tbGrid;
                tbStep = {
                    markedCells: markedList,
                    gridAfter: grid.map(c => [...c]),
                };
                continue; // 繼續下一輪 cascade 檢查
            }
            // 去重 win cells，累計賠付
            const seenCell = new Set();
            const winCells = [];
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
            if (totalRawWin * fgMult >= totalBet * GameConfig_1.MAX_WIN_MULT) {
                maxWinCapped = true;
                cascadeSteps.push({ wins, winCells, rawWin, rowsAfter: rows });
                break;
            }
            const newRows = Math.min(rows + 1, GameConfig_1.MAX_ROWS);
            if (newRows >= GameConfig_1.MAX_ROWS && rows < GameConfig_1.MAX_ROWS)
                fgTriggered = true;
            for (const c of winCells) {
                grid[c.reel][c.row] = this.drawSymbol(useFG, useEB, useBuyFG);
            }
            cascadeSteps.push({ wins, winCells, rawWin, rowsAfter: newRows });
            rows = newRows;
        }
        return {
            initialGrid, finalGrid: grid.map(c => [...c]),
            cascadeSteps, tbStep,
            totalRawWin, fgTriggered,
            finalRows: rows, maxWinCapped,
        };
    }
    // ══════════════════════════════════════════════════════════════════════════
    // Atomic full-spin: 一次算完所有結果（含 FG chain），UI 只負責播放
    // ══════════════════════════════════════════════════════════════════════════
    _toSpinResponse(r, fgMult, marks) {
        return {
            grid: r.finalGrid,
            cascadeSteps: r.cascadeSteps,
            tbStep: r.tbStep,
            totalWin: parseFloat((r.totalRawWin * fgMult).toFixed(4)),
            fgTriggered: r.fgTriggered,
            finalRows: r.finalRows,
            maxWinCapped: r.maxWinCapped,
            newMarks: Array.from(marks),
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
    computeFullSpin(opts) {
        var _a;
        const { mode, totalBet } = opts;
        const isBuyFG = mode === 'buyFG';
        // extraBet flag: true for 'extraBet' mode OR when extraBetOn is explicitly set
        const extraBet = mode === 'extraBet' || opts.extraBetOn === true;
        const wagered = isBuyFG ? totalBet * GameConfig_1.BUY_COST_MULT
            : extraBet ? totalBet * GameConfig_1.EXTRA_BET_MULT
                : totalBet;
        const maxWinTotal = totalBet * GameConfig_1.MAX_WIN_MULT;
        // ① Decide FG trigger at spin start
        const fgTriggered = isBuyFG ? true : this.rng() < GameConfig_1.FG_TRIGGER_PROB;
        // ② Phase A: cascade spins
        const baseSpins = [];
        const baseMarks = new Set();
        let baseWin = 0;
        if (fgTriggered) {
            let currentRows = GameConfig_1.BASE_ROWS;
            for (let s = 0; s < 100; s++) {
                const r = this.simulateSpin({
                    totalBet,
                    extraBet, // pass SC guarantee for extraBet AND extraBetOn+buyFG
                    buyFG: isBuyFG,
                    startRows: currentRows,
                    lightningMarks: baseMarks,
                });
                baseSpins.push(this._toSpinResponse(r, 1, baseMarks));
                baseWin += r.totalRawWin;
                currentRows = r.finalRows;
                if (currentRows >= GameConfig_1.MAX_ROWS)
                    break;
            }
        }
        else {
            // Normal single spin
            const r = this.simulateSpin({ totalBet, extraBet });
            baseSpins.push(this._toSpinResponse(r, 1, baseMarks));
            baseWin += r.totalRawWin;
        }
        // ③ Entry Toss (only if FG triggered)
        let entryCoinToss;
        let enterFG = false;
        if (fgTriggered) {
            const prob = isBuyFG ? GameConfig_1.ENTRY_TOSS_PROB_BUY : GameConfig_1.ENTRY_TOSS_PROB_MAIN;
            const heads = this.rng() < prob;
            entryCoinToss = { probability: prob, heads };
            enterFG = heads;
        }
        // ④ FG Spin Loop: spin → toss → upgrade or end
        const fgSpins = [];
        let fgWin = 0;
        let maxWinCapped = false;
        if (enterFG) {
            const fgMarks = new Set();
            let multIdx = 0;
            for (let safety = 0; safety < 200; safety++) {
                const mult = GameConfig_1.FG_MULTIPLIERS[multIdx];
                const r = this.simulateSpin({
                    inFreeGame: true, fgMultiplier: mult,
                    buyFG: isBuyFG,
                    totalBet, lightningMarks: fgMarks,
                    extraBet,
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
                    : ((_a = GameConfig_1.COIN_TOSS_HEADS_PROB[multIdx]) !== null && _a !== void 0 ? _a : GameConfig_1.COIN_TOSS_HEADS_PROB[GameConfig_1.COIN_TOSS_HEADS_PROB.length - 1]);
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
                if (maxWinCapped || !tossHeads)
                    break;
                // Buy FG: ends after completing the max multiplier (guaranteed full progression)
                if (isBuyFG && multIdx >= GameConfig_1.FG_MULTIPLIERS.length - 1)
                    break;
                // Upgrade multiplier (stay at max if already there)
                if (multIdx < GameConfig_1.FG_MULTIPLIERS.length - 1)
                    multIdx++;
            }
        }
        // ⑤ Calculate totals
        const totalRawWin = baseWin + fgWin;
        let totalWin = totalRawWin;
        if (isBuyFG && totalWin < GameConfig_1.BUY_FG_MIN_WIN_MULT * totalBet) {
            totalWin = GameConfig_1.BUY_FG_MIN_WIN_MULT * totalBet;
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
    _drawFGSpinBonus() {
        const total = GameConfig_1.FG_SPIN_BONUS.reduce((s, t) => s + t.weight, 0);
        let r = this.rng() * total;
        for (const tier of GameConfig_1.FG_SPIN_BONUS) {
            r -= tier.weight;
            if (r <= 0)
                return tier.mult;
        }
        return GameConfig_1.FG_SPIN_BONUS[GameConfig_1.FG_SPIN_BONUS.length - 1].mult;
    }
}
exports.SlotEngine = SlotEngine;
/** 建立引擎實例（rng 為必傳參數） */
function createEngine(rng) {
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
function checkWins(grid, rows, _totalBet) {
    return _sharedEngine.checkWins(grid, rows);
}
/**
 * Guard RNG: _sharedEngine 僅供 checkWins()（pure logic，不需要隨機數）。
 * 如果任何路徑意外呼叫了這個 RNG，立刻丟出錯誤以便快速定位問題。
 */
const _guardRng = () => { throw new Error('_sharedEngine RNG should never be called — checkWins() is pure'); };
const _sharedEngine = new SlotEngine(_guardRng);
