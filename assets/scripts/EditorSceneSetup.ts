/**
 * EditorSceneSetup.ts
 * @executeInEditMode 元件 — 掛在 Canvas 上，在 Cocos Editor 開啟場景時
 * 自動建立完整 UI 層級結構，讓美術可以直接在編輯器中預覽和調整。
 *
 * 工作流程：
 *   1. 美術打開場景 → onLoad 自動偵測並建立缺少的節點
 *   2. 美術在 Hierarchy 中看到完整排版
 *   3. 美術存檔 → 節點永久寫入場景（下次開啟不再重建）
 *   4. Runtime 時 SceneBuilder 查找這些已存在的節點做事件接線
 */
import { _decorator, Component, Node, UITransform, Label,
         Button, Color, Vec2 } from 'cc';
import { EDITOR } from 'cc/env';
import { REEL_COUNT, MAX_ROWS, SYMBOL_W, SYMBOL_H, SYMBOL_GAP,
         REEL_GAP, CANVAS_W, CANVAS_H, REEL_START_X } from './GameConfig';

const { ccclass, executeInEditMode } = _decorator;

const REEL_W = REEL_COUNT * (SYMBOL_W + REEL_GAP) + SYMBOL_W;
const REEL_H = MAX_ROWS * (SYMBOL_H + SYMBOL_GAP) + SYMBOL_H / 2;
const RF_W   = REEL_COUNT * SYMBOL_W + (REEL_COUNT - 1) * REEL_GAP + 20;
const RF_H   = MAX_ROWS * SYMBOL_H + (MAX_ROWS - 1) * SYMBOL_GAP + 20;

@ccclass('EditorSceneSetup')
@executeInEditMode
export class EditorSceneSetup extends Component {

    onLoad(): void {
        if (!EDITOR) return;
        if (this.node.getChildByName('Background')) return;
        console.log('[EditorSceneSetup] Building scene hierarchy...');
        this._build();
        console.log('[EditorSceneSetup] Done. Please save the scene (Ctrl+S).');
    }

    private _build(): void {
        const root = this.node;

        // ── Background ───────────────────────────────────────
        this._makeNode(root, 'Background', 0, 0, -10, CANVAS_W, CANVAS_H);

        // ── TitleArea ────────────────────────────────────────
        const title = this._makeNode(root, 'TitleArea', 0, 530, 0, CANVAS_W, 100);
        this._makeLabel(title, 'TitleLabel', 0, 10, 'THUNDER BLESSING SLOT', 28, '#ffc830');
        this._makeLabel(title, 'SubtitleLabel', 0, -22, '雷霆祝福', 16, '#ccccdd');
        for (let i = 0; i < 4; i++) {
            this._makeLabel(title, `FreeLetter_${i}`, -60 + i * 40, -48,
                'FREE'[i], 20, '#555577');
        }

        // ── ReelArea ─────────────────────────────────────────
        const reelArea = this._makeNode(root, 'ReelArea', 0, 72, 0, REEL_W, REEL_H);

        const totalH = MAX_ROWS * SYMBOL_H + (MAX_ROWS - 1) * SYMBOL_GAP;
        const bottomY = -(totalH / 2 - SYMBOL_H / 2);

        for (let ri = 0; ri < REEL_COUNT; ri++) {
            const rx = REEL_START_X + ri * (SYMBOL_W + REEL_GAP);
            const reel = this._makeNode(reelArea, `Reel_${ri}`, rx, 0, 0, SYMBOL_W, totalH);
            for (let row = 0; row < MAX_ROWS; row++) {
                const cy = bottomY + row * (SYMBOL_H + SYMBOL_GAP);
                this._makeNode(reel, `Cell_${row}`, 0, cy, 0, SYMBOL_W, SYMBOL_H);
            }
        }
        this._makeNode(reelArea, 'CloudMask', 0, 0, 5, REEL_W, REEL_H);

        // ── ReelFrame ────────────────────────────────────────
        this._makeNode(root, 'ReelFrame', 0, 72, 1, RF_W, RF_H);

        // ── BuyExtraRow (positions match original buildScene) ─
        const ber = this._makeNode(root, 'BuyExtraRow', 0, -330, 2, 720, 52);
        this._makeBtn(ber, 'BuyBtn', -160, 0, 316, 42, 'BUY FREE GAME');
        this._makeBtn(ber, 'ExtraBetBtn', 168, 0, 228, 42, 'EXTRA BET');
        this._makeBtn(ber, 'ExtraBetInfoBtn', 338, 0, 34, 34, '?');

        // ── UIPanel (positions match original buildScene) ────
        const panel = this._makeNode(root, 'UIPanel', 0, -530, 0, 720, 200);
        this._makeLabel(panel, 'BalanceLabel', -215, 52, '餘額: 1000.00', 15, '#ccccdd');
        this._makeLabel(panel, 'BetLabel',        0, 52, '押注: 0.25', 15, '#ccccdd');
        this._makeLabel(panel, 'WinLabel',       215, 52, '贏得: 0.00', 16, '#ffd700');
        this._makeLabel(panel, 'LinesLabel',       0, 32, '線: 25', 12, '#888899');
        this._makeLabel(panel, 'MultiplierLabel',   0, 32, 'x1', 16, '#00cfff');

        this._makeBtn(panel, 'TurboBtn',    -295, -44, 62, 62, '⚡');
        this._makeBtn(panel, 'BetMinusBtn', -175, -44, 62, 62, '−');
        this._makeBtn(panel, 'SpinBtn',        0, -44, 106, 106, '↺');
        this._makeBtn(panel, 'BetPlusBtn',   175, -44, 62, 62, '+');
        this._makeBtn(panel, 'AutoSpinBtn',  255, -44, 62, 62, '▶');
        this._makeBtn(panel, 'MenuBtn',      325, -44, 62, 62, '≡');

        // ── Status / StepWin labels ──────────────────────────
        this._makeLabel(root, 'StatusLabel', 0, -392, '', 13, '#88aacc');
        const stepWin = this._makeLabel(root, 'StepWinLabel', 0, 72, '', 48, '#ffe566');
        stepWin.node.active = false;
    }

    // ── Helpers ──────────────────────────────────────────────

    private _makeNode(parent: Node, name: string,
            x: number, y: number, z: number,
            w: number, h: number): Node {
        const n = new Node(name);
        parent.addChild(n);
        n.setPosition(x, y, z);
        n.layer = parent.layer;
        const uit = n.addComponent(UITransform);
        uit.setContentSize(w, h);
        uit.setAnchorPoint(new Vec2(0.5, 0.5));
        return n;
    }

    private _makeLabel(parent: Node, name: string,
            x: number, y: number,
            text: string, fontSize: number, color: string): Label {
        const n = this._makeNode(parent, name, x, y, 0, 400, fontSize + 10);
        const lbl = n.addComponent(Label);
        lbl.string   = text;
        lbl.fontSize = fontSize;
        lbl.color    = Color.fromHEX(new Color(), color);
        return lbl;
    }

    private _makeBtn(parent: Node, name: string,
            x: number, y: number,
            w: number, h: number, text: string): Node {
        const n = this._makeNode(parent, name, x, y, 0, w, h);
        n.addComponent(Button);
        // Label goes on a CHILD node — a node can only have one renderable,
        // and buildScene will add Graphics to the button node at runtime.
        const lblNode = new Node('lbl');
        n.addChild(lblNode);
        lblNode.layer = n.layer;
        lblNode.addComponent(UITransform).setContentSize(w, h);
        const lbl = lblNode.addComponent(Label);
        lbl.string   = text;
        lbl.fontSize = h > 50 ? 22 : 16;
        lbl.color    = new Color(255, 255, 255, 255);
        return n;
    }
}
