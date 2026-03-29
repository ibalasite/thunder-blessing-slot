/**
 * Test helper: creates a mock container override with jest.fn() implementations.
 * Use in beforeEach to inject mocks; call container._reset() in afterEach.
 */
import { container } from '../../../src/container';
import type { IAuthProvider } from '../../../src/domain/interfaces/IAuthProvider';
import type { IWalletRepository, Wallet } from '../../../src/domain/interfaces/IWalletRepository';
import type { ISpinLogRepository, SpinLog } from '../../../src/domain/interfaces/ISpinLogRepository';
import type { ICacheAdapter } from '../../../src/domain/interfaces/ICacheAdapter';
import type { IProbabilityProvider, BetRange } from '../../../src/domain/interfaces/IProbabilityProvider';
import type { IRNGProvider } from '../../../src/domain/interfaces/IRNGProvider';
import type { IProbabilityCore } from '../../../src/domain/interfaces/IProbabilityCore';
import type { ISpinLogger } from '../../../src/domain/interfaces/ISpinLogger';

export const TEST_USER = { id: 'user-1', email: 'test@example.com', createdAt: new Date('2026-01-01') };
export const TEST_WALLET: Wallet = {
  id: 'wallet-1',
  userId: 'user-1',
  currency: 'USD',
  balance: '100.00',
  updatedAt: new Date('2026-01-01'),
};
export const TEST_TOKENS = { accessToken: 'access-tok', refreshToken: 'refresh-tok' };
export const TEST_SPIN_LOG: SpinLog = {
  id: 'spin-1',
  userId: 'user-1',
  sessionId: 'session-1',
  mode: 'main',
  currency: 'USD',
  betLevel: 1,
  winLevel: 5,
  baseUnit: '0.01',
  playerBet: '0.01',
  playerWin: '0.05',
  gridSnapshot: [],
  rngBytes: Buffer.alloc(4),
  rngByteCount: 4,
  serverSeed: 'abc',
  clientSeed: null,
  createdAt: new Date('2026-01-01'),
};

export const TEST_BET_RANGE: BetRange = {
  currency: 'USD',
  baseUnit: '0.01',
  levels: [1, 5, 10, 25, 50, 100],
  minLevel: 1,
  maxLevel: 100,
};

export function createMockAuthProvider(overrides: Partial<IAuthProvider> = {}): IAuthProvider {
  return {
    register: jest.fn().mockResolvedValue(TEST_USER),
    login: jest.fn().mockResolvedValue({ user: TEST_USER, tokens: TEST_TOKENS }),
    refreshAccessToken: jest.fn().mockResolvedValue(TEST_TOKENS),
    logout: jest.fn().mockResolvedValue(undefined),
    verifyAccessToken: jest.fn().mockResolvedValue(TEST_USER),
    getUserById: jest.fn().mockResolvedValue(TEST_USER),
    ...overrides,
  };
}

export function createMockWalletRepo(overrides: Partial<IWalletRepository> = {}): IWalletRepository {
  return {
    getByUserId: jest.fn().mockResolvedValue(TEST_WALLET),
    credit: jest.fn().mockResolvedValue({ ...TEST_WALLET, balance: '105.00' }),
    debit: jest.fn().mockResolvedValue({ ...TEST_WALLET, balance: '99.00' }),
    getTransactions: jest.fn().mockResolvedValue([]),
    createWallet: jest.fn().mockResolvedValue(TEST_WALLET),
    ...overrides,
  };
}

export function createMockSpinLogRepo(overrides: Partial<ISpinLogRepository> = {}): ISpinLogRepository {
  return {
    create: jest.fn().mockResolvedValue(TEST_SPIN_LOG),
    getById: jest.fn().mockResolvedValue(TEST_SPIN_LOG),
    getByUser: jest.fn().mockResolvedValue([TEST_SPIN_LOG]),
    ...overrides,
  };
}

export function createMockCache(overrides: Partial<ICacheAdapter> = {}): ICacheAdapter {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    incr: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(1),
    decrby: jest.fn().mockResolvedValue(0),
    xadd: jest.fn().mockResolvedValue('1-0'),
    xread: jest.fn().mockResolvedValue([]),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockProbabilityProvider(overrides: Partial<IProbabilityProvider> = {}): IProbabilityProvider {
  return {
    getBetRange: jest.fn().mockResolvedValue(TEST_BET_RANGE),
    ...overrides,
  };
}

export const MOCK_BYTES = [Buffer.from([0x01, 0x02, 0x03, 0x04])];

export function createMockRng(overrides: Partial<IRNGProvider> = {}): IRNGProvider {
  return {
    random: jest.fn().mockReturnValue(0.5),
    randomInt: jest.fn().mockReturnValue(3),
    getSpinBytes: jest.fn().mockReturnValue(MOCK_BYTES),
    resetSpinBytes: jest.fn(),
    ...overrides,
  };
}

export function createMockProbabilityCore(overrides: Partial<IProbabilityCore> = {}): IProbabilityCore {
  return {
    computeSpin: jest.fn().mockReturnValue({ totalWin: 5 }),
    getSpinBytes: jest.fn().mockReturnValue(MOCK_BYTES),
    resetSpinBytes: jest.fn(),
    ...overrides,
  };
}

export function createMockSpinLogger(overrides: Partial<ISpinLogger> = {}): ISpinLogger {
  return {
    logAsync: jest.fn(),
    ...overrides,
  };
}

/** Set up all mocks in container. Call in beforeEach. */
export function setupMockContainer(overrides: {
  auth?: Partial<IAuthProvider>;
  wallet?: Partial<IWalletRepository>;
  spinLog?: Partial<ISpinLogRepository>;
  cache?: Partial<ICacheAdapter>;
  probability?: Partial<IProbabilityProvider>;
  rng?: Partial<IRNGProvider>;
} = {}): void {
  container._override({
    authProvider: createMockAuthProvider(overrides.auth ?? {}),
    walletRepository: createMockWalletRepo(overrides.wallet ?? {}),
    spinLogRepository: createMockSpinLogRepo(overrides.spinLog ?? {}),
    cache: createMockCache(overrides.cache ?? {}),
    probabilityProvider: createMockProbabilityProvider(overrides.probability ?? {}),
    rng: createMockRng(overrides.rng ?? {}),
  });
}
