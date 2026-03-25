/**
 * GameBootstrap.ts
 * DI 配線層（~60 行）— 只負責組裝 Model / View / Controller，不含任何遊戲邏輯
 * 掛在 Canvas 的 GameView Node 上
 */
import { _decorator, Component, view, ResolutionPolicy } from 'cc';
import { CANVAS_W, CANVAS_H }    from './GameConfig';
import { GameSession }           from './core/GameSession';
import { LocalAccountService }   from './services/LocalAccountService';
import { LocalWalletService }    from './services/LocalWalletService';
import { LocalEngineAdapter }    from './services/LocalEngineAdapter';
import { GameFlowController }    from './core/GameFlowController';
import { createEngine }          from './SlotEngine';
import { buildScene }            from './components/SceneBuilder';

const { ccclass } = _decorator;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    start() {
        view.setDesignResolutionSize(CANVAS_W, CANVAS_H, ResolutionPolicy.SHOW_ALL);

        // ── Model ──────────────────────────────────────────
        const session = new GameSession();
        const wallet  = new LocalWalletService();
        const adapter = new LocalEngineAdapter(createEngine());

        // IAccountService fallback（SceneBuilder/UIController still use it for display）
        const account = new LocalAccountService();

        let flow!: GameFlowController;

        // ── View（Cocos Components built by SceneBuilder）──
        const { reelMgr, uiCtrl } = buildScene(this.node, session, account, {
            onSpinClick:      () => flow.doSpin(),
            onBuyFreeGame:    () => flow.onBuyFreeGame(),
            onExtraBetToggle: () => uiCtrl.pressExtraBet(),
            onTurboToggle:    () => uiCtrl.pressTurbo(),
            changeBet:        (d) => uiCtrl.pressBetChange(d),
            onAutoSpinClick:  () => flow.onAutoSpinClick(),
            onAutoSpinSelect: (n) => flow.startAutoSpin(n),
            onCoinTap:        () => uiCtrl.onCoinTap(),
            onBuyCancel:      () => uiCtrl.onBuyCancel(),
            onBuyStart:       () => uiCtrl.onBuyStart(),
            onCollect:        () => uiCtrl.onCollect(),
        });

        // ── Controller（注入 wallet DI）─────────────────────
        flow = new GameFlowController(
            session, account, adapter, reelMgr, uiCtrl,
            undefined,  // _wait (default)
            wallet,     // IWalletService
        );

        uiCtrl.updateExtraBetUI();
        uiCtrl.updateTurboUI();
        uiCtrl.setDisplayBalance(wallet.getBalance());
        uiCtrl.refresh();
    }
}
