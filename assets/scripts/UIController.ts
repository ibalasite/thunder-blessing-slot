/**
 * UIController.ts
 * Cocos Creator Component：管理所有 UI 顯示（餘額、WIN、按鈕等）
 * 掛在名為 "UIPanel" 的 Node 上
 */
import { _decorator, Component, Node, Label, Button, Toggle, 
         Color, UITransform, Sprite, Graphics, Vec3, tween } from 'cc';
import { gs } from './GameState';
import { EXTRA_BET_MULT, DEFAULT_BET } from './GameConfig';

const { ccclass, property } = _decorator;

@ccclass('UIController')
export class UIController extends Component {
    // 由 GameBootstrap 外部賦值
    lblBalance!:   Label;
    lblBet!:       Label;
    lblWin!:       Label;       // 押注旁小字：本輪累計 WIN
    lblStepWin!:   Label;       // 畫面中央大字：每步 cascade 獎金彈出
    lblLines!:     Label;
    lblMultiplier!:Label;
    lblStatus!:    Label;
    btnSpin!:      Node;
    btnExtraBet!:  Node;
    extraBetBg!:   Graphics;

    onLoad() { /* labels 由 GameBootstrap 賦值後才能 refresh */ }

    refresh(): void {
        if (!this.lblBalance) return;
        this.lblBalance.string   = `餘額: ${gs.balance.toFixed(2)}`;
        this.lblBet.string       = `押分: ${gs.totalBet.toFixed(2)}`;
        this.lblWin.string       = `WIN: ${gs.roundWin > 0 ? gs.roundWin.toFixed(2) : '0'}`;
        this.lblLines.string     = '';
        this.lblMultiplier.string = gs.inFreeGame
            ? `FREE GAME  ×${gs.fgMultiplier}` : '';
    }

    setStatus(msg: string, color: string = '#ffffff'): void {
        this.lblStatus.string = msg;
        this.lblStatus.color  = Color.fromHEX(new Color(), color);
    }

    /**
     * stepWin  = 每步 cascade 的個別獎金 → 中央大字彈出動畫
     * roundWin = 本輪累計           → 押注旁小字同步更新
     */
    showWinPop(stepWin: number, roundWin: number): void {
        // ① 中央大字：顯示本步驟獎金，彈跳後淡出
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
        // ② 押注旁小字：更新為累計值
        if (this.lblWin) {
            this.lblWin.string = `WIN: ${roundWin.toFixed(2)}`;
        }
    }

    enableSpin(enabled: boolean): void {
        const btn = this.btnSpin.getComponent(Button);
        if (btn) btn.interactable = enabled;
    }

    updateExtraBetUI(): void {
        const on = gs.extraBetOn;
        if (!this.extraBetBg) return;
        this.extraBetBg.clear();
        // Main background (268×42)
        const c = Color.fromHEX(new Color(), on ? '#0e2a60' : '#14142e');
        this.extraBetBg.fillColor = c;
        this.extraBetBg.roundRect(-134, -21, 268, 42, 10);
        this.extraBetBg.fill();
        // Border
        const border = Color.fromHEX(new Color(), on ? '#00cfff' : '#333355');
        this.extraBetBg.strokeColor = border;
        this.extraBetBg.lineWidth   = on ? 2 : 1;
        this.extraBetBg.roundRect(-134, -21, 268, 42, 10);
        this.extraBetBg.stroke();
        // ON/OFF badge (right side)
        this.extraBetBg.fillColor = Color.fromHEX(new Color(), on ? '#006622' : '#2a0a0a');
        this.extraBetBg.roundRect(66, -12, 58, 24, 6);
        this.extraBetBg.fill();
        this.extraBetBg.strokeColor = Color.fromHEX(new Color(), on ? '#00cc44' : '#664444');
        this.extraBetBg.lineWidth = 1;
        this.extraBetBg.roundRect(66, -12, 58, 24, 6);
        this.extraBetBg.stroke();
        // Update label text
        const lbl = this.btnExtraBet?.getChildByName('lbl')?.getComponent(Label);
        if (lbl) lbl.string = `EXTRA BET  ${on ? 'ON' : 'OFF'}`;
    }
}

