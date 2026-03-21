/**
 * types.ts
 * 共用資料型別 — Client / Server 共用的請求 / 回應結構
 */
import { SymType } from '../GameConfig';
import { WinLine, CascadeStep, TBStep } from '../SlotEngine';

// 重新導出，讓 contracts 層不需要直接 import SlotEngine
export type { SymType, WinLine, CascadeStep, TBStep };

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
    totalWin:     number;        // 總獎金（FG 倍率已套用）
    fgTriggered:  boolean;
    finalRows:    number;
    maxWinCapped: boolean;
    newMarks:     string[];
}
