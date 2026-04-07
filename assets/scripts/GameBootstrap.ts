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
        // ── Remote mode: call K8s server API for all spin logic ──────────────
        // Config priority: window.__THUNDER_CONFIG > URL params > defaults
        this.startRemote().catch((err: unknown) => {
            console.error('[GameBootstrap] Remote API init failed:', err);
        });
    }

    /**
     * startRemote() — Server mode: all spins go through the K8s Fastify API.
     *
     * Config is read (in priority order) from:
     *   1. window.__THUNDER_CONFIG   (injected by nginx or test harness)
     *   2. URL query params          (?apiUrl=...&email=...&password=...)
     *   3. Built-in K8s dev defaults (http://localhost:30001, game-demo@thunder.local)
     *
     * On first run, loginOrRegister() auto-registers the demo account then logs in.
     */
    async startRemote(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg: Record<string, string> = (typeof window !== 'undefined' && (window as any).__THUNDER_CONFIG) ?? {};
        const urlParams = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search) : new URLSearchParams();

        const REMOTE_API_URL  = cfg['apiUrl']   ?? urlParams.get('apiUrl')   ?? 'http://localhost:30001';
        const REMOTE_EMAIL    = cfg['email']    ?? urlParams.get('email')    ?? 'game-demo@thunder.local';
        const REMOTE_PASSWORD = cfg['password'] ?? urlParams.get('password') ?? 'GameDemo1!';

        view.setDesignResolutionSize(CANVAS_W, CANVAS_H, ResolutionPolicy.SHOW_ALL);

        const rng = createCSPRNG();

        // ── Remote Model (Phase 2) ──────────────────────────────────────────────
        const client        = new RemoteApiClient(REMOTE_API_URL);
        await client.loginOrRegister(REMOTE_EMAIL, REMOTE_PASSWORD);
        await client.fetchWallet();
        // Auto-deposit on first run (balance = 0)
        if (client.balance === 0) {
            await client.deposit('1000');
            await client.fetchWallet();
        }
        await client.fetchBetRange();

        const remoteWallet  = new RemoteWalletService(client);
        const remoteAdapter = new RemoteEngineAdapter(client);

        // IAccountService fallback (display only)
        const account = new LocalAccountService();

        let flow!: GameFlowController;

        // ── View ────────────────────────────────────────────────────────────────
        const session = new GameSession();
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
            onDepositClick:   () => uiCtrl.showDepositPanel(),
            onDeposit:        (amount) => {
                client.deposit(amount)
                    .then(() => client.fetchWallet())
                    .then(() => {
                        uiCtrl.setDisplayBalance(client.balance);
                        uiCtrl.hideDepositPanel();
                    })
                    .catch((err: unknown) => {
                        console.error('[Deposit] failed:', err);
                        uiCtrl.setStatus('儲值失敗，請重試', '#ff4444');
                        uiCtrl.hideDepositPanel();
                    });
            },
            onDepositCancel:  () => uiCtrl.hideDepositPanel(),
        }, rng);

        // ── Controller (remote adapters injected) ────────────────────────────────
        flow = new GameFlowController(
            session, account, remoteAdapter, reelMgr, uiCtrl,
            undefined,    // _wait (default)
            remoteWallet, // IWalletService — remote
        );

        uiCtrl.updateExtraBetUI();
        uiCtrl.updateTurboUI();
        uiCtrl.setDisplayBalance(remoteWallet.getBalance());
        uiCtrl.refresh();
    }
}
