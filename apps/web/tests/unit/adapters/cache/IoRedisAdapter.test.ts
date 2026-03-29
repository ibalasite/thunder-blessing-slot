/**
 * IoRedisAdapter unit tests — mocks the ioredis constructor.
 *
 * jest.mock() is hoisted to the top of the file at compile time,
 * so the factory must be self-contained (no references to outer variables).
 */

jest.mock('ioredis');

// Helpers to access the mock after setup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const getIoRedisMock = () => require('ioredis') as jest.Mock;

import { IoRedisAdapter } from '../../../../src/adapters/cache/IoRedisAdapter';

// ─── Mock client factory ──────────────────────────────────────────────────────

let mockClient: {
  on: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  incrby: jest.Mock;
  decrby: jest.Mock;
  xadd: jest.Mock;
  xread: jest.Mock;
  quit: jest.Mock;
};

beforeEach(() => {
  mockClient = {
    on: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(10),
    decrby: jest.fn().mockResolvedValue(5),
    xadd: jest.fn().mockResolvedValue('1-1'),
    xread: jest.fn().mockResolvedValue(null),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  getIoRedisMock().mockImplementation(() => mockClient);
});

afterEach(() => {
  jest.clearAllMocks();
});

function makeAdapter() {
  return new IoRedisAdapter('redis://localhost:6379');
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('IoRedisAdapter — constructor', () => {
  it('creates Redis client with the URL and registers error handler', () => {
    makeAdapter();
    expect(getIoRedisMock()).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
    expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('error handler logs to console.error without throwing', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    makeAdapter();
    const [, handler] = mockClient.on.mock.calls.find(([evt]) => evt === 'error') ?? [];
    expect(() => handler?.(new Error('connection refused'))).not.toThrow();
    expect(console.error).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

// ─── get / set / del ─────────────────────────────────────────────────────────

describe('IoRedisAdapter — get / set / del', () => {
  it('get delegates to Redis GET', async () => {
    mockClient.get.mockResolvedValue('hello');
    expect(await makeAdapter().get('k')).toBe('hello');
    expect(mockClient.get).toHaveBeenCalledWith('k');
  });

  it('get returns null for missing key', async () => {
    mockClient.get.mockResolvedValue(null);
    expect(await makeAdapter().get('k')).toBeNull();
  });

  it('set without TTL calls SET key value', async () => {
    await makeAdapter().set('k', 'v');
    expect(mockClient.set).toHaveBeenCalledWith('k', 'v');
  });

  it('set with TTL calls SET key value EX n', async () => {
    await makeAdapter().set('k', 'v', 60);
    expect(mockClient.set).toHaveBeenCalledWith('k', 'v', 'EX', 60);
  });

  it('del delegates to Redis DEL', async () => {
    await makeAdapter().del('k');
    expect(mockClient.del).toHaveBeenCalledWith('k');
  });
});

// ─── incr ─────────────────────────────────────────────────────────────────────

describe('IoRedisAdapter — incr', () => {
  it('returns incremented count', async () => {
    mockClient.incr.mockResolvedValue(3);
    expect(await makeAdapter().incr('c')).toBe(3);
  });

  it('sets TTL on first increment (count === 1) when ttlSeconds provided', async () => {
    mockClient.incr.mockResolvedValue(1);
    await makeAdapter().incr('c', 30);
    expect(mockClient.expire).toHaveBeenCalledWith('c', 30);
  });

  it('skips EXPIRE when count > 1 (window already started)', async () => {
    mockClient.incr.mockResolvedValue(2);
    await makeAdapter().incr('c', 30);
    expect(mockClient.expire).not.toHaveBeenCalled();
  });

  it('skips EXPIRE when no ttlSeconds provided', async () => {
    mockClient.incr.mockResolvedValue(1);
    await makeAdapter().incr('c');
    expect(mockClient.expire).not.toHaveBeenCalled();
  });
});

// ─── incrby / decrby ─────────────────────────────────────────────────────────

describe('IoRedisAdapter — incrby / decrby', () => {
  it('incrby delegates to INCRBY', async () => {
    mockClient.incrby.mockResolvedValue(15);
    expect(await makeAdapter().incrby('k', 5)).toBe(15);
    expect(mockClient.incrby).toHaveBeenCalledWith('k', 5);
  });

  it('decrby delegates to DECRBY', async () => {
    mockClient.decrby.mockResolvedValue(-3);
    expect(await makeAdapter().decrby('k', 3)).toBe(-3);
    expect(mockClient.decrby).toHaveBeenCalledWith('k', 3);
  });
});

// ─── xadd / xread ────────────────────────────────────────────────────────────

describe('IoRedisAdapter — xadd / xread', () => {
  it('xadd calls XADD with * and flattened field pairs', async () => {
    await makeAdapter().xadd('stream', { userId: 'u1', amount: '5' });
    expect(mockClient.xadd).toHaveBeenCalledWith('stream', '*', 'userId', 'u1', 'amount', '5');
  });

  it('xread returns [] when Redis returns null', async () => {
    mockClient.xread.mockResolvedValue(null);
    expect(await makeAdapter().xread('s', '0')).toEqual([]);
  });

  it('xread parses stream entries into {id, data} shape', async () => {
    const raw = [['stream', [['1-1', ['k1', 'v1', 'k2', 'v2']]]]];
    mockClient.xread.mockResolvedValue(raw);
    const entries = await makeAdapter().xread('stream', '0', 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('1-1');
    expect(entries[0]!.data).toEqual({ k1: 'v1', k2: 'v2' });
    expect(mockClient.xread).toHaveBeenCalledWith('COUNT', 10, 'STREAMS', 'stream', '0');
  });

  it('xread uses default count 100', async () => {
    await makeAdapter().xread('s', '0');
    expect(mockClient.xread).toHaveBeenCalledWith('COUNT', 100, 'STREAMS', 's', '0');
  });

  it('xread returns [] when Redis returns non-null but stream key is absent', async () => {
    mockClient.xread.mockResolvedValue([]);
    expect(await makeAdapter().xread('s', '0')).toEqual([]);
  });
});

// ─── acquireLock / releaseLock / disconnect ───────────────────────────────────

describe('IoRedisAdapter — acquireLock / releaseLock / disconnect', () => {
  it('acquireLock returns true when Redis SET NX returns OK', async () => {
    mockClient.set.mockResolvedValue('OK');
    expect(await makeAdapter().acquireLock('lock', 5)).toBe(true);
    expect(mockClient.set).toHaveBeenCalledWith('lock', '1', 'NX', 'EX', 5);
  });

  it('acquireLock returns false when Redis SET NX returns null (lock held)', async () => {
    mockClient.set.mockResolvedValue(null);
    expect(await makeAdapter().acquireLock('lock', 5)).toBe(false);
  });

  it('releaseLock deletes the lock key', async () => {
    await makeAdapter().releaseLock('lock');
    expect(mockClient.del).toHaveBeenCalledWith('lock');
  });

  it('disconnect calls QUIT', async () => {
    await makeAdapter().disconnect();
    expect(mockClient.quit).toHaveBeenCalled();
  });
});
