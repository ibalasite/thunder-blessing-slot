/**
 * SceneBuilder.ts
 * 場景建立模組 — 將所有 Cocos 節點建立與面板組裝
 * 從 GameBootstrap 提取出來，保持 GameBootstrap 為純 DI 配線。
 *
 * 對外只暴露三項：
 *   buildScene(root, cbs) → SceneRefs
 *   drawCoinFace(g, heads) — GameBootstrap onCoinTap 重用
 *   SceneBuildCallbacks / SceneRefs 型別
 */
import { Node, Label, Button, Color, UITransform,
         Graphics, Vec3, Mask } from 'cc';
import { IGameSession }  from '../contracts/IGameSession';
import { IAccountService } from '../contracts/IAccountService';
import { ReelManager }  from '../ReelManager';
import { UIController } from '../UIController';
import type { RNGFunction } from '../services/RNGProvider';
import {
    REEL_COUNT, BASE_ROWS, MAX_ROWS,
    SYMBOL_W, SYMBOL_H, SYMBOL_GAP, REEL_GAP,
    CANVAS_W, CANVAS_H,
    FG_MULTIPLIERS,
} from '../GameConfig';

// ────────────────────────────────────────────────────────────────────────────
// 回呼合約
// ────────────────────────────────────────────────────────────────────────────
export interface SceneBuildCallbacks {
    onSpinClick():               void;
    onBuyFreeGame():             void;
    onExtraBetToggle():          void;
    onTurboToggle():             void;
    changeBet(delta: number):    void;
    onAutoSpinClick():           void;
    /** 使用者選擇自動旋轉次數後呼叫 */
    onAutoSpinSelect(n: number): void;
    onCoinTap():                 void;
    /** BUY FG 面板 — 取消 */
    onBuyCancel():               void;
    /** BUY FG 面板 — 確認 Start */
    onBuyStart():                void;
    /** Total Win 面板 — Collect */
    onCollect():                 void;
    /** 開啟儲值面板（MenuBtn ≡ 點擊） */
    onDepositClick():            void;
    /** 儲值面板 — 點選金額按鈕 */
    onDeposit(amount: string):   void;
    /** 儲值面板 — 取消 */
    onDepositCancel():           void;
}

// ────────────────────────────────────────────────────────────────────────────
// 回傳型別（簡化：面板 refs 已注入 uiCtrl）
// ────────────────────────────────────────────────────────────────────────────
export interface SceneRefs {
    reelMgr: ReelManager;
    uiCtrl:  UIController;
}

// ────────────────────────────────────────────────────────────────────────────
// 私有 helpers（模組內使用）
// ────────────────────────────────────────────────────────────────────────────

/** 查找已存在的子節點（by name）或建立新的 */
function findOrMake(parent: Node, name: string,
        x: number, y: number, z: number, w: number, h: number): Node {
    let n = parent.getChildByName(name);
    if (n) return n;
    n = new Node(name);
    parent.addChild(n);
    n.setPosition(x, y, z);
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
}

function ensureGfx(node: Node): Graphics {
    return node.getComponent(Graphics) || node.addComponent(Graphics);
}

function makeLabel(parent: Node, text: string, fontSize: number,
        color = '#ffffff', x = 0, y = 0, w = 400): Label {
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

/** 查找已存在的命名 Label 或建立新的 */
function findOrMakeLabel(parent: Node, name: string, text: string,
        fontSize: number, color = '#ffffff', x = 0, y = 0, w = 400): Label {
    const existing = parent.getChildByName(name);
    if (existing) {
        let lbl = existing.getComponent(Label);
        if (!lbl) lbl = existing.addComponent(Label);
        lbl.string   = text;
        lbl.fontSize = fontSize;
        lbl.isBold   = true;
        lbl.color    = Color.fromHEX(new Color(), color);
        return lbl;
    }
    const lbl = makeLabel(parent, text, fontSize, color, x, y, w);
    lbl.node.name = name;
    return lbl;
}

function makeButton(parent: Node, text: string, w: number, h: number,
        x: number, y: number, bgColor: string, textColor = '#ffffff'): Node {
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

/** 查找已存在的命名按鈕節點並繪製背景，或建立新的 */
function findOrMakeButton(parent: Node, name: string, text: string,
        w: number, h: number, x: number, y: number,
        bgColor: string, textColor = '#ffffff'): Node {
    const existing = parent.getChildByName(name);
    if (existing) {
        const gfx = ensureGfx(existing);
        gfx.clear();
        gfx.fillColor = Color.fromHEX(new Color(), bgColor);
        gfx.roundRect(-w/2, -h/2, w, h, 12);
        gfx.fill();
        gfx.strokeColor = Color.fromHEX(new Color(), '#ffffff55');
        gfx.lineWidth   = 2;
        gfx.roundRect(-w/2+1, -h/2+1, w-2, h-2, 11);
        gfx.stroke();
        if (!existing.getComponent(Button)) existing.addComponent(Button);
        // Label already on a child 'lbl' node from EditorSceneSetup — keep it
        if (!existing.getChildByName('lbl')) {
            makeLabel(existing, text, h > 50 ? 22 : 16, textColor, 0, 0, w);
        }
        return existing;
    }
    return makeButton(parent, text, w, h, x, y, bgColor, textColor);
}

// ────────────────────────────────────────────────────────────────────────────
// 導出 helper（GameBootstrap onCoinTap 在 showCoinToss 也需要重繪）
// ────────────────────────────────────────────────────────────────────────────
export function drawCoinFace(g: Graphics, heads: boolean): void {
    g.clear();
    g.fillColor = new Color(160, 100, 8, 255);
    g.circle(0, 0, 110);
    g.fill();
    g.fillColor = new Color(215, 165, 25, 255);
    g.circle(0, 0, 100);
    g.fill();
    g.strokeColor = new Color(170, 125, 5, 255);
    g.lineWidth = 7;
    g.circle(0, 0, 88);
    g.stroke();
    g.fillColor = new Color(235, 190, 42, 255);
    g.circle(0, 0, 78);
    g.fill();
    g.fillColor = new Color(255, 228, 110, 160);
    g.circle(-18, 30, 32);
    g.fill();
    if (!heads) {
        g.strokeColor = new Color(170, 120, 5, 200);
        g.lineWidth = 4;
        g.circle(0, 0, 50);
        g.stroke();
        g.circle(0, 0, 25);
        g.stroke();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 個別面板建立函式（模組私有）
// ────────────────────────────────────────────────────────────────────────────
function buildBuyPanel(root: Node, cbs: SceneBuildCallbacks): { node: Node; buyCostLbl: Label } {
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
    pGfx.lineWidth = 3;
    pGfx.roundRect(-210, -165, 420, 330, 20);
    pGfx.stroke();
    pGfx.strokeColor = Color.fromHEX(new Color(), '#3366cc');
    pGfx.lineWidth = 1.5;
    pGfx.roundRect(-206, -161, 412, 322, 18);
    pGfx.stroke();

    makeLabel(panel, 'BUY FREE GAME', 26, '#ff8800', 0, 128);

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
    const buyCostLbl = makeLabel(costBox, '25.00', 30, '#ffd700', 0, -14);

    makeLabel(panel, 'Select "Start" to trigger the Free Games', 13, '#aaaacc', 0, -20, 400);
    makeLabel(panel, 'at the current bet amount', 13, '#aaaacc', 0, -42, 400);

    const cancelBtn = makeButton(panel, 'CANCEL', 155, 52, -95, -118, '#440011', '#ff6666');
    const startBtn  = makeButton(panel, 'START',  155, 52,  95, -118, '#004422', '#00ff88');
    cancelBtn.on(Button.EventType.CLICK, () => { p.active = false; cbs.onBuyCancel(); });
    startBtn.on(Button.EventType.CLICK,  () => { p.active = false; cbs.onBuyStart(); });
    p.active = false;
    return { node: p, buyCostLbl };
}

function buildCoinPanel(root: Node, cbs: SceneBuildCallbacks): {
    node: Node; coinGfxNode: Node; coinGfx: Graphics; coinFaceLbl: Label; coinTitleLbl: Label;
} {
    const p = new Node('CoinPanel');
    root.addChild(p);
    p.setPosition(0, 0, 10);
    p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
    const dim = p.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 140);
    dim.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
    dim.fill();

    const coinTitleLbl = makeLabel(p, 'FLIP TO ENTER FREE GAME', 26, '#ff8800', 0, 300, 680);
    makeLabel(p, 'WITH INCREASED MULTIPLIER', 22, '#ffcc00', 0, 264, 680);

    const coinNode = new Node('Coin');
    p.addChild(coinNode);
    coinNode.setPosition(0, 40, 0);
    coinNode.addComponent(UITransform).setContentSize(240, 240);
    const cGfx = coinNode.addComponent(Graphics);
    drawCoinFace(cGfx, true);

    const coinFaceLbl = makeLabel(coinNode, 'ZEUS', 22, '#5a2800', 0, -8, 140);

    makeLabel(p, '▲  TAP COIN TO FLIP  ▲', 15, '#ffffff88', 0, -130, 500);

    p.addComponent(Button);
    p.on(Button.EventType.CLICK, () => cbs.onCoinTap());
    p.active = false;
    return { node: p, coinGfxNode: coinNode, coinGfx: cGfx, coinFaceLbl, coinTitleLbl };
}

function buildMultBar(root: Node): {
    node: Node; multBarGfx: Graphics; multBarLabels: Label[];
} {
    const n = new Node('MultBar');
    root.addChild(n);
    n.setPosition(0, 520, 5);
    const barW = 720;
    n.addComponent(UITransform).setContentSize(barW, 52);
    const multBarGfx    = n.addComponent(Graphics);
    const multBarLabels: Label[] = [];

    const mults  = FG_MULTIPLIERS;
    const boxW   = 130, gap = 10;
    const startX = -((mults.length - 1) * (boxW + gap)) / 2;
    for (let i = 0; i < mults.length; i++) {
        const box = new Node(`mult_${i}`);
        n.addChild(box);
        box.setPosition(startX + i * (boxW + gap), 0, 0);
        box.addComponent(UITransform).setContentSize(boxW, 44);
        const lbl = makeLabel(box, `x${mults[i]}`, 18, '#8899bb', 0, 0, boxW);
        lbl.node.getComponent(UITransform)!.setContentSize(boxW, 30);
        multBarLabels.push(lbl);
    }
    n.active = false;
    return { node: n, multBarGfx, multBarLabels };
}

function buildAutoSpinPanel(root: Node, cbs: SceneBuildCallbacks): {
    node: Node; autoSpinCountLbl: Label;
} {
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
            p.active = false;
            cbs.onAutoSpinSelect(val);
        });
    });

    const cancelBtn = makeButton(card, '✕ 取消', 120, 38, 0, -110, '#3a1a1a', '#ff6666');
    cancelBtn.on(Button.EventType.CLICK, () => { p.active = false; });

    // 剩餘次數標籤由 GameBootstrap 自行保管和更新，從 autoSpinCountLbl 取得
    // buildScene 中回傳 ref 後，GameBootstrap 將其儲存在 uiPanel 下
    p.active = false;
    // autoSpinCountLbl 放在 UIPanel，不在此面板內，由 buildScene 建立
    // 這裡只回傳面板本身
    return { node: p, autoSpinCountLbl: null! };
}

function buildTBPanel(root: Node): Node {
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
    p.active = false;
    return p;
}

function buildTotalWinPanel(root: Node, cbs: SceneBuildCallbacks): {
    node: Node; totalWinLbl: Label;
} {
    const p = new Node('TotalWinPanel');
    root.addChild(p);
    p.setPosition(0, 0, 20);
    p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
    const bg = p.addComponent(Graphics);
    bg.fillColor = new Color(4, 8, 30, 248);
    bg.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
    bg.fill();
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        bg.strokeColor = new Color(60, 100, 200, 25 + (i % 2) * 20);
        bg.lineWidth   = 50;
        bg.moveTo(0, 0);
        bg.lineTo(Math.cos(a) * 700, Math.sin(a) * 700);
        bg.stroke();
    }
    makeLabel(p, 'TOTAL WIN', 52, '#44aaff', 0, 130, 600);
    const totalWinLbl = makeLabel(p, '0.00', 62, '#ffd700', 0, 38, 600);

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
        cbs.onCollect();
    });
    p.active = false;
    return { node: p, totalWinLbl };
}

// ────────────────────────────────────────────────────────────────────────────
// 儲值面板
// ────────────────────────────────────────────────────────────────────────────
function buildDepositPanel(root: Node, cbs: SceneBuildCallbacks): {
    node: Node; balanceLbl: Label;
} {
    const p = new Node('DepositPanel');
    root.addChild(p);
    p.setPosition(0, 0, 10);
    p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
    const dim = p.addComponent(Graphics);
    dim.fillColor = new Color(0, 0, 0, 200);
    dim.rect(-CANVAS_W/2, -CANVAS_H/2, CANVAS_W, CANVAS_H);
    dim.fill();

    const panel = new Node('panel');
    p.addChild(panel);
    panel.addComponent(UITransform).setContentSize(420, 380);
    const pGfx = panel.addComponent(Graphics);
    pGfx.fillColor = Color.fromHEX(new Color(), '#080e26');
    pGfx.roundRect(-210, -190, 420, 380, 20);
    pGfx.fill();
    pGfx.strokeColor = Color.fromHEX(new Color(), '#cc9900');
    pGfx.lineWidth = 3;
    pGfx.roundRect(-210, -190, 420, 380, 20);
    pGfx.stroke();
    pGfx.strokeColor = Color.fromHEX(new Color(), '#3366cc');
    pGfx.lineWidth = 1.5;
    pGfx.roundRect(-206, -186, 412, 372, 18);
    pGfx.stroke();

    makeLabel(panel, '💎 儲值', 26, '#ffd700', 0, 158);

    const balanceLbl = makeLabel(panel, '餘額: 0.00', 15, '#88ccff', 0, 118, 380);

    // 2×2 preset amount grid
    const amounts: [string, string][] = [
        ['$10',  '10'],
        ['$50',  '50'],
        ['$100', '100'],
        ['$500', '500'],
    ];
    const btnW = 160, btnH = 52, gapX = 16, gapY = 12;
    const cols = 2;
    const startX = -((cols - 1) * (btnW + gapX)) / 2;
    amounts.forEach(([label, amount], i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const bx  = startX + col * (btnW + gapX);
        const by  = 62 - row * (btnH + gapY);
        const btn = makeButton(panel, label, btnW, btnH, bx, by, '#0e2a60', '#00cfff');
        btn.on(Button.EventType.CLICK, () => {
            p.active = false;
            cbs.onDeposit(amount);
        });
    });

    const cancelBtn = makeButton(panel, '✕ 取消', 200, 48, 0, -152, '#440011', '#ff6666');
    cancelBtn.on(Button.EventType.CLICK, () => { p.active = false; cbs.onDepositCancel(); });

    p.active = false;
    return { node: p, balanceLbl };
}

// ────────────────────────────────────────────────────────────────────────────
// Extra Bet 資訊彈窗
// ────────────────────────────────────────────────────────────────────────────
function buildExtraBetInfoPanel(root: Node): Node {
    const p = new Node('ExtraBetInfoPanel');
    root.addChild(p);
    p.setPosition(0, 0, 25);
    p.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);

    // 半透明遮罩 + 點任處關閉
    const bdBg = p.addComponent(Graphics);
    bdBg.fillColor = new Color(0, 0, 0, 160);
    bdBg.rect(-CANVAS_W / 2, -CANVAS_H / 2, CANVAS_W, CANVAS_H);
    bdBg.fill();
    p.addComponent(Button);
    p.on(Button.EventType.CLICK, () => { p.active = false; });

    // 資訊卡片
    const card = new Node('card');
    p.addChild(card);
    card.setPosition(0, 40, 0);
    card.addComponent(UITransform).setContentSize(440, 200);
    const cardBg = card.addComponent(Graphics);
    cardBg.fillColor = Color.fromHEX(new Color(), '#0a152e');
    cardBg.roundRect(-220, -100, 440, 200, 16);
    cardBg.fill();
    cardBg.strokeColor = Color.fromHEX(new Color(), '#00cfff');
    cardBg.lineWidth = 2;
    cardBg.roundRect(-220, -100, 440, 200, 16);
    cardBg.stroke();

    makeLabel(card, 'Extra Bet Features', 22, '#00cfff',  0,  74, 400);
    makeLabel(card, 'Costs 3× of your bet.',              18, '#ffd700',  0,  34, 400);
    makeLabel(card, 'Guarantees a Scatter on every spin', 15, '#ffffff',  0,  -4, 400);
    makeLabel(card, 'for higher chance to trigger Thunder Blessing.',
                                                          13, '#aaaacc',  0, -30, 400);
    makeLabel(p, 'Tap anywhere to close', 12, '#555577', 0, -CANVAS_H / 2 + 36, 400);

    p.active = false;
    return p;
}

// ────────────────────────────────────────────────────────────────────────────
// buildScene — 主要進入點
// ────────────────────────────────────────────────────────────────────────────
export function buildScene(
        root: Node,
        session: IGameSession,
        account: IAccountService,
        cbs: SceneBuildCallbacks,
        rng?: RNGFunction): SceneRefs {
    // ── 背景 ────────────────────────────────────────────
    const bg = findOrMake(root, 'Background', 0, 0, -10, CANVAS_W, CANVAS_H);
    const bgGfx = ensureGfx(bg);
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

    // ── 標題 ────────────────────────────────────────────
    const titleArea = findOrMake(root, 'TitleArea', 0, 530, 0, CANVAS_W, 100);
    const titleNodes: Node[] = [];
    titleNodes.push(findOrMakeLabel(titleArea, 'TitleLabel', '⚡ THUNDER BLESSING', 24, '#ffe066', 0, 10).node);
    titleNodes.push(findOrMakeLabel(titleArea, 'SubtitleLabel', 'Zeus  Slot  Game', 14, '#88aacc', 0, -22).node);

    // ── FREE 字母收集指示器 ──────────────────────────────
    const freeLbls: Label[] = [];
    const freeLetters = ['F', 'R', 'E', 'E'];
    const letterSpacing = 50;
    const freeTotalW = (freeLetters.length - 1) * letterSpacing;
    freeLetters.forEach((ch, i) => {
        const lbl = findOrMakeLabel(titleArea, `FreeLetter_${i}`, ch, 20, '#2a2a44',
            -freeTotalW / 2 + i * letterSpacing, -48);
        lbl.isBold = true;
        freeLbls.push(lbl);
    });

    // ── 滾輪區域 (Mask) ──────────────────────────────────
    const reelW = REEL_COUNT * (SYMBOL_W + REEL_GAP) + SYMBOL_W;
    const reelH = MAX_ROWS  * (SYMBOL_H + SYMBOL_GAP) + SYMBOL_H / 2;
    const reelArea = findOrMake(root, 'ReelArea', 0, 72, 0, reelW, reelH);
    if (!reelArea.getComponent(Mask)) {
        const m = reelArea.addComponent(Mask);
        m.type = (Mask.Type as any).GRAPHICS_RECT ?? Mask.Type.RECT;
    }
    const reelMgr = reelArea.getComponent(ReelManager) || reelArea.addComponent(ReelManager);
    reelMgr.init(session, rng);

    // ── 滾輪框 ──────────────────────────────────────────
    const rfW = REEL_COUNT * SYMBOL_W + (REEL_COUNT - 1) * REEL_GAP + 20;
    const rfH = MAX_ROWS  * SYMBOL_H + (MAX_ROWS  - 1) * SYMBOL_GAP + 20;
    const reelFrame = findOrMake(root, 'ReelFrame', 0, 72, 1, rfW, rfH);
    const rfGfx = ensureGfx(reelFrame);
    rfGfx.strokeColor = Color.fromHEX(new Color(), '#8b6914');
    rfGfx.lineWidth   = 3;
    rfGfx.roundRect(-rfW/2, -rfH/2, rfW, rfH, 14);
    rfGfx.stroke();
    rfGfx.strokeColor = Color.fromHEX(new Color(), '#cc9900');
    rfGfx.lineWidth   = 1;
    rfGfx.roundRect(-rfW/2 + 4, -rfH/2 + 4, rfW - 8, rfH - 8, 12);
    rfGfx.stroke();

    // ── FG 倍率條 ────────────────────────────────────────
    const multBarRefs = buildMultBar(root);

    // ── UIPanel (y=−530) ─────────────────────────────────
    const uiPanel = findOrMake(root, 'UIPanel', 0, -530, 0, 720, 200);
    const uiCtrl = uiPanel.getComponent(UIController) || uiPanel.addComponent(UIController);
    // init deferred until after reelMgr is available (done after scene construction)

    // ── BUY FREE GAME | EXTRA BET 列 ─────────────────────
    const buyExtraRow = findOrMake(root, 'BuyExtraRow', 0, -330, 2, 720, 52);
    const barBg = ensureGfx(buyExtraRow);
    barBg.fillColor = Color.fromHEX(new Color(), '#0c0c1c');
    barBg.roundRect(-360, -26, 720, 52, 0);
    barBg.fill();
    barBg.strokeColor = Color.fromHEX(new Color(), '#4a3800');
    barBg.lineWidth   = 2;
    barBg.moveTo(-360, 26);  barBg.lineTo(360, 26);  barBg.stroke();
    barBg.moveTo(-360, -26); barBg.lineTo(360, -26); barBg.stroke();
    barBg.strokeColor = Color.fromHEX(new Color(), '#2a2a44');
    barBg.lineWidth   = 1;
    barBg.moveTo(-12, -22); barBg.lineTo(-12, 22); barBg.stroke();

    const buyBtn = findOrMakeButton(buyExtraRow, 'BuyBtn', 'BUY FREE GAME', 316, 42, -160, 0, '#08185c', '#3a88ff');
    buyBtn.on(Button.EventType.CLICK, () => cbs.onBuyFreeGame());

    const extraBetNode = findOrMake(buyExtraRow, 'ExtraBetBtn', 168, 0, 0, 228, 42);
    uiCtrl.extraBetBg = ensureGfx(extraBetNode);
    if (!extraBetNode.getChildByName('lbl')) {
        makeLabel(extraBetNode, 'EXTRA BET  OFF', 14, '#88aacc', 0, 0, 228);
    }
    if (!extraBetNode.getComponent(Button)) extraBetNode.addComponent(Button);
    extraBetNode.on(Button.EventType.CLICK, () => cbs.onExtraBetToggle());
    uiCtrl.btnExtraBet = extraBetNode;

    const extraBetInfoBtn = findOrMakeButton(buyExtraRow, 'ExtraBetInfoBtn', '?', 34, 34, 338, 0, '#001830', '#00cfff');
    extraBetInfoBtn.on(Button.EventType.CLICK, () => uiCtrl.showExtraBetInfo());

    // ── Status label & 中央 cascade 獎金大字 ────────────────
    uiCtrl.lblStatus = findOrMakeLabel(root, 'StatusLabel', '', 13, '#88aacc', 0, -392, 600);
    const stepWinLbl = findOrMakeLabel(root, 'StepWinLabel', '', 48, '#ffe566', 0, 72, 600);
    stepWinLbl.node.active = false;
    uiCtrl.lblStepWin = stepWinLbl;

    // ── UIPanel 背景 + 分隔線 ─────────────────────────────
    const panelGfx = ensureGfx(uiPanel);
    panelGfx.fillColor = Color.fromHEX(new Color(), '#07071a');
    panelGfx.roundRect(-360, -100, 720, 200, 0);
    panelGfx.fill();
    panelGfx.fillColor = Color.fromHEX(new Color(), '#1a1a3a');
    panelGfx.roundRect(-360, 98, 720, 4, 0);
    panelGfx.fill();
    panelGfx.strokeColor = Color.fromHEX(new Color(), '#1c1c38');
    panelGfx.lineWidth   = 1;
    panelGfx.moveTo(-360, 18); panelGfx.lineTo(360, 18); panelGfx.stroke();

    // ── Info row ──────────────────────────────────────────
    uiCtrl.lblBalance    = findOrMakeLabel(uiPanel, 'BalanceLabel', '', 15, '#ccccdd', -215, 52, 200);
    uiCtrl.lblBet        = findOrMakeLabel(uiPanel, 'BetLabel', '', 15, '#ccccdd',    0, 52, 140);
    uiCtrl.lblWin        = findOrMakeLabel(uiPanel, 'WinLabel', '', 16, '#ffd700',  215, 52, 190);
    uiCtrl.lblLines      = findOrMakeLabel(uiPanel, 'LinesLabel', '', 12, '#888899',    0, 32, 400);
    uiCtrl.lblMultiplier = findOrMakeLabel(uiPanel, 'MultiplierLabel', '', 16, '#00cfff',    0, 32, 400);

    // ── Function bar ─────────────────────────────────────
    const turboBtn = findOrMakeButton(uiPanel, 'TurboBtn', '⚡', 62, 62, -295, -44, '#2a1a00', '#ffcc22');
    turboBtn.on(Button.EventType.CLICK, () => cbs.onTurboToggle());
    uiCtrl.btnTurbo = turboBtn;
    findOrMakeButton(uiPanel, 'BetMinusBtn', '−', 62, 62, -175, -44, '#2a1200', '#ff8800')
        .on(Button.EventType.CLICK, () => cbs.changeBet(-0.25));
    const spinBtn = findOrMakeButton(uiPanel, 'SpinBtn', '↺', 106, 106, 0, -44, '#cc3300');
    uiCtrl.btnSpin = spinBtn;
    spinBtn.on(Button.EventType.CLICK, () => cbs.onSpinClick());
    findOrMakeButton(uiPanel, 'BetPlusBtn', '+', 62, 62, 175, -44, '#001830', '#2299ff')
        .on(Button.EventType.CLICK, () => cbs.changeBet(0.25));
    findOrMakeButton(uiPanel, 'AutoSpinBtn', '▶', 62, 62, 255, -44, '#001a14', '#00cc88')
        .on(Button.EventType.CLICK, () => cbs.onAutoSpinClick());
    let autoSpinCountLbl: Label;
    const existingOverlay = spinBtn.getChildByName('autoSpinCountOverlay');
    if (existingOverlay) {
        autoSpinCountLbl = existingOverlay.getComponent(Label) || existingOverlay.addComponent(Label);
    } else {
        autoSpinCountLbl = makeLabel(spinBtn, '', 26, '#ffffff', 0, 0, 100);
        autoSpinCountLbl.node.name = 'autoSpinCountOverlay';
    }
    findOrMakeButton(uiPanel, 'MenuBtn', '≡', 62, 62, 325, -44, '#14141e', '#8888aa')
        .on(Button.EventType.CLICK, () => cbs.onDepositClick());

    // ── 覆蓋面板 ─────────────────────────────────────────
    const extraBetInfoPanel = buildExtraBetInfoPanel(root);
    const autoSpinResult   = buildAutoSpinPanel(root, cbs);
    const buyResult        = buildBuyPanel(root, cbs);
    const coinResult       = buildCoinPanel(root, cbs);
    const tbPanel          = buildTBPanel(root);
    const totalWinResult   = buildTotalWinPanel(root, cbs);
    const depositResult    = buildDepositPanel(root, cbs);

    // ── Inject all panel refs into uiCtrl ───────────────
    uiCtrl.init(session, account, reelMgr, rng);
    uiCtrl.initPanels({
        freeLbls,
        titleNodes,
        tbPanel,
        buyPanel:         buyResult.node,
        buyCostLbl:       buyResult.buyCostLbl,
        coinPanel:        coinResult.node,
        coinGfxNode:      coinResult.coinGfxNode,
        coinGfx:          coinResult.coinGfx,
        coinFaceLbl:      coinResult.coinFaceLbl,
        coinTitleLbl:     coinResult.coinTitleLbl,
        multBarNode:      multBarRefs.node,
        multBarGfx:       multBarRefs.multBarGfx,
        multBarLabels:    multBarRefs.multBarLabels,
        totalWinPanel:    totalWinResult.node,
        totalWinLbl:      totalWinResult.totalWinLbl,
        autoSpinPanel:      autoSpinResult.node,
        autoSpinCountLbl,
        extraBetInfoPanel,
        depositPanel:       depositResult.node,
        depositBalanceLbl:  depositResult.balanceLbl,
    });
    uiCtrl.autoSpinCountLbl = autoSpinCountLbl;

    return { reelMgr, uiCtrl };
}
