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
        lbl.fontSize = 16;
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

    // 每幀更新標記（用於 schedule/unschedule 識別）
    private _scrolling: boolean[] = Array(REEL_COUNT).fill(false);

    /**
     * 捲動式旋轉 — 使用每幀排程實現真正的連續帶狀捲動效果。
     *
     * 原理：6格排成一個環形帶子，雲朵遮住上方 3格作為「隱藏緩衝區」。
     * 每幀直接 setPosition 移動所有格（無 tween），底部離開框外即移至最高格上方
     * 並換入新符號，形成無縫彩帶旋轉。到達停轉時間後按 Y 排序 snap 至結果位置。
     *
     * @param fgMode true = 自由遊戲，由左至右逐欄停止
     */
    spinWithScrollStrip(resultGrid: SymType[][], fgMode = false): Promise<void> {
        if (this.spinning) return Promise.resolve();
        this.spinning = true;

        const STEP_PX   = SYMBOL_H + SYMBOL_GAP;   // 116 px — 一格高度
        const SPEED     = STEP_PX / 0.055;           // ~2109 px/s → 約 35px/frame @60fps
        // 底部退出閾值：比底列再低半格即算離開
        const EXIT_Y    = this.rowToY(0, MAX_ROWS) - STEP_PX * 0.6;

        // ① 將所有格子歸位到 canonical 位置並填入當前 grid 內容
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            const px = this.cells[ri][0].node.position.x;
            for (let row = 0; row < MAX_ROWS; row++) {
                const cell = this.cells[ri][row];
                tween(cell.node).stop();
                cell.node.setScale(1, 1, 1);
                cell.node.active = true;
                cell.node.setPosition(px, this.rowToY(row, MAX_ROWS), 0);
                this.drawCell(cell, gs.grid[ri][row]);
            }
            this._scrolling[ri] = true;
        }
        // 雲朵遮住 row 3-5（緩衝區），符號從雲朵後方流入視野
        this.setCloud(BASE_ROWS);

        // ② 每欄的停轉時間
        const MIN_T    = 0.60;
        const stopTimes = Array.from({ length: REEL_COUNT }, (_, ri) =>
            fgMode ? MIN_T + ri * 0.22 : MIN_T + ri * 0.06
        );

        return new Promise<void>(resolve => {
            const elapsed  = Array(REEL_COUNT).fill(0);
            const stopped  = Array(REEL_COUNT).fill(false);
            let   doneCnt  = 0;
            let   prevMs   = -1;

            // ③ 每幀更新函式：直接 setPosition，無 tween（速度足以由視覺產生運動感）
            const updateFn = () => {
                const nowMs = Date.now();
                if (prevMs < 0) { prevMs = nowMs; return; }
                const dt    = Math.min((nowMs - prevMs) / 1000, 0.05);   // 最大 50ms cap
                prevMs      = nowMs;

                for (let ri = 0; ri < REEL_COUNT; ri++) {
                    if (stopped[ri]) continue;

                    elapsed[ri] += dt;
                    const movePx = SPEED * dt;
                    const px     = this.cells[ri][0].node.position.x;

                    // 向下移動所有格子
                    for (let row = 0; row < MAX_ROWS; row++) {
                        const nd = this.cells[ri][row].node;
                        nd.setPosition(px, nd.position.y - movePx, 0);
                    }

                    // 回收已離開底部的格子：移至最高格上方並換入新符號
                    for (let row = 0; row < MAX_ROWS; row++) {
                        const cell = this.cells[ri][row];
                        if (cell.node.position.y < EXIT_Y) {
                            let maxY = -Infinity;
                            for (let r2 = 0; r2 < MAX_ROWS; r2++) {
                                if (r2 !== row) {
                                    const y2 = this.cells[ri][r2].node.position.y;
                                    if (y2 > maxY) maxY = y2;
                                }
                            }
                            // 放在最高格正上方（進入雲朵遮蔽緩衝區，不可見）
                            cell.node.setPosition(px, maxY + STEP_PX, 0);
                            this.drawCell(cell, REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)]);
                        }
                    }

                    // 到達停轉時間：停止此欄並 snap 至結果
                    if (elapsed[ri] >= stopTimes[ri]) {
                        stopped[ri]        = true;
                        this._scrolling[ri] = false;
                        const capturedRi   = ri;
                        const capturedPx   = px;
                        this._snapReelToResult(capturedRi, resultGrid[capturedRi], capturedPx, () => {
                            doneCnt++;
                            if (doneCnt === REEL_COUNT) {
                                this.unschedule(updateFn);
                                gs.grid      = resultGrid;
                                this.spinning = false;
                                resolve();
                            }
                        });
                    }
                }
            };

            // 每幀呼叫（interval=0）
            this.schedule(updateFn, 0);
        });
    }

    /**
     * 將一欄格子 snap 至最終結果位置。
     * 先按目前 Y（由高到低）排序格子，對應 row(MAX_ROWS-1)→row(0)，
     * 避免格子跨越整個螢幕移動，使停轉動畫看起來自然。
     */
    private _snapReelToResult(ri: number, result: SymType[], px: number, cb: () => void): void {
        const reel = this.cells[ri];

        // 依目前 Y 降序排列：index 0 = Y最高（最接近頂部） → result[MAX_ROWS-1]
        const sorted = reel.slice().sort((a, b) => b.node.position.y - a.node.position.y);

        for (let i = 0; i < MAX_ROWS; i++) {
            const targetRow = MAX_ROWS - 1 - i;
            tween(sorted[i].node).stop();
            this.drawCell(sorted[i], result[targetRow]);
            sorted[i].node.active = true;
            sorted[i].node.setScale(1, 1, 1);
        }

        let pending = MAX_ROWS;
        const done  = () => { if (--pending === 0) cb(); };

        for (let i = 0; i < MAX_ROWS; i++) {
            ((idx: number) => {
                const cell    = sorted[idx];
                const targetRow = MAX_ROWS - 1 - idx;
                const targetY = this.rowToY(targetRow, MAX_ROWS);
                const curY    = cell.node.position.y;
                if (Math.abs(curY - targetY) < 2) {
                    cell.node.setPosition(px, targetY, 0);
                    done();
                } else {
                    tween(cell.node)
                        .to(0.10, { position: new Vec3(px, targetY - 5, 0) }, { easing: 'cubicOut' })
                        .to(0.05, { position: new Vec3(px, targetY + 2, 0) })
                        .to(0.04, { position: new Vec3(px, targetY,     0) })
                        .call(done)
                        .start();
                }
            })(i);
        }
        this.setCloud(BASE_ROWS);
    }

    /** 永遠旋轉完整 5×6，顯示列數由雲朵控制（保留向下相容，內部轉發） */
    spin(): Promise<void> {
        if (this.spinning) return Promise.resolve();
        // 生成完整 6 列結果盤面（含雲朵遮蔽列）
        const resultGrid: SymType[][] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            resultGrid[ri] = [];
            for (let row = 0; row < MAX_ROWS; row++) {
                if (gs.extraBetOn && ri === 2 && row === 0) {
                    resultGrid[ri][row] = SYM.SCATTER;
                } else {
                    resultGrid[ri][row] = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
                }
            }
        }
        return this.spinWithScrollStrip(resultGrid, false);
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

                    // Use canonical rowToY positions (not live node Y) to avoid timing
                    // artifacts where a cell mid-animation has Y below its intended row,
                    // which would cause the survivor to tween upward instead of downward.
                    const oldCellY: number[] = Array.from(
                        { length: MAX_ROWS }, (_, r) => this.rowToY(r, MAX_ROWS));

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

                        tween(cell.node).stop();  // cancel any residual tween before repositioning
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
                                // Symbol fell from — animate from canonical row Y downward to new Y
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

    /**
     * Buy FG 表演用：將滾輪視覺擴展至指定列數（純動畫，不改變 gs.grid 內容）。
     * TODO: 實作具體的逐列展開動畫；目前僅更新 gs.rowCount 供後續邏輯使用。
     */
    expandToRows(targetRows: number): void {
        gs.rowCount = Array(REEL_COUNT).fill(targetRows);
        // TODO: 播放滾輪向下展開動畫，揭示對應 FREE 字母
    }

    /**
     * 使用引擎預先決定的盤面執行旋轉動畫（供 GameBootstrap 搭配 SlotEngine 使用）
     * @param fgMode true = 自由遊戲，滾輪由左至右逐欄停止
     */
    spinWithGrid(resultGrid: SymType[][], fgMode = false): Promise<void> {
        return this.spinWithScrollStrip(resultGrid, fgMode);
    }

    /** 重置盤面到 BASE_ROWS */
    reset(): void {
        this.clearPreviewExtraBet();   // restore any preview SC cells before redraw
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

    // ── Extra Bet 預覽 ───────────────────────────────────────────
    private _previewCells: { reel: number; row: number; origSym: SymType; lifted: boolean }[] = [];

    /**
     * Extra Bet ON 視覺預覽：5 個 SC 在全 5×6 隨機跳出再消失，純動畫不留殘留。
     * 動畫結束後自動還原原始符號；若 SPIN 提前觸發，clearPreviewExtraBet() 立即取消。
     */
    previewExtraBet(): void {
        this.clearPreviewExtraBet();
        // All 30 cells (5 reels × 6 rows) are candidates
        const candidates: { reel: number; row: number }[] = [];
        for (let ri = 0; ri < REEL_COUNT; ri++)
            for (let row = 0; row < MAX_ROWS; row++)
                candidates.push({ reel: ri, row });
        // Fisher-Yates shuffle then take first 5
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        for (const { reel, row } of candidates.slice(0, 5)) {
            const cell = this.cells[reel]?.[row];
            if (!cell) continue;
            const origSym = cell.sym;
            const lifted  = row >= BASE_ROWS && !!this.cloudNode;
            this._previewCells.push({ reel, row, origSym, lifted });
            this.drawCell(cell, SYM.SCATTER);
            if (lifted) cell.node.setSiblingIndex(this.node.children.length);
            // Bounce animation → restore original symbol on completion
            tween(cell.node)
                .to(0.10, { scale: new Vec3(1.25, 1.25, 1) })
                .to(0.12, { scale: new Vec3(0.92, 0.92, 1) })
                .to(0.10, { scale: new Vec3(1,    1,    1) })
                .call(() => {
                    // Restore this cell (only if still in preview list)
                    const idx = this._previewCells.findIndex(p => p.reel === reel && p.row === row);
                    if (idx === -1) return;  // already cleared by clearPreviewExtraBet()
                    this.drawCell(cell, origSym);
                    if (lifted && this.cloudNode)
                        cell.node.setSiblingIndex(this.cloudNode.getSiblingIndex());
                    this._previewCells.splice(idx, 1);
                })
                .start();
        }
    }

    /** SPIN 開始 / Extra Bet 關閉時立即取消尚未完成的預覽動畫並還原 */
    clearPreviewExtraBet(): void {
        for (const { reel, row, origSym, lifted } of this._previewCells) {
            const cell = this.cells[reel]?.[row];
            if (!cell) continue;
            tween(cell.node).stop();
            cell.node.setScale(1, 1, 1);
            this.drawCell(cell, origSym);
            if (lifted && this.cloudNode)
                cell.node.setSiblingIndex(this.cloudNode.getSiblingIndex());
        }
        this._previewCells = [];
    }
}

