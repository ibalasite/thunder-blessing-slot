/**
 * IReelManager
 * 滾輪動畫合約 — 供 GameFlowController 呼叫，
 * 實作由 ReelManager（Cocos Component）提供；測試中以 jest.fn() mock
 */
import { SymType } from '../GameConfig';
import { WinLine } from '../SlotEngine';

export interface IReelManager {
    /** 執行旋轉動畫並停在給定盤面 */
    spinWithGrid(grid: SymType[][], fgMode?: boolean): Promise<void>;
    /** 消除中獎格並執行重力落下動畫 */
    cascade(
        winCells: { reel: number; row: number }[],
        newRows:  number,
        newSyms:  Map<string, SymType>,
    ): Promise<void>;
    /** 閃爍中獎格 */
    flashWinCells(wins: WinLine[]): Promise<void>;
    /** 更新閃電標記顯示 */
    refreshAllMarks(): void;
    /** 更新盤面顯示（TB 升階後用） */
    updateGrid(grid: SymType[][]): void;
    /** 重置滾輪到初始狀態 */
    reset(): void;
    /** Extra Bet 預覽高亮（底部 SC 保障） */
    previewExtraBet(): void;
    /** 清除 Extra Bet 預覽高亮 */
    clearPreviewExtraBet(): void;
}
