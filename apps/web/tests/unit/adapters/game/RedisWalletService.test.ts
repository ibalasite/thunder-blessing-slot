/**
 * RedisWalletService unit tests (2A-19, 2A-22)
 *
 * Verifies:
 *  - Debit / credit use incrby / decrby on the balance key
 *  - Debit throws INSUFFICIENT_FUNDS and rolls back when balance goes negative
 *  - write-behind: xadd called on every mutation
 *  - Cold read falls through to fallback DB repo
 */

import { RedisWalletService } from '../../../../src/adapters/game/RedisWalletService';
import { createMockCache, createMockWalletRepo, TEST_WALLET } from '../../helpers/mockContainer';
import { AppError } from '../../../../src/shared/errors/AppError';

function makeService(cacheOverrides = {}, fallbackOverrides = {}) {
  return new RedisWalletService(
    createMockCache(cacheOverrides),
    createMockWalletRepo(fallbackOverrides),
  );
}

describe('RedisWalletService', () => {
  describe('debit', () => {
    it('calls decrby and xadd on a successful debit', async () => {
      const cache = createMockCache({
        get: jest.fn()
          .mockResolvedValueOnce(JSON.stringify({ id: 'wallet-1', currency: 'USD', updatedAt: new Date().toISOString() }))
          .mockResolvedValueOnce('1000000'), // balance = 100.00 (×10000)
        decrby: jest.fn().mockResolvedValue(900000), // 90.00 after 10.00 debit
        xadd: jest.fn().mockResolvedValue('1-0'),
      });
      const svc = new RedisWalletService(cache, createMockWalletRepo());
      const result = await svc.debit('wallet-1', '10.00', 'bet');
      expect(cache.decrby).toHaveBeenCalledWith('wallet:balance:wallet-1', 100000);
      expect(cache.xadd).toHaveBeenCalledWith('wallet_tx_stream', expect.objectContaining({
        walletId: 'wallet-1',
        type: 'bet',
        direction: 'debit',
      }));
      expect(result.balance).toBe('90');
    });

    it('throws INSUFFICIENT_FUNDS and rolls back when balance goes negative', async () => {
      const incrby = jest.fn().mockResolvedValue(0);
      const cache = createMockCache({
        get: jest.fn()
          .mockResolvedValueOnce(JSON.stringify({ id: 'wallet-1', currency: 'USD', updatedAt: new Date().toISOString() }))
          .mockResolvedValueOnce('100'), // 0.01 balance
        decrby: jest.fn().mockResolvedValue(-900000), // negative → insufficient
        incrby,
      });
      const svc = new RedisWalletService(cache, createMockWalletRepo());
      await expect(svc.debit('wallet-1', '10.00', 'bet')).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
      // Rollback: incrby should restore
      expect(incrby).toHaveBeenCalled();
    });
  });

  describe('credit', () => {
    it('calls incrby and xadd on credit', async () => {
      const cache = createMockCache({
        get: jest.fn()
          .mockResolvedValueOnce(JSON.stringify({ id: 'wallet-1', currency: 'USD', updatedAt: new Date().toISOString() }))
          .mockResolvedValueOnce('1000000'),
        incrby: jest.fn().mockResolvedValue(1050000),
        xadd: jest.fn().mockResolvedValue('2-0'),
      });
      const svc = new RedisWalletService(cache, createMockWalletRepo());
      const result = await svc.credit('wallet-1', '5.00', 'win');
      expect(cache.incrby).toHaveBeenCalledWith('wallet:balance:wallet-1', 50000);
      expect(cache.xadd).toHaveBeenCalledWith('wallet_tx_stream', expect.objectContaining({
        type: 'win',
        direction: 'credit',
      }));
      expect(result.balance).toBe('105');
    });
  });

  describe('getByUserId', () => {
    it('returns wallet from cache when warm', async () => {
      const cache = createMockCache({
        get: jest.fn()
          .mockResolvedValueOnce(JSON.stringify({ id: 'wallet-1', currency: 'USD', updatedAt: new Date().toISOString() }))
          .mockResolvedValueOnce('1000000'),
      });
      const fallback = createMockWalletRepo();
      const svc = new RedisWalletService(cache, fallback);
      const result = await svc.getByUserId('user-1');
      expect(result?.balance).toBe('100');
      expect(fallback.getByUserId).not.toHaveBeenCalled();
    });

    it('falls back to DB on cache miss and warms cache', async () => {
      const cache = createMockCache({
        get: jest.fn().mockResolvedValue(null), // cold cache
        set: jest.fn().mockResolvedValue(undefined),
      });
      const fallback = createMockWalletRepo();
      const svc = new RedisWalletService(cache, fallback);
      const result = await svc.getByUserId('user-1');
      expect(result?.id).toBe(TEST_WALLET.id);
      expect(fallback.getByUserId).toHaveBeenCalledWith('user-1');
      // Cache should be warmed
      expect(cache.set).toHaveBeenCalled();
    });
  });

  describe('getTransactions', () => {
    it('delegates to fallback repo', async () => {
      const fallback = createMockWalletRepo();
      const svc = new RedisWalletService(createMockCache(), fallback);
      await svc.getTransactions('wallet-1', 10, 0);
      expect(fallback.getTransactions).toHaveBeenCalledWith('wallet-1', 10, 0);
    });
  });

  describe('createWallet', () => {
    it('delegates to fallback and warms cache', async () => {
      const set = jest.fn().mockResolvedValue(undefined);
      const cache = createMockCache({ set });
      const fallback = createMockWalletRepo();
      const svc = new RedisWalletService(cache, fallback);
      const result = await svc.createWallet('user-1', 'USD');
      expect(fallback.createWallet).toHaveBeenCalledWith('user-1', 'USD');
      expect(result.id).toBe(TEST_WALLET.id);
      // Cache should be warmed with balance and meta keys
      expect(set).toHaveBeenCalledTimes(2);
    });
  });
});
