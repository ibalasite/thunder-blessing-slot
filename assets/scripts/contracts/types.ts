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

/** 一次 FG spin 的完整結果 */
export interface FGSpinOutcome {
    multiplierIndex: number;
    multiplier:      number;
    spin:            SpinResponse;
    rawWin:          number;
    multipliedWin:   number;
    coinToss:        CoinTossOutcome;
}

/**
 * FullSpinOutcome — 一次 spin（或一次 Buy FG）的完整原子結果。
 *
 * Engine 一次算完，UI / Client 依序播放動畫。
 * 斷線復原時 server 只需重送此結構。
 */
export interface FullSpinOutcome {
    mode:             GameMode;
    totalBet:         number;
    wagered:          number;
    modePayoutScale:  number;

    /** 基礎 spin（main/EB=1筆, buyFG=多筆 intro spins） */
    baseSpins:        SpinResponse[];
    baseWin:          number;

    /** FG 觸發判定（main/EB 模式才有） */
    fgTriggerCheck?: {
        reachedMaxRows: boolean;
        triggerRoll:    number;
        passed:         boolean;
    };

    /** 入場硬幣（觸發 FG 時才有；main/EB 決定是否進入，buyFG 保底 heads） */
    entryCoinToss?:   CoinTossOutcome;

    /** Tier 升級硬幣序列（進入 FG 後，決定輪數 8/12/20 及倍率） */
    tierUpgrades:     CoinTossOutcome[];
    /** 最終 FG tier（tierIndex 對應 FG_MULTIPLIERS / FG_ROUND_COUNTS） */
    fgTier?:          { tierIndex: number; rounds: number; multiplier: number };

    /** FG chain 每轉結果（長度 = fgTier.rounds） */
    fgSpins:          FGSpinOutcome[];
    fgWin:            number;

    /** 最終彙總 */
    totalRawWin:      number;
    totalWin:         number;
    maxWinCapped:     boolean;
}
