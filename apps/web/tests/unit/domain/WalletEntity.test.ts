import Decimal from 'decimal.js';
import { WalletEntity } from '../../../src/domain/entities/WalletEntity';
import { AppError } from '../../../src/shared/errors/AppError';
import type { Wallet } from '../../../src/domain/interfaces/IWalletRepository';

const makeWallet = (balance: string, currency: 'USD' | 'TWD' = 'USD'): WalletEntity =>
  new WalletEntity('w-1', 'u-1', currency, new Decimal(balance), new Date());

const makeRow = (balance: string, currency: 'USD' | 'TWD' = 'USD'): Wallet => ({
  id: 'w-1', userId: 'u-1', currency, balance, updatedAt: new Date(),
});

describe('WalletEntity', () => {
  describe('balance getter', () => {
    it('returns fixed decimal string', () => {
      expect(makeWallet('100.50').balance).toBe('100.5');
    });
  });

  describe('canDebit()', () => {
    it('returns true when balance >= amount', () => {
      expect(makeWallet('100').canDebit(new Decimal('100'))).toBe(true);
    });

    it('returns false when balance < amount', () => {
      expect(makeWallet('50').canDebit(new Decimal('100'))).toBe(false);
    });
  });

  describe('assertCanDebit()', () => {
    it('does not throw when sufficient balance', () => {
      expect(() => makeWallet('100').assertCanDebit(new Decimal('50'))).not.toThrow();
    });

    it('throws INSUFFICIENT_FUNDS when balance too low', () => {
      expect(() => makeWallet('10').assertCanDebit(new Decimal('100'))).toThrow(AppError);
      try {
        makeWallet('10').assertCanDebit(new Decimal('100'));
      } catch (e) {
        expect((e as AppError).code).toBe('INSUFFICIENT_FUNDS');
      }
    });
  });

  describe('assertDepositLimit()', () => {
    it('does not throw for amount within USD limit', () => {
      expect(() => makeWallet('0').assertDepositLimit(new Decimal('99999'))).not.toThrow();
    });

    it('throws when exceeding USD limit of 100,000', () => {
      expect(() => makeWallet('0').assertDepositLimit(new Decimal('100001'))).toThrow(AppError);
      try {
        makeWallet('0').assertDepositLimit(new Decimal('100001'));
      } catch (e) {
        expect((e as AppError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('does not throw for amount within TWD limit', () => {
      expect(() => makeWallet('0', 'TWD').assertDepositLimit(new Decimal('2999999'))).not.toThrow();
    });

    it('throws when exceeding TWD limit of 3,000,000', () => {
      expect(() => makeWallet('0', 'TWD').assertDepositLimit(new Decimal('3000001'))).toThrow(AppError);
    });
  });

  describe('assertWithdrawMin()', () => {
    it('does not throw for amount >= USD min (1)', () => {
      expect(() => makeWallet('100').assertWithdrawMin(new Decimal('1'))).not.toThrow();
    });

    it('throws for amount < USD min', () => {
      expect(() => makeWallet('100').assertWithdrawMin(new Decimal('0.5'))).toThrow(AppError);
      try {
        makeWallet('100').assertWithdrawMin(new Decimal('0.5'));
      } catch (e) {
        expect((e as AppError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('does not throw for amount >= TWD min (30)', () => {
      expect(() => makeWallet('100', 'TWD').assertWithdrawMin(new Decimal('30'))).not.toThrow();
    });

    it('throws for amount < TWD min', () => {
      expect(() => makeWallet('100', 'TWD').assertWithdrawMin(new Decimal('29'))).toThrow(AppError);
    });
  });

  describe('fromRow()', () => {
    it('creates WalletEntity from Wallet row', () => {
      const entity = WalletEntity.fromRow(makeRow('250.00'));
      expect(entity.id).toBe('w-1');
      expect(entity.userId).toBe('u-1');
      expect(entity.currency).toBe('USD');
      expect(entity.balance).toBe('250');
    });
  });
});
