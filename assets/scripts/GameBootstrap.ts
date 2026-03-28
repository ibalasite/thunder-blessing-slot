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
import { createCSPRNG }          from './services/RNGProvider';
import { buildScene }            from './components/SceneBuilder';
// ── Phase 2 Remote Mode (imports — safe to include, only used when REMOTE_MODE=true) ──
import { RemoteApiClient }      from './services/RemoteApiClient';
import { RemoteEngineAdapter }  from './services/RemoteEngineAdapter';
import { RemoteWalletService }  from './services/RemoteWalletService';

const { ccclass } = _decorator;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {

    start() {
        view.setDesignResolutionSize(CANVAS_W, CANVAS_H, ResolutionPolicy.SHOW_ALL);

        // ── RNG（CSPRNG — 全域唯一，注入所有模組）────────
        const rng = createCSPRNG();

        // ── Model ──────────────────────────────────────────
        const session = new GameSession();
        const wallet  = new LocalWalletService();
        const adapter = new LocalEngineAdapter(createEngine(rng));

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
        }, rng);

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

    /**
     * startRemote() — Phase 2 server mode entry point.
     *
     * To switch the game to server mode:
     *   1. Change `start()` to call `this.startRemote().catch(console.error)`.
     *   2. Ensure `apps/web` Fastify API is running: `cd apps/web && pnpm dev`
     *   3. Set the correct REMOTE_API_URL, REMOTE_EMAIL, REMOTE_PASSWORD below.
     *
     * WARNING: Do NOT call this method directly from start() in production without
     * first ensuring the API server is running. Cocos start() is synchronous; this
     * method is async and must be awaited via a fire-and-forget wrapper.
     *
     * ─── Configuration ──────────────────────────────────────────────────────────
     */
    async startRemote(): Promise<void> {
        const REMOTE_API_URL  = 'http://localhost:3000';
        const REMOTE_EMAIL    = 'demo@example.com';
        const REMOTE_PASSWORD = 'demo1234';

        view.setDesignResolutionSize(CANVAS_W, CANVAS_H, ResolutionPolicy.SHOW_ALL);

        const rng = createCSPRNG();

        // ── Remote Model (Phase 2) ──────────────────────────────────────────────
        const client        = new RemoteApiClient(REMOTE_API_URL);
        await client.login(REMOTE_EMAIL, REMOTE_PASSWORD);
        await client.fetchWallet();
        await client.fetchBetRange();

        const remoteWallet  = new RemoteWalletService(client);
        const remoteAdapter = new RemoteEngineAdapter(client);

        // IAccountService fallback (display only)
        const account = new LocalAccountService();

        let flow!: GameFlowController;

        // ── View ────────────────────────────────────────────────────────────────
        const { reelMgr, uiCtrl } = buildScene(this.node, new GameSession(), account, {
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
        }, rng);

        // ── Controller (remote adapters injected) ────────────────────────────────
        flow = new GameFlowController(
            new GameSession(), account, remoteAdapter, reelMgr, uiCtrl,
            undefined,    // _wait (default)
            remoteWallet, // IWalletService — remote
        );

        uiCtrl.updateExtraBetUI();
        uiCtrl.updateTurboUI();
        uiCtrl.setDisplayBalance(remoteWallet.getBalance());
        uiCtrl.refresh();
    }
}
