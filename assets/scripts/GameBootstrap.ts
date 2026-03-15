/**
 * GameBootstrap.ts
 * ★ 主要遊戲Controller — 掛在 Canvas 的 GameView Node 上
 *
 * 職責：
 *  1. onLoad() 建立所有 UI 子節點
 *  2. 處理 SPIN 按鈕事件
 *  3. 執行完整遊戲流程：Spin → Win Check → Cascade → Thunder Blessing → Coin Toss → Free Game
 */
import { _decorator, Component, Node, Label, Button, Color, UITransform,
         Graphics, Vec3, tween, sys, game, director } from 'cc';
import { gs }            from './GameState';
import { ReelManager }   from './ReelManager';
import { UIController }  from './UIController';
import { checkWins, calcWinAmount, findScatters, WinResult } from './WinChecker';
import {
    REEL_COUNT, BASE_ROWS, MAX_ROWS, SYMBOL_W, SYMBOL_H, SYMBOL_GAP, REEL_GAP,
    CANVAS_W, CANVAS_H, DEFAULT_BET, DEFAULT_BALANCE, MAX_WIN_MULT, EXTRA_BET_MULT,
    FG_MULTIPLIERS, SYM, SymType, PAYTABLE, SYMBOL_COLORS, SYMBOL_UPGRADE
} from './GameConfig';
import { CellPos } from './GameState';

const { ccclass, property } = _decorator;

// ─── 工具：建立帶背景的 Label ───────────────────────────────
function makeLabel(parent: Node, text: string, fontSize: number,
                   color: string = '#ffffff', x = 0, y = 0): Label {
    const n = new Node('lbl');
    parent.addChild(n);
    n.setPosition(x, y, 0);
    const uit = n.addComponent(UITransform);
    uit.setContentSize(300, fontSize + 8);
    const lbl = n.addComponent(Label);
    lbl.string   = text;
    lbl.fontSize = fontSize;
    lbl.isBold   = true;
    lbl.color    = Color.fromHEX(new Color(), color);
    return lbl;
}

function makeButton(parent: Node, text: string, w: number, h: number,
                    x: number, y: number, bgColor: string, textColor: string = '#ffffff'): Node {
    const n = new Node('btn_' + text);
    parent.addChild(n);
    n.setPosition(x, y, 0);

    const uit = n.addComponent(UITransform);
    uit.setContentSize(w, h);

    const gfx = n.addComponent(Graphics);
    const c   = Color.fromHEX(new Color(), bgColor);
    gfx.fillColor = c;
    gfx.roundRect(-w/2, -h/2, w, h, 12);
    gfx.fill();

    // 邊框
    const bc = Color.fromHEX(new Color(), '#ffffff44');
    gfx.strokeColor = bc;
    gfx.lineWidth   = 2;
    gfx.roundRect(-w/2+1, -h/2+1, w-2, h-2, 11);
    gfx.stroke();

    makeLabel(n, text, h > 50 ? 22 : 16, textColor, 0, 0);

    n.addComponent(Button);
    return n;
}

// ─── 主組件 ──────────────────────────────────────────────────

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    private reelMgr!: ReelManager;
    private uiCtrl!:  UIController;
    private busy      = false;
    private coinPanel?: Node;
    private tbPanel?:  Node;

    // ─── 場景建立 ───────────────────────────────────────
    onLoad() {
        gs.balance  = DEFAULT_BALANCE;
        gs.totalBet = DEFAULT_BET;
        gs.computeTotalBet();

        this.buildScene();
    }

    private buildScene(): void {
        const root = this.node;

        // 希臘奈空深藍背景
        const bg = new Node('Background');
        root.addChild(bg);
        bg.setPosition(0, 0, -10);
        const bgUit = bg.addComponent(UITransform);
        bgUit.setContentSize(CANVAS_W, CANVAS_H);
        const bgGfx = bg.addComponent(Graphics);
        // 游戲背景：奈天滞蹦深藍
        bgGfx.fillColor = Color.fromHEX(new Color(), '#04080f');
        bgGfx.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        bgGfx.fill();
        // 上方天空游變色層
        bgGfx.fillColor = Color.fromHEX(new Color(), '#08122a');
        bgGfx.rect(-CANVAS_W/2, CANVAS_H/2 - 160, CANVAS_W, 160);
        bgGfx.fill();
        // 外框裝飾：冱魂科林特風格金色
        bgGfx.strokeColor = Color.fromHEX(new Color(), '#5a4400');
        bgGfx.lineWidth   = 36;
        bgGfx.roundRect(-CANVAS_W/2+18, -CANVAS_H/2+18, CANVAS_W-36, CANVAS_H-36, 4);
        bgGfx.stroke();
        bgGfx.strokeColor = Color.fromHEX(new Color(), '#c8aa30');
        bgGfx.lineWidth   = 2;
        bgGfx.roundRect(-CANVAS_W/2+18, -CANVAS_H/2+18, CANVAS_W-36, CANVAS_H-36, 4);
        bgGfx.stroke();

        // 主標題
        makeLabel(root, '⚡ THUNDER BLESSING', 28, '#ffe066', 0, 290);
        makeLabel(root, 'Zeus   Slot   Game', 14, '#88aacc', 0, 262);

        // ── 滾輪區 ──
        const reelArea = new Node('ReelArea');
        root.addChild(reelArea);
        reelArea.setPosition(0, 40, 0);
        const reelUit = reelArea.addComponent(UITransform);
        reelUit.setContentSize(CANVAS_W - 40, MAX_ROWS * (SYMBOL_H + SYMBOL_GAP));
        this.reelMgr = reelArea.addComponent(ReelManager);

        // 滾輪外框
        const reelFrame = new Node('ReelFrame');
        root.addChild(reelFrame);
        reelFrame.setPosition(0, 40, 1);
        const rfUit = reelFrame.addComponent(UITransform);
        rfUit.setContentSize(REEL_COUNT * (SYMBOL_W + REEL_GAP) + 20, MAX_ROWS * (SYMBOL_H + SYMBOL_GAP) + 20);
        const rfGfx = reelFrame.addComponent(Graphics);
        const fw = rfUit.contentSize.width, fh = rfUit.contentSize.height;
        rfGfx.strokeColor = Color.fromHEX(new Color(), '#8b6914');
        rfGfx.lineWidth   = 3;
        rfGfx.roundRect(-fw/2, -fh/2, fw, fh, 14);
        rfGfx.stroke();

        // ── UI 面板 ──
        const uiPanel = new Node('UIPanel');
        root.addChild(uiPanel);
        uiPanel.setPosition(0, -266, 0);
        this.uiCtrl = uiPanel.addComponent(UIController);

        // 面板背景
        const panelGfx = uiPanel.addComponent(Graphics);
        panelGfx.fillColor = Color.fromHEX(new Color(), '#0f0f28');
        panelGfx.roundRect(-CANVAS_W/2 + 10, -50, CANVAS_W - 20, 100, 12);
        panelGfx.fill();
        panelGfx.strokeColor = Color.fromHEX(new Color(), '#2a2a44');
        panelGfx.lineWidth   = 1.5;
        panelGfx.roundRect(-CANVAS_W/2 + 10, -50, CANVAS_W - 20, 100, 12);
        panelGfx.stroke();

        // Labels
        this.uiCtrl.lblBalance    = makeLabel(uiPanel, '', 15, '#aaaacc', -340, 28);
        this.uiCtrl.lblBet        = makeLabel(uiPanel, '', 15, '#aaaacc',  340, 28);
        this.uiCtrl.lblWin        = makeLabel(uiPanel, '', 24, '#ffd700',    0, 30);
        this.uiCtrl.lblLines      = makeLabel(uiPanel, '', 13, '#888899', -340, -28);
        this.uiCtrl.lblMultiplier = makeLabel(uiPanel, '', 18, '#00cfff',    0, -30);
        this.uiCtrl.lblStatus     = makeLabel(uiPanel, '', 14, '#88aacc',    0, -50);
        // Status 在 uiPanel 上方
        const statusLbl = makeLabel(root, '', 16, '#88aacc', 0, -230);
        this.uiCtrl.lblStatus = statusLbl;

        // SPIN 按鈕
        const spinBtn = makeButton(uiPanel, 'SPIN', 110, 56, 0, -5, '#cc3300');
        this.uiCtrl.btnSpin = spinBtn;
        spinBtn.on(Button.EventType.CLICK, this.onSpinClick, this);

        // Extra Bet 按鈕
        const extraBetNode = new Node('ExtraBet');
        uiPanel.addChild(extraBetNode);
        extraBetNode.setPosition(150, -5, 0);
        const ebUit = extraBetNode.addComponent(UITransform);
        ebUit.setContentSize(120, 36);
        const ebGfx = extraBetNode.addComponent(Graphics);
        this.uiCtrl.extraBetBg = ebGfx;
        makeLabel(extraBetNode, 'EXTRA BET', 12, '#88aacc', 0, 0);
        const ebBtn = extraBetNode.addComponent(Button);
        extraBetNode.on(Button.EventType.CLICK, this.onExtraBetClick, this);
        this.uiCtrl.btnExtraBet = extraBetNode;

        // 投注 +/- 按鈕
        const betPlusBtn  = makeButton(uiPanel, '+', 36, 36, -80, -5, '#1a3a1a');
        const betMinusBtn = makeButton(uiPanel, '−', 36, 36, -130, -5, '#3a1a1a');
        betPlusBtn.on(Button.EventType.CLICK, () => this.changeBet(0.25), this);
        betMinusBtn.on(Button.EventType.CLICK, ()=> this.changeBet(-0.25), this);

        // Buy Feature 按鈕
        const buyBtn = makeButton(uiPanel, 'BUY FREE', 100, 36, -220, -5, '#1a1a4a', '#4444ff');
        buyBtn.on(Button.EventType.CLICK, this.onBuyFreeGame, this);

        // Coin Toss 面板（初始隱藏）
        this.coinPanel = this.buildCoinPanel(root);
        this.coinPanel.active = false;

        // Thunder Blessing 面板（初始隱藏）
        this.tbPanel = this.buildTBPanel(root);
        this.tbPanel.active = false;

        this.uiCtrl.updateExtraBetUI();
        this.uiCtrl.refresh();
    }

    // ─── Coin Toss 面板 ─────────────────────────────────
    private _coinResolve?: (heads: boolean) => void;

    private buildCoinPanel(root: Node): Node {
        const p = new Node('CoinPanel');
        root.addChild(p);
        p.setPosition(0, 0, 10);

        // 半透明遮罩
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 180);
        bg.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        bg.fill();

        // 面板框
        const panel = new Node('panel');
        p.addChild(panel);
        const pUit = panel.addComponent(UITransform);
        pUit.setContentSize(400, 260);
        const pGfx = panel.addComponent(Graphics);
        pGfx.fillColor = Color.fromHEX(new Color(), '#0f0f28');
        pGfx.roundRect(-200, -130, 400, 260, 16);
        pGfx.fill();
        pGfx.strokeColor = Color.fromHEX(new Color(), '#ffd700');
        pGfx.lineWidth   = 3;
        pGfx.roundRect(-200, -130, 400, 260, 16);
        pGfx.stroke();

        makeLabel(panel, '🪙 硬幣翻轉', 24, '#ffd700', 0, 90);
        makeLabel(panel, 'COIN TOSS', 14, '#888800', 0, 62);
        makeLabel(panel, '翻到正面 → 進入 Free Game (×3)', 14, '#88ccff', 0, 28);
        makeLabel(panel, '翻到反面 → 本輪結束', 14, '#ffaaaa', 0, 4);

        const headsBtn = makeButton(panel, '⊙ HEADS (正面)', 170, 50, -95, -52, '#004400', '#00ff88');
        const tailsBtn = makeButton(panel, '○ TAILS (反面)',  170, 50,  95, -52, '#440000', '#ff6666');

        headsBtn.on(Button.EventType.CLICK, () => {
            p.active = false;
            this._coinResolve?.(true);
        }, this);
        tailsBtn.on(Button.EventType.CLICK, () => {
            p.active = false;
            this._coinResolve?.(false);
        }, this);

        // 自動翻轉（模擬隨機 — 可改為讓玩家選擇，或全自動）
        makeLabel(panel, '（系統自動翻轉中…）', 11, '#555577', 0, -100);

        return p;
    }

    private showCoinToss(): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this._coinResolve = resolve;
            this.coinPanel!.active = true;
            // 自動隨機翻（可改為全手動）
            this.scheduleOnce(() => {
                const heads = Math.random() < 0.5;
                this.coinPanel!.active = false;
                resolve(heads);
            }, 1.8);
        });
    }

    // ─── Thunder Blessing 面板 ───────────────────────────
    private buildTBPanel(root: Node): Node {
        const p = new Node('TBPanel');
        root.addChild(p);
        p.setPosition(0, 0, 10);

        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(10, 0, 30, 200);
        bg.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        bg.fill();

        makeLabel(p, '⚡ 雷霆祝福 ⚡', 32, '#ff88ff', 0, 80);
        makeLabel(p, 'THUNDER BLESSING', 16, '#cc44cc', 0, 44);
        makeLabel(p, '所有閃電標記格 → 轉換為高賠符號！', 18, '#ffd700', 0, 8);
        return p;
    }

    private async showThunderBlessing(msg: string): Promise<void> {
        const lbl = this.tbPanel!.children.find(n => n.getComponent(Label))?.getComponent(Label);
        this.tbPanel!.active = true;
        tween(this.tbPanel!).to(0.1,{scale:new Vec3(1.1,1.1,1)}).to(0.1,{scale:new Vec3(1,1,1)}).start();
        return new Promise<void>(resolve => this.scheduleOnce(() => {
            this.tbPanel!.active = false;
            resolve();
        }, 1.5));
    }

    // ─── 事件處理 ────────────────────────────────────────
    private onSpinClick(): void {
        if (this.busy) return;
        this.doSpin();
    }

    private onExtraBetClick(): void {
        if (this.busy) return;
        gs.extraBetOn = !gs.extraBetOn;
        gs.computeTotalBet();
        this.uiCtrl.updateExtraBetUI();
        this.uiCtrl.refresh();
    }

    private changeBet(delta: number): void {
        if (this.busy) return;
        gs.totalBet = Math.max(0.25, Math.min(10, parseFloat((gs.totalBet + delta).toFixed(2))));
        gs.betPerLine = gs.totalBet / (gs.currentRows <= 3 ? 25 : 57);
        this.uiCtrl.refresh();
    }

    private onBuyFreeGame(): void {
        if (this.busy) return;
        const cost = gs.totalBet * 100;
        if (gs.balance < cost) {
            this.uiCtrl.setStatus('餘額不足！', '#ff4444');
            return;
        }
        gs.balance -= cost;
        this.uiCtrl.setStatus(`花費 ${cost.toFixed(2)} 購買 Coin Toss`, '#00cfff');
        this.doCoinTossAndMaybeFG();
    }

    // ─── 主遊戲流程 ─────────────────────────────────────
    private async doSpin(): Promise<void> {
        if (gs.balance < gs.totalBet) {
            this.uiCtrl.setStatus('餘額不足！', '#ff4444');
            return;
        }

        this.busy = true;
        this.uiCtrl.enableSpin(false);
        this.uiCtrl.setStatus('旋轉中…', '#88aacc');

        // 扣款
        gs.balance -= gs.totalBet;
        gs.resetRound();

        // 清除普通遊戲的閃電標記（Free Game 不清除）
        if (!gs.inFreeGame) gs.clearMarks();

        this.reelMgr.reset();
        this.uiCtrl.refresh();

        // ── 旋轉 ──
        await this.reelMgr.spin(BASE_ROWS);

        // ── Cascade 循環 ──
        await this.cascadeLoop();

        // ── 結算 ──
        this.uiCtrl.setStatus(
            gs.roundWin > 0 ? `本輪獲得 ${gs.roundWin.toFixed(2)}` : '沒有獎金',
            gs.roundWin > 0 ? '#ffd700' : '#888888'
        );

        if (gs.roundWin >= gs.totalBet * MAX_WIN_MULT) {
            this.uiCtrl.setStatus(`★ MAX WIN ${gs.roundWin.toFixed(2)} ★`, '#ff4444');
        }

        this.busy = false;
        this.uiCtrl.enableSpin(true);
        this.uiCtrl.refresh();
    }

    /** Cascade 遞迴循環 */
    private async cascadeLoop(): Promise<void> {
        const rows = gs.currentRows;
        const wins = checkWins(gs.grid, rows, gs.totalBet);

        if (wins.length === 0) {
            // 無中獎 → 檢查 Scatter + 閃電標記（雷霆祝福）
            await this.checkThunderBlessing();
            return;
        }

        // 累計獎金
        let winAmt = 0;
        const winCells: CellPos[] = [];
        for (const w of wins) {
            winAmt += calcWinAmount(w, gs.totalBet);
            w.cells.forEach(c => {
                winCells.push(c);
                gs.addMark(c);      // 中獎位置產生閃電標記
            });
        }

        const multiplier = gs.inFreeGame ? gs.fgMultiplier : 1;
        const totalWinThisStep = parseFloat((winAmt * multiplier).toFixed(2));
        gs.roundWin = parseFloat((gs.roundWin + totalWinThisStep).toFixed(2));
        gs.balance  = parseFloat((gs.balance  + totalWinThisStep).toFixed(2));

        this.uiCtrl.showWinPop(totalWinThisStep);
        this.uiCtrl.setStatus(`中獎 +${totalWinThisStep.toFixed(2)}${gs.inFreeGame ? ` (×${multiplier})` : ''}`, '#ffd700');

        // Max win check
        if (gs.roundWin >= gs.totalBet * MAX_WIN_MULT) return;

        // Cascade 擴展
        gs.cascadeCount++;
        const newRows = Math.min(rows + 1, MAX_ROWS);
        await this.reelMgr.cascade(winCells, newRows);
        this.reelMgr.refreshAllMarks();

        // 6列達成 + 再次Cascade → Coin Toss
        if (rows === MAX_ROWS) {
            await this.doCoinTossAndMaybeFG();
            return;
        }

        // 繼續 Cascade
        await this.cascadeLoop();
    }

    /** 檢查雷霆祝福條件 */
    private async checkThunderBlessing(): Promise<void> {
        const rows     = gs.currentRows;
        const scatters = findScatters(gs.grid, rows);
        const hasMarks = gs.lightningMarks.size > 0;

        if (scatters.length === 0 || !hasMarks) return;

        // ── 雷霆祝福觸發！ ──
        await this.showThunderBlessing('雷霆祝福觸發！');
        this.uiCtrl.setStatus('⚡ 雷霆祝福！標記格轉換中…', '#ff88ff');

        const newGrid: SymType[][] = gs.grid.map(col => [...col]);

        // 第一擊：每個標記格依 SYMBOL_UPGRADE 各自升階
        for (let ri = 0; ri < REEL_COUNT; ri++) {
            for (let row = 0; row < rows; row++) {
                if (gs.hasMark({ reel: ri, row })) {
                    const orig = newGrid[ri][row] as string;
                    newGrid[ri][row] = (SYMBOL_UPGRADE[orig] ?? orig) as SymType;
                }
            }
        }

        // 第二擊（機率 40%）：再依相同升階表各自升一級
        if (Math.random() < 0.4) {
            for (let ri = 0; ri < REEL_COUNT; ri++) {
                for (let row = 0; row < rows; row++) {
                    if (gs.hasMark({ reel: ri, row })) {
                        const cur = newGrid[ri][row] as string;
                        newGrid[ri][row] = (SYMBOL_UPGRADE[cur] ?? cur) as SymType;
                    }
                }
            }
        }

        this.reelMgr.updateGrid(newGrid);
        await this.wait(0.5);

        // 重新掃描中獎
        await this.cascadeLoop();
    }

    /** Coin Toss → 可能進入 Free Game */
    private async doCoinTossAndMaybeFG(): Promise<void> {
        this.uiCtrl.setStatus('🪙 Coin Toss!', '#ffaa44');
        const heads = await this.showCoinToss();

        if (!heads) {
            this.uiCtrl.setStatus('● 反面 — 本輪結束', '#ff6666');
            return;
        }

        // 進入 Free Game
        this.uiCtrl.setStatus('⊙ 正面 — 進入 Free Game!', '#00ff88');
        gs.inFreeGame  = true;
        gs.fgMultIndex = 0;
        this.uiCtrl.refresh();
        await this.wait(0.8);
        await this.freeGameLoop();
    }

    /** Free Game 主循環 */
    private async freeGameLoop(): Promise<void> {
        while (gs.inFreeGame) {
            this.uiCtrl.setStatus(`FREE GAME ×${gs.fgMultiplier} — 旋轉中…`, '#00cfff');
            await this.reelMgr.spin(BASE_ROWS);
            await this.cascadeLoop();

            if (gs.roundWin >= gs.totalBet * MAX_WIN_MULT) {
                gs.inFreeGame = false;
                gs.clearMarks();
                this.uiCtrl.refresh();
                return;
            }

            // Coin Toss 決定繼續或結束
            this.uiCtrl.setStatus('🪙 Free Game Coin Toss', '#ffaa44');
            const heads = await this.showCoinToss();

            if (!heads) {
                gs.inFreeGame = false;
                gs.clearMarks();         // FG 結束才清除標記
                this.uiCtrl.setStatus('Free Game 結束', '#ff8888');
                this.uiCtrl.refresh();
                return;
            }

            // 倍率升級
            if (gs.fgMultIndex < FG_MULTIPLIERS.length - 1) gs.fgMultIndex++;
            this.uiCtrl.setStatus(`倍率升為 ×${gs.fgMultiplier}!`, '#ffd700');
            await this.wait(0.6);
        }
    }

    private wait(sec: number): Promise<void> {
        return new Promise<void>(resolve => this.scheduleOnce(resolve, sec));
    }
}
