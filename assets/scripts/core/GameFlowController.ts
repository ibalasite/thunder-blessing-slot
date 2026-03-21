/**
 * GameFlowController.ts
 * 純 TypeScript 遊戲流程控制器 — 無任何 Cocos Creator 依賴
 *
 * 職責：
 *   - doSpin / cascadeLoop / freeGameLoop
 *   - doCoinTossAndMaybeFG / enterFreeGame / checkThunderBlessing
 *   - generateGuaranteedWinGrid / playBuyFGIntro
 *
 * 依賴全部透過建構子注入：
 *   IGameSession   — 遊戲狀態讀寫
 *   IAccountService — 餘額扣減
 *   IEngineAdapter  — 機率引擎（非同步）
 *   IReelManager    — 滾輪動畫
 *   IUIController   — UI 顯示
 */
import { IGameSession }    from '../contracts/IGameSession';
import { IAccountService, InsufficientFundsError } from '../contracts/IAccountService';
import { IEngineAdapter }  from '../contracts/IEngineAdapter';
import { IReelManager }    from '../contracts/IReelManager';
import { IUIController }   from '../contracts/IUIController';
import { SpinRequest }     from '../contracts/types';
import { WinLine }         from '../SlotEngine';
import { calcWinAmount, findScatters } from '../SlotEngine';
import {
    BASE_ROWS, MAX_ROWS, MAX_WIN_MULT, REEL_COUNT,
    FG_MULTIPLIERS, FG_TRIGGER_PROB, COIN_TOSS_HEADS_PROB, SymType,
} from '../GameConfig';

export class GameFlowController {

    /** true while a spin animation / flow is running */
    busy = false;
    /** 0 = off, -1 = infinite, N = remaining */
    autoSpinCount = 0;

    private _buyFGMode = false;

    constructor(
        private readonly _session: IGameSession,
        private readonly _account: IAccountService,
        private readonly _engine:  IEngineAdapter,
        private readonly _reels:   IReelManager,
        private readonly _ui:      IUIController,
        /** injectable sleep for animation waiting (default: real Promise-based wait) */
        private readonly _wait: (sec: number) => Promise<void> = (s) =>
            new Promise(r => setTimeout(r, s * 1000)),
    ) {}

    // ══════════════════════════════════════════════════
    // 主遊戲流程
    // ══════════════════════════════════════════════════

    async doSpin(): Promise<void> {
        // 在非 FG 狀態下，先重置列數至基礎 3 列並重算 totalBet，
        // 確保 canAfford 與 debit 使用正確的 25 條線押注額，
        // 而非上局 cascade 展開後的殘留 57 條線値。
        if (!this._session.inFreeGame) {
            this._session.resetRows();
            this._session.computeTotalBet();
            this._ui.refresh();
        }
        if (!this._account.canAfford(this._session.totalBet)) {
            this._ui.setStatus('餘額不足！', '#ff4444');
            return;
        }
        this.busy = true;
        this._ui.enableSpin(false);
        this._ui.setStatus('旋轉中…', '#88aacc');

        this._account.debit(this._session.totalBet);
        this._session.resetRound();
        if (!this._session.inFreeGame) this._session.clearMarks();
        this._reels.reset();
        this._ui.updateFreeLetters(BASE_ROWS);
        this._ui.refresh();

        const req = this._makeSpinRequest();
        const res = await this._engine.spin(req);

        // Apply result back to session grid + rows
        this._session.setGrid(res.grid);
        this._session.setCurrentRows(res.finalRows);

        await this._reels.spinWithGrid(res.grid);
        await this._cascadeFromEngineResult(res);

        const rw = this._session.roundWin;
        this._ui.setStatus(
            rw > 0 ? `本輪獲得 ${rw.toFixed(2)}` : '沒有獎金',
            rw > 0 ? '#ffd700' : '#888888');
        if (rw >= this._session.totalBet * MAX_WIN_MULT)
            this._ui.setStatus(`★ MAX WIN ${rw.toFixed(2)} ★', '#ff4444`);

        this.busy = false;
        this._ui.enableSpin(true);
        this._ui.refresh();

        if (this.autoSpinCount !== 0 && !this._session.inFreeGame
                && this._account.canAfford(this._session.totalBet)) {
            if (this.autoSpinCount > 0) this.autoSpinCount--;
            this._ui.updateAutoSpinLabel(this.autoSpinCount);
            this._ui.updateFreeLetters(BASE_ROWS);
            this.doSpin();
        } else if (this.autoSpinCount !== 0) {
            this.autoSpinCount = 0;
            this._ui.updateAutoSpinLabel(0);
        }
    }

    /**
     * Re-play the engine response as visual cascade loop.
     * This drives the reel animation and credits; the engine already
     * computed everything deterministically via IEngineAdapter.spin().
     */
    private async _cascadeFromEngineResult(res: Awaited<ReturnType<IEngineAdapter['spin']>>): Promise<void> {
        for (const step of res.cascadeSteps) {
            await this._reels.flashWinCells(step.wins as WinLine[]);

            const newSyms = new Map<string, SymType>();
            for (const cell of step.winCells) {
                newSyms.set(`${cell.reel},${cell.row}`, res.grid[cell.reel][cell.row]);
            }

            const multiplier = this._session.inFreeGame ? this._session.fgMultiplier : 1;
            const rawWin = step.wins.reduce((s, w) => s + calcWinAmount(w as WinLine, this._session.totalBet), 0);
            const stepWin = Math.round(rawWin * multiplier * 100 + Number.EPSILON) / 100;

            this._session.addRoundWin(stepWin);
            this._account.credit(stepWin);

            this._ui.showWinPop(stepWin, this._session.roundWin);
            this._ui.setStatus(
                `中獎 +${stepWin.toFixed(2)}${this._session.inFreeGame ? ` (×${multiplier})` : ''}`,
                '#ffd700');

            if (this._session.roundWin >= this._session.totalBet * MAX_WIN_MULT) break;

            await this._reels.cascade(step.winCells, step.rowsAfter, newSyms);
            this._reels.refreshAllMarks();

            if (step.rowsAfter >= MAX_ROWS && !this._session.inFreeGame) {
                const triggerCoinToss = this._buyFGMode || Math.random() < FG_TRIGGER_PROB;
                this._ui.updateFreeLetters(step.rowsAfter, triggerCoinToss);
                if (triggerCoinToss) {
                    const wasBuyFG = this._buyFGMode;
                    this._buyFGMode = false;
                    await this.doCoinTossAndMaybeFG(wasBuyFG);
                }
                return;
            }

            if (!this._session.inFreeGame) {
                this._ui.updateFreeLetters(step.rowsAfter, false);
            }
        }

        if (res.tbStep) {
            await this._checkThunderBlessingAfterTB(res.tbStep.gridAfter, res.newMarks);
        }
    }

    private async _checkThunderBlessingAfterTB(newGrid: SymType[][], _marks: string[]): Promise<void> {
        const rows = this._session.currentRows;
        const scatters = findScatters(newGrid, rows);
        if (scatters.length === 0) return;

        void this._ui.showThunderBlessing();
        this._ui.setStatus('⚡ 雷霆祝福！標記格轉換中…', '#ff88ff');
        await this._wait(0.25);

        this._session.clearMarks();
        this._reels.updateGrid(newGrid);
        this._session.setGrid(newGrid);
        this._reels.refreshAllMarks();
        await this._wait(0.4);
    }

    // ══════════════════════════════════════════════════
    // Coin Toss / Free Game
    // ══════════════════════════════════════════════════

    async doCoinTossAndMaybeFG(guaranteed = false): Promise<void> {
        const rw = this._session.roundWin;
        if (rw > 0) {
            this._ui.setStatus(`基礎獎累計 ${rw.toFixed(2)}`, '#ffd700');
            await this._wait(0.8);
        }
        this._ui.setStatus('🪙 Coin Toss！', '#ffaa44');
        const prob  = guaranteed ? 1.0 : COIN_TOSS_HEADS_PROB[0];
        const heads = await this._ui.showCoinToss(false, prob);
        if (heads) {
            await this.enterFreeGame();
        } else {
            this._ui.setStatus('反面——未進入 Free Game', '#ff8888');
            await this._wait(0.5);
        }
    }

    async enterFreeGame(): Promise<void> {
        this._session.enterFreeGame(0);
        this._ui.showFGBar(this._session.fgMultIndex);
        this._ui.setStatus(`⊙ 進入 Free Game ×${this._session.fgMultiplier}！`, '#00ff88');
        this._ui.refresh();
        await this._wait(0.5);
        await this.freeGameLoop();
    }

    async freeGameLoop(): Promise<void> {
        this._ui.showFGBar(this._session.fgMultIndex);

        while (this._session.inFreeGame) {
            this._ui.refresh();
            this._ui.setStatus(`FREE GAME ×${this._session.fgMultiplier} — 旋轉中…`, '#00cfff');
            this._reels.reset();

            const req = this._makeSpinRequest();
            const res = await this._engine.spin(req);
            this._session.setGrid(res.grid);
            this._session.setCurrentRows(res.finalRows);

            await this._reels.spinWithGrid(res.grid, true);
            await this._cascadeFromEngineResult(res);

            if (this._session.roundWin >= this._session.totalBet * MAX_WIN_MULT) {
                this._session.exitFreeGame();
                this._session.clearMarks();
                this._ui.hideFGBar();
                this._ui.refresh();
                await this._ui.showTotalWin(this._session.roundWin);
                return;
            }

            this._ui.setStatus('🪙 Free Game Coin Toss', '#ffaa44');
            const fgProb  = COIN_TOSS_HEADS_PROB[this._session.fgMultIndex] ?? 0.40;
            const heads   = await this._ui.showCoinToss(true, fgProb);

            if (!heads) {
                this._session.exitFreeGame();
                this._session.clearMarks();
                this._ui.hideFGBar();
                this._ui.setStatus('Free Game 結束', '#ff8888');
                this._ui.refresh();
                await this._ui.showTotalWin(this._session.roundWin);
                return;
            }

            this._session.upgradeFGMultiplier();
            this._ui.showFGBar(this._session.fgMultIndex);
            this._ui.setStatus(`倍率升為 x${this._session.fgMultiplier}!`, '#ffd700');
            this._ui.refresh();
            await this._wait(0.5);
        }

        this._ui.hideFGBar();
    }

    // ══════════════════════════════════════════════════
    // Buy Free Game
    // ══════════════════════════════════════════════════

    async onBuyFreeGame(): Promise<void> {
        if (this.busy) return;
        const confirmed = await this._ui.showBuyPanel();
        if (!confirmed) return;
        const cost = this._session.totalBet * 100;
        if (!this._account.canAfford(cost)) {
            this._ui.setStatus('餘額不足！', '#ff4444');
            return;
        }
        this._account.debit(cost);
        this.busy = true;
        this._ui.enableSpin(false);
        this._session.resetRound();
        this._session.clearMarks();
        this._reels.reset();
        this._ui.refresh();
        await this._playBuyFGIntro();
        this.busy = false;
        this._ui.enableSpin(true);
        this._ui.refresh();
    }

    private async _playBuyFGIntro(): Promise<void> {
        this._buyFGMode = true;
        this._ui.updateFreeLetters(BASE_ROWS);
        this._ui.setStatus('★ Buy Free Game — 旋轉中…', '#ffdd44');
        let safety = 0;
        while (this._buyFGMode && safety < 20) {
            safety++;
            this._reels.reset();
            const req = this._makeGuaranteedWinRequest();
            const res = await this._engine.spin(req);
            this._session.setGrid(res.grid);
            this._session.setCurrentRows(res.finalRows);
            await this._reels.spinWithGrid(res.grid);
            await this._cascadeFromEngineResult(res);
        }
        if (this._buyFGMode) {
            this._buyFGMode = false;
            this._session.setCurrentRows(MAX_ROWS);
            await this.doCoinTossAndMaybeFG(true);
        }
    }

    // ══════════════════════════════════════════════════
    // Auto Spin
    // ══════════════════════════════════════════════════

    /** 使用者按 AUTO SPIN 按鈕：若正在跑則停止，否則顯示次數選單 */
    onAutoSpinClick(): void {
        if (this.autoSpinCount !== 0) {
            this.autoSpinCount = 0;
            this._ui.updateAutoSpinLabel(0);
            return;
        }
        if (!this.busy) this._ui.showAutoSpinPanel();
    }

    /** 使用者選擇次數後呼叫（n: 正整數 或 -1 無限）*/
    startAutoSpin(n: number): void {
        this.autoSpinCount = n;
        this._ui.updateAutoSpinLabel(n);
        if (!this.busy) this.doSpin();
    }

    // ══════════════════════════════════════════════════
    // Helpers
    // ══════════════════════════════════════════════════

    private _makeSpinRequest(): SpinRequest {
        return {
            totalBet:    this._session.totalBet,
            extraBet:    this._session.extraBetOn,
            inFreeGame:  this._session.inFreeGame,
            fgMultIndex: this._session.fgMultIndex,
            marks:       Array.from(this._session.lightningMarks),
        };
    }

    /** Produces a request for the Buy FG guaranteed-win spin (no marks, no FG) */
    private _makeGuaranteedWinRequest(): SpinRequest {
        return {
            totalBet:    this._session.totalBet,
            extraBet:    false,
            inFreeGame:  false,
            fgMultIndex: 0,
            marks:       [],
        };
    }
}
