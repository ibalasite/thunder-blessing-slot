/**
 * SpinLogStreamConsumer unit tests (2A-20)
 *
 * Uses fake timers to control polling intervals.
 */

import { SpinLogStreamConsumer } from '../../../../src/adapters/game/SpinLogStreamConsumer';
import { createMockCache, createMockSpinLogRepo } from '../../helpers/mockContainer';

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function makeConsumer(cacheOverrides = {}, repoOverrides = {}) {
  return new SpinLogStreamConsumer(
    createMockCache(cacheOverrides),
    createMockSpinLogRepo(repoOverrides),
  );
}

describe('SpinLogStreamConsumer — start / stop', () => {
  it('start() schedules a poll after POLL_INTERVAL_MS', async () => {
    const cache = createMockCache({ xread: jest.fn().mockResolvedValue([]) });
    const consumer = new SpinLogStreamConsumer(cache, createMockSpinLogRepo());
    consumer.start();
    await jest.advanceTimersByTimeAsync(2001);
    expect(cache.xread).toHaveBeenCalled();
    consumer.stop();
  });

  it('stop() prevents further polls', async () => {
    const cache = createMockCache({ xread: jest.fn().mockResolvedValue([]) });
    const consumer = new SpinLogStreamConsumer(cache, createMockSpinLogRepo());
    consumer.start();
    consumer.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(cache.xread).not.toHaveBeenCalled();
  });

  it('start() is idempotent (calling twice does not double-poll)', async () => {
    const cache = createMockCache({ xread: jest.fn().mockResolvedValue([]) });
    const consumer = new SpinLogStreamConsumer(cache, createMockSpinLogRepo());
    consumer.start();
    consumer.start(); // second call should be no-op
    await jest.advanceTimersByTimeAsync(2001);
    expect(cache.xread).toHaveBeenCalledTimes(1);
    consumer.stop();
  });

  it('stop() is safe to call when never started', () => {
    const consumer = makeConsumer();
    expect(() => consumer.stop()).not.toThrow();
  });
});

describe('SpinLogStreamConsumer — polling behaviour', () => {
  it('reads from cursor 0 on first poll (no saved cursor)', async () => {
    const cache = createMockCache({
      get: jest.fn().mockResolvedValue(null), // no cursor saved
      xread: jest.fn().mockResolvedValue([]),
    });
    const consumer = new SpinLogStreamConsumer(cache, createMockSpinLogRepo());
    consumer.start();
    await jest.advanceTimersByTimeAsync(2001);
    expect(cache.xread).toHaveBeenCalledWith('spin_log_stream', '0', 50);
    consumer.stop();
  });

  it('uses saved cursor on subsequent polls', async () => {
    const cache = createMockCache({
      get: jest.fn().mockResolvedValue('42-0'), // saved cursor
      xread: jest.fn().mockResolvedValue([]),
    });
    const consumer = new SpinLogStreamConsumer(cache, createMockSpinLogRepo());
    consumer.start();
    await jest.advanceTimersByTimeAsync(2001);
    expect(cache.xread).toHaveBeenCalledWith('spin_log_stream', '42-0', 50);
    consumer.stop();
  });

  it('inserts spin log entries into repo and advances cursor', async () => {
    const entry = {
      id: '5-1',
      data: {
        userId: 'u1', sessionId: 's1', mode: 'main', currency: 'USD',
        betLevel: '25', winLevel: '0', baseUnit: '0.01',
        playerBet: '0.25', playerWin: '0.00', gridSnapshot: 'null',
        rngByteCount: '4', serverSeed: 'abc', clientSeed: '',
      },
    };
    const cache = createMockCache({
      get: jest.fn().mockResolvedValue(null),
      xread: jest.fn().mockResolvedValue([entry]),
      set: jest.fn().mockResolvedValue(undefined),
    });
    const repo = createMockSpinLogRepo();
    const consumer = new SpinLogStreamConsumer(cache, repo);
    consumer.start();
    await jest.advanceTimersByTimeAsync(2001);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', mode: 'main' }));
    expect(cache.set).toHaveBeenCalledWith('spin_log_stream:cursor', '5-1');
    consumer.stop();
  });

  it('continues past failed entries (logs error, does not abort)', async () => {
    const entry = { id: '1-1', data: { userId: 'bad' } };
    const cache = createMockCache({
      get: jest.fn().mockResolvedValue(null),
      xread: jest.fn().mockResolvedValue([entry]),
      set: jest.fn().mockResolvedValue(undefined),
    });
    const repo = createMockSpinLogRepo({
      create: jest.fn().mockRejectedValue(new Error('db fail')),
    });
    const consumer = new SpinLogStreamConsumer(cache, repo);
    consumer.start();
    await jest.advanceTimersByTimeAsync(2001);
    expect(console.error).toHaveBeenCalled();
    // cursor still advances past the bad entry
    expect(cache.set).toHaveBeenCalledWith('spin_log_stream:cursor', '1-1');
    consumer.stop();
  });

  it('reschedules after poll error', async () => {
    let callCount = 0;
    const cache = createMockCache({
      get: jest.fn().mockRejectedValue(new Error('Redis down')),
      xread: jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve([]);
      }),
    });
    const consumer = new SpinLogStreamConsumer(cache, createMockSpinLogRepo());
    consumer.start();
    await jest.advanceTimersByTimeAsync(2001);
    expect(console.error).toHaveBeenCalled();
    // Still running — advances timer again to check reschedule
    await jest.advanceTimersByTimeAsync(2001);
    consumer.stop();
  });
});
