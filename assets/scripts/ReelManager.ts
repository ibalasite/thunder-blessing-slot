/**
 * ReelManager.ts
 * Cocos Creator Component：管理所有5個滾輪的視覺呈現與旋轉動畫
 * 掛在名為 "ReelArea" 的 Node 上
 */
import { _decorator, Component, Node, Label, Sprite, Color, UITransform, 
         Graphics, tween, Vec3, SpriteFrame, Texture2D, CCInteger, 
         CCFloat, EventTarget } from 'cc';
import { REEL_COUNT, BASE_ROWS, MAX_ROWS, SYMBOL_W, SYMBOL_H, SYMBOL_GAP,
         REEL_GAP, REEL_STRIP, SYMBOL_COLORS, SYMBOL_DARK, SYMBOL_LABELS, SymType, SYM, CANVAS_W } from './GameConfig';
import { gs } from './GameState';
import { WinResult } from './WinChecker';

const { ccclass, property } = _decorator;

// 每個符號格子的 View
interface SymCell {
    node:    Node;
    bgGfx:   Graphics;
    label:   Label;
    markGfx: Graphics; // 閃電標記覆蓋層
    sym:     SymType;
}

@ccclass('ReelManager')
export class ReelManager extends Component {
    // 事件匯流排 (GameBootstrap 監聽用)
    static events = new EventTarget();

    // 每個滾輪的符號格子 [reel][row]
    private cells: SymCell[][] = [];
    // 每個滾輪目前顯示的起始 Strip 索引
    private stripIdx: number[] = Array(REEL_COUNT).fill(0);
    // 是否正在旋轉
    private spinning = false;
    // 雲朵遮罩節點和圖形元件
    private cloudNode: Node | null = null;
    private cloudGfx: Graphics | null = null;

    start() {
        this.buildGrid();
    }

    // ── 建立初始格子 ─────────────────────────────────────
    private buildGrid(): void {
        this.cells = [];
        const startX = -((REEL_COUNT - 1) * (SYMBOL_W + REEL_GAP)) / 2;

        for (let ri = 0; ri < REEL_COUNT; ri++) {
            this.cells[ri] = [];
            const rx = startX + ri * (SYMBOL_W + REEL_GAP);

            for (let row = 0; row < MAX_ROWS; row++) {
                const cell = this.createCell(ri, row, rx);
                this.cells[ri][row] = cell;
                // 所有格子都保持 active — 雲朵 Mask 會遮住下方列
            }
        }
        this.addCloudPanel();
        this.randomizeGrid();
    }

    private createCell(ri: number, row: number, rx: number): SymCell {
        const cellNode = new Node(`cell_${ri}_${row}`);
        this.node.addChild(cellNode);

        const uit = cellNode.addComponent(UITransform);
        uit.setContentSize(SYMBOL_W, SYMBOL_H);

        // 計算位置（Y 向上為正，row=0 在頂部）— 永遠用 MAX_ROWS 定位，位置固定不動
        const ry = this.rowToY(row, MAX_ROWS);
        cellNode.setPosition(rx, ry, 0);

        // 背景圖形
        const bgNode = new Node('bg');
        cellNode.addChild(bgNode);
        const bgGfx = bgNode.addComponent(Graphics);

        // 閃電標記覆蓋層
        const markNode = new Node('mark');
        cellNode.addChild(markNode);
        const markGfx = markNode.addComponent(Graphics);

        // 符號文字
        const lblNode = new Node('lbl');
        cellNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.fontSize = 22;
        lbl.isBold   = true;
        lbl.color    = new Color(255, 255, 255, 255);
        const lblUit = lblNode.addComponent(UITransform);
        lblUit.setContentSize(SYMBOL_W, SYMBOL_H);

        return { node: cellNode, bgGfx, label: lbl, markGfx, sym: SYM.L4 };
    }

    /** row 轉換為 Y 座標（row=0 在最底部，row 增加 = 往上） */
    private rowToY(row: number, _totalRows: number): number {
        const totalH = MAX_ROWS * SYMBOL_H + (MAX_ROWS - 1) * SYMBOL_GAP;
        const bottom = -(totalH / 2 - SYMBOL_H / 2);
        return bottom + row * (SYMBOL_H + SYMBOL_GAP);
    }

    /** 更新符號格外觀 */
    private drawCell(cell: SymCell, sym: SymType): void {
        cell.sym = sym;
        const color  = SYMBOL_COLORS[sym] || '#888888';
        const dark   = SYMBOL_DARK[sym]   || '#222222';
        const hw = SYMBOL_W / 2, hh = SYMBOL_H / 2;

        const g = cell.bgGfx;
        g.clear();
        // 外框
        const fc = Color.fromHEX(new Color(), dark);
        g.fillColor = fc;
        g.roundRect(-hw, -hh, SYMBOL_W, SYMBOL_H, 10);
        g.fill();
        // 內填漸層波 (top highlight)
        const ic = Color.fromHEX(new Color(), color);
        g.fillColor = ic;
        g.roundRect(-hw + 3, -hh + 3, SYMBOL_W - 6, SYMBOL_H - 6, 8);
        g.fill();
        // 頂部亮背光
        const hi = Color.fromHEX(new Color(), '#ffffff22');
        g.fillColor = hi;
        g.roundRect(-hw + 5, -hh + 5, SYMBOL_W - 10, (SYMBOL_H - 10) * 0.45, 6);
        g.fill();

        // 顯示希臘神話符號名稱，抗的字体稍小
        const label = SYMBOL_LABELS[sym] || sym;
        cell.label.fontSize = label.length > 4 ? 14 : 18;
        cell.label.string = label;
    }

    /** 繪製閃電標記 */
    updateMark(ri: number, row: number, show: boolean): void {
        const cell = this.cells[ri]?.[row];
        if (!cell) return;
        const g = cell.markGfx;
        g.clear();
        if (!show) return;
        const hw = SYMBOL_W / 2, hh = SYMBOL_H / 2;

        // Blue tint wash
        g.fillColor = new Color(0, 70, 200, 28);
        g.roundRect(-hw + 3, -hh + 3, SYMBOL_W - 6, SYMBOL_H - 6, 8);
        g.fill();
        // Bright blue border
        g.strokeColor = new Color(50, 150, 255, 220);
        g.lineWidth   = 4;
        g.roundRect(-hw + 2, -hh + 2, SYMBOL_W - 4, SYMBOL_H - 4, 9);
        g.stroke();
        // Inner glow ring
        g.strokeColor = new Color(100, 190, 255, 65);
        g.lineWidth   = 8;
        g.roundRect(-hw + 6, -hh + 6, SYMBOL_W - 12, SYMBOL_H - 12, 7);
        g.stroke();

        // ⚡ Lightning bolt shape — top-right corner
        const bx = hw - 13, by = hh - 14;
        g.strokeColor = new Color(255, 220, 30, 240);
        g.lineWidth   = 2.5;
        g.moveTo(bx + 2, by - 7);   // top
        g.lineTo(bx - 1, by + 1);   // mid-left
        g.lineTo(bx + 2, by + 1);   // mid-right kink
        g.lineTo(bx - 2, by + 7);   // bottom
        g.stroke();
    }

    /** 重新繪製所有閃電標記狀態 */
    refreshAllMarks(): void {
        const rows = gs.currentRows;
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < rows; row++) {
                this.updateMark(ri, row, gs.hasMark({ reel: ri, row }));
            }
        }
    }

    /**
     * 中獎連線金色閃光 + 連線路徑高亮（cascade 前呼叫）
     * 約 0.45 秒後 resolve
     */
    flashWinCells(wins: WinResult[]): Promise<void> {
        return new Promise<void>(resolve => {
            const seen = new Set<string>();
            const flashNode = new Node('WinFlash');
            this.node.addChild(flashNode);
            flashNode.addComponent(UITransform).setContentSize(
                REEL_COUNT * (SYMBOL_W + REEL_GAP) + SYMBOL_W * 2,
                MAX_ROWS * (SYMBOL_H + SYMBOL_GAP) + SYMBOL_H);
            const g = flashNode.addComponent(Graphics);

            for (const win of wins) {
                // ① Payline connector line
                g.strokeColor = new Color(255, 200, 20, 190);
                g.lineWidth = 4;
                for (let i = 0; i < win.cells.length; i++) {
                    const c = win.cells[i];
                    const cx = this.cells[c.reel][0].node.position.x;
                    const cy = this.rowToY(c.row, MAX_ROWS);
                    if (i === 0) g.moveTo(cx, cy); else g.lineTo(cx, cy);
                }
                g.stroke();

                // ② Gold glow frame per unique winning cell
                for (const c of win.cells) {
                    const key = `${c.reel},${c.row}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const cx = this.cells[c.reel][0].node.position.x;
                    const cy = this.rowToY(c.row, MAX_ROWS);
                    const hw = SYMBOL_W / 2, hh = SYMBOL_H / 2;
                    // Outer soft glow
                    g.fillColor = new Color(255, 190, 0, 55);
                    g.roundRect(cx - hw - 7, cy - hh - 7, SYMBOL_W + 14, SYMBOL_H + 14, 15);
                    g.fill();
                    // Gold border
                    g.strokeColor = new Color(255, 200, 20, 255);
                    g.lineWidth = 3;
                    g.roundRect(cx - hw - 1, cy - hh - 1, SYMBOL_W + 2, SYMBOL_H + 2, 11);
                    g.stroke();
                    // Scale pulse on the cell
                    const cell = this.cells[c.reel][c.row];
                    tween(cell.node)
                        .to(0.11, { scale: new Vec3(1.12, 1.12, 1) })
                        .to(0.11, { scale: new Vec3(0.97, 0.97, 1) })
                        .to(0.09, { scale: new Vec3(1.06, 1.06, 1) })
                        .to(0.09, { scale: new Vec3(1,    1,    1) })
                        .start();
                }
            }

            this.scheduleOnce(() => { flashNode.destroy(); resolve(); }, 0.44);
        });
    }
    private randomizeGrid(): void {
        const grid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            grid[ri] = [];
            for (let row = 0; row < MAX_ROWS; row++) {
                const sym = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
                grid[ri][row] = sym;
                this.drawCell(this.cells[ri][row], sym);
            }
        }
        gs.grid = grid;
    }

    // ── 雲霧遮罩 ─────────────────────────────────────────
    /** 建立雲霧遮罩 Panel（加在所有 cell 之後，確保繪製在最上層） */
    private addCloudPanel(): void {
        const n = new Node('CloudMask');
        this.node.addChild(n);
        const totalW = REEL_COUNT * (SYMBOL_W + REEL_GAP) + REEL_GAP;
        const totalH = MAX_ROWS * (SYMBOL_H + SYMBOL_GAP) + SYMBOL_H;
        const uit = n.addComponent(UITransform);
        uit.setContentSize(totalW, totalH);
        this.cloudGfx = n.addComponent(Graphics);
        this.cloudNode = n;
        this.setCloud(BASE_ROWS);
    }

    /** 依目前可見列數更新雲霧遮罩（雲在上方，遮住頂部隱藏列） */
    setCloud(visibleRows: number): void {
        if (!this.cloudGfx || !this.cloudNode) return;
        const cloudRows = MAX_ROWS - visibleRows;
        const g = this.cloudGfx;
        g.clear();
        if (cloudRows <= 0) { this.cloudNode.active = false; return; }
        this.cloudNode.active = true;

        // 寬度覆蓋整個滾輪區（含左右各半格餘量）
        const totalW = REEL_COUNT * (SYMBOL_W + REEL_GAP) + SYMBOL_W;
        // 雲霧覆蓋上方隱藏列（row visibleRows ~ MAX_ROWS-1）
        // cloudBottom = 最後可見列頂邊 + 半行間距
        const topVisY   = this.rowToY(visibleRows - 1, MAX_ROWS);
        const cloudBottom = topVisY + SYMBOL_H / 2 + SYMBOL_GAP / 2;
        // cloudTop = 最頂列頂邊 + 餘量
        const topRowY   = this.rowToY(MAX_ROWS - 1, MAX_ROWS);
        const cloudTop  = topRowY + SYMBOL_H / 2 + 6;
        const cloudH    = cloudTop - cloudBottom;

        // ① 半透明底色：符號仍可見，但有色調標示雲朵區域
        g.fillColor = new Color(15, 30, 80, 155);
        g.rect(-totalW / 2, cloudBottom, totalW, cloudH);
        g.fill();

        // ② 雲朵羽化層：底部邊緣由透明漸變，製造霧氣感（alpha 較低保持透明度）
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const alpha = Math.floor(120 - i * 18);   // 下→上：120→12（保持半透明）
            g.fillColor = new Color(60, 120, 220, alpha);
            const bandH = 18;
            g.roundRect(-totalW / 2 + 4, cloudBottom + i * bandH, totalW - 8, bandH, 10);
            g.fill();
        }

        // ③ 底邊分隔高光線
        g.strokeColor = new Color(110, 175, 255, 180);
        g.lineWidth = 2;
        g.moveTo(-totalW / 2 + 8, cloudBottom);
        g.lineTo(totalW / 2 - 8, cloudBottom);
        g.stroke();
    }

    // ── 旋轉動畫 ─────────────────────────────────────────
    /** 永遠旋轉完整 5×6，顯示列數由雲朵控制 */
    spin(): Promise<void> {
        if (this.spinning) return Promise.resolve();
        this.spinning = true;

        // 生成完整 6 列結果盤面（含雲朵遮蔽列）
        const resultGrid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            resultGrid[ri] = [];
            for (let row = 0; row < MAX_ROWS; row++) {
                // Extra Bet: 保證滾輪3（index 2）一定有 Scatter（如果 extraBetOn）
                if (gs.extraBetOn && ri === 2 && row === 0) {
                    resultGrid[ri][row] = SYM.SCATTER;
                } else {
                    resultGrid[ri][row] = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
                }
            }
        }

        return new Promise<void>(resolve => {
            let done = 0;
            for (let ri = 0; ri < REEL_COUNT; ri++) {
                const delay = ri * 0.12;
                this.spinReel(ri, resultGrid[ri], delay, () => {
                    done++;
                    if (done === REEL_COUNT) {
                        gs.grid = resultGrid;
                        this.spinning = false;
                        resolve();
                    }
                });
            }
        });
    }

    /** 所有 6 個格子全部從框外上方同時落下，雲朵在下方遮蔽上層 */
    private spinReel(ri: number, result: SymType[], delay: number, cb: () => void): void {
        const topRowY  = this.rowToY(MAX_ROWS - 1, MAX_ROWS);
        const entryY   = topRowY + SYMBOL_H * 2 + SYMBOL_GAP;   // 框外上方，遮罩裁切不可見
        const spinDist = (SYMBOL_H + SYMBOL_GAP) * (MAX_ROWS + 2);

        this.scheduleOnce(() => {
            const reel = this.cells[ri];

            // ① 停止殘留 tween，快照各格 Y 後一起向下退出
            for (let row = 0; row < MAX_ROWS; row++) {
                const n  = reel[row].node;
                const px = n.position.x;
                const sy = n.position.y;   // 快照當前 Y，避免 tween 覆蓋
                tween(n).stop();
                tween(n)
                    .to(0.18, { position: new Vec3(px, sy - spinDist, 0) })
                    .call(() => { n.setPosition(px, -1500, 0); })
                    .start();
            }

            // ② 0.20s 後新符號從框外上方落下（scheduleOnce 獨立計時，不共用 this.node）
            this.scheduleOnce(() => {
                for (let row = 0; row < MAX_ROWS; row++) {
                    const cell    = reel[row];
                    const px      = cell.node.position.x;
                    const targetY = this.rowToY(row, MAX_ROWS);
                    this.drawCell(cell, result[row]);
                    tween(cell.node).stop();
                    cell.node.active = true;
                    cell.node.setPosition(px, entryY, 0);
                    tween(cell.node)
                        .to(0.30, { position: new Vec3(px, targetY, 0) }, { easing: 'cubicOut' })
                        .start();
                }
                this.setCloud(BASE_ROWS);
                this.scheduleOnce(cb, 0.32);
            }, 0.20);
        }, delay);
    }

    // ── Cascade 動畫 ─────────────────────────────────────
    /** 移除中獎符號、其餘下移、頂部補新符號，同時擴展1列
     *  @param newSyms 由引擎預先抽取的新符號（key = "ri,row" 指原始中獎格座標）
     *                 若未提供則從 REEL_STRIP 隨機抽取（向下相容）
     */
    cascade(winCells: { reel: number; row: number }[], newRows: number,
            newSyms?: Map<string, SymType>): Promise<void> {
        const oldRows = gs.currentRows;
        const expanding = newRows > oldRows;

        return new Promise<void>(resolve => {
            // 1. Win cell elimination: burst then shrink to 0
            for (const c of winCells) {
                const cell = this.cells[c.reel][c.row];
                tween(cell.node)
                    .to(0.06, { scale: new Vec3(1.2,  1.2,  1) })
                    .to(0.12, { scale: new Vec3(0,    0,    1) })
                    .start();
            }

            // 2. Cloud shake when expanding — signals cloud layer dissolving
            if (expanding && this.cloudNode) {
                tween(this.cloudNode)
                    .to(0.05, { position: new Vec3(0,  8, 0) })
                    .to(0.06, { position: new Vec3(0, -6, 0) })
                    .to(0.04, { position: new Vec3(0,  4, 0) })
                    .to(0.05, { position: new Vec3(0,  0, 0) })
                    .start();
            }

            this.scheduleOnce(() => {
                const grid    = gs.grid;  // 永遠包含全 6 列
                // Entry Y: 框外上方，遮罩以外不可見
                const topRowY = this.rowToY(MAX_ROWS - 1, MAX_ROWS);
                const entryY  = topRowY + SYMBOL_H * 2 + SYMBOL_GAP;

                for (let ri = 0; ri < REEL_COUNT; ri++) {
                    const removed = winCells
                        .filter(c => c.reel === ri)
                        .map(c => c.row)
                        .sort((a, b) => a - b);

                    // 只處理可見列（0 ~ oldRows-1），雲朵遮蔽列（oldRows ~ MAX_ROWS-1）保持不變
                    const col: (SymType | null)[] = grid[ri].slice(0, oldRows);
                    for (const r of removed) col[r] = null;
                    const survivorOrigRows: number[] = [];
                    for (let r = 0; r < col.length; r++) {
                        if (col[r] !== null) survivorOrigRows.push(r);
                    }
                    const surviving = col.filter(s => s !== null) as SymType[];

                    // Snapshot current cell screen positions before any moves
                    const oldCellY: number[] = this.cells[ri].map(c => c.node.position.y);

                    // 只填滿舊的可見範圍（不包含新解放列），新解放列保留 spin 時的預設符號
                    const removedSorted = [...removed].sort((a, b) => a - b);
                    let newSymFillIdx   = 0;
                    while (surviving.length < oldRows) {
                        // 優先使用引擎預先抽取的符號，否則從 REEL_STRIP 隨機補充
                        const origRow = removedSorted[newSymFillIdx++];
                        const sym     = newSyms?.get(`${ri},${origRow}`)
                            ?? REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
                        surviving.push(sym);
                    }
                    // 重建完整 grid：新可見列 + 保留雲朵遮蔽列的 spin 預設值
                    grid[ri] = [...surviving, ...grid[ri].slice(oldRows)];

                    for (let row = 0; row < newRows; row++) {
                        const cell = this.cells[ri][row];
                        cell.node.active = true;
                        cell.node.setScale(1, 1, 1);
                        this.drawCell(cell, grid[ri][row]);
                        const targetY = this.rowToY(row, MAX_ROWS);

                        if (row >= oldRows) {
                            // 雲朵解放列：符號原本就在那，不需位移動畫，只做縮放提示
                            cell.node.setPosition(cell.node.position.x, targetY, 0);
                            tween(cell.node)
                                .to(0.08, { scale: new Vec3(1.15, 1.15, 1) })
                                .to(0.18, { scale: new Vec3(1,    1,    1) })
                                .start();
                        } else if (row < survivorOrigRows.length) {
                            const origRow = survivorOrigRows[row];
                            if (origRow === row) {
                                // Symbol did not move — snap directly
                                cell.node.setPosition(cell.node.position.x, targetY, 0);
                            } else {
                                // Symbol fell from above — animate from old Y down to new Y
                                cell.node.setPosition(cell.node.position.x, oldCellY[origRow], 0);
                                tween(cell.node)
                                    .to(0.22, { position: new Vec3(cell.node.position.x, targetY, 0) },
                                        { easing: 'cubicOut' })
                                    .start();
                            }
                        } else {
                            // 新符號從框外上方落入（補滿中獎消除的空位）
                            cell.node.setPosition(cell.node.position.x, entryY, 0);
                            tween(cell.node)
                                .to(0.26, { position: new Vec3(cell.node.position.x, targetY, 0) },
                                    { easing: 'cubicOut' })
                                .start();
                        }
                    }
                    // 仍在雲朵遮蔽列：確保位置正確，保留 spin 預設符號
                    for (let row = newRows; row < MAX_ROWS; row++) {
                        const cell = this.cells[ri][row];
                        cell.node.active = true;
                        cell.node.setScale(1, 1, 1);
                        cell.node.setPosition(cell.node.position.x, this.rowToY(row, MAX_ROWS), 0);
                    }
                }
                gs.grid     = grid;
                gs.rowCount = Array(REEL_COUNT).fill(newRows);

                if (expanding) {
                    // 先搖晃雲朵（已在上方），然後解放一層
                    this.setCloud(oldRows);
                    this.scheduleOnce(() => {
                        this.setCloud(newRows);
                        const revealRow = newRows - 1;
                        for (let ri = 0; ri < REEL_COUNT; ri++) {
                            tween(this.cells[ri][revealRow].node)
                                .to(0.06, { scale: new Vec3(1.12, 1.12, 1) })
                                .to(0.14, { scale: new Vec3(1,    1,    1) })
                                .start();
                        }
                    }, 0.08);
                } else {
                    this.setCloud(newRows);
                }
            }, 0.20);

            this.scheduleOnce(resolve, 0.54);
        });
    }

    /** 更新盤面（Thunder Blessing 後） */
    updateGrid(grid: SymType[][]): void {
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < gs.currentRows; row++) {
                if (grid[ri][row] !== gs.grid[ri][row]) {
                    this.drawCell(this.cells[ri][row], grid[ri][row]);
                    // Flash cell: white burst → settle (Thunder Blessing transform)
                    tween(this.cells[ri][row].node)
                        .to(0.06, { scale: new Vec3(1.3, 1.3, 1) })
                        .to(0.10, { scale: new Vec3(0.9, 0.9, 1) })
                        .to(0.10, { scale: new Vec3(1,   1,   1) })
                        .start();
                }
            }
        }
        gs.grid = grid;
    }

    /** 使用引擎預先決定的盤面執行旋轉動畫（供 GameBootstrap 搭配 SlotEngine 使用）*/
    spinWithGrid(resultGrid: SymType[][]): Promise<void> {
        if (this.spinning) return Promise.resolve();
        this.spinning = true;

        return new Promise<void>(resolve => {
            let done = 0;
            for (let ri = 0; ri < REEL_COUNT; ri++) {
                const delay = ri * 0.12;
                this.spinReel(ri, resultGrid[ri], delay, () => {
                    done++;
                    if (done === REEL_COUNT) {
                        gs.grid = resultGrid;
                        this.spinning = false;
                        resolve();
                    }
                });
            }
        });
    }

    /** 重置盤面到 BASE_ROWS */
    reset(): void {
        gs.rowCount = Array(REEL_COUNT).fill(BASE_ROWS);
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < MAX_ROWS; row++) {
                this.cells[ri][row].node.active = true;
                const targetY = this.rowToY(row, MAX_ROWS);
                this.cells[ri][row].node.setPosition(
                    this.cells[ri][row].node.position.x, targetY, 0);
                this.cells[ri][row].node.setScale(1, 1, 1);
            }
        }
        this.setCloud(BASE_ROWS);
    }
}

