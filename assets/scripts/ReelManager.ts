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

    onLoad() {
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
                if (row >= BASE_ROWS) cell.node.active = false;  // 初始隱藏擴展列
            }
        }
        this.randomizeGrid();
    }

    private createCell(ri: number, row: number, rx: number): SymCell {
        const cellNode = new Node(`cell_${ri}_${row}`);
        this.node.addChild(cellNode);

        const uit = cellNode.addComponent(UITransform);
        uit.setContentSize(SYMBOL_W, SYMBOL_H);

        // 計算位置（Y 向上為正，row=0 在頂部）
        const ry = this.rowToY(row, BASE_ROWS);
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

    /** row 轉換為 Y 座標 (中心=0，row=0在最上方) */
    private rowToY(row: number, totalRows: number): number {
        const totalH = totalRows * SYMBOL_H + (totalRows - 1) * SYMBOL_GAP;
        const top    = totalH / 2 - SYMBOL_H / 2;
        return top - row * (SYMBOL_H + SYMBOL_GAP);
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
        // 藍色半透明閃電邊框
        const c = new Color(50, 150, 255, 160);
        g.strokeColor = c;
        g.lineWidth   = 4;
        const hw = SYMBOL_W / 2, hh = SYMBOL_H / 2;
        g.roundRect(-hw + 2, -hh + 2, SYMBOL_W - 4, SYMBOL_H - 4, 9);
        g.stroke();
        // ⚡ 文字
        cell.label.string = cell.sym + '\n⚡';
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

    // ── 盤面初始化 ───────────────────────────────────────
    private randomizeGrid(): void {
        const rows = gs.currentRows;
        const grid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            grid[ri] = [];
            for (let row = 0; row < rows; row++) {
                const sym = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
                grid[ri][row] = sym;
                this.drawCell(this.cells[ri][row], sym);
            }
        }
        gs.grid = grid;
    }

    // ── 旋轉動畫 ─────────────────────────────────────────
    spin(rows: number): Promise<void> {
        if (this.spinning) return Promise.resolve();
        this.spinning = true;

        // 生成結果盤面
        const resultGrid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            resultGrid[ri] = [];
            for (let row = 0; row < rows; row++) {
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
                this.spinReel(ri, resultGrid[ri], rows, delay, () => {
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

    private spinReel(ri: number, result: SymType[], rows: number, delay: number, cb: () => void): void {
        const startY  = this.cells[ri][0].node.position.y;
        const spinDist = (SYMBOL_H + SYMBOL_GAP) * 3;

        // 簡單做法：快速偏移再 snap 回正確符號
        this.scheduleOnce(() => {
            const reel = this.cells[ri];
            // 向下偏移 (Y+)
            tween(this.node)
                .delay(0)
                .call(() => {
                    for (let row = 0; row < rows; row++) {
                        const n = reel[row].node;
                        tween(n)
                            .to(0.15, { position: new Vec3(n.position.x, n.position.y + spinDist, 0) })
                            .to(0.0,  { position: new Vec3(n.position.x, -1000, 0) })
                            .call(() => {})
                            .start();
                    }
                })
                .delay(0.16)
                .call(() => {
                    // 立即設置結果並移動到最終位置
                    for (let row = 0; row < rows; row++) {
                        const cell = reel[row];
                        this.drawCell(cell, result[row]);
                        const targetY = this.rowToY(row, rows);
                        cell.node.active = true;
                        cell.node.setPosition(cell.node.position.x, targetY + spinDist, 0);
                        tween(cell.node)
                            .to(0.25, { position: new Vec3(cell.node.position.x, targetY, 0) },
                                { easing: 'cubicOut' })
                            .call(() => {})
                            .start();
                    }
                    // 隱藏超出的列
                    for (let row = rows; row < MAX_ROWS; row++) {
                        reel[row].node.active = false;
                    }
                })
                .delay(0.28)
                .call(cb)
                .start();
        }, delay);
    }

    // ── Cascade 動畫 ─────────────────────────────────────
    /** 移除中獎符號、其餘下移、頂部補新符號，同時擴展1列 */
    cascade(winCells: { reel: number; row: number }[], newRows: number): Promise<void> {
        return new Promise<void>(resolve => {
            // 1. 閃爍中獎位置
            for (const c of winCells) {
                const cell = this.cells[c.reel][c.row];
                tween(cell.node).to(0.1,{scale:new Vec3(1.15,1.15,1)})
                    .to(0.1,{scale:new Vec3(0,0,0)}).start();
            }

            this.scheduleOnce(() => {
                // 2. 更新 grid & 重繪（新符號從頂部加入）
                const grid = gs.grid;
                for (let ri = 0; ri < REEL_COUNT; ri++) {
                    // 找到要移除的 rows（已排序由小到大）
                    const removed = winCells
                        .filter(c => c.reel === ri)
                        .map(c => c.row)
                        .sort((a,b)=>a-b);

                    // 從盤面移除（這些位置以 null 標記）
                    const col: (SymType|null)[] = [...grid[ri]];
                    for (const r of removed) col[r] = null;

                    // 剩餘符號往下推（row 大 = 下方）
                    const remaining = col.filter(s => s !== null) as SymType[];
                    // 頂部補新符號
                    while (remaining.length < newRows) {
                        remaining.unshift(REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)]);
                    }
                    grid[ri] = remaining;

                    // 重繪格子，並設定動畫（由上落下）
                    for (let row = 0; row < newRows; row++) {
                        const cell = this.cells[ri][row];
                        cell.node.active = true;
                        this.drawCell(cell, grid[ri][row]);
                        const targetY = this.rowToY(row, newRows);
                        // 動畫：格子從上方落下
                        cell.node.setPosition(cell.node.position.x, targetY + (SYMBOL_H + SYMBOL_GAP) * 2, 0);
                        tween(cell.node)
                            .to(0.3, { position: new Vec3(cell.node.position.x, targetY, 0) },
                                { easing: 'bounceOut' })
                            .start();
                    }
                    // 隱藏多餘（不在擴展列）
                    for (let row = newRows; row < MAX_ROWS; row++) {
                        this.cells[ri][row].node.active = false;
                    }
                }
                gs.grid = grid;
                gs.rowCount = Array(REEL_COUNT).fill(newRows);
            }, 0.22);

            this.scheduleOnce(resolve, 0.6);
        });
    }

    /** 更新盤面（Thunder Blessing 後） */
    updateGrid(grid: SymType[][]): void {
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < gs.currentRows; row++) {
                if (grid[ri][row] !== gs.grid[ri][row]) {
                    this.drawCell(this.cells[ri][row], grid[ri][row]);
                    // 金色閃爍效果
                    tween(this.cells[ri][row].node)
                        .to(0.12, { scale: new Vec3(1.25, 1.25, 1) })
                        .to(0.15, { scale: new Vec3(1,    1,    1) })
                        .start();
                }
            }
        }
        gs.grid = grid;
    }

    /** 重置盤面到 BASE_ROWS */
    reset(): void {
        gs.rowCount = Array(REEL_COUNT).fill(BASE_ROWS);
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < MAX_ROWS; row++) {
                this.cells[ri][row].node.active = (row < BASE_ROWS);
                if (row < BASE_ROWS) {
                    const targetY = this.rowToY(row, BASE_ROWS);
                    this.cells[ri][row].node.setPosition(
                        this.cells[ri][row].node.position.x, targetY, 0);
                }
            }
        }
    }
}
