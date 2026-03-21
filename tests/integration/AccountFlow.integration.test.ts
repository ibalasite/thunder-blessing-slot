/**
 * AccountFlow.integration.test.ts
 * 整合測試：LocalAccountService + GameSession — debit/credit 完整流程
 *
 * 不需要 mock — 均使用真實實作。
 * 驗證帳戶服務與遊戲狀態之間的互動是否符合設計規格：
 *
 *   1. balance debit / credit 基本運算
 *   2. InsufficientFundsError 正確拋出
 *   3. 浮點數精度（四捨五入到小數點後 4 位）
 *   4. GameSession 投注額計算 + LocalAccountService 扣款整合
 *   5. 多局連續下注 balance 追蹤
 *   6. resetRound 不影響 balance
 *   7. extraBet 開啟後 totalBet 增加，canAfford 正確回應
 */

import { GameSession }          from '../../assets/scripts/core/GameSession';
import { LocalAccountService }  from '../../assets/scripts/services/LocalAccountService';
import { InsufficientFundsError } from '../../assets/scripts/contracts/IAccountService';
import {
    DEFAULT_BET, DEFAULT_BALANCE,
} from '../../assets/scripts/GameConfig';

// ─────────────────────────────────────────────────────────────────────────────
// 1. LocalAccountService 基本 debit / credit
// ─────────────────────────────────────────────────────────────────────────────

describe('LocalAccountService — debit / credit 基本運算', () => {

    it('初始 balance 等於傳入值', () => {
        const acc = new LocalAccountService(500);
        expect(acc.getBalance()).toBe(500);
    });

    it('預設 balance 為 DEFAULT_BALANCE', () => {
        const acc = new LocalAccountService();
        expect(acc.getBalance()).toBe(DEFAULT_BALANCE);
    });

    it('debit 後 balance 減少', () => {
        const acc = new LocalAccountService(100);
        acc.debit(25);
        expect(acc.getBalance()).toBe(75);
    });

    it('credit 後 balance 增加', () => {
        const acc = new LocalAccountService(100);
        acc.credit(10.5);
        expect(acc.getBalance()).toBe(110.5);
    });

    it('連續 debit + credit balance 正確', () => {
        const acc = new LocalAccountService(100);
        acc.debit(10);   // 90
        acc.credit(5);   // 95
        acc.debit(20);   // 75
        acc.credit(30);  // 105
        expect(acc.getBalance()).toBeCloseTo(105, 4);
    });

    it('canAfford: balance 充足時返回 true', () => {
        const acc = new LocalAccountService(100);
        expect(acc.canAfford(99.99)).toBe(true);
    });

    it('canAfford: balance 不足時返回 false', () => {
        const acc = new LocalAccountService(10);
        expect(acc.canAfford(10.01)).toBe(false);
    });

    it('canAfford: balance 剛好等於金額時返回 true', () => {
        const acc = new LocalAccountService(10);
        expect(acc.canAfford(10)).toBe(true);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. InsufficientFundsError
// ─────────────────────────────────────────────────────────────────────────────

describe('InsufficientFundsError', () => {

    it('debit 超過 balance 時拋出 InsufficientFundsError', () => {
        const acc = new LocalAccountService(5);
        expect(() => acc.debit(10)).toThrow(InsufficientFundsError);
    });

    it('InsufficientFundsError 包含有意義的訊息', () => {
        const acc = new LocalAccountService(5);
        try {
            acc.debit(10);
            fail('應該拋出 InsufficientFundsError');
        } catch (e) {
            expect(e).toBeInstanceOf(InsufficientFundsError);
            expect((e as Error).message).toBeTruthy();
        }
    });

    it('debit 失敗後 balance 不變', () => {
        const acc = new LocalAccountService(5);
        try { acc.debit(10); } catch {}
        expect(acc.getBalance()).toBe(5);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 浮點數精度
// ─────────────────────────────────────────────────────────────────────────────

describe('浮點數精度', () => {

    it('debit 0.1 三次後 balance = 初始 - 0.3（精度到 4 位）', () => {
        const acc = new LocalAccountService(1);
        acc.debit(0.1);
        acc.debit(0.1);
        acc.debit(0.1);
        // 0.1 + 0.1 + 0.1 ≠ 0.3 in floating point, but LocalAccountService rounds to 4 dp
        expect(acc.getBalance()).toBeCloseTo(0.7, 4);
    });

    it('credit 微小金額後 balance 不爆炸（無窮迴圈保護）', () => {
        const acc = new LocalAccountService(0);
        for (let i = 0; i < 100; i++) {
            acc.credit(0.0001);
        }
        expect(acc.getBalance()).toBeCloseTo(0.01, 4);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GameSession 投注額 + LocalAccountService 整合
// ─────────────────────────────────────────────────────────────────────────────

describe('GameSession totalBet + LocalAccountService 整合', () => {

    it('預設 totalBet 扣款後 balance 正確', () => {
        const session = new GameSession();
        const account = new LocalAccountService(100);
        const bet     = session.totalBet;

        expect(bet).toBeGreaterThan(0);
        account.debit(bet);
        expect(account.getBalance()).toBeCloseTo(100 - bet, 4);
    });

    it('setBetPerLine 改變後 totalBet 同步更新，扣款金額正確', () => {
        const session = new GameSession();
        const account = new LocalAccountService(100);

        session.setBetPerLine(0.01);
        const newBet = session.totalBet;
        account.debit(newBet);
        expect(account.getBalance()).toBeCloseTo(100 - newBet, 4);
    });

    it('extraBet 開啟後 totalBet 增至 3×，canAfford 正確回應', () => {
        const session = new GameSession();
        const normalBet = session.totalBet;

        session.setExtraBet(true);
        const extraBet = session.totalBet;

        // With extraBet, totalBet ≈ 3× normal
        expect(extraBet).toBeCloseTo(normalBet * 3, 2);

        // If balance is just enough for normal bet, not enough for extra bet
        const account = new LocalAccountService(normalBet * 2);
        expect(account.canAfford(normalBet)).toBe(true);
        expect(account.canAfford(extraBet)).toBe(false);
    });

    it('resetRound 不影響 account balance', () => {
        const session = new GameSession();
        const account = new LocalAccountService(100);

        account.debit(session.totalBet);
        account.credit(0.5);
        const balBefore = account.getBalance();

        session.resetRound();

        expect(account.getBalance()).toBe(balBefore);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 多局模擬 — balance 追蹤
// ─────────────────────────────────────────────────────────────────────────────

describe('多局模擬 — balance 與 roundWin 追蹤', () => {

    it('20 局連續下注 + 回帳，balance 始終非負（初始足夠）', () => {
        const session = new GameSession();
        const account = new LocalAccountService(100);
        const bet     = session.totalBet;

        for (let i = 0; i < 20; i++) {
            if (!account.canAfford(bet)) break;
            account.debit(bet);

            // Simulate winning nothing (no credit)
            session.resetRound();

            expect(account.getBalance()).toBeGreaterThanOrEqual(0);
        }
    });

    it('addRoundWin 累積後 session.roundWin 正確', () => {
        const session = new GameSession();
        session.addRoundWin(1.25);
        session.addRoundWin(0.50);
        session.addRoundWin(3.00);
        expect(session.roundWin).toBeCloseTo(4.75, 4);
    });

    it('resetRound 後 session.roundWin = 0', () => {
        const session = new GameSession();
        session.addRoundWin(10);
        session.resetRound();
        expect(session.roundWin).toBe(0);
    });

    it('credit(roundWin) 後 balance 正確回帳', () => {
        const session = new GameSession();
        const account = new LocalAccountService(100);

        account.debit(session.totalBet);
        session.resetRound();
        session.addRoundWin(2.5);
        account.credit(session.roundWin);

        expect(account.getBalance()).toBeCloseTo(100 - session.totalBet + 2.5, 4);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GameSession Free Game 狀態 + account balance 互動
// ─────────────────────────────────────────────────────────────────────────────

describe('Free Game 狀態整合', () => {

    it('enterFreeGame / exitFreeGame 不影響 account balance', () => {
        const session = new GameSession();
        const account = new LocalAccountService(100);

        const before = account.getBalance();
        session.enterFreeGame(0);
        session.exitFreeGame();
        expect(account.getBalance()).toBe(before);
    });

    it('upgradeFGMultiplier 使 fgMultiplier 遞增', () => {
        const session = new GameSession();
        session.enterFreeGame(0);
        const mult0 = session.fgMultiplier;
        session.upgradeFGMultiplier();
        expect(session.fgMultiplier).toBeGreaterThan(mult0);
    });

    it('連續 upgradeFGMultiplier 不超過陣列邊界', () => {
        const session = new GameSession();
        session.enterFreeGame(0);
        // Call many more times than FG_MULTIPLIERS.length
        for (let i = 0; i < 20; i++) {
            session.upgradeFGMultiplier();
        }
        expect(session.fgMultiplier).toBeGreaterThan(0);
        expect(session.fgMultIndex).toBeLessThan(100); // no overflow
    });

});
