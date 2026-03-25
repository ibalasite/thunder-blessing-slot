/**
 * types.ts
 * 共用資料型別 — Client / Server 共用的請求 / 回應結構
 *
 * 設計原則：一次 spin 為原子單位，所有結果（含 FG chain）一次算完。
 * UI / Client 只負責表演，不做機率運算。
 * 未來 server 版本同樣以此結構回應 client。
 */
import { SymType } from '../GameConfig';
import { WinLine, CascadeStep, TBStep } from '../SlotEngine';

// 重新導出，讓 contracts 層不需要直接 import SlotEngine
export type { SymType, WinLine, CascadeStep, TBStep };

// ── Legacy single-spin request/response（保留向後相容）──────────────────────

export interface SpinRequest {
    totalBet:    number;
    extraBet:    boolean;
    inFreeGame:  boolean;
    fgMultIndex: number;
    /** 閃電標記 key 陣列，格式 "reel,row" */
    marks:       string[];
}

export interface SpinResponse {
    grid:         SymType[][];
    cascadeSteps: CascadeStep[];
    tbStep?:      TBStep;
    totalWin:     number;
    fgTriggered:  boolean;
    finalRows:    number;
    maxWinCapped: boolean;
    newMarks:     string[];
}

// ── Atomic full-spin types（新架構）────────────────────────────────────────

export type GameMode = 'main' | 'buyFG' | 'extraBet';

export interface CoinTossOutcome {
    probability: number;
    heads:       boolean;
}

/** 一次 FG spin 的完整結果（cascade + coin toss 合為一體） */
export interface FGSpinOutcome {
    multiplierIndex: number;
    multiplier:      number;
    spin:            SpinResponse;
    rawWin:          number;
    multipliedWin:   number;
    /** 此轉結束後的 coin toss（決定是否升級繼續） */
    coinToss:        CoinTossOutcome;
}

/**
 * FullSpinOutcome — 一次 spin（或一次 Buy FG）的完整原子結果。
 *
 * 新模型：Engine 在 spin 開始時決定是否觸發 FG。
 * 若觸發 → Phase A（保證 cascade 至 MAX_ROWS）+ Phase B（Entry Toss + FG Loop）。
 * Phase A 分數一定算入 TOTAL WIN，即使 Entry Toss 失敗。
 */
export interface FullSpinOutcome {
    mode:             GameMode;
    totalBet:         number;
    wagered:          number;
    modePayoutScale:  number;

    /** Phase A: cascade spins（FG 觸發時保證到 MAX_ROWS；否則正常 spin） */
    baseSpins:        SpinResponse[];
    baseWin:          number;

    /** 是否觸發 FG（spin 開始時就決定） */
    fgTriggered:      boolean;

    /** Entry Coin Toss（FG 觸發時才有；Main/EB=80%, Buy=100%） */
    entryCoinToss?:   CoinTossOutcome;

    /** FG spin loop：每轉 = cascade + coin toss */
    fgSpins:          FGSpinOutcome[];
    fgWin:            number;

    /** 最終彙總 */
    totalRawWin:      number;
    totalWin:         number;
    maxWinCapped:     boolean;
}
