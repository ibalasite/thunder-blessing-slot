/**
 * RedisSpinLogger unit tests (2A-20)
 *
 * Verifies fire-and-forget XADD behavior and error swallowing.
 */

import { RedisSpinLogger } from '../../../../src/adapters/game/RedisSpinLogger';
import { createMockCache, TEST_SPIN_LOG } from '../../helpers/mockContainer';

describe('RedisSpinLogger', () => {
  it('calls xadd with spin_log_stream and expected fields', async () => {
    const cache = createMockCache({ xadd: jest.fn().mockResolvedValue('1-0') });
    const logger = new RedisSpinLogger(cache);

    logger.logAsync(TEST_SPIN_LOG);

    // Let microtask queue drain
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.xadd).toHaveBeenCalledWith(
      'spin_log_stream',
      expect.objectContaining({
        id: TEST_SPIN_LOG.id,
        userId: TEST_SPIN_LOG.userId,
        betLevel: String(TEST_SPIN_LOG.betLevel),
        winLevel: String(TEST_SPIN_LOG.winLevel),
        serverSeed: TEST_SPIN_LOG.serverSeed,
      }),
    );
  });

  it('swallows xadd errors and does not throw', async () => {
    const cache = createMockCache({ xadd: jest.fn().mockRejectedValue(new Error('redis down')) });
    const logger = new RedisSpinLogger(cache);

    // Should not throw
    expect(() => logger.logAsync(TEST_SPIN_LOG)).not.toThrow();

    // Let rejection settle
    await Promise.resolve();
    await Promise.resolve();
    // No unhandled rejection — test passes
  });
});
