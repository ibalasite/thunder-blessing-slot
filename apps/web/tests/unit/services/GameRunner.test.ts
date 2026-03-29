/**
 * GameRunner unit tests (2A-17)
 *
 * Verifies the orchestration contract:
 *  - Pre-check balance, acquire lock, debit, engine, credit, log, release lock
 *  - Correct error propagation and lock release on failure
 *  - Fire-and-forget logger (logAsync called, not awaited)
 */

import { GameRunner } from '../../../src/services/GameRunner';
import {
  createMockWalletRepo,
  createMockCache,
  createMockProbabilityCore,
  createMockSpinLogger,
  TEST_WALLET,
} from '../helpers/mockContainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../../../src/domain/entities/WalletEntity', () => ({
  WalletEntity: {
    fromRow: jest.fn(() => ({
      id: 'wallet-1',
      assertCanDebit: jest.fn(),
    })),
  },
}));

const baseInput = {
  userId: 'user-1',
  sessionId: 'session-1',
  mode: 'main' as const,
  betLevel: 1,
  currency: 'USD' as const,
  extraBetOn: false,
  clientSeed: null,
  baseUnit: '0.01',
};

function makeRunner(overrides: {
  core?: ReturnType<typeof createMockProbabilityCore>;
  wallet?: ReturnType<typeof createMockWalletRepo>;
  logger?: ReturnType<typeof createMockSpinLogger>;
  cache?: ReturnType<typeof createMockCache>;
} = {}) {
  return new GameRunner(
    overrides.core ?? createMockProbabilityCore(),
    overrides.wallet ?? createMockWalletRepo(),
    overrides.logger ?? createMockSpinLogger(),
    overrides.cache ?? createMockCache(),
  );
}

describe('GameRunner', () => {
  it('returns a SpinOutput with a UUID spinId', async () => {
    const runner = makeRunner();
    const result = await runner.run(baseInput);
    expect(result.spinId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(result.playerBet).toBe('0.01');
    expect(result.playerWin).toBe('0.05');
    expect(result.currency).toBe('USD');
  });

  it('calls debit once and credit once on a winning spin', async () => {
    const wallet = createMockWalletRepo();
    const runner = makeRunner({ wallet });
    await runner.run(baseInput);
    expect(wallet.debit).toHaveBeenCalledTimes(1);
    expect(wallet.credit).toHaveBeenCalledTimes(1);
  });

  it('does not call credit when totalWin is 0', async () => {
    const core = createMockProbabilityCore({ computeSpin: jest.fn().mockReturnValue({ totalWin: 0 }) });
    const wallet = createMockWalletRepo();
    const runner = makeRunner({ core, wallet });
    await runner.run(baseInput);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it('calls spinLogger.logAsync (fire-and-forget)', async () => {
    const logger = createMockSpinLogger();
    const runner = makeRunner({ logger });
    await runner.run(baseInput);
    expect(logger.logAsync).toHaveBeenCalledTimes(1);
    const log = (logger.logAsync as jest.Mock).mock.calls[0][0];
    expect(log.userId).toBe('user-1');
    expect(log.betLevel).toBe(1);
  });

  it('throws VALIDATION_ERROR when lock not acquired', async () => {
    const cache = createMockCache({ acquireLock: jest.fn().mockResolvedValue(false) });
    const runner = makeRunner({ cache });
    await expect(runner.run(baseInput)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when wallet is null', async () => {
    const wallet = createMockWalletRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const runner = makeRunner({ wallet });
    await expect(runner.run(baseInput)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('releases lock even when debit throws', async () => {
    const releaseLock = jest.fn().mockResolvedValue(undefined);
    const wallet = createMockWalletRepo({
      debit: jest.fn().mockRejectedValue(new Error('db fail')),
    });
    const runner = makeRunner({
      wallet,
      cache: createMockCache({ acquireLock: jest.fn().mockResolvedValue(true), releaseLock }),
    });
    await expect(runner.run(baseInput)).rejects.toThrow('db fail');
    expect(releaseLock).toHaveBeenCalled();
  });
});
