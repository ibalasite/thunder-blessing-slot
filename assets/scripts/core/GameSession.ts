/**
 * GameSession.ts
 * 遊戲狀態模型 — 實作 IGameSession，取代全域 gs singleton
 * 純 TypeScript，無任何 Cocos 依賴，可在 Node.js 直接測試
 */
import {
    SymType,
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
    FG_MULTIPLIERS,
    DEFAULT_BET, DEFAULT_BALANCE,
    LINES_BASE, LINES_MAX,
} from '../GameConfig';
import { IGameSession } from '../contracts/IGameSession';

export class GameSession implements IGameSession {
    // ── 盤面 ──────────────────────────────────────────────
    private _grid:     SymType[][] = [];
    private _rowCount: number[]    = Array(REEL_COUNT).fill(BASE_ROWS);

    get grid():        SymType[][]      { return this._grid; }
    get currentRows(): number           { return this._rowCount[0]; }

    setGrid(g: SymType[][]): void {
        this._grid = g.map(col => [...col]) as SymType[][];
    }

    expandRows(): void {
        const next = Math.min(this._rowCount[0] + 1, MAX_ROWS);
        this._rowCount = Array(REEL_COUNT).fill(next);
    }

    resetRows(): void {
        this._rowCount = Array(REEL_COUNT).fill(BASE_ROWS);
    }

    setCurrentRows(n: number): void {
        const clamped = Math.max(BASE_ROWS, Math.min(n, MAX_ROWS));
        this._rowCount = Array(REEL_COUNT).fill(clamped);
    }

    // ── 閃電標記 ──────────────────────────────────────────
    private _marks = new Set<string>();
    get lightningMarks(): ReadonlySet<string> { return this._marks; }

    addMark(reel: number, row: number): void  { this._marks.add(`${reel},${row}`); }
    hasMark(reel: number, row: number): boolean { return this._marks.has(`${reel},${row}`); }
    clearMarks(): void                         { this._marks.clear(); }

    // ── Free Game ─────────────────────────────────────────
    private _inFreeGame:  boolean = false;
    private _fgMultIndex: number  = 0;

    get inFreeGame():   boolean { return this._inFreeGame; }
    get fgMultIndex():  number  { return this._fgMultIndex; }
    get fgMultiplier(): number  { return FG_MULTIPLIERS[this._fgMultIndex]; }

    enterFreeGame(multIndex: number): void {
        this._inFreeGame  = true;
        this._fgMultIndex = multIndex;
    }

    exitFreeGame(): void {
        this._inFreeGame  = false;
        this._fgMultIndex = 0;
    }

    upgradeFGMultiplier(): void {
        if (this._fgMultIndex < FG_MULTIPLIERS.length - 1) {
            this._fgMultIndex++;
        }
    }

    // ── 投注 ──────────────────────────────────────────────
    private _betPerLine: number  = DEFAULT_BET / LINES_BASE;
    private _extraBetOn: boolean = false;
    private _totalBet:   number  = DEFAULT_BET;

    get betPerLine(): number  { return this._betPerLine; }
    get extraBetOn(): boolean { return this._extraBetOn; }
    get totalBet():   number  { return this._totalBet; }

    setBetPerLine(v: number): void {
        this._betPerLine = v;
        this.computeTotalBet();
    }

    setExtraBet(on: boolean): void {
        this._extraBetOn = on;
        this.computeTotalBet();
    }

    computeTotalBet(): void {
        const lines = this.currentRows <= BASE_ROWS ? LINES_BASE : LINES_MAX;
        this._totalBet = parseFloat(
            (this._betPerLine * lines * (this._extraBetOn ? 3 : 1)).toFixed(2)
        );
    }

    // ── 回合計數與累計獎金 ──────────────────────────────────
    private _cascadeCount:  number = 0;
    private _roundWin:      number = 0;
    private _scatterLanded: boolean= false;

    get cascadeCount():  number  { return this._cascadeCount; }
    get roundWin():      number  { return this._roundWin; }
    get scatterLanded(): boolean { return this._scatterLanded; }

    incrementCascade(): void   { this._cascadeCount++; }
    addRoundWin(amount: number): void {
        this._roundWin = parseFloat((this._roundWin + amount).toFixed(4));
    }
    setScatterLanded(v: boolean): void { this._scatterLanded = v; }

    resetRound(): void {
        this._roundWin      = 0;
        this._cascadeCount  = 0;
        this._scatterLanded = false;
        this.resetRows();
    }

    // ── 滾輪速度模式 ─────────────────────────────────────────
    private _turboMode: boolean = false;  // 預設 OFF（玩家首次點擊才啟用）

    get turboMode(): boolean { return this._turboMode; }

    setTurboMode(on: boolean): void { this._turboMode = on; }

    // ── 建構子 ─────────────────────────────────────────────
    constructor(
        initialBetPerLine: number = DEFAULT_BET / LINES_BASE,
    ) {
        this._betPerLine = initialBetPerLine;
        this.computeTotalBet();
    }
}
