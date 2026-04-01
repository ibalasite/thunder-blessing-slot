/**
 * SupabaseSpinLogger unit tests
 *
 * Verifies fire-and-forget semantics and error swallowing.
 */

import { SupabaseSpinLogger } from '../../../../src/adapters/game/SupabaseSpinLogger';
import { createMockSpinLogRepo, TEST_SPIN_LOG } from '../../helpers/mockContainer';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('SupabaseSpinLogger', () => {
  it('calls repo.create with spin data (including id, excluding createdAt)', async () => {
    const repo = createMockSpinLogRepo();
    const logger = new SupabaseSpinLogger(repo);
    logger.logAsync(TEST_SPIN_LOG);
    await Promise.resolve();
    await Promise.resolve();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: TEST_SPIN_LOG.id }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_SPIN_LOG.userId }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ createdAt: expect.anything() }),
    );
  });

  it('does not throw when repo.create rejects (swallows error)', async () => {
    const repo = createMockSpinLogRepo({
      create: jest.fn().mockRejectedValue(new Error('DB unreachable')),
    });
    const logger = new SupabaseSpinLogger(repo);
    expect(() => logger.logAsync(TEST_SPIN_LOG)).not.toThrow();
    // Drain microtask queue
    await Promise.resolve();
    await Promise.resolve();
    expect(console.error).toHaveBeenCalledWith(
      '[SupabaseSpinLogger] Failed to persist spin log',
      TEST_SPIN_LOG.id,
      expect.any(Error),
    );
  });
});
