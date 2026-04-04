/**
 * GameFlowController.ts
 * 純 TypeScript 遊戲流程控制器 — 無任何 Cocos Creator 依賴
 *
 * 架構原則（Atomic Spin）：
 *   一次 spin 為原子單位。Engine 一次算完所有結果（含 FG chain），
 *   Controller 只負責播放動畫。UI 不做任何機率運算。
 *   未來 server 版只需把 FullSpinOutcome 從 server 回傳即可。
 *
 * 依賴全部透過建構子注入：
 *   IGameSession   — 遊戲狀態讀寫
 *   IAccountService — 餘額扣減
 *   IEngineAdapter  — 機率引擎（非同步）
 *   IReelManager    — 滾輪動畫
 *   IUIController   — UI 顯示
 */
import { IGameSession }    from '../contracts/IGameSession';
import { IAccountService } from '../contracts/IAccountService';
import { IEngineAdapter }  from '../contracts/IEngineAdapter';
import { IReelManager }    from '../contracts/IReelManager';
import { IUIController }   from '../contracts/IUIController';
import type { IWalletService, SpinTx } from '../contracts/IWalletService';
import type { FullSpinOutcome, GameMode, SpinResponse, FGSpinOutcome } from '../contracts/types';
import { logger } from './logger';
import { WinLine }         from '../SlotEngine';
import { calcWinAmount, findScatters } from '../SlotEngine';
import {
    BASE_ROWS, MAX_ROWS, MAX_WIN_MULT, LINES_BASE,
    BUY_COST_MULT, EXTRA_BET_MULT, SymType,
    FG_MULTIPLIERS, SYMBOL_LABELS,
} from '../GameConfig';

export class GameFlowController {

    /** true while a spin animation / flow is running */
    busy = false;
    /** 0 = off, -1 = infinite, N = remaining */
    autoSpinCount = 0;

    /**
     * 新版錢包（IWalletService），支援 beginSpin/completeSpin 交易模式。
     * 若未提供，會用 _account（舊版 IAccountService）作為 fallback。
     */
    private readonly _wallet?: IWalletService;

    constructor(
        private readonly _session: IGameSession,
        private readonly _account: IAccountService,
        private readonly _engine:  IEngineAdapter,
        private readonly _reels:   IReelManager,
        private readonly _ui:      IUIController,
        private readonly _wait: (sec: number) => Promise<void> = (s) =>
            new Promise(r => setTimeout(r, s * 1000)),
        wallet?: IWalletService,
    ) {
        this._wallet = wallet;
    }

    /** Base totalBet without EB multiplier — used for engine calculations */
    private get _baseTotalBet(): number {
        return parseFloat((this._session.betPerLine * LINES_BASE).toFixed(4));
    }

    // ══════════════════════════════════════════════════
    // Main Spin（Atomic）
    // ══════════════════════════════════════════════════

    async doSpin(): Promise<void> {
        if (!this._session.inFreeGame) {
            this._session.resetRows();
            this._session.computeTotalBet();
            this._ui.refresh();
        }

        const mode: GameMode = this._session.extraBetOn ? 'extraBet' : 'main';
        const baseBet = this._baseTotalBet;

        // Pre-flight balance check — must run BEFORE fullSpin() because in remote
        // mode the engine calls the server which atomically deducts the wager.
        const w = this._wallet;
        const expectedWager = this._session.totalBet;
        if (w) {
            if (!w.canAfford(expectedWager)) {
                logger.error('Spin failed', { error: 'InsufficientFunds', wagered: expectedWager, balance: w.getBalance() });
                await this._ui.showDepositPanel(); return;
            }
        } else {
            if (!this._account.canAfford(expectedWager)) {
                logger.error('Spin failed', { error: 'InsufficientFunds', wagered: expectedWager });
                await this._ui.showDepositPanel(); return;
            }
        }

        logger.info('Spin started', { bet: baseBet, mode });
        const outcome = await this._engine.fullSpin(mode, baseBet);

        this.busy = true;
        this._ui.enableSpin(false);
        this._ui.setStatus('旋轉中…', '#88aacc');

        // ── 1. 扣款（立即，帳務層）──────────────────────
        let tx: SpinTx | undefined;
        if (w) {
            tx = w.beginSpin(outcome.wagered);
            this._ui.setDisplayBalance(w.getBalance());
        } else {
            this._account.debit(outcome.wagered);
        }

        this._session.resetRound();
        this._session.clearMarks();
        this._reels.reset();
        this._ui.updateFreeLetters(BASE_ROWS);
        this._ui.refresh();

        // ── 2. UI 表演（純視覺，不動帳務）────────────────
        const balanceAfterDebit = w ? w.getBalance() : this._account.getBalance();
        await this._playFullOutcome(outcome, balanceAfterDebit);

        // ── 3. 入帳（立即，帳務層）──────────────────────
        const totalWin = this._session.roundWin;
        if (w && tx) {
            const newBal = w.completeSpin(tx, totalWin);
            this._ui.setDisplayBalance(newBal);
        } else {
            this._account.credit(totalWin);
        }

        const rw = this._session.roundWin;
        this._ui.setStatus(
            rw > 0 ? `本輪獲得 ${rw.toFixed(2)}` : '沒有獎金',
            rw > 0 ? '#ffd700' : '#888888');
        if (outcome.maxWinCapped)
            this._ui.setStatus(`★ MAX WIN ${rw.toFixed(2)} ★`, '#ff4444');

        this.busy = false;
        this._ui.enableSpin(true);
        this._ui.refresh();

        const canAffordNext = w
            ? w.canAfford(outcome.wagered)
            : this._account.canAfford(outcome.wagered);
        if (this.autoSpinCount !== 0 && !this._session.inFreeGame && canAffordNext) {
            if (this.autoSpinCount > 0) this.autoSpinCount--;
            this._ui.updateAutoSpinLabel(this.autoSpinCount);
            this._ui.updateFreeLetters(BASE_ROWS);
            await this.doSpin();
        } else if (this.autoSpinCount !== 0) {
            this.autoSpinCount = 0;
            this._ui.updateAutoSpinLabel(0);
        }
    }

    // ══════════════════════════════════════════════════
    // Buy Free Game（Atomic）
    // ══════════════════════════════════════════════════

    async onBuyFreeGame(): Promise<void> {
        if (this.busy) return;
        const confirmed = await this._ui.showBuyPanel();
        if (!confirmed) return;

        const ebMult = this._session.extraBetOn ? EXTRA_BET_MULT : 1;
        const baseBet = parseFloat((this._session.betPerLine * LINES_BASE * ebMult).toFixed(4));
        const buyCost = parseFloat((baseBet * BUY_COST_MULT).toFixed(4));

        // Pre-flight balance check — must run BEFORE fullSpin() because in remote
        // mode the engine calls the server which atomically deducts the wager.
        const w = this._wallet;
        if (w) {
            if (!w.canAfford(buyCost)) {
                await this._ui.showDepositPanel(); return;
            }
        } else {
            if (!this._account.canAfford(buyCost)) {
                await this._ui.showDepositPanel(); return;
            }
        }

        const outcome = await this._engine.fullSpin('buyFG', baseBet, this._session.extraBetOn);

        // ── 1. 扣款（立即）──────────────────────
        let tx: SpinTx | undefined;
        if (w) {
            tx = w.beginSpin(outcome.wagered);
            this._ui.setDisplayBalance(w.getBalance());
        } else {
            this._account.debit(outcome.wagered);
        }

        this.busy = true;
        this._ui.enableSpin(false);
        this._session.resetRound();
        this._session.clearMarks();
        this._reels.reset();
        this._ui.updateFreeLetters(BASE_ROWS);
        this._ui.refresh();

        // ── 2. UI 表演 ─────────────────────────
        const balanceAfterDebit = w ? w.getBalance() : this._account.getBalance();
        await this._playFullOutcome(outcome, balanceAfterDebit);

        // ── 3. 入帳（立即）──────────────────────
        const totalWin = this._session.roundWin;
        if (w && tx) {
            const newBal = w.completeSpin(tx, totalWin);
            this._ui.setDisplayBalance(newBal);
        } else {
            this._account.credit(totalWin);
        }

        this.busy = false;
        this._ui.enableSpin(true);
        this._ui.refresh();
    }

    // ══════════════════════════════════════════════════
    // Atomic Outcome Playback
    // ══════════════════════════════════════════════════

    private async _playFullOutcome(
        o: FullSpinOutcome, balanceAfterDebit?: number,
    ): Promise<void> {
        const fgWillTrigger = o.fgTriggered && o.entryCoinToss?.heads === true;

        // ── 1. Play Phase A: base cascade spins ──────────────
        for (let i = 0; i < o.baseSpins.length; i++) {
            if (i > 0) this._reels.reset();
            const spin = o.baseSpins[i];
            this._session.setGrid(spin.grid);
            this._session.setCurrentRows(spin.finalRows);
            await this._reels.spinWithGrid(spin.grid);
            await this._replayCascade(spin, 1, 1, balanceAfterDebit);

            if (spin.tbStep) {
                await this._replayTB(spin.tbStep.gridAfter);
            }

            if (o.fgTriggered) {
                this._ui.updateFreeLetters(spin.finalRows, fgWillTrigger && spin.finalRows >= MAX_ROWS);
            } else if (!this._session.inFreeGame) {
                this._ui.updateFreeLetters(spin.finalRows, false);
            }

            if (o.fgTriggered && spin.finalRows < MAX_ROWS && i < o.baseSpins.length - 1) {
                this._ui.setStatus(o.mode === 'buyFG'
                    ? 'Buy Free Game — collecting FREE...'
                    : 'FREE — collecting...', '#ffdd44');
                await this._wait(0.3);
            }
        }

        // ── 2. Entry Coin Toss (if FG triggered) ─────────────
        if (o.fgTriggered && o.entryCoinToss) {
            this._ui.showFGBar(0);

            if (o.mode === 'buyFG') {
                // BuyFG: entry is mathematically guaranteed (ENTRY_TOSS_PROB_BUY = 1).
                // Skip the interactive coin toss UI — go directly to FG spin loop.
                // Showing a coin toss with WIN: 0 (base spin often has no line wins
                // in buyFG weight mode) confuses players. The per-spin tosses (x3→x7
                // etc.) still show, all predetermined heads, each after a spin with wins.
                this._ui.setStatus('FREE GAME — x3 START!', '#00ff88');
                await this._wait(0.5);
            } else {
                // Normal / ExtraBet FG: entry coin toss is interactive (may be tails)
                this._ui.setStatus('FLIP TO CONTINUE WITH INCREASED MULTIPLIER', '#ffaa44');
                await this._wait(0.5);

                await this._ui.playCoinToss(true, o.entryCoinToss.heads);

                if (!o.entryCoinToss.heads) {
                    this._ui.setStatus('Coin Toss — Tails. Free Game not entered.', '#ff6666');
                    await this._wait(0.8);
                    this._ui.hideFGBar();

                    if (this._session.roundWin > 0) {
                        await this._ui.showTotalWin(this._session.roundWin);
                    }
                    return;
                }

                this._ui.setStatus('Free Game x3 — START!', '#00ff88');
                await this._wait(0.8);
            }
        }

        // ── 3. FG Spin Loop (per-spin coin toss) ─────────────
        if (o.fgSpins.length > 0) {
            logger.info('Free game entered', { multIndex: 0, spins: o.fgSpins.length });
            this._session.enterFreeGame(0);
            this._ui.showFGBar(0);
            this._ui.refresh();

            let fgAccumulatedWin = 0;

            for (let i = 0; i < o.fgSpins.length; i++) {
                const fg = o.fgSpins[i];
                const mult = fg.multiplier;
                const multIdx = fg.multiplierIndex;

                this._ui.updateMultBar(multIdx);
                this._ui.setStatus(
                    `FREE GAME x${mult} — REMAINING: 1`, '#00cfff');
                await this._wait(0.3);

                const winBefore = this._session.roundWin;

                this._reels.reset();
                this._session.setGrid(fg.spin.grid);
                this._session.setCurrentRows(fg.spin.finalRows);
                await this._reels.spinWithGrid(fg.spin.grid, true);
                await this._replayCascade(fg.spin, mult, fg.spinBonus ?? 1, balanceAfterDebit);

                if (fg.spin.tbStep) {
                    await this._replayTB(fg.spin.tbStep.gridAfter);
                }

                const spinWin = this._session.roundWin - winBefore;
                fgAccumulatedWin += spinWin;

                if (spinWin > 0) {
                    this._ui.setStatus(
                        `WIN ${spinWin.toFixed(2)} (x${mult})` +
                        `  TOTAL: ${fgAccumulatedWin.toFixed(2)}`, '#ffd700');
                    await this._wait(0.6);
                } else {
                    this._ui.setStatus(
                        `x${mult} — no win  TOTAL: ${fgAccumulatedWin.toFixed(2)}`, '#aaaaaa');
                    await this._wait(0.3);
                }
                this._ui.refresh();

                if (this._session.roundWin >= o.totalBet * MAX_WIN_MULT) {
                    this._ui.setStatus('MAX WIN REACHED! 🎉', '#FFD700');
                    await this._wait(1.5);
                    break;
                }

                // Per-spin Coin Toss
                if (fg.coinToss.heads && i < o.fgSpins.length - 1) {
                    const nextMult = o.fgSpins[i + 1].multiplier;
                    this._ui.setStatus('FLIP TO CONTINUE WITH INCREASED MULTIPLIER', '#ffaa44');
                    await this._wait(0.3);
                    await this._ui.playCoinToss(true, true);
                    this._ui.setStatus(`+1 FREE GAME — x${nextMult}!`, '#ffd700');
                    await this._wait(0.6);
                } else if (!fg.coinToss.heads) {
                    this._ui.setStatus('FLIP TO CONTINUE WITH INCREASED MULTIPLIER', '#ffaa44');
                    await this._wait(0.3);
                    await this._ui.playCoinToss(true, false);
                    this._ui.setStatus('Coin Toss — Tails. Free Game ends.', '#ff6666');
                    await this._wait(0.6);
                }
            }

            // ── 4. FG Settlement ──────────────────────────────
            logger.info('Free game exited', { totalWin: this._session.roundWin });
            this._session.exitFreeGame();
            this._session.clearMarks();
            this._ui.hideFGBar();

            this._ui.setStatus(
                `Free Game complete! Total FG win: ${fgAccumulatedWin.toFixed(2)}`, '#ff8888');
            this._ui.refresh();
            await this._wait(1.0);

            await this._ui.showTotalWin(this._session.roundWin);
        }
    }

    /**
     * Replay cascade steps from a single SpinResponse.
     *
     * 帳務分離：cascade 中 **不** 呼叫 wallet credit。
     * 只累計 session.roundWin 和更新 UI 顯示餘額（跟動畫）。
     * 實際入帳在 doSpin / onBuyFreeGame 的 completeSpin 統一處理。
     */
    private async _replayCascade(
        spin: SpinResponse, fgMultiplier: number,
        spinBonus: number = 1,
        balanceAfterDebit?: number,
    ): Promise<void> {
        const inFG = fgMultiplier > 1;

        for (let stepIdx = 0; stepIdx < spin.cascadeSteps.length; stepIdx++) {
            const step = spin.cascadeSteps[stepIdx];

            // ① Flash 高亮中獎格子
            await this._reels.flashWinCells(step.wins as WinLine[]);

            const newSyms = new Map<string, SymType>();
            for (const cell of step.winCells) {
                newSyms.set(`${cell.reel},${cell.row}`, spin.grid[cell.reel][cell.row]);
            }

            // ② 計算本步獎金（含 FG Spin Bonus 倍率）
            const rawWin = step.wins.reduce(
                (s, w) => s + calcWinAmount(w as WinLine, this._baseTotalBet), 0);
            const stepWin = Math.round(rawWin * fgMultiplier * spinBonus * 100 + Number.EPSILON) / 100;

            this._session.addRoundWin(stepWin);

            if (this._wallet) {
                this._ui.setDisplayBalance(
                    (this._wallet?.getBalance() ?? this._account.getBalance()) + this._session.roundWin);
            }

            // ③ 組合中獎符號摘要（顯示消了什麼、得多少分）
            const winDetails = step.wins.map(w => {
                const wl = w as WinLine;
                return `${SYMBOL_LABELS[wl.symbol] ?? wl.symbol}×${wl.count}`;
            });
            const symSummary = Array.from(new Set(winDetails)).join('+');

            this._ui.showWinPop(stepWin, this._session.roundWin);
            this._ui.setStatus(
                `${symSummary} → +${stepWin.toFixed(2)}` +
                `${inFG ? ` (×${fgMultiplier})` : ''}` +
                `　合計：${this._session.roundWin.toFixed(2)}`,
                '#ffd700');

            // ④ 停頓：讓玩家看清中獎內容再開始下移
            await this._wait(0.3);

            if (this._session.roundWin >= this._baseTotalBet * MAX_WIN_MULT) break;

            // ⑤ Cascade 動畫：消除中獎格、符號下移填充
            await this._reels.cascade(step.winCells, step.rowsAfter, newSyms);
            this._reels.refreshAllMarks();
            this._session.setCurrentRows(step.rowsAfter);

            if (!inFG) {
                this._ui.updateFreeLetters(step.rowsAfter, false);
            }
        }
    }

    /** Replay Thunder Blessing visual */
    private async _replayTB(gridAfter: SymType[][]): Promise<void> {
        void this._ui.showThunderBlessing();
        this._ui.setStatus('⚡ 雷霆祝福！標記格轉換中…', '#ff88ff');
        await this._wait(0.25);

        this._session.clearMarks();
        this._reels.updateGrid(gridAfter);
        this._session.setGrid(gridAfter);
        this._reels.refreshAllMarks();
        await this._wait(0.4);
    }

    // ═══════════════════════════════════════════════════════════════════
    // AUTO SPIN MANAGEMENT
    // Handles auto-spin state: start, stop, and count tracking.
    // onAutoSpinClick — toggled by the UI spin button when auto is active.
    // startAutoSpin   — called by the auto-spin panel after the player
    //                   selects a spin count (or ∞).
    // ═══════════════════════════════════════════════════════════════════

    onAutoSpinClick(): void {
        if (this.autoSpinCount !== 0) {
            this.autoSpinCount = 0;
            this._ui.updateAutoSpinLabel(0);
            return;
        }
        if (!this.busy) this._ui.showAutoSpinPanel();
    }

    startAutoSpin(n: number): void {
        this.autoSpinCount = n;
        this._ui.updateAutoSpinLabel(n);
        if (!this.busy) this.doSpin();
    }
}
