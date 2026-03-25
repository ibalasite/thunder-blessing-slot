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
import { WinLine }         from '../SlotEngine';
import { calcWinAmount, findScatters } from '../SlotEngine';
import {
    BASE_ROWS, MAX_ROWS, MAX_WIN_MULT, LINES_BASE,
    BUY_COST_MULT, EXTRA_BET_MULT, SymType,
    FG_MULTIPLIERS, FG_ROUND_COUNTS, SYMBOL_LABELS,
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
        const outcome = await this._engine.fullSpin(mode, baseBet);

        const w = this._wallet;
        if (w) {
            if (!w.canAfford(outcome.wagered)) {
                this._ui.setStatus('餘額不足！', '#ff4444'); return;
            }
        } else {
            if (!this._account.canAfford(outcome.wagered)) {
                this._ui.setStatus('餘額不足！', '#ff4444'); return;
            }
        }

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
            this.doSpin();
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
        const outcome = await this._engine.fullSpin('buyFG', baseBet);

        const w = this._wallet;
        if (w) {
            if (!w.canAfford(outcome.wagered)) {
                this._ui.setStatus('餘額不足！', '#ff4444'); return;
            }
        } else {
            if (!this._account.canAfford(outcome.wagered)) {
                this._ui.setStatus('餘額不足！', '#ff4444'); return;
            }
        }

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
        const scale = o.modePayoutScale;
        const fgWillTrigger = o.fgSpins.length > 0;

        // ── 1. Play base spins ──────────────────────────────
        for (let i = 0; i < o.baseSpins.length; i++) {
            if (i > 0) this._reels.reset();
            const spin = o.baseSpins[i];
            this._session.setGrid(spin.grid);
            this._session.setCurrentRows(spin.finalRows);
            await this._reels.spinWithGrid(spin.grid);
            await this._replayCascade(spin, 1, scale, balanceAfterDebit);

            if (spin.tbStep) {
                await this._replayTB(spin.tbStep.gridAfter);
            }

            // FREE letter: 4th E only if FG will actually trigger
            if (spin.finalRows >= MAX_ROWS || spin.fgTriggered) {
                this._ui.updateFreeLetters(MAX_ROWS, fgWillTrigger);
            } else if (!this._session.inFreeGame) {
                this._ui.updateFreeLetters(spin.finalRows, false);
            }

            if (o.mode === 'buyFG' && !(spin.fgTriggered || spin.finalRows >= MAX_ROWS)
                    && i < o.baseSpins.length - 1) {
                this._ui.setStatus('★ Buy Free Game — 旋轉中…', '#ffdd44');
                await this._wait(0.3);
            }
        }

        // ── 2. Tier upgrade ceremony (GDD: coin toss determines rounds + multiplier) ──
        if (o.tierUpgrades && o.tierUpgrades.length > 0 && o.fgTier) {
            const MULTS  = FG_MULTIPLIERS;
            const ROUNDS = FG_ROUND_COUNTS;

            // 2a. 宣告進入 Free Game
            this._ui.setStatus('🎉 恭喜！即將進入 Free Game！', '#00ff88');
            await this._wait(1.0);

            // 2b. 顯示倍率條，從 tier 0 開始
            this._ui.showFGBar(0);
            this._ui.setStatus(
                `起始等級 ×${MULTS[0]} — ${ROUNDS[0]} 輪`, '#ffffff');
            await this._wait(0.8);

            // 2c. 逐次 coin toss 升級
            let currentTier = 0;
            for (let i = 0; i < o.tierUpgrades.length; i++) {
                const toss = o.tierUpgrades[i];
                const nextTier = currentTier + 1;

                // 顯示本次翻轉目標
                this._ui.setStatus(
                    `🪙 翻轉硬幣 — 升級至 ×${MULTS[nextTier]}？`, '#ffaa44');
                await this._wait(0.5);

                // 玩家翻硬幣
                await this._ui.playCoinToss(true, toss.heads);

                if (toss.heads) {
                    currentTier = nextTier;
                    this._ui.updateMultBar(currentTier);
                    this._ui.setStatus(
                        `✨ 升級成功！×${MULTS[currentTier - 1]} → ×${MULTS[currentTier]} — ${ROUNDS[currentTier]} 輪！`,
                        '#ffd700');
                    await this._wait(1.0);

                    if (i >= o.tierUpgrades.length - 1) break;
                } else {
                    this._ui.setStatus(
                        `硬幣反面 — 等級確定！`, '#ffaa44');
                    await this._wait(0.6);
                    break;
                }
            }

            // 2d. 展示未挑戰的等級（讓 ×27 / ×77 等高階 tier 有存在感）
            // currentTier+1 的 tails 已在上面的 coin toss 中展示過，
            // 這裡從 currentTier+2 開始展示剩餘更高的等級
            for (let t = currentTier + 2; t < MULTS.length; t++) {
                this._ui.updateMultBar(t);
                this._ui.setStatus(
                    `×${MULTS[t]} — ${ROUNDS[t]} 輪（需先通過 ×${MULTS[t - 1]}）`,
                    '#555555');
                await this._wait(0.5);
            }

            // 2e. 最終確認等級
            this._ui.updateMultBar(o.fgTier.tierIndex);
            if (currentTier === MULTS.length - 1) {
                this._ui.setStatus(
                    `🌟 最高等級達成！×${MULTS[currentTier]} — ${ROUNDS[currentTier]} 輪！`,
                    '#ff4444');
            } else {
                this._ui.setStatus(
                    `🎰 Free Game ×${o.fgTier.multiplier} — ${o.fgTier.rounds} 輪開始！`,
                    '#00ff88');
            }
            await this._wait(1.2);
            this._ui.hideFGBar();
        }

        // ── 3. Free Game chain (fixed rounds) ────────────────
        if (o.fgSpins.length > 0 && o.fgTier) {
            this._session.enterFreeGame(o.fgTier.tierIndex);
            this._ui.showFGBar(o.fgTier.tierIndex);
            this._ui.refresh();

            const totalRounds = o.fgTier.rounds;
            const fgMult = o.fgTier.multiplier;
            let fgAccumulatedWin = 0;

            for (let i = 0; i < o.fgSpins.length; i++) {
                const fg = o.fgSpins[i];

                // 3a. 宣告本輪（含累計）
                const roundLabel = `FREE GAME ×${fgMult} — 第 ${i + 1}/${totalRounds} 轉`;
                this._ui.setStatus(roundLabel, '#00cfff');
                await this._wait(0.3);

                // 3b. 記錄本輪開始前的 roundWin，用於計算本輪小計
                const winBefore = this._session.roundWin;

                // 3c. 滾輪轉動 + cascade 表演
                this._reels.reset();
                this._session.setGrid(fg.spin.grid);
                this._session.setCurrentRows(fg.spin.finalRows);
                await this._reels.spinWithGrid(fg.spin.grid, true);
                await this._replayCascade(fg.spin, fg.multiplier, scale, balanceAfterDebit);

                // 3d. Thunder Blessing（如果有）
                if (fg.spin.tbStep) {
                    await this._replayTB(fg.spin.tbStep.gridAfter);
                }

                // 3e. 本輪小計：顯示本轉贏得 + 累計 FG 獎金
                const spinWin = this._session.roundWin - winBefore;
                fgAccumulatedWin += spinWin;

                if (spinWin > 0) {
                    this._ui.setStatus(
                        `第 ${i + 1} 轉贏得 ${spinWin.toFixed(2)} (×${fgMult})` +
                        `　累計：${fgAccumulatedWin.toFixed(2)}`,
                        '#ffd700');
                    await this._wait(0.6);
                } else {
                    this._ui.setStatus(
                        `第 ${i + 1} 轉 — 無獎　累計：${fgAccumulatedWin.toFixed(2)}`,
                        '#aaaaaa');
                    await this._wait(0.3);
                }

                this._ui.refresh();

                // 3f. Max Win cap 檢查
                if (this._session.roundWin >= o.totalBet * MAX_WIN_MULT * scale) {
                    this._ui.setStatus('★ MAX WIN ★', '#ff4444');
                    await this._wait(1.0);
                    break;
                }
            }

            // ── 4. FG 結算 ────────────────────────────────────
            this._session.exitFreeGame();
            this._session.clearMarks();
            this._ui.hideFGBar();

            // 4a. 結算摘要
            this._ui.setStatus(
                `🏆 Free Game 完成！×${fgMult} — ${totalRounds} 輪` +
                `　FG 獎金：${fgAccumulatedWin.toFixed(2)}`,
                '#ff8888');
            this._ui.refresh();
            await this._wait(1.0);

            // 4b. Total Win 面板
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
        spin: SpinResponse, fgMultiplier: number, modeScale: number,
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

            // ② 計算本步獎金
            const rawWin = step.wins.reduce(
                (s, w) => s + calcWinAmount(w as WinLine, this._baseTotalBet), 0);
            const stepWin = Math.round(rawWin * fgMultiplier * modeScale * 100 + Number.EPSILON) / 100;

            this._session.addRoundWin(stepWin);

            if (this._wallet && balanceAfterDebit !== undefined) {
                this._ui.setDisplayBalance(balanceAfterDebit + this._session.roundWin);
            }

            // ③ 組合中獎符號摘要（顯示消了什麼、得多少分）
            const winDetails = step.wins.map(w => {
                const wl = w as WinLine;
                return `${SYMBOL_LABELS[wl.symbol] ?? wl.symbol}×${wl.count}`;
            });
            const symSummary = [...new Set(winDetails)].join('+');

            this._ui.showWinPop(stepWin, this._session.roundWin);
            this._ui.setStatus(
                `${symSummary} → +${stepWin.toFixed(2)}` +
                `${inFG ? ` (×${fgMultiplier})` : ''}` +
                `　合計：${this._session.roundWin.toFixed(2)}`,
                '#ffd700');

            // ④ 停頓：讓玩家看清中獎內容再開始下移
            await this._wait(0.3);

            if (this._session.roundWin >= this._baseTotalBet * MAX_WIN_MULT * modeScale) break;

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

    // ══════════════════════════════════════════════════
    // Auto Spin
    // ══════════════════════════════════════════════════

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
