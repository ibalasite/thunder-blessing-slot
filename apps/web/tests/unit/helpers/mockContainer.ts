/**
 * Test helper: creates a mock container override with jest.fn() implementations.
 * Use in beforeEach to inject mocks; call container._reset() in afterEach.
 */
import { container } from '../../../src/container';
import type { IAuthProvider, AuthUser, AuthTokens } from '../../../src/interfaces/IAuthProvider';
import type { IWalletRepository, Wallet, WalletTransaction } from '../../../src/interfaces/IWalletRepository';
import type { ISpinLogRepository, SpinLog } from '../../../src/interfaces/ISpinLogRepository';
import type { ICacheAdapter } from '../../../src/interfaces/ICacheAdapter';
import type { IProbabilityProvider, BetRange } from '../../../src/interfaces/IProbabilityProvider';

export const TEST_USER: AuthUser = {
  id: 'user-123',
  email: 'test@example.com',
  createdAt: new Date('2026-01-01'),
};

export const TEST_WALLET: Wallet = {
  id: 'wallet-456',
  userId: 'user-123',
  currency: 'USD',
  balance: '100.0000',
  updatedAt: new Date('2026-01-01'),
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
    login: jest.fn().mockResolvedValue({ user: TEST_USER, tokens: { accessToken: 'at', refreshToken: 'rt' } }),
    refreshAccessToken: jest.fn().mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' } as AuthTokens),
    logout: jest.fn().mockResolvedValue(undefined),
    verifyAccessToken: jest.fn().mockResolvedValue(TEST_USER),
    getUserById: jest.fn().mockResolvedValue(TEST_USER),
    ...overrides,
  };
}

export function createMockWalletRepo(overrides: Partial<IWalletRepository> = {}): IWalletRepository {
  return {
    getByUserId: jest.fn().mockResolvedValue(TEST_WALLET),
    createWallet: jest.fn().mockResolvedValue(TEST_WALLET),
    credit: jest.fn().mockResolvedValue({ ...TEST_WALLET, balance: '200.0000' }),
    debit: jest.fn().mockResolvedValue({ ...TEST_WALLET, balance: '99.0000' }),
    getTransactions: jest.fn().mockResolvedValue([] as WalletTransaction[]),
    ...overrides,
  };
}

export function createMockSpinLogRepo(overrides: Partial<ISpinLogRepository> = {}): ISpinLogRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'spin-789', userId: 'user-123' } as SpinLog),
    getById: jest.fn().mockResolvedValue(null),
    getByUser: jest.fn().mockResolvedValue([] as SpinLog[]),
    ...overrides,
  };
}

export function createMockCache(overrides: Partial<ICacheAdapter> = {}): ICacheAdapter {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    incr: jest.fn().mockResolvedValue(1),
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

/** Set up all mocks in container. Call in beforeEach. */
export function setupMockContainer(overrides: {
  auth?: Partial<IAuthProvider>;
  wallet?: Partial<IWalletRepository>;
  spinLog?: Partial<ISpinLogRepository>;
  cache?: Partial<ICacheAdapter>;
  probability?: Partial<IProbabilityProvider>;
} = {}) {
  container._override({
    authProvider: createMockAuthProvider(overrides.auth),
    walletRepository: createMockWalletRepo(overrides.wallet),
    spinLogRepository: createMockSpinLogRepo(overrides.spinLog),
    cache: createMockCache(overrides.cache),
    probabilityProvider: createMockProbabilityProvider(overrides.probability),
  });
}

/** Make a NextRequest-like mock. */
export function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
) {
  const { NextRequest } = require('next/server');
  const req = new NextRequest(new URL(url, 'http://localhost'), {
    method: options.method ?? 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  // Inject cookies
  if (options.cookies) {
    for (const [name, value] of Object.entries(options.cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}
