/**
 * WinChecker.ts
 * 純邏輯模組：掃描盤面連線中獎、並回傳中獎資訊
 */
import { PAYTABLE, PAYLINES_25, SYM, SymType } from './GameConfig';
import { CellPos } from './GameState';

export interface WinResult {
    lineIndex: number;        // 連線編號
    rowPath:   number[];      // 每個滾輪的列位置
    symbol:    SymType;       // 中獎符號
    count:     number;        // 連續符號數 (3/4/5)
    multiplier:number;        // 賠率倍數
    cells:     CellPos[];     // 中獎的格子座標
}

/**
 * 檢查盤面中獎
 * @param grid [reel][row] - 當前盤面符號
 * @param rows 當前有效列數
 * @param totalBet 總投注額
 */
export function checkWins(grid: SymType[][], rows: number, totalBet: number): WinResult[] {
    const results: WinResult[] = [];
    const lines = PAYLINES_25;        // V1 先用25線（6列後應使用57線，TODO V2）

    for (let li = 0; li < lines.length; li++) {
        const rowPath = lines[li];
        // 確認每個位置的 row index 都在有效範圍內
        if (rowPath.some(r => r >= rows)) continue;

        const firstSym = grid[0][rowPath[0]];
        // 計算從左邊連續幾個符號相同（Wild 可替換）
        let count = 1;
        for (let ri = 1; ri < 5; ri++) {
            const sym = grid[ri][rowPath[ri]];
            if (sym === firstSym || sym === SYM.WILD || firstSym === SYM.WILD) {
                count = ri + 1;
            } else {
                break;
            }
        }
        if (count < 3) continue;

        // 決定實際中獎符號（Wild 連線時，看第一個非 Wild 符號）
        let matchSym: SymType = firstSym;
        if (firstSym === SYM.WILD) {
            for (let ri = 1; ri < count; ri++) {
                if (grid[ri][rowPath[ri]] !== SYM.WILD) { matchSym = grid[ri][rowPath[ri]]; break; }
            }
        }
        if (matchSym === SYM.SCATTER) continue;  // Scatter 不計一般連線

        const multiplier = PAYTABLE[matchSym][count];
        if (multiplier <= 0) continue;

        const cells: CellPos[] = [];
        for (let ri = 0; ri < count; ri++) {
            cells.push({ reel: ri, row: rowPath[ri] });
        }

        results.push({ lineIndex: li, rowPath, symbol: matchSym, count, multiplier, cells });
    }
    return results;
}

/** 計算獎金：totalBet × multiplier（FG 倍率在外層套用）*/
export function calcWinAmount(res: WinResult, totalBet: number): number {
    return parseFloat((totalBet * res.multiplier).toFixed(4));
}

/** 取得盤面上所有 Scatter 位置 */
export function findScatters(grid: SymType[][], rows: number): CellPos[] {
    const pos: CellPos[] = [];
    for (let ri = 0; ri < grid.length; ri++) {
        for (let row = 0; row < rows; row++) {
            if (grid[ri][row] === SYM.SCATTER) pos.push({ reel: ri, row });
        }
    }
    return pos;
}
