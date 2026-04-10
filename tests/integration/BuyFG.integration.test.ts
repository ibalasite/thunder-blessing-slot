/**
 * BuyFG.integration.test.ts
 * 整合測試：Buy Free Game 完整流程
 *
 * 使用真實 SlotEngine + LocalEngineAdapter + GameSession + Account
 * 只 mock IReelManager 和 IUIController
 *
 * 驗證：
 *   1. Buy FG 一定進入 FG（不會停在半路）
 *   2. FREE letters 在 intro 期間漸進亮燈
 *   3. 帳務正確（扣 100× totalBet，加 FG wins）
 *   4. busy 最後回 false
 */
import { GameFlowController }   from '../../assets/scripts/core/GameFlowController';
import { GameSession }           from '../../assets/scripts/core/GameSession';
import { LocalAccountService }  from '../../assets/scripts/services/LocalAccountService';
import { LocalEngineAdapter }   from '../../assets/scripts/services/LocalEngineAdapter';
import { createEngine }         from '../../assets/scripts/SlotEngine';
import { IReelManager }         from '../../assets/scripts/contracts/IReelManager';
import { IUIController }        from '../../assets/scripts/contracts/IUIController';
import { BASE_ROWS, MAX_ROWS, BUY_COST_MULT, LINES_BASE } from '../../assets/scripts/GameConfig';

jest.setTimeout(30_000);

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeReels(): jest.Mocked<IReelManager> {
    return {
        spinWithGrid:         jest.fn().mockResolvedValue(undefined),
        cascade:              jest.fn().mockResolvedValue(undefined),
        flashWinCells:        jest.fn().mockResolvedValue(undefined),
        refreshAllMarks:      jest.fn(),
        updateGrid:           jest.fn(),
        reset:                jest.fn(),
        previewExtraBet:      jest.fn(),
        clearPreviewExtraBet: jest.fn(),
    } as jest.Mocked<IReelManager>;
}

function makeUI(): jest.Mocked<IUIController> {
    return {
        refresh:             jest.fn(),
        setDisplayBalance:   jest.fn(),
        setStatus:           jest.fn(),
        showWinPop:          jest.fn(),
        enableSpin:          jest.fn(),
        updateExtraBetUI:    jest.fn(),
        updateTurboUI:       jest.fn(),
        updateFreeLetters:   jest.fn(),
        showBuyPanel:        jest.fn().mockResolvedValue(true),
        showCoinToss:        jest.fn().mockResolvedValue(false),
        playCoinToss:        jest.fn().mockResolvedValue(undefined),
        showTotalWin:        jest.fn().mockResolvedValue(undefined),
        showThunderBlessing: jest.fn().mockResolvedValue(undefined),
        showFGBar:           jest.fn(),
        hideFGBar:           jest.fn(),
        updateMultBar:       jest.fn(),
        showAutoSpinPanel:   jest.fn(),
        updateAutoSpinLabel: jest.fn(),
        showDepositPanel:    jest.fn().mockResolvedValue(undefined),
        hideDepositPanel:    jest.fn(),
    } as jest.Mocked<IUIController>;
}

const instantWait = () => Promise.resolve();

function makeIntegration(seed: number, balance = 5000) {
    const session  = new GameSession();
    const account  = new LocalAccountService(balance);
    const engine   = createEngine(mulberry32(seed));
    const adapter  = new LocalEngineAdapter(engine);
    const reels    = makeReels();
    const ui       = makeUI();
    const ctrl     = new GameFlowController(session, account, adapter, reels, ui, instantWait);
    return { session, account, adapter, reels, ui, ctrl };
}

describe('Buy FG — 完整流程整合測試', () => {

    it('Buy FG 一定完成（不停在半路）, busy 最後回 false', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const { ctrl } = makeIntegration(seed);
            await ctrl.onBuyFreeGame();
            expect(ctrl.busy).toBe(false);
        }
    });

    it('Buy FG 一定進入 FG (showFGBar 被呼叫)', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const { ui, ctrl } = makeIntegration(seed);
            await ctrl.onBuyFreeGame();
            expect(ui.showFGBar).toHaveBeenCalled();
            expect(ui.hideFGBar).toHaveBeenCalled();
        }
    });

    it('Buy FG 呼叫 playCoinToss（結果預設為正面，動畫照常播放）', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const { ui, ctrl } = makeIntegration(seed);
            await ctrl.onBuyFreeGame();
            const calls = (ui.playCoinToss as jest.Mock).mock.calls;
            // BuyFG: entry toss + per-spin tosses all call playCoinToss(true, true)
            expect(calls.length).toBeGreaterThanOrEqual(1);
            // All calls must be heads=true (predetermined)
            for (const [, result] of calls) {
                expect(result).toBe(true);
            }
        }
    });

    it('Buy FG FREE letters 漸進亮燈（至少出現 rows > BASE_ROWS 的呼叫）', async () => {
        let foundProgressive = false;
        for (let seed = 0; seed < 30; seed++) {
            const { ui, ctrl } = makeIntegration(seed);
            await ctrl.onBuyFreeGame();
            const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
            const rows = calls.map((c: any) => c[0] as number);
            if (rows.some(r => r > BASE_ROWS && r < MAX_ROWS)) {
                foundProgressive = true;
                break;
            }
        }
        expect(foundProgressive).toBe(true);
    });

    it('Buy FG FREE letters 最終亮到 MAX_ROWS', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const { ui, ctrl } = makeIntegration(seed);
            await ctrl.onBuyFreeGame();
            const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
            const rows = calls.map((c: any) => c[0] as number);
            expect(Math.max(...rows)).toBeGreaterThanOrEqual(MAX_ROWS);
        }
    });

    it('Buy FG 帳務正確：扣款 = baseTotalBet × BUY_COST_MULT', async () => {
        const { account, session, ctrl } = makeIntegration(42);
        const before   = account.getBalance();
        const baseBet  = parseFloat((session.betPerLine * LINES_BASE).toFixed(4));
        const expected = baseBet * BUY_COST_MULT;

        await ctrl.onBuyFreeGame();

        const debited = before - account.getBalance() + session.roundWin;
        expect(debited).toBeCloseTo(expected, 2);
    });

    it('Buy FG 後 session.inFreeGame = false', async () => {
        for (let seed = 0; seed < 20; seed++) {
            const { session, ctrl } = makeIntegration(seed);
            await ctrl.onBuyFreeGame();
            expect(session.inFreeGame).toBe(false);
        }
    });
});

describe('Main spin — FREE letters 漸進更新', () => {

    it('cascade 中 updateFreeLetters 被多次呼叫（不同 rows）', async () => {
        let foundMultipleCalls = false;
        for (let seed = 0; seed < 50; seed++) {
            const { ui, ctrl } = makeIntegration(seed);
            await ctrl.doSpin();
            const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
            const uniqueRows = new Set(calls.map((c: any) => c[0]));
            if (uniqueRows.size > 2) {
                foundMultipleCalls = true;
                break;
            }
        }
        // Should find at least one spin where rows expanded progressively
        expect(foundMultipleCalls).toBe(true);
    });

    it('updateFreeLetters always starts with BASE_ROWS reset', async () => {
        for (let seed = 0; seed < 10; seed++) {
            const { ui, ctrl } = makeIntegration(seed);
            await ctrl.doSpin();
            const calls = (ui.updateFreeLetters as jest.Mock).mock.calls;
            expect(calls[0][0]).toBe(BASE_ROWS);
        }
    });
});
