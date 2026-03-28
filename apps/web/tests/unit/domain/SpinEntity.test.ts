import Decimal from 'decimal.js';
import { SpinEntity } from '../../../src/domain/entities/SpinEntity';

describe('SpinEntity', () => {
  describe('betMultiplier', () => {
    it('is 1 for main mode', () => {
      const spin = SpinEntity.create('main', 10, new Decimal('0.01'), 0);
      expect(spin.betMultiplier).toBe(1);
    });

    it('is 2 for extraBet mode', () => {
      const spin = SpinEntity.create('extraBet', 10, new Decimal('0.01'), 0);
      expect(spin.betMultiplier).toBe(2);
    });

    it('is 100 for buyFG mode', () => {
      const spin = SpinEntity.create('buyFG', 10, new Decimal('0.01'), 0);
      expect(spin.betMultiplier).toBe(100);
    });
  });

  describe('totalBetLevel', () => {
    it('equals betLevel for main mode', () => {
      const spin = SpinEntity.create('main', 5, new Decimal('0.01'), 0);
      expect(spin.totalBetLevel).toBe(5);
    });

    it('equals betLevel * 2 for extraBet', () => {
      const spin = SpinEntity.create('extraBet', 5, new Decimal('0.01'), 0);
      expect(spin.totalBetLevel).toBe(10);
    });

    it('equals betLevel * 100 for buyFG', () => {
      const spin = SpinEntity.create('buyFG', 5, new Decimal('0.01'), 0);
      expect(spin.totalBetLevel).toBe(500);
    });
  });

  describe('playerBetAmount', () => {
    it('calculates correct bet for main mode', () => {
      const spin = SpinEntity.create('main', 10, new Decimal('0.01'), 0);
      expect(spin.playerBetAmount.toFixed()).toBe('0.1');
    });

    it('calculates correct bet for extraBet mode', () => {
      const spin = SpinEntity.create('extraBet', 10, new Decimal('0.01'), 0);
      expect(spin.playerBetAmount.toFixed()).toBe('0.2');
    });

    it('calculates correct bet for buyFG mode', () => {
      const spin = SpinEntity.create('buyFG', 10, new Decimal('0.01'), 0);
      expect(spin.playerBetAmount.toFixed()).toBe('10');
    });
  });

  describe('playerWinAmount', () => {
    it('returns 0 when winLevel is 0', () => {
      const spin = SpinEntity.create('main', 10, new Decimal('0.01'), 0);
      expect(spin.playerWinAmount.toFixed()).toBe('0');
    });

    it('calculates win correctly', () => {
      const spin = SpinEntity.create('main', 10, new Decimal('0.01'), 50);
      expect(spin.playerWinAmount.toFixed()).toBe('0.5');
    });
  });

  describe('create()', () => {
    it('creates SpinEntity with all properties', () => {
      const spin = SpinEntity.create('main', 5, new Decimal('1'), 10);
      expect(spin.mode).toBe('main');
      expect(spin.betLevel).toBe(5);
      expect(spin.winLevel).toBe(10);
    });
  });
});
