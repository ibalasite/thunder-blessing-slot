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
    lblWin!:       Label;
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
        this.lblBet.string       = `投注: ${gs.totalBet.toFixed(2)}`;
        this.lblWin.string       = gs.roundWin > 0 ? `WIN: ${gs.roundWin.toFixed(2)}` : '';
        const lines              = gs.currentRows <= 3 ? 25 : 57;
        this.lblLines.string     = `${lines} LINES`;
        this.lblMultiplier.string= gs.inFreeGame
            ? `FREE GAME  ×${gs.fgMultiplier}` : '';
    }

    setStatus(msg: string, color: string = '#ffffff'): void {
        this.lblStatus.string = msg;
        this.lblStatus.color  = Color.fromHEX(new Color(), color);
    }

    showWinPop(amount: number): void {
        this.lblWin.string = `WIN  ${amount.toFixed(2)}`;
        this.lblWin.node.setScale(1, 1, 1);
        tween(this.lblWin.node)
            .to(0.18, { scale: new Vec3(1.5, 1.5, 1) })
            .to(0.18, { scale: new Vec3(1,   1,   1) })
            .start();
    }

    enableSpin(enabled: boolean): void {
        const btn = this.btnSpin.getComponent(Button);
        if (btn) btn.interactable = enabled;
    }

    updateExtraBetUI(): void {
        const on = gs.extraBetOn;
        if (!this.extraBetBg) return;
        this.extraBetBg.clear();
        const c = Color.fromHEX(new Color(), on ? '#1a4a88' : '#222233');
        this.extraBetBg.fillColor = c;
        this.extraBetBg.roundRect(-60, -18, 120, 36, 8);
        this.extraBetBg.fill();
        const border = Color.fromHEX(new Color(), on ? '#00cfff' : '#444466');
        this.extraBetBg.strokeColor = border;
        this.extraBetBg.lineWidth   = on ? 2 : 1;
        this.extraBetBg.roundRect(-60, -18, 120, 36, 8);
        this.extraBetBg.stroke();
    }
}

