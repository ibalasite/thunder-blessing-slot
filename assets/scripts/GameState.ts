/**
 * GameState.ts
 * 全局遊戲狀態（單例），UI 與邏輯模組共用
 */
import { REEL_COUNT, BASE_ROWS, FG_MULTIPLIERS, SymType } from './GameConfig';

export interface CellPos { reel: number; row: number; }

export class GameState {
    // ── 財務 ─────────────────────────────────────────────
    balance:     number = 1000;
    betPerLine:  number = 0.0044;   // 0.0044 × 57 ≈ 0.25 per spin
    totalBet:    number = 0.25;
    extraBetOn:  boolean = false;
    currentWin:  number = 0;
    roundWin:    number = 0;        // 本輪Cascade累計

    // ── 盤面狀態 ─────────────────────────────────────────
    /** 當前盤面  [reel][row]，由 ReelManager 寫入 */
    grid: SymType[][] = [];
    /** 每個滾輪目前顯示列數 */
    rowCount: number[] = Array(REEL_COUNT).fill(BASE_ROWS);
    /** 所有 reel 的 row 數（取 rowCount[0]，全部一致）*/
    get currentRows(): number { return this.rowCount[0]; }

    // ── 閃電標記 ─────────────────────────────────────────
    lightningMarks: Set<string> = new Set();  // key = "reel,row"

    markKey(pos: CellPos): string { return `${pos.reel},${pos.row}`; }
    addMark(pos: CellPos): void   { this.lightningMarks.add(this.markKey(pos)); }
    hasMark(pos: CellPos): boolean{ return this.lightningMarks.has(this.markKey(pos)); }
    clearMarks(): void            { this.lightningMarks.clear(); }

    // ── Free Game ─────────────────────────────────────────
    inFreeGame:    boolean = false;
    fgMultIndex:   number = 0;   // 0=×3, 1=×7, ...
    get fgMultiplier(): number { return FG_MULTIPLIERS[this.fgMultIndex]; }

    // ── 本輪輔助 ─────────────────────────────────────────
    cascadeCount:  number = 0;
    scatterLanded: boolean= false;

    // ── 輔助方法 ─────────────────────────────────────────
    computeTotalBet(): void {
        const lines  = this.currentRows <= 3 ? 25 : 57;
        this.totalBet = parseFloat((this.betPerLine * lines * (this.extraBetOn ? 3 : 1)).toFixed(2));
    }

    resetRound(): void {
        this.roundWin     = 0;
        this.cascadeCount = 0;
        this.scatterLanded= false;
        this.rowCount     = Array(REEL_COUNT).fill(BASE_ROWS);
    }
}

// 單例
export const gs = new GameState();

