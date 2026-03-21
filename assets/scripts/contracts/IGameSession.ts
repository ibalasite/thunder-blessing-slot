/**
 * IGameSession
 * 遊戲狀態合約 — 替換全域 gs singleton
 */
import { SymType } from '../GameConfig';

export interface IGameSession {
    // ── 唯讀屬性 ──────────────────────────────────────────
    readonly grid:           SymType[][];
    readonly currentRows:    number;
    readonly inFreeGame:     boolean;
    readonly fgMultiplier:   number;
    readonly fgMultIndex:    number;
    readonly lightningMarks: ReadonlySet<string>;
    readonly cascadeCount:   number;
    readonly totalBet:       number;
    readonly betPerLine:     number;
    readonly extraBetOn:     boolean;
    readonly roundWin:       number;
    readonly turboMode:      boolean;

    // ── 盤面狀態變更 ──────────────────────────────────────
    setGrid(g: SymType[][]): void;
    expandRows(): void;
    resetRows(): void;
    /** 直接設定所有欄的可見列數（cascade 或 previewExtraBet 使用）*/
    setCurrentRows(n: number): void;

    // ── 回合控制 ──────────────────────────────────────────
    resetRound(): void;
    addRoundWin(amount: number): void;
    incrementCascade(): void;

    // ── Free Game 控制 ────────────────────────────────────
    enterFreeGame(multIndex: number): void;
    exitFreeGame(): void;
    upgradeFGMultiplier(): void;

    // ── 閃電標記 ──────────────────────────────────────────
    addMark(reel: number, row: number): void;
    clearMarks(): void;
    hasMark(reel: number, row: number): boolean;

    // ── 投注設定 ──────────────────────────────────────────
    setExtraBet(on: boolean): void;
    setBetPerLine(v: number): void;
    computeTotalBet(): void;
    setTurboMode(on: boolean): void;
}
