/**
 * LocalAccountService unit tests
 */
import { LocalAccountService } from '../../assets/scripts/services/LocalAccountService';
import { InsufficientFundsError } from '../../assets/scripts/contracts/IAccountService';
import { DEFAULT_BALANCE } from '../../assets/scripts/GameConfig';

describe('LocalAccountService – initial state', () => {
    it('uses DEFAULT_BALANCE when no argument provided', () => {
        const a = new LocalAccountService();
        expect(a.getBalance()).toBe(DEFAULT_BALANCE);
    });

    it('accepts custom initial balance', () => {
        const a = new LocalAccountService(500);
        expect(a.getBalance()).toBe(500);
    });

    it('canAfford returns true when balance >= amount', () => {
        const a = new LocalAccountService(10);
        expect(a.canAfford(10)).toBe(true);
        expect(a.canAfford(9.99)).toBe(true);
    });

    it('canAfford returns false when balance < amount', () => {
        const a = new LocalAccountService(5);
        expect(a.canAfford(5.01)).toBe(false);
    });
});

describe('LocalAccountService – debit', () => {
    it('debit reduces balance', () => {
        const a = new LocalAccountService(100);
        a.debit(25);
        expect(a.getBalance()).toBeCloseTo(75, 4);
    });

    it('debit exact balance leaves 0', () => {
        const a = new LocalAccountService(0.25);
        a.debit(0.25);
        expect(a.getBalance()).toBe(0);
    });

    it('debit throws InsufficientFundsError when balance insufficient', () => {
        const a = new LocalAccountService(0.10);
        expect(() => a.debit(0.25)).toThrow(InsufficientFundsError);
    });

    it('InsufficientFundsError has correct name', () => {
        const a = new LocalAccountService(0);
        let caught: unknown;
        try { a.debit(1); } catch (e) { caught = e; }
        expect((caught as Error).name).toBe('InsufficientFundsError');
    });

    it('balance is unchanged after failed debit', () => {
        const a = new LocalAccountService(5);
        try { a.debit(10); } catch (_) { /* expected */ }
        expect(a.getBalance()).toBe(5);
    });

    it('debit avoids floating point drift', () => {
        const a = new LocalAccountService(1.0);
        a.debit(0.3);
        // 1.0 - 0.3 = 0.7 (stored as toFixed(4))
        expect(a.getBalance()).toBe(0.7);
    });
});

describe('LocalAccountService – credit', () => {
    it('credit increases balance', () => {
        const a = new LocalAccountService(100);
        a.credit(50);
        expect(a.getBalance()).toBeCloseTo(150, 4);
    });

    it('credit on zero balance', () => {
        const a = new LocalAccountService(0);
        a.credit(1.5);
        expect(a.getBalance()).toBe(1.5);
    });

    it('credit avoids floating point drift', () => {
        const a = new LocalAccountService(0.1);
        a.credit(0.2);
        expect(a.getBalance()).toBe(0.3);
    });
});

describe('LocalAccountService – debit then credit cycle', () => {
    it('debit then credit returns to original balance', () => {
        const a = new LocalAccountService(100);
        a.debit(25);
        a.credit(25);
        expect(a.getBalance()).toBeCloseTo(100, 4);
    });

    it('multiple debits and credits stay consistent', () => {
        const a = new LocalAccountService(100);
        a.debit(0.25);
        a.debit(0.25);
        a.debit(0.25);
        a.credit(1.50);
        // 100 - 0.75 + 1.50 = 100.75
        expect(a.getBalance()).toBeCloseTo(100.75, 4);
    });
});
