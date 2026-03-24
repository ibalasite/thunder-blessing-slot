/**
 * ReelCellView.ts
 * 單一符號格子的視覺元件 — 掛在每個 Cell 節點上
 *
 * 運作模式：
 *   ① 如果 @property SpriteFrame 已指定 → 使用 Sprite 切換（美術介入後）
 *   ② 否則 → Graphics 色塊 + Label 文字（開發階段佔位）
 *
 * 美術介入點：在 Prefab / Scene Editor 中為每個符號設定 SpriteFrame，
 *             程式碼零修改即可切換為真實圖片。
 */
import { _decorator, Component, Node, Label, Graphics, Sprite, SpriteFrame,
         Color, UITransform, tween, Vec3 } from 'cc';
import { SymType, SYM, SYMBOL_W, SYMBOL_H,
         SYMBOL_COLORS, SYMBOL_DARK, SYMBOL_LABELS } from './GameConfig';

const { ccclass, property } = _decorator;

@ccclass('ReelCellView')
export class ReelCellView extends Component {

    // ── 美術用：每個符號的 SpriteFrame（可選，設定後自動啟用 Sprite 模式）──
    @property(SpriteFrame) frameW:  SpriteFrame | null = null;
    @property(SpriteFrame) frameSC: SpriteFrame | null = null;
    @property(SpriteFrame) frameP1: SpriteFrame | null = null;
    @property(SpriteFrame) frameP2: SpriteFrame | null = null;
    @property(SpriteFrame) frameP3: SpriteFrame | null = null;
    @property(SpriteFrame) frameP4: SpriteFrame | null = null;
    @property(SpriteFrame) frameL1: SpriteFrame | null = null;
    @property(SpriteFrame) frameL2: SpriteFrame | null = null;
    @property(SpriteFrame) frameL3: SpriteFrame | null = null;
    @property(SpriteFrame) frameL4: SpriteFrame | null = null;

    private _sym: SymType = SYM.L4;
    private _frameMap!: Map<SymType, SpriteFrame | null>;

    private _bgGfx:   Graphics | null = null;
    private _markGfx:  Graphics | null = null;
    private _label:    Label | null = null;
    private _sprite:   Sprite | null = null;
    private _spriteMode = false;

    get sym(): SymType { return this._sym; }

    // ── Lifecycle ─────────────────────────────────────────

    onLoad(): void {
        this._frameMap = new Map<SymType, SpriteFrame | null>([
            [SYM.WILD,    this.frameW],
            [SYM.SCATTER, this.frameSC],
            [SYM.P1,      this.frameP1],
            [SYM.P2,      this.frameP2],
            [SYM.P3,      this.frameP3],
            [SYM.P4,      this.frameP4],
            [SYM.L1,      this.frameL1],
            [SYM.L2,      this.frameL2],
            [SYM.L3,      this.frameL3],
            [SYM.L4,      this.frameL4],
        ]);

        this._spriteMode = [...this._frameMap.values()].some(f => f !== null);
        this._ensureChildren();
    }

    /** 確保子節點存在（場景中已有則取用，否則自動建立） */
    private _ensureChildren(): void {
        // bg Graphics
        let bgNode = this.node.getChildByName('bg');
        if (!bgNode) {
            bgNode = new Node('bg');
            this.node.addChild(bgNode);
        }
        this._bgGfx = bgNode.getComponent(Graphics) || bgNode.addComponent(Graphics);

        // mark Graphics
        let markNode = this.node.getChildByName('mark');
        if (!markNode) {
            markNode = new Node('mark');
            this.node.addChild(markNode);
        }
        this._markGfx = markNode.getComponent(Graphics) || markNode.addComponent(Graphics);

        if (this._spriteMode) {
            let sprNode = this.node.getChildByName('sym');
            if (!sprNode) {
                sprNode = new Node('sym');
                this.node.addChild(sprNode);
                sprNode.addComponent(UITransform).setContentSize(SYMBOL_W, SYMBOL_H);
            }
            this._sprite = sprNode.getComponent(Sprite) || sprNode.addComponent(Sprite);
        } else {
            let lblNode = this.node.getChildByName('lbl');
            if (!lblNode) {
                lblNode = new Node('lbl');
                this.node.addChild(lblNode);
                const uit = lblNode.addComponent(UITransform);
                uit.setContentSize(SYMBOL_W, SYMBOL_H);
            }
            this._label = lblNode.getComponent(Label) || lblNode.addComponent(Label);
            this._label.fontSize = 16;
            this._label.isBold   = true;
            this._label.color    = new Color(255, 255, 255, 255);
        }
    }

    // ── Public API ─────────────────────────────────────────

    /** 顯示指定符號 */
    show(sym: SymType): void {
        this._sym = sym;
        if (this._spriteMode) {
            this._showSprite(sym);
        } else {
            this._drawGraphics(sym);
        }
    }

    /** 繪製 / 清除閃電標記 */
    showMark(visible: boolean): void {
        const g = this._markGfx;
        if (!g) return;
        g.clear();
        if (!visible) return;

        const hw = SYMBOL_W / 2, hh = SYMBOL_H / 2;
        g.fillColor = new Color(0, 70, 200, 28);
        g.roundRect(-hw + 3, -hh + 3, SYMBOL_W - 6, SYMBOL_H - 6, 8);
        g.fill();
        g.strokeColor = new Color(50, 150, 255, 220);
        g.lineWidth   = 4;
        g.roundRect(-hw + 2, -hh + 2, SYMBOL_W - 4, SYMBOL_H - 4, 9);
        g.stroke();
        g.strokeColor = new Color(100, 190, 255, 65);
        g.lineWidth   = 8;
        g.roundRect(-hw + 6, -hh + 6, SYMBOL_W - 12, SYMBOL_H - 12, 7);
        g.stroke();

        // ⚡ bolt
        const bx = hw - 13, by = hh - 14;
        g.strokeColor = new Color(255, 220, 30, 240);
        g.lineWidth   = 2.5;
        g.moveTo(bx + 2, by - 7);
        g.lineTo(bx - 1, by + 1);
        g.lineTo(bx + 2, by + 1);
        g.lineTo(bx - 2, by + 7);
        g.stroke();
    }

    /** 中獎脈衝動畫 */
    setWin(on: boolean): void {
        if (!on) return;
        tween(this.node)
            .to(0.11, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.11, { scale: new Vec3(0.97, 0.97, 1) })
            .to(0.09, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    // ── Sprite mode ────────────────────────────────────────

    private _showSprite(sym: SymType): void {
        if (!this._sprite) return;
        const frame = this._frameMap.get(sym);
        if (frame) {
            this._sprite.spriteFrame = frame;
            this._sprite.node.active = true;
        } else {
            this._sprite.node.active = false;
        }
        // still draw background tint
        this._drawBg(sym);
    }

    // ── Graphics fallback mode ────────────────────────────

    private _drawGraphics(sym: SymType): void {
        this._drawBg(sym);
        if (this._label) {
            const label = SYMBOL_LABELS[sym] || sym;
            this._label.fontSize = label.length > 4 ? 14 : 18;
            this._label.string   = label;
        }
    }

    private _drawBg(sym: SymType): void {
        const g = this._bgGfx;
        if (!g) return;

        const color = SYMBOL_COLORS[sym] || '#888888';
        const dark  = SYMBOL_DARK[sym]   || '#222222';
        const hw = SYMBOL_W / 2, hh = SYMBOL_H / 2;

        g.clear();
        g.fillColor = Color.fromHEX(new Color(), dark);
        g.roundRect(-hw, -hh, SYMBOL_W, SYMBOL_H, 10);
        g.fill();
        g.fillColor = Color.fromHEX(new Color(), color);
        g.roundRect(-hw + 3, -hh + 3, SYMBOL_W - 6, SYMBOL_H - 6, 8);
        g.fill();
        g.fillColor = Color.fromHEX(new Color(), '#ffffff22');
        g.roundRect(-hw + 5, -hh + 5, SYMBOL_W - 10, (SYMBOL_H - 10) * 0.45, 6);
        g.fill();
    }
}
