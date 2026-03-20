/**
 * GameBootstrap.ts
 * ★ 主要遊戲Controller — 掛在 Canvas 的 GameView Node 上
 */
import { _decorator, Component, Node, Label, Button, Color, UITransform,
         Graphics, Vec3, tween, Mask } from 'cc';
import { gs }            from './GameState';
import { ReelManager }   from './ReelManager';
import { UIController }  from './UIController';
import { calcWinAmount, findScatters, WinResult } from './WinChecker';
import { SlotEngine, createEngine }               from './SlotEngine';
import {
    REEL_COUNT, BASE_ROWS, MAX_ROWS, SYMBOL_W, SYMBOL_H, SYMBOL_GAP, REEL_GAP,
    CANVAS_W, CANVAS_H, DEFAULT_BET, DEFAULT_BALANCE, MAX_WIN_MULT,
    FG_MULTIPLIERS, SymType, COIN_TOSS_HEADS_PROB, FG_TRIGGER_PROB,
} from './GameConfig';
import { CellPos } from './GameState';

const { ccclass, property } = _decorator;

// Label helper
function makeLabel(parent: Node, text: string, fontSize: number,
                   color: string = '#ffffff', x = 0, y = 0, w = 400): Label {
    const n = new Node('lbl');
    parent.addChild(n);
    n.setPosition(x, y, 0);
    const uit = n.addComponent(UITransform);
    uit.setContentSize(w, fontSize + 10);
    const lbl = n.addComponent(Label);
    lbl.string   = text;
    lbl.fontSize = fontSize;
    lbl.isBold   = true;
    lbl.color    = Color.fromHEX(new Color(), color);
    return lbl;
}

// Button helper
function makeButton(parent: Node, text: string, w: number, h: number,
                    x: number, y: number, bgColor: string, textColor: string = '#ffffff'): Node {
    const n = new Node('btn_' + text);
    parent.addChild(n);
    n.setPosition(x, y, 0);
    const uit = n.addComponent(UITransform);
    uit.setContentSize(w, h);
    const gfx = n.addComponent(Graphics);
    gfx.fillColor = Color.fromHEX(new Color(), bgColor);
    gfx.roundRect(-w/2, -h/2, w, h, 12);
    gfx.fill();
    gfx.strokeColor = Color.fromHEX(new Color(), '#ffffff55');
    gfx.lineWidth   = 2;
    gfx.roundRect(-w/2+1, -h/2+1, w-2, h-2, 11);
    gfx.stroke();
    makeLabel(n, text, h > 50 ? 22 : 16, textColor, 0, 0, w);
    n.addComponent(Button);
    return n;
}

// Draw coin face using Graphics
function drawCoinFace(g: Graphics, heads: boolean): void {
    g.clear();
    // Outer dark rim
    g.fillColor = new Color(160, 100, 8, 255);
    g.circle(0, 0, 110);
    g.fill();
    // Main gold body
    g.fillColor = new Color(215, 165, 25, 255);
    g.circle(0, 0, 100);
    g.fill();
    // Greek-key ring
    g.strokeColor = new Color(170, 125, 5, 255);
    g.lineWidth = 7;
    g.circle(0, 0, 88);
    g.stroke();
    // Inner face area
    g.fillColor = new Color(235, 190, 42, 255);
    g.circle(0, 0, 78);
    g.fill();
    // Highlight
    g.fillColor = new Color(255, 228, 110, 160);
    g.circle(-18, 30, 32);
    g.fill();
    if (!heads) {
        // Tails: concentric rings
        g.strokeColor = new Color(170, 120, 5, 200);
        g.lineWidth = 4;
        g.circle(0, 0, 50);
        g.stroke();
        g.circle(0, 0, 25);
        g.stroke();
    }
}

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    private reelMgr!:   ReelManager;
    private uiCtrl!:    UIController;
    private busy        = false;

    /** 機率核心引擎（純 TypeScript，無 Cocos 依賴）*/
    private engine: SlotEngine = createEngine();
    private buyFGMode = false;            // Buy FG intro: skip FG_TRIGGER_PROB gate; still goes through real Coin Toss
    private _coinEntryHeadsProb = 0.50;   // entry Coin Toss prob: 0.50 for normal, COIN_TOSS_HEADS_PROB[0] for Buy FG

    // ── FREE 字母指示器 F‧R‧E‧E ───────────────
    private freeLbls:       Label[] = [];   // [0]=F [1]=R [2]=E(3rd) [3]=E(4th)

    // ── 타이틀 nodes (FG 중 숨김) ────────
    private titleNodes:     Node[] = [];

    // ── 面板 ──────────────────────────
    private tbPanel?:       Node;
    private _tbActive        = false;  // guard: only one TB overlay at a time
    private buyPanel?:      Node;
    private _buyCostLbl?:   Label;
    private _buyResolve?:   (start: boolean) => void;
    private coinPanel?:     Node;
    private coinGfxNode?:   Node;
    private coinGfx?:       Graphics;
    private coinFaceLbl?:   Label;
    private coinTitleLbl?:  Label;
    private _coinResolve?:  (heads: boolean) => void;
    private _coinFlipped    = false;
    private _coinIsFGContext = false;
    private multBarNode?:   Node;
    private multBarGfx?:    Graphics;
    private multBarLabels:  Label[] = [];
    private totalWinPanel?: Node;
    private _totalWinLbl?:  Label;
    private _collectResolve?: () => void;

    // ── Auto Spin ────────────────────────
    private autoSpinCount   = 0;    // 0 = 停止; -1 = 無限
    private autoSpinPanel?: Node;
    private autoSpinCountLbl?: Label;   // UIPanel 上顯示剩餘次數

    // ─── 場景建立 ─────────────────────
    start() {
        gs.balance  = DEFAULT_BALANCE;
        gs.totalBet = DEFAULT_BET;
        gs.computeTotalBet();
        this.buildScene();
    }

    private buildScene(): void {
        const root = this.node;

        // Background
        const bg = new Node('Background');
        root.addChild(bg);
        bg.setPosition(0, 0, -10);
        const bgUit = bg.addComponent(UITransform);
        bgUit.setContentSize(CANVAS_W, CANVAS_H);
        const bgGfx = bg.addComponent(Graphics);
        bgGfx.fillColor = Color.fromHEX(new Color(), '#04080f');
        bgGfx.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        bgGfx.fill();
        bgGfx.fillColor = Color.fromHEX(new Color(), '#08122a');
        bgGfx.rect(-CANVAS_W/2, CANVAS_H/2 - 160, CANVAS_W, 160);
        bgGfx.fill();
        bgGfx.strokeColor = Color.fromHEX(new Color(), '#5a4400');
        bgGfx.lineWidth   = 36;
        bgGfx.roundRect(-CANVAS_W/2+18, -CANVAS_H/2+18, CANVAS_W-36, CANVAS_H-36, 4);
        bgGfx.stroke();
        bgGfx.strokeColor = Color.fromHEX(new Color(), '#c8aa30');
        bgGfx.lineWidth   = 2;
        bgGfx.roundRect(-CANVAS_W/2+18, -CANVAS_H/2+18, CANVAS_W-36, CANVAS_H-36, 4);
        bgGfx.stroke();

        this.titleNodes.push(makeLabel(root, '⚡ THUNDER BLESSING', 22, '#ffe066', 0, 335).node);
        this.titleNodes.push(makeLabel(root, 'Zeus  Slot  Game', 12, '#88aacc', 0, 314).node);

        // ── FREE 字母收集指示器 (滾輪區上方) ───────────────────────
        const freeLetters = ['F', 'R', 'E', 'E'];
        const freeColors  = { off: '#2a2a44', on: '#ffe066' };
        const freeBarY    = 293;   // THUNDER(335)→Zeus(314)→FREE(293)→reel頂(250)
        const letterSpacing = 34;
        const totalW = (freeLetters.length - 1) * letterSpacing;
        freeLetters.forEach((ch, i) => {
            const lbl = makeLabel(root, ch, 20, freeColors.off,
                -totalW / 2 + i * letterSpacing, freeBarY);
            lbl.isBold = true;
            this.freeLbls.push(lbl);
        });

        // Reel area (with Mask to clip symbols during drop-in animation)
        const reelArea = new Node('ReelArea');
        root.addChild(reelArea);
        reelArea.setPosition(0, 30, 0);
        const reelUit = reelArea.addComponent(UITransform);
        reelUit.setContentSize(REEL_COUNT * (SYMBOL_W + REEL_GAP) + SYMBOL_W, MAX_ROWS * (SYMBOL_H + SYMBOL_GAP) + SYMBOL_H / 2);
        const reelMask = reelArea.addComponent(Mask);
        reelMask.type = Mask.Type.RECT;
        this.reelMgr = reelArea.addComponent(ReelManager);

        // Reel frame
        const reelFrame = new Node('ReelFrame');
        root.addChild(reelFrame);
        reelFrame.setPosition(0, 30, 1);
        const rfUit = reelFrame.addComponent(UITransform);
        rfUit.setContentSize(REEL_COUNT * (SYMBOL_W + REEL_GAP) + 20, MAX_ROWS * (SYMBOL_H + SYMBOL_GAP) + 20);
        const rfGfx = reelFrame.addComponent(Graphics);
        const fw = rfUit.contentSize.width, fh = rfUit.contentSize.height;
        rfGfx.strokeColor = Color.fromHEX(new Color(), '#8b6914');
        rfGfx.lineWidth   = 3;
        rfGfx.roundRect(-fw/2, -fh/2, fw, fh, 14);
        rfGfx.stroke();

        // Multiplier bar (hidden initially)
        this.multBarNode = this.buildMultBar(root);
        this.multBarNode.active = false;

        // UI panel
        const uiPanel = new Node('UIPanel');
        root.addChild(uiPanel);
        uiPanel.setPosition(0, -308, 0);
        this.uiCtrl = uiPanel.addComponent(UIController);
        const panelGfx = uiPanel.addComponent(Graphics);
        panelGfx.fillColor = Color.fromHEX(new Color(), '#0f0f28');
        panelGfx.roundRect(-CANVAS_W/2 + 10, -50, CANVAS_W - 20, 100, 12);
        panelGfx.fill();
        panelGfx.strokeColor = Color.fromHEX(new Color(), '#2a2a44');
        panelGfx.lineWidth   = 1.5;
        panelGfx.roundRect(-CANVAS_W/2 + 10, -50, CANVAS_W - 20, 100, 12);
        panelGfx.stroke();

        // WIN 獨立一行（panel 外），不與 balance/bet 互搶空間
        this.uiCtrl.lblWin        = makeLabel(root,    '', 26, '#ffd700',    0, -205, 500);
        this.uiCtrl.lblStatus     = makeLabel(root,    '', 13, '#88aacc',    0, -228, 560);

        // panel 內：balance / bet 各自靠邊，lines / multiplier 第二行，按鈕第三行
        this.uiCtrl.lblBalance    = makeLabel(uiPanel, '', 14, '#aaaacc', -280, 30, 260);
        this.uiCtrl.lblBet        = makeLabel(uiPanel, '', 14, '#aaaacc',  280, 30, 260);
        this.uiCtrl.lblLines      = makeLabel(uiPanel, '', 12, '#888899', -280,  8, 260);
        this.uiCtrl.lblMultiplier = makeLabel(uiPanel, '', 16, '#00cfff',   80,  8, 300);

        const spinBtn = makeButton(uiPanel, 'SPIN', 110, 56, 0, -5, '#cc3300');
        this.uiCtrl.btnSpin = spinBtn;
        spinBtn.on(Button.EventType.CLICK, this.onSpinClick, this);

        const extraBetNode = new Node('ExtraBet');
        uiPanel.addChild(extraBetNode);
        extraBetNode.setPosition(150, -5, 0);
        extraBetNode.addComponent(UITransform).setContentSize(120, 36);
        this.uiCtrl.extraBetBg = extraBetNode.addComponent(Graphics);
        makeLabel(extraBetNode, 'EXTRA BET', 12, '#88aacc', 0, 0);
        extraBetNode.addComponent(Button);
        extraBetNode.on(Button.EventType.CLICK, this.onExtraBetClick, this);
        this.uiCtrl.btnExtraBet = extraBetNode;

        const betPlusBtn  = makeButton(uiPanel, '+', 36, 36,  -80, -5, '#1a3a1a');
        const betMinusBtn = makeButton(uiPanel, '−', 36, 36, -130, -5, '#3a1a1a');
        betPlusBtn.on(Button.EventType.CLICK,  () => this.changeBet( 0.25), this);
        betMinusBtn.on(Button.EventType.CLICK, () => this.changeBet(-0.25), this);

        const buyBtn = makeButton(uiPanel, 'BUY FREE', 100, 36, -220, -5, '#1a1a4a', '#4444ff');
        buyBtn.on(Button.EventType.CLICK, this.onBuyFreeGame, this);

        // Auto Spin 按鈕 + 剩餘次數標籤
        const autoBtn = makeButton(uiPanel, 'AUTO', 80, 36, 300, -5, '#1a3a3a', '#00cccc');
        autoBtn.on(Button.EventType.CLICK, this.onAutoSpinClick, this);
        this.autoSpinCountLbl = makeLabel(uiPanel, '', 13, '#00cccc', 300, 18);

        // Overlay panels (all hidden initially)
        this.autoSpinPanel = this.buildAutoSpinPanel(root); this.autoSpinPanel.active = false;
        this.buyPanel      = this.buildBuyPanel(root);      this.buyPanel.active      = false;
        this.coinPanel     = this.buildCoinPanel(root);     this.coinPanel.active     = false;
        this.tbPanel       = this.buildTBPanel(root);       this.tbPanel.active       = false;
        this.totalWinPanel = this.buildTotalWinPanel(root); this.totalWinPanel.active = false;

        this.uiCtrl.updateExtraBetUI();
        this.uiCtrl.refresh();
    }

    // ══════════════════════════════════════════════════
    // BUY FREE GAME 確認面板
    // ══════════════════════════════════════════════════
    private buildBuyPanel(root: Node): Node {
        const p = new Node('BuyFGPanel');
        root.addChild(p);
        p.setPosition(0, 0, 10);
        p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        const dim = p.addComponent(Graphics);
        dim.fillColor = new Color(0, 0, 0, 200);
        dim.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        dim.fill();

        const panel = new Node('panel');
        p.addChild(panel);
        panel.addComponent(UITransform).setContentSize(420, 330);
        const pGfx = panel.addComponent(Graphics);
        pGfx.fillColor = Color.fromHEX(new Color(), '#080e26');
        pGfx.roundRect(-210, -165, 420, 330, 20);
        pGfx.fill();
        pGfx.strokeColor = Color.fromHEX(new Color(), '#cc9900');
        pGfx.lineWidth   = 3;
        pGfx.roundRect(-210, -165, 420, 330, 20);
        pGfx.stroke();
        pGfx.strokeColor = Color.fromHEX(new Color(), '#3366cc');
        pGfx.lineWidth   = 1.5;
        pGfx.roundRect(-206, -161, 412, 322, 18);
        pGfx.stroke();

        makeLabel(panel, 'BUY FREE GAME', 26, '#ff8800', 0, 128);

        // Cost box
        const costBox = new Node('costBox');
        panel.addChild(costBox);
        costBox.setPosition(0, 56, 0);
        costBox.addComponent(UITransform).setContentSize(300, 80);
        const cbGfx = costBox.addComponent(Graphics);
        cbGfx.fillColor = new Color(0, 50, 120, 200);
        cbGfx.roundRect(-150, -40, 300, 80, 10);
        cbGfx.fill();
        cbGfx.strokeColor = new Color(80, 160, 255, 200);
        cbGfx.lineWidth   = 2;
        cbGfx.roundRect(-150, -40, 300, 80, 10);
        cbGfx.stroke();
        makeLabel(costBox, 'COST', 16, '#88ccff', 0, 18);
        this._buyCostLbl = makeLabel(costBox, '25.00', 30, '#ffd700', 0, -14);

        makeLabel(panel, 'Select "Start" to trigger the Free Games', 13, '#aaaacc', 0, -20, 400);
        makeLabel(panel, 'at the current bet amount', 13, '#aaaacc', 0, -42, 400);

        const cancelBtn = makeButton(panel, 'CANCEL', 155, 52, -95, -118, '#440011', '#ff6666');
        const startBtn  = makeButton(panel, 'START',  155, 52,  95, -118, '#004422', '#00ff88');
        cancelBtn.on(Button.EventType.CLICK, () => { p.active = false; this._buyResolve?.(false); }, this);
        startBtn.on(Button.EventType.CLICK,  () => { p.active = false; this._buyResolve?.(true);  }, this);
        return p;
    }

    private showBuyPanel(): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this._buyResolve = resolve;
            if (this._buyCostLbl) this._buyCostLbl.string = (gs.totalBet * 100).toFixed(2);
            this.buyPanel!.active = true;
        });
    }

    // ══════════════════════════════════════════════════
    // COIN TOSS 硬幣翻轉
    // ══════════════════════════════════════════════════
    private buildCoinPanel(root: Node): Node {
        const p = new Node('CoinPanel');
        root.addChild(p);
        p.setPosition(0, 0, 10);
        p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        // Semi-transparent: reels still visible behind
        const dim = p.addComponent(Graphics);
        dim.fillColor = new Color(0, 0, 0, 140);
        dim.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        dim.fill();

        // "FLIP TO CONTINUE" at BOTTOM of screen (matches reference screenshot)
        this.coinTitleLbl = makeLabel(p, 'FLIP TO ENTER FREE GAME', 26, '#ff8800', 0, -248, 780);
        makeLabel(p, 'WITH INCREASED MULTIPLIER', 22, '#ffcc00', 0, -278, 780);

        // Coin node
        const coinNode = new Node('Coin');
        p.addChild(coinNode);
        coinNode.setPosition(0, -40, 0);
        coinNode.addComponent(UITransform).setContentSize(240, 240);
        const cGfx = coinNode.addComponent(Graphics);
        drawCoinFace(cGfx, true);
        this.coinGfxNode = coinNode;
        this.coinGfx     = cGfx;

        // Face label
        this.coinFaceLbl = makeLabel(coinNode, 'ZEUS', 22, '#5a2800', 0, -8, 140);

        // Tap hint
        makeLabel(p, '▲  TAP COIN TO FLIP  ▲', 15, '#ffffff88', 0, -195, 500);

        // Whole panel is clickable
        p.addComponent(Button);
        p.on(Button.EventType.CLICK, this.onCoinTap, this);
        return p;
    }

    private showCoinToss(isFGContext: boolean, entryHeadsProb = 0.50): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this._coinResolve       = resolve;
            this._coinFlipped       = false;
            this._coinIsFGContext   = isFGContext;
            this._coinEntryHeadsProb = entryHeadsProb;
            if (this.coinTitleLbl) {
                this.coinTitleLbl.string = isFGContext
                    ? 'FLIP TO CONTINUE' : 'FLIP TO ENTER FREE GAME';
            }
            // Restore multBar visibility while coin panel is open (during FG)
            if (isFGContext && this.multBarNode?.active) {
                this.multBarNode.active = true;  // keep it active
            }
            if (this.coinGfx)     drawCoinFace(this.coinGfx, true);
            if (this.coinFaceLbl) {
                this.coinFaceLbl.string = 'ZEUS';
                this.coinFaceLbl.color  = Color.fromHEX(new Color(), '#5a2800');
            }
            if (this.coinGfxNode) {
                this.coinGfxNode.setScale(1, 1, 1);
                this.coinGfxNode.setPosition(0, -200, 0);
                tween(this.coinGfxNode)
                    .to(0.45, { position: new Vec3(0, -40, 0) }, { easing: 'backOut' })
                    .start();
            }
            this.coinPanel!.active = true;
        });
    }

    private onCoinTap(): void {
        if (this._coinFlipped || !this.coinPanel?.active) return;
        this._coinFlipped = true;
        // 局間 Coin Toss 使用 fgMultIndex 對應的機率；進場 Coin Toss 用 _coinEntryHeadsProb（正常與 Buy FG 都是 COIN_TOSS_HEADS_PROB[0]=80%）
        const headsProb = this._coinIsFGContext
            ? (COIN_TOSS_HEADS_PROB[gs.fgMultIndex] ?? 0.40)
            : this._coinEntryHeadsProb;
        const result    = Math.random() < headsProb;
        const coinNode  = this.coinGfxNode!;

        // Upward lob tween (separate from Y-flip)
        tween(coinNode)
            .to(0.18, { position: new Vec3(0,  30, 0) }, { easing: 'cubicOut' })
            .to(0.18, { position: new Vec3(0, -40, 0) }, { easing: 'cubicIn'  })
            .start();

        // Y-scale flip: squash to 0, swap face, unsquash
        tween(coinNode)
            .to(0.18, { scale: new Vec3(1, 0.04, 1) }, { easing: 'cubicIn' })
            .call(() => {
                if (this.coinGfx)     drawCoinFace(this.coinGfx, result);
                if (this.coinFaceLbl) {
                    this.coinFaceLbl.string = result ? 'ZEUS\n⊙' : '○';
                    this.coinFaceLbl.color  = Color.fromHEX(new Color(),
                        result ? '#5a2800' : '#888888');
                }
            })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'cubicOut' })
            .delay(0.8)
            .call(() => {
                this.coinPanel!.active = false;
                this._coinResolve?.(result);
            })
            .start();
    }

    // ══════════════════════════════════════════════════
    // FREE GAME 倍率條 x3 → x7 → x17 → x27 → x77
    // ══════════════════════════════════════════════════
    private buildMultBar(root: Node): Node {
        const n = new Node('MultBar');
        root.addChild(n);
        // y=328 → near top of 960x720 canvas (top edge = y=360)
        n.setPosition(0, 328, 5);
        const barW = 720;
        n.addComponent(UITransform).setContentSize(barW, 52);
        this.multBarGfx    = n.addComponent(Graphics);
        this.multBarLabels = [];

        const mults   = FG_MULTIPLIERS;
        const boxW    = 130, gap = 10;
        const startX  = -((mults.length - 1) * (boxW + gap)) / 2;
        for (let i = 0; i < mults.length; i++) {
            const box = new Node(`mult_${i}`);
            n.addChild(box);
            box.setPosition(startX + i * (boxW + gap), 0, 0);
            box.addComponent(UITransform).setContentSize(boxW, 44);
            const lbl = makeLabel(box, `x${mults[i]}`, 18, '#8899bb', 0, 0, boxW);
            lbl.node.getComponent(UITransform)!.setContentSize(boxW, 30);
            this.multBarLabels.push(lbl);
        }
        return n;
    }

    private updateMultBar(activeIdx: number): void {
        const g     = this.multBarGfx!;
        const mults = FG_MULTIPLIERS;
        const boxW  = 130, gap = 10;
        const startX = -((mults.length - 1) * (boxW + gap)) / 2;

        g.clear();
        const totalW = 720;
        // Full-width stone bar background
        g.fillColor = new Color(20, 18, 14, 255);
        g.roundRect(-totalW/2, -26, totalW, 52, 0);
        g.fill();
        // Top highlight strip
        g.fillColor = new Color(255, 255, 255, 18);
        g.roundRect(-totalW/2, 18, totalW, 4, 0);
        g.fill();
        // Bottom shadow strip
        g.fillColor = new Color(0, 0, 0, 80);
        g.roundRect(-totalW/2, -26, totalW, 4, 0);
        g.fill();

        for (let i = 0; i < mults.length; i++) {
            const bx = startX + i * (boxW + gap);
            if (i === activeIdx) {
                // Gold glowing active box
                g.fillColor = new Color(100, 65, 5, 255);
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6);
                g.fill();
                g.fillColor = new Color(60, 40, 0, 200);
                g.roundRect(bx - boxW/2 + 2, -19, boxW - 4, 38, 5);
                g.fill();
                g.strokeColor = Color.fromHEX(new Color(), '#ffd700');
                g.lineWidth   = 2.5;
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6);
                g.stroke();
                // Inner gold rim
                g.strokeColor = new Color(255, 200, 50, 100);
                g.lineWidth   = 1;
                g.roundRect(bx - boxW/2 + 3, -18, boxW - 6, 36, 4);
                g.stroke();
                this.multBarLabels[i].color    = Color.fromHEX(new Color(), '#ffd700');
                this.multBarLabels[i].fontSize = 22;
                this.multBarLabels[i].isBold   = true;
            } else if (i < activeIdx) {
                // Completed (dim)
                g.fillColor = new Color(25, 20, 12, 200);
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6);
                g.fill();
                g.strokeColor = new Color(100, 80, 30, 100);
                g.lineWidth   = 1;
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6);
                g.stroke();
                this.multBarLabels[i].color    = Color.fromHEX(new Color(), '#776633');
                this.multBarLabels[i].fontSize = 16;
            } else {
                // Upcoming (stone)
                g.fillColor = new Color(40, 35, 28, 220);
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6);
                g.fill();
                g.strokeColor = new Color(100, 90, 70, 120);
                g.lineWidth   = 1;
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6);
                g.stroke();
                this.multBarLabels[i].color    = Color.fromHEX(new Color(), '#aaa080');
                this.multBarLabels[i].fontSize = 18;
            }
        }
    }

    private updateAutoSpinLabel(): void {
        if (!this.autoSpinCountLbl) return;
        if (this.autoSpinCount === 0)  this.autoSpinCountLbl.string = '';
        else if (this.autoSpinCount === -1) this.autoSpinCountLbl.string = '∞';
        else this.autoSpinCountLbl.string = String(this.autoSpinCount);
    }

    // ══════════════════════════════════════════════════
    // AUTO SPIN 選擇面板
    // ══════════════════════════════════════════════════
    private buildAutoSpinPanel(root: Node): Node {
        const p = new Node('AutoSpinPanel');
        root.addChild(p);
        p.setPosition(0, 0, 10);
        p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        const dim = p.addComponent(Graphics);
        dim.fillColor = new Color(0, 0, 0, 180);
        dim.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        dim.fill();

        const card = new Node('card');
        p.addChild(card);
        card.addComponent(UITransform).setContentSize(480, 300);
        const cg = card.addComponent(Graphics);
        cg.fillColor = Color.fromHEX(new Color(), '#0d1130');
        cg.roundRect(-240, -150, 480, 300, 18);
        cg.fill();
        cg.strokeColor = Color.fromHEX(new Color(), '#00cccc');
        cg.lineWidth = 2;
        cg.roundRect(-240, -150, 480, 300, 18);
        cg.stroke();

        makeLabel(card, 'AUTO SPIN', 20, '#00cccc', 0, 120);

        const options = [10, 25, 50, 100, 200, 500, -1];
        const labels  = ['10', '25', '50', '100', '200', '500', '∞'];
        const cols = 4, btnW = 96, btnH = 44, gapX = 12, gapY = 10;
        const startX = -((cols - 1) * (btnW + gapX)) / 2;
        options.forEach((val, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const bx  = startX + col * (btnW + gapX);
            const by  = 60 - row * (btnH + gapY);
            const btn = makeButton(card, labels[i], btnW, btnH, bx, by, '#1a3a3a', '#00cccc');
            btn.on(Button.EventType.CLICK, () => {
                this.autoSpinCount = val;
                this.updateAutoSpinLabel();
                p.active = false;
                if (!this.busy) this.doSpin();
            }, this);
        });

        const cancelBtn = makeButton(card, '✕ 取消', 120, 38, 0, -110, '#3a1a1a', '#ff6666');
        cancelBtn.on(Button.EventType.CLICK, () => { p.active = false; }, this);

        return p;
    }
    private showFGBar(activeIdx: number): void {
        for (const n of this.titleNodes) n.active = false;
        this.multBarNode!.active = true;
        this.updateMultBar(activeIdx);
    }

    /** Hide the FG multiplier bar and restore game title */
    private hideFGBar(): void {
        this.multBarNode!.active = false;
        for (const n of this.titleNodes) n.active = true;
    }

    // ══════════════════════════════════════════════════
    // THUNDER BLESSING 面板
    // ══════════════════════════════════════════════════
    private buildTBPanel(root: Node): Node {
        const p = new Node('TBPanel');
        root.addChild(p);
        p.setPosition(0, 0, 10);
        p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(10, 0, 30, 200);
        bg.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        bg.fill();
        makeLabel(p, '⚡ 雷霆祝福 ⚡', 32, '#ff88ff', 0, 80);
        makeLabel(p, 'THUNDER  BLESSING', 16, '#cc44cc', 0, 42);
        makeLabel(p, '所有閃電標記格 → 轉換為高賠符號！', 18, '#ffd700', 0, 8, 600);
        return p;
    }

    private async showThunderBlessing(): Promise<void> {
        if (this._tbActive) return;
        this._tbActive = true;
        this.tbPanel!.active = true;
        tween(this.tbPanel!).to(0.1,{scale:new Vec3(1.1,1.1,1)}).to(0.1,{scale:new Vec3(1,1,1)}).start();
        await this.wait(1.1);
        tween(this.tbPanel!)
            .to(0.25, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.20, { scale: new Vec3(0,    0,    1) }, { easing: 'cubicIn' })
            .call(() => { this.tbPanel!.active = false; this.tbPanel!.setScale(1,1,1); })
            .start();
        await this.wait(0.45);
        this._tbActive = false;
    }

    // ══════════════════════════════════════════════════
    // TOTAL WIN / COLLECT 面板
    // ══════════════════════════════════════════════════
    private buildTotalWinPanel(root: Node): Node {
        const p = new Node('TotalWinPanel');
        root.addChild(p);
        p.setPosition(0, 0, 20);
        p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(4, 8, 30, 248);
        bg.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
        bg.fill();
        // Radial rays
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            bg.strokeColor = new Color(60, 100, 200, 25 + (i % 2) * 20);
            bg.lineWidth   = 50;
            bg.moveTo(0, 0);
            bg.lineTo(Math.cos(a) * 700, Math.sin(a) * 700);
            bg.stroke();
        }
        makeLabel(p, 'TOTAL WIN', 52, '#44aaff', 0, 130, 600);
        this._totalWinLbl = makeLabel(p, '0.00', 62, '#ffd700', 0, 38, 600);

        // Star burst
        const sparkNode = new Node('sparkle');
        p.addChild(sparkNode);
        sparkNode.setPosition(0, 38, 0);
        const sGfx = sparkNode.addComponent(Graphics);
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            sGfx.strokeColor = new Color(255, 215, 60, 180);
            sGfx.lineWidth   = i % 2 === 0 ? 3 : 1.5;
            sGfx.moveTo(Math.cos(a) * 92,  Math.sin(a) * 92);
            sGfx.lineTo(Math.cos(a) * 134, Math.sin(a) * 134);
            sGfx.stroke();
        }

        const collectBtn = makeButton(p, 'COLLECT', 220, 66, 0, -120, '#1a3a7a', '#44ddff');
        collectBtn.on(Button.EventType.CLICK, () => {
            p.active = false;
            this._collectResolve?.();
        }, this);
        return p;
    }

    private showTotalWin(amount: number): Promise<void> {
        return new Promise<void>(resolve => {
            this._collectResolve = resolve;
            if (this._totalWinLbl) this._totalWinLbl.string = amount.toFixed(2);
            this.totalWinPanel!.active = true;
            if (this._totalWinLbl) {
                this._totalWinLbl.node.setScale(0.5, 0.5, 1);
                tween(this._totalWinLbl.node)
                    .to(0.4,  { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
                    .to(0.15, { scale: new Vec3(1,   1,   1) })
                    .start();
            }
        });
    }

    // ══════════════════════════════════════════════════
    // 事件處理
    // ══════════════════════════════════════════════════
    private onSpinClick(): void {
        if (this.busy) return;
        // 手動按 SPIN 時停止 Auto Spin
        this.autoSpinCount = 0;
        this.updateAutoSpinLabel();
        this.doSpin();
    }

    private onAutoSpinClick(): void {
        if (this.autoSpinCount !== 0) {
            // 正在 Auto Spin → 立即停止
            this.autoSpinCount = 0;
            this.updateAutoSpinLabel();
            return;
        }
        if (this.busy) return;
        this.autoSpinPanel!.active = true;
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
        gs.totalBet   = Math.max(0.25, Math.min(10, parseFloat((gs.totalBet + delta).toFixed(2))));
        gs.betPerLine = gs.totalBet / (gs.currentRows <= 3 ? 25 : 57);
        this.uiCtrl.refresh();
    }

    private async onBuyFreeGame(): Promise<void> {
        if (this.busy) return;
        // 1. Confirm panel (cost = 100× bet)
        const confirmed = await this.showBuyPanel();
        if (!confirmed) return;
        const cost = gs.totalBet * 100;
        if (gs.balance < cost) {
            this.uiCtrl.setStatus('餘額不足！', '#ff4444');
            return;
        }
        gs.balance -= cost;
        this.busy = true;
        this.uiCtrl.enableSpin(false);
        gs.resetRound();
        gs.clearMarks();
        this.reelMgr.reset();
        this.uiCtrl.refresh();
        // 2. 真實引導 Spin：cascade 擴展至 MAX_ROWS，累積基本 BONUS
        //    cascade 內部緩舎 MAX_ROWS 時直接呼叫 enterFreeGame（buyFGMode）
        await this.playBuyFGIntro();
        // enterFreeGame 已在 cascadeLoop 內部由 buyFGMode 路徑呼叫
        this.busy = false;
        this.uiCtrl.enableSpin(true);
        this.uiCtrl.refresh();
    }

    /**
     * 根據滾輪目前列數更新 FREE 字母亮燈狀態。
     * rows=3:全燅 | rows=4:F亮 | rows=5:FR亮 | rows>=6:FRE亮，並在下次cascade勝出時亮第4個。
     * @param rows 當前列數
     * @param fourthE 是否亮起第 4 個 E（最後一個，觸發 Coin Toss 時）
     */
    private updateFreeLetters(rows: number, fourthE = false): void {
        const ON  = '#ffe066';
        const OFF = '#2a2a44';
        // F: rows >= 4, R: rows >= 5, 3rd E: rows >= 6, 4th E: explicit flag
        const states = [
            rows >= 4,          // F
            rows >= 5,          // R
            rows >= MAX_ROWS,   // 3rd E
            fourthE,            // 4th E (FREE all lit)
        ];
        states.forEach((on, i) => {
            if (this.freeLbls[i]) {
                this.freeLbls[i].color = Color.fromHEX(new Color(), on ? ON : OFF);
            }
        });
    }

    /** 購買 FG 入場動畫：跑 cascade loop 直到擴至 MAX_ROWS 觸發 Coin Toss */
    private async playBuyFGIntro(): Promise<void> {
        this.buyFGMode = true;
        this.updateFreeLetters(BASE_ROWS);   // Buy FG 開始重置 FREE 燅燅
        this.uiCtrl.setStatus('★ Buy Free Game — 旋轉中…', '#ffdd44');
        let safety = 0;
        while (this.buyFGMode && safety < 20) {
            safety++;
            this.reelMgr.reset();
            const grid = this.generateGuaranteedWinGrid(gs.currentRows);
            await this.reelMgr.spinWithGrid(grid);
            await this.cascadeLoop();  // 自然 cascade + 擴列；到 MAX_ROWS 時觸發 Coin Toss
        }
        if (this.buyFGMode) {
            // 安全 fallback：20 局仍未到達 MAX_ROWS
            this.buyFGMode = false;
            gs.rowCount = Array(REEL_COUNT).fill(MAX_ROWS);
            await this.doCoinTossAndMaybeFG(true);  // Buy FG 保證入場
        }
    }

    /** 生成保證有連線中獎的盤面（最多嘗試 200 次）*/
    private generateGuaranteedWinGrid(rows: number): SymType[][] {
        for (let i = 0; i < 200; i++) {
            const grid = this.engine.generateGrid(false);
            if (this.engine.checkWins(grid, rows).length > 0) return grid;
        }
        return this.engine.generateGrid(false);  // fallback
    }

    // ══════════════════════════════════════════════════
    // 主遊戲流程
    // ══════════════════════════════════════════════════
    private async doSpin(): Promise<void> {
        if (gs.balance < gs.totalBet) {
            this.uiCtrl.setStatus('餘額不足！', '#ff4444');
            return;
        }
        this.busy = true;
        this.uiCtrl.enableSpin(false);
        this.uiCtrl.setStatus('旋轉中…', '#88aacc');
        gs.balance -= gs.totalBet;
        gs.resetRound();
        if (!gs.inFreeGame) gs.clearMarks();
        this.reelMgr.reset();
        this.updateFreeLetters(BASE_ROWS);   // 每局開始重置 FREE 燅燅
        this.uiCtrl.refresh();

        // ★ 引擎決定盤面，ReelManager 執行動畫
        let grid = this.engine.generateGrid(gs.inFreeGame);
        if (gs.extraBetOn) grid = this.engine.applyExtraBetSC(grid);
        await this.reelMgr.spinWithGrid(grid);
        await this.cascadeLoop();

        this.uiCtrl.setStatus(
            gs.roundWin > 0 ? `本輪獲得 ${gs.roundWin.toFixed(2)}` : '沒有獎金',
            gs.roundWin > 0 ? '#ffd700' : '#888888');
        if (gs.roundWin >= gs.totalBet * MAX_WIN_MULT)
            this.uiCtrl.setStatus(`★ MAX WIN ${gs.roundWin.toFixed(2)} ★`, '#ff4444');

        this.busy = false;
        this.uiCtrl.enableSpin(true);
        this.uiCtrl.refresh();

        // Auto Spin 繼續
        if (this.autoSpinCount !== 0 && !gs.inFreeGame && gs.balance >= gs.totalBet) {
            if (this.autoSpinCount > 0) this.autoSpinCount--;
            this.updateAutoSpinLabel();
            this.doSpin();
        } else if (this.autoSpinCount !== 0) {
            // 餘額不足或進入 FG，停止
            this.autoSpinCount = 0;
            this.updateAutoSpinLabel();
        }
    }

    private async cascadeLoop(): Promise<void> {
        const rows = gs.currentRows;
        // ★ 引擎掃描連線（支援 PAYLINES_BY_ROWS，3→25 條，6→57 條）
        const wins = this.engine.checkWins(gs.grid, rows);

        if (wins.length === 0) {
            await this.checkThunderBlessing();
            return;
        }

        // Gold flash + payline highlight before elimination
        await this.reelMgr.flashWinCells(wins as WinResult[]);

        // ★ 引擎預先為每個中獎格抽取新符號（下一輪 cascade 用）
        const winCells: CellPos[] = [];
        const newSyms  = new Map<string, SymType>();
        const seenCell = new Set<string>();
        let winAmt     = 0;

        for (const w of wins) {
            winAmt += calcWinAmount(w as WinResult, gs.totalBet);
            for (const c of w.cells) {
                const key = `${c.reel},${c.row}`;
                if (!seenCell.has(key)) {
                    seenCell.add(key);
                    winCells.push(c);
                    gs.addMark(c);
                    // ★ 引擎抽取補充符號（FG 中使用FG權重）
                    newSyms.set(key, this.engine.drawSymbol(gs.inFreeGame));
                }
            }
        }

        const multiplier = gs.inFreeGame ? gs.fgMultiplier : 1;
        const stepWin    = parseFloat((winAmt * multiplier).toFixed(2));
        gs.roundWin = parseFloat((gs.roundWin + stepWin).toFixed(2));
        gs.balance  = parseFloat((gs.balance  + stepWin).toFixed(2));

        this.uiCtrl.showWinPop(stepWin);
        this.uiCtrl.setStatus(`中獎 +${stepWin.toFixed(2)}${gs.inFreeGame ? ` (×${multiplier})` : ''}`, '#ffd700');

        if (gs.roundWin >= gs.totalBet * MAX_WIN_MULT) return;

        gs.cascadeCount++;
        const newRows = Math.min(rows + 1, MAX_ROWS);
        // ★ 傳入引擎預抽符號，ReelManager 直接使用（確保視覺與邏輯一致）
        await this.reelMgr.cascade(winCells, newRows, newSyms);
        this.reelMgr.refreshAllMarks();

        if (rows === MAX_ROWS) {
            // In Free Game, coin toss happens after the full spin (in freeGameLoop).
            if (!gs.inFreeGame) {
                // 先決定是否觸發 Coin Toss，第 4 個 E 只在真的會進 Coin Toss 時才亮
                const triggerCoinToss = this.buyFGMode || Math.random() < FG_TRIGGER_PROB;
                this.updateFreeLetters(newRows, triggerCoinToss);
                if (triggerCoinToss) {
                    const wasBuyFG = this.buyFGMode;   // 記住是否為 Buy FG 路徑
                    this.buyFGMode = false;
                    await this.doCoinTossAndMaybeFG(wasBuyFG);  // Buy FG → guaranteed=true
                }
            }
            return;
        }

        // 更新 FREE 字母亮燈（rows 是擴列前的列數，第4個E不在此處亮）
        if (!gs.inFreeGame) {
            this.updateFreeLetters(newRows, false);
        }
        await this.cascadeLoop();
    }

    private async checkThunderBlessing(): Promise<void> {
        const rows     = gs.currentRows;
        const scatters = findScatters(gs.grid, rows);
        if (scatters.length === 0 || gs.lightningMarks.size === 0) return;

        // Fire TB overlay (non-blocking, guarded against stacking)
        void this.showThunderBlessing();
        this.uiCtrl.setStatus('⚡ 雷霆祝福！標記格轉換中…', '#ff88ff');
        await this.wait(0.25);

        // ★ 引擎執行 TB 升階（含第二擊機率 TB_SECOND_HIT_PROB）
        const newGrid = this.engine.applyTB(
            gs.grid.map(col => [...col]) as SymType[][],
            gs.lightningMarks,
            rows
        );

        // 消耗 marks — 已完成升階，清除避免重複觸發
        gs.clearMarks();

        this.reelMgr.updateGrid(newGrid);
        this.reelMgr.refreshAllMarks();
        await this.wait(0.4);
        await this.cascadeLoop();
    }

    /**
     * 在 MAX_ROWS 時有新 Cascade 勝出（基礎遊戲）時呼叫。
     * @param guaranteed Buy FG 購買路徑傳 true，保證 Coin Toss 必然正面（玩家已付費）。
     *   正常自然觸發傳 false，使用 COIN_TOSS_HEADS_PROB[0]=80%。
     */
    private async doCoinTossAndMaybeFG(guaranteed = false): Promise<void> {
        // 顯示本輪累計基礎獎（Buy FG intro 各局累計 + 本局 cascade 獎）
        if (gs.roundWin > 0) {
            this.uiCtrl.setStatus(`基礎獎累計 ${gs.roundWin.toFixed(2)}`, '#ffd700');
            await this.wait(0.8);
        }
        this.uiCtrl.setStatus('🪙 Coin Toss！', '#ffaa44');
        // Buy FG 保證入場（機率 1.0）；正常觸發用 80%
        const prob  = guaranteed ? 1.0 : COIN_TOSS_HEADS_PROB[0];
        const heads = await this.showCoinToss(false, prob);
        if (heads) {
            await this.enterFreeGame();
        } else {
            this.uiCtrl.setStatus('反面——未進入 Free Game', '#ff8888');
            await this.wait(0.5);
        }
    }

    /**
     * 進場 Coin Toss 通過後直接呼叫，設定 FG 狀態並啟動 freeGameLoop。
     */
    private async enterFreeGame(): Promise<void> {
        gs.inFreeGame  = true;
        gs.fgMultIndex = 0;
        this.showFGBar(gs.fgMultIndex);
        this.uiCtrl.setStatus(`⊙ 進入 Free Game ×${gs.fgMultiplier}！`, '#00ff88');
        this.uiCtrl.refresh();
        await this.wait(0.5);
        await this.freeGameLoop();
    }

    private async freeGameLoop(): Promise<void> {
        this.showFGBar(gs.fgMultIndex);

        while (gs.inFreeGame) {
            this.uiCtrl.setStatus(`FREE GAME ×${gs.fgMultiplier} — 旋轉中…`, '#00cfff');
            this.reelMgr.reset();
            // ★ FG 中同樣由引擎生成盤面（使用 FG 權重）
            const fgGrid = this.engine.generateGrid(true);
            await this.reelMgr.spinWithGrid(fgGrid);
            await this.cascadeLoop();

            if (gs.roundWin >= gs.totalBet * MAX_WIN_MULT) {
                gs.inFreeGame = false;
                gs.clearMarks();
                this.hideFGBar();
                this.uiCtrl.refresh();
                await this.showTotalWin(gs.roundWin);
                return;
            }

            // Per-spin Coin Toss
            this.uiCtrl.setStatus('🪙 Free Game Coin Toss', '#ffaa44');
            const heads = await this.showCoinToss(true);

            if (!heads) {
                gs.inFreeGame = false;
                gs.clearMarks();
                this.hideFGBar();
                this.uiCtrl.setStatus('Free Game 結束', '#ff8888');
                this.uiCtrl.refresh();
                await this.showTotalWin(gs.roundWin);
                return;
            }

            // Advance multiplier
            if (gs.fgMultIndex < FG_MULTIPLIERS.length - 1) gs.fgMultIndex++;
            this.showFGBar(gs.fgMultIndex);
            this.uiCtrl.setStatus(`倍率升為 x${gs.fgMultiplier}!`, '#ffd700');
            this.uiCtrl.refresh();
            await this.wait(0.5);
        }

        this.hideFGBar();
    }

    private wait(sec: number): Promise<void> {
        return new Promise<void>(resolve => this.scheduleOnce(resolve, sec));
    }
}
