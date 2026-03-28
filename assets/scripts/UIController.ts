/**
 * UIController.ts
 * Cocos Creator Component：管理所有 UI 顯示（餘額、WIN、按鈕、面板等）
 * 掛在名為 "UIPanel" 的 Node 上
 * 實作 IUIController，供 GameFlowController 呼叫
 */
import { _decorator, Component, Node, Label, Button,
         Color, Graphics, Vec3, tween } from 'cc';
import { IUIController } from './contracts/IUIController';
import { IGameSession }  from './contracts/IGameSession';
import { IAccountService } from './contracts/IAccountService';
import { IReelManager }  from './contracts/IReelManager';
import type { RNGFunction } from './services/RNGProvider';
import {
    MAX_ROWS, COIN_TOSS_HEADS_PROB, FG_MULTIPLIERS,
    LINES_BASE, BET_MIN, BET_MAX, BUY_COST_MULT, EXTRA_BET_MULT,
} from './GameConfig';

const { ccclass } = _decorator;

/** SceneBuilder 建立面板後注入給 UIController */
export interface UIPanelRefs {
    freeLbls:         Label[];
    titleNodes:       Node[];
    tbPanel:          Node;
    buyPanel:         Node;
    buyCostLbl:       Label;
    coinPanel:        Node;
    coinGfxNode:      Node;
    coinGfx:          Graphics;
    coinFaceLbl:      Label;
    coinTitleLbl:     Label;
    multBarNode:      Node;
    multBarGfx:       Graphics;
    multBarLabels:    Label[];
    totalWinPanel:    Node;
    totalWinLbl:      Label;
    autoSpinPanel:    Node;
    autoSpinCountLbl: Label;
    extraBetInfoPanel: Node;
}

@ccclass('UIController')
export class UIController extends Component implements IUIController {
    // ── 由 SceneBuilder 外部賦值 ──────────────────────────
    lblBalance!:    Label;
    lblBet!:        Label;
    lblWin!:        Label;
    lblStepWin!:    Label;
    lblLines!:      Label;
    lblMultiplier!: Label;
    lblStatus!:     Label;
    btnSpin!:       Node;
    btnExtraBet!:   Node;    btnTurbo!:      Node;    extraBetBg!:    Graphics;

    // ── 注入依賴 ─────────────────────────────────────────
    private _session!: IGameSession;
    private _account!: IAccountService;
    private _reelMgr!: IReelManager;

    // ── 面板節點（由 initPanels 注入）────────────────────
    private freeLbls:           Label[]   = [];
    private titleNodes:         Node[]    = [];
    private tbPanel!:           Node;
    private _tbActive           = false;
    private buyPanel!:          Node;
    private _buyCostLbl!:       Label;
    private _buyResolve?:       (start: boolean) => void;
    private coinPanel!:         Node;
    private coinGfxNode!:       Node;
    private coinGfx!:           Graphics;
    private coinFaceLbl!:       Label;
    private coinTitleLbl!:      Label;
    private _coinResolve?:      (heads: boolean) => void;
    private _coinFlipped        = false;
    private _coinIsFGContext    = false;
    private _coinEntryHeadsProb = 0.50;
    private _predeterminedCoin?: boolean;
    private multBarNode!:       Node;
    private multBarGfx!:        Graphics;
    private multBarLabels:      Label[]   = [];
    private totalWinPanel!:     Node;
    private _totalWinLbl!:      Label;
    private _collectResolve?:   () => void;
    autoSpinPanel!:             Node;
    autoSpinCountLbl!:          Label;
    private extraBetInfoPanel?: Node;

    private _rng!: RNGFunction;

    /** 由 GameBootstrap 在場景建立後注入依賴 */
    init(session: IGameSession, account: IAccountService, reelMgr: IReelManager, rng?: RNGFunction): void {
        this._session = session;
        this._account = account;
        this._reelMgr = reelMgr;
        this._rng = rng ?? (() => { throw new Error('RNG not injected into UIController'); });
    }

    /** SceneBuilder 建立面板後呼叫，注入所有面板節點 / 元件 */
    initPanels(refs: UIPanelRefs): void {
        this.freeLbls         = refs.freeLbls;
        this.titleNodes       = refs.titleNodes;
        this.tbPanel          = refs.tbPanel;
        this.buyPanel         = refs.buyPanel;
        this._buyCostLbl      = refs.buyCostLbl;
        this.coinPanel        = refs.coinPanel;
        this.coinGfxNode      = refs.coinGfxNode;
        this.coinGfx          = refs.coinGfx;
        this.coinFaceLbl      = refs.coinFaceLbl;
        this.coinTitleLbl     = refs.coinTitleLbl;
        this.multBarNode      = refs.multBarNode;
        this.multBarGfx       = refs.multBarGfx;
        this.multBarLabels    = refs.multBarLabels;
        this.totalWinPanel    = refs.totalWinPanel;
        this._totalWinLbl     = refs.totalWinLbl;
        this.autoSpinPanel    = refs.autoSpinPanel;
        this.autoSpinCountLbl = refs.autoSpinCountLbl;
        this.extraBetInfoPanel = refs.extraBetInfoPanel;
    }

    onLoad() { /* labels populated by SceneBuilder */ }

    // ══════════════════════════════════════════════════════
    // IUIController — 基本顯示
    // ══════════════════════════════════════════════════════

    private _displayBalance: number | null = null;

    refresh(): void {
        if (!this.lblBalance || !this._session) return;
        const bal = this._displayBalance ?? this._account.getBalance();
        this.lblBalance.string    = `餘額: ${bal.toFixed(2)}`;
        const baseBet = parseFloat(
            (this._session.betPerLine * LINES_BASE * (this._session.extraBetOn ? 3 : 1)).toFixed(2));
        this.lblBet.string        = `押分: ${baseBet.toFixed(2)}`;
        this.lblWin.string        = `WIN: ${this._session.roundWin > 0 ? this._session.roundWin.toFixed(2) : '0'}`;
        this.lblLines.string      = '';
        this.lblMultiplier.string = this._session.inFreeGame
            ? `FREE GAME  ×${this._session.fgMultiplier}` : '';
    }

    setDisplayBalance(balance: number): void {
        this._displayBalance = balance;
        if (this.lblBalance) {
            this.lblBalance.string = `餘額: ${balance.toFixed(2)}`;
        }
    }

    setStatus(msg: string, color = '#ffffff'): void {
        if (!this.lblStatus) return;
        this.lblStatus.string = msg;
        // Validate hex color format before use
        const safeColor = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color! : '#ffffff';
        this.lblStatus.color  = Color.fromHEX(new Color(), safeColor);
    }

    showWinPop(stepWin: number, roundWin: number): void {
        if (this.lblStepWin) {
            this.lblStepWin.string = `+${stepWin.toFixed(2)}`;
            this.lblStepWin.node.active = true;
            this.lblStepWin.node.setScale(0.5, 0.5, 1);
            this.lblStepWin.node.setPosition(0, 0, 0);
            tween(this.lblStepWin.node)
                .to(0.15, { scale: new Vec3(1.3, 1.3, 1) })
                .to(0.12, { scale: new Vec3(1.0, 1.0, 1) })
                .delay(0.5)
                .to(0.25, { scale: new Vec3(0, 0, 1) })
                .call(() => { if (this.lblStepWin) this.lblStepWin.node.active = false; })
                .start();
        }
        if (this.lblWin) {
            this.lblWin.string = `WIN: ${roundWin.toFixed(2)}`;
        }
    }

    enableSpin(enabled: boolean): void {
        const btn = this.btnSpin?.getComponent(Button);
        if (btn) btn.interactable = enabled;
    }

    updateExtraBetUI(): void {
        if (!this._session || !this.extraBetBg) return;
        const on = this._session.extraBetOn;
        this.extraBetBg.clear();
        this.extraBetBg.fillColor = Color.fromHEX(new Color(), on ? '#0e2a60' : '#14142e');
        this.extraBetBg.roundRect(-114, -21, 228, 42, 10);
        this.extraBetBg.fill();
        this.extraBetBg.strokeColor = Color.fromHEX(new Color(), on ? '#00cfff' : '#333355');
        this.extraBetBg.lineWidth   = on ? 2 : 1;
        this.extraBetBg.roundRect(-114, -21, 228, 42, 10);
        this.extraBetBg.stroke();
        this.extraBetBg.fillColor = Color.fromHEX(new Color(), on ? '#006622' : '#2a0a0a');
        this.extraBetBg.roundRect(44, -12, 58, 24, 6);
        this.extraBetBg.fill();
        this.extraBetBg.strokeColor = Color.fromHEX(new Color(), on ? '#00cc44' : '#664444');
        this.extraBetBg.lineWidth = 1;
        this.extraBetBg.roundRect(44, -12, 58, 24, 6);
        this.extraBetBg.stroke();
        const lbl = this.btnExtraBet?.getChildByName('lbl')?.getComponent(Label);
        if (lbl) lbl.string = `EXTRA BET  ${on ? 'ON' : 'OFF'}`;
    }

    updateFreeLetters(rows: number, fourthE = false): void {
        const ON  = '#ffe066';
        const OFF = '#2a2a44';
        const states = [rows >= 4, rows >= 5, rows >= MAX_ROWS, fourthE];
        states.forEach((on, i) => {
            if (this.freeLbls[i]) {
                this.freeLbls[i].color = Color.fromHEX(new Color(), on ? ON : OFF);
            }
        });
    }

    // ══════════════════════════════════════════════════════
    // IUIController — 面板 Promises
    // ══════════════════════════════════════════════════════

    showBuyPanel(): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this._buyResolve = resolve;
            if (this._buyCostLbl) {
                const ebMult = this._session.extraBetOn ? EXTRA_BET_MULT : 1;
                const baseBet = parseFloat(
                    (this._session.betPerLine * LINES_BASE * ebMult).toFixed(2));
                this._buyCostLbl.string = (baseBet * BUY_COST_MULT).toFixed(2);
            }
            this.buyPanel.active = true;
        });
    }

    onBuyCancel(): void { this._buyResolve?.(false); }
    onBuyStart():  void { this._buyResolve?.(true);  }

    showCoinToss(isFGContext: boolean, entryHeadsProb = 0.50): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this._coinResolve         = resolve;
            this._coinFlipped         = false;
            this._coinIsFGContext     = isFGContext;
            this._coinEntryHeadsProb  = entryHeadsProb;
            if (this.coinTitleLbl) {
                this.coinTitleLbl.string = isFGContext
                    ? 'FLIP TO CONTINUE' : 'FLIP TO ENTER FREE GAME';
            }
            this._drawCoinFace(true);
            if (this.coinFaceLbl) {
                this.coinFaceLbl.string = 'ZEUS';
                this.coinFaceLbl.color  = Color.fromHEX(new Color(), '#5a2800');
            }
            if (this.coinGfxNode) {
                this.coinGfxNode.setScale(1, 1, 1);
                this.coinGfxNode.setPosition(0, -500, 0);
                tween(this.coinGfxNode)
                    .to(0.45, { position: new Vec3(0, 40, 0) }, { easing: 'backOut' })
                    .start();
            }
            this.coinPanel.active = true;
        });
    }

    /** 由 SceneBuilder 的 Coin 節點 tap 事件觸發 */
    onCoinTap(): void {
        if (this._coinFlipped || !this.coinPanel?.active) return;
        this._coinFlipped = true;
        let result: boolean;
        if (this._predeterminedCoin !== undefined) {
            result = this._predeterminedCoin;
            this._predeterminedCoin = undefined;
        } else {
            const idx = this._session.fgMultIndex;
            if (idx < 0 || idx >= COIN_TOSS_HEADS_PROB.length) {
                throw new RangeError(`fgMultIndex ${idx} out of bounds for COIN_TOSS_HEADS_PROB`);
            }
            const headsProb = this._coinIsFGContext ? COIN_TOSS_HEADS_PROB[idx] : this._coinEntryHeadsProb;
            result = this._rng() < headsProb;
        }
        const coinNode  = this.coinGfxNode;
        tween(coinNode)
            .to(0.18, { position: new Vec3(0,  90, 0) }, { easing: 'cubicOut' })
            .to(0.18, { position: new Vec3(0,  40, 0) }, { easing: 'cubicIn'  })
            .start();
        tween(coinNode)
            .to(0.18, { scale: new Vec3(1, 0.04, 1) }, { easing: 'cubicIn' })
            .call(() => {
                this._drawCoinFace(result);
                if (this.coinFaceLbl) {
                    this.coinFaceLbl.string = result ? 'ZEUS\n⊙' : '○';
                    this.coinFaceLbl.color  = Color.fromHEX(new Color(),
                        result ? '#5a2800' : '#888888');
                }
            })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'cubicOut' })
            .delay(0.8)
            .call(() => {
                this.coinPanel.active = false;
                this._coinResolve?.(result);
            })
            .start();
    }

    /**
     * playCoinToss — atomic spin 用：播放已決定結果的硬幣動畫。
     * 玩家點擊硬幣後直接顯示預設結果，無隨機。
     */
    playCoinToss(isFGContext: boolean, result: boolean): Promise<void> {
        this._predeterminedCoin = result;
        return this.showCoinToss(isFGContext, 0).then(() => {});
    }

    showTotalWin(amount: number): Promise<void> {
        return new Promise<void>(resolve => {
            this._collectResolve = resolve;
            if (this._totalWinLbl) this._totalWinLbl.string = amount.toFixed(2);
            this.totalWinPanel.active = true;
            if (this._totalWinLbl) {
                this._totalWinLbl.node.setScale(0.5, 0.5, 1);
                tween(this._totalWinLbl.node)
                    .to(0.4,  { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
                    .to(0.15, { scale: new Vec3(1,   1,   1) })
                    .start();
            }
        });
    }

    onCollect(): void { this._collectResolve?.(); }

    async showThunderBlessing(): Promise<void> {
        if (this._tbActive) return;
        this._tbActive = true;
        this.tbPanel.active = true;
        tween(this.tbPanel)
            .to(0.1, { scale: new Vec3(1.1, 1.1, 1) })
            .to(0.1, { scale: new Vec3(1,   1,   1) })
            .start();
        await this._wait(1.1);
        tween(this.tbPanel)
            .to(0.25, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.20, { scale: new Vec3(0,    0,    1) }, { easing: 'cubicIn' })
            .call(() => { this.tbPanel.active = false; this.tbPanel.setScale(1, 1, 1); })
            .start();
        await this._wait(0.45);
        this._tbActive = false;
    }

    // ══════════════════════════════════════════════════════
    // IUIController — FG 倍率條
    // ══════════════════════════════════════════════════════

    showFGBar(activeIdx: number): void {
        for (const n of this.titleNodes) n.active = false;
        this.multBarNode.active = true;
        this.updateMultBar(activeIdx);
    }

    hideFGBar(): void {
        this.multBarNode.active = false;
        for (const n of this.titleNodes) n.active = true;
    }

    updateMultBar(activeIdx: number): void {
        const g      = this.multBarGfx;
        const mults  = FG_MULTIPLIERS;
        const boxW   = 130, gap = 10;
        const startX = -((mults.length - 1) * (boxW + gap)) / 2;
        const totalW = 720;
        g.clear();
        g.fillColor = new Color(20, 18, 14, 255);
        g.roundRect(-totalW/2, -26, totalW, 52, 0); g.fill();
        g.fillColor = new Color(255, 255, 255, 18);
        g.roundRect(-totalW/2, 18, totalW, 4, 0);   g.fill();
        g.fillColor = new Color(0, 0, 0, 80);
        g.roundRect(-totalW/2, -26, totalW, 4, 0);  g.fill();
        for (let i = 0; i < mults.length; i++) {
            const bx = startX + i * (boxW + gap);
            if (i === activeIdx) {
                g.fillColor = new Color(100, 65, 5, 255);
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6); g.fill();
                g.fillColor = new Color(60, 40, 0, 200);
                g.roundRect(bx - boxW/2 + 2, -19, boxW - 4, 38, 5); g.fill();
                g.strokeColor = Color.fromHEX(new Color(), '#ffd700');
                g.lineWidth   = 2.5;
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6); g.stroke();
                g.strokeColor = new Color(255, 200, 50, 100);
                g.lineWidth   = 1;
                g.roundRect(bx - boxW/2 + 3, -18, boxW - 6, 36, 4); g.stroke();
                this.multBarLabels[i].color    = Color.fromHEX(new Color(), '#ffd700');
                this.multBarLabels[i].fontSize = 22;
                this.multBarLabels[i].isBold   = true;
            } else if (i < activeIdx) {
                g.fillColor = new Color(25, 20, 12, 200);
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6); g.fill();
                g.strokeColor = new Color(100, 80, 30, 100);
                g.lineWidth   = 1;
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6); g.stroke();
                this.multBarLabels[i].color    = Color.fromHEX(new Color(), '#776633');
                this.multBarLabels[i].fontSize = 16;
            } else {
                g.fillColor = new Color(40, 35, 28, 220);
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6); g.fill();
                g.strokeColor = new Color(100, 90, 70, 120);
                g.lineWidth   = 1;
                g.roundRect(bx - boxW/2, -21, boxW, 42, 6); g.stroke();
                this.multBarLabels[i].color    = Color.fromHEX(new Color(), '#aaa080');
                this.multBarLabels[i].fontSize = 18;
            }
        }
    }

    // ══════════════════════════════════════════════════════
    // IUIController — Auto Spin
    // ══════════════════════════════════════════════════════

    showAutoSpinPanel(): void {
        if (this.autoSpinPanel) this.autoSpinPanel.active = true;
    }

    /** Extra Bet 說明彈窗 */
    showExtraBetInfo(): void {
        if (this.extraBetInfoPanel) this.extraBetInfoPanel.active = true;
    }

    updateAutoSpinLabel(count: number): void {
        if (!this.autoSpinCountLbl) return;
        // 切換 Spin 按鈕的 ↺ 圖示與剩餘次數顯示
        const spinIconLbl = this.btnSpin?.getChildByName('lbl')?.getComponent(Label);
        if (count === 0) {
            this.autoSpinCountLbl.string = '';
            if (spinIconLbl) spinIconLbl.node.active = true;
        } else {
            this.autoSpinCountLbl.string = count === -1 ? '∞' : String(count);
            if (spinIconLbl) spinIconLbl.node.active = false;
        }
    }

    // ══════════════════════════════════════════════════════
    // 非 IUIController — Extra Bet / Bet Change（Cocos 便利方法）
    // ══════════════════════════════════════════════════════

    pressTurbo(): void {
        if (!this._session) return;
        this._session.setTurboMode(!this._session.turboMode);
        this.updateTurboUI();
    }

    updateTurboUI(): void {
        if (!this.btnTurbo) return;
        const on = this._session?.turboMode ?? true;
        const gfx = this.btnTurbo.getComponent(Graphics);
        if (!gfx) return;
        gfx.clear();
        // Background
        gfx.fillColor = Color.fromHEX(new Color(), on ? '#2a1a00' : '#0d0d10');
        gfx.roundRect(-31, -31, 62, 62, 12);
        gfx.fill();
        // Glow border
        gfx.strokeColor = Color.fromHEX(new Color(), on ? '#ffcc22' : '#333333');
        gfx.lineWidth = on ? 2 : 1;
        gfx.roundRect(-30, -30, 60, 60, 11);
        gfx.stroke();
        // 按鈕圖示顏色
        const lbl = this.btnTurbo.getChildByName('lbl')?.getComponent(Label);
        if (lbl) lbl.color = Color.fromHEX(new Color(), on ? '#ffcc22' : '#444456');
    }

    pressExtraBet(): void {
        if (!this._session) return;
        this._session.setExtraBet(!this._session.extraBetOn);
        this.updateExtraBetUI();
        this.refresh();
        if (this._session.extraBetOn) this._reelMgr.previewExtraBet();
        else                          this._reelMgr.clearPreviewExtraBet();
    }

    pressBetChange(delta: number): void {
        if (!this._session) return;
        // 以 25線基礎押分為參考，確保：
        //   ① +/- 步進永遠是固定 BET_STEP（不受 extraBet×3 或列數影響）
        //   ② 範圍 [BET_MIN, BET_MAX] 對應基礎遊戲 25 線
        const currentBase = parseFloat((this._session.betPerLine * LINES_BASE).toFixed(2));
        const newBase = parseFloat(Math.max(BET_MIN, Math.min(BET_MAX, currentBase + delta)).toFixed(2));
        this._session.setBetPerLine(newBase / LINES_BASE);
        this.refresh();
    }

    // ══════════════════════════════════════════════════════
    // Private helpers
    // ══════════════════════════════════════════════════════

    private _wait(sec: number): Promise<void> {
        return new Promise<void>(resolve => this.scheduleOnce(resolve, sec));
    }

    private _drawCoinFace(heads: boolean): void {
        const g = this.coinGfx;
        if (!g) return;
        g.clear();
        g.fillColor = new Color(160, 100, 8, 255);  g.circle(0, 0, 110); g.fill();
        g.fillColor = new Color(215, 165, 25, 255); g.circle(0, 0, 100); g.fill();
        g.strokeColor = new Color(170, 125, 5, 255); g.lineWidth = 7;
        g.circle(0, 0, 88); g.stroke();
        g.fillColor = new Color(235, 190, 42, 255); g.circle(0, 0, 78); g.fill();
        g.fillColor = new Color(255, 228, 110, 160); g.circle(-18, 30, 32); g.fill();
        if (!heads) {
            g.strokeColor = new Color(170, 120, 5, 200); g.lineWidth = 4;
            g.circle(0, 0, 50); g.stroke();
            g.circle(0, 0, 25); g.stroke();
        }
    }
}

