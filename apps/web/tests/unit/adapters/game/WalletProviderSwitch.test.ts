/**
 * WALLET_PROVIDER ENV switch tests (2A-22)
 *
 * Verifies that container.walletRepository returns the correct
 * implementation based on WALLET_PROVIDER environment variable.
 */

describe('WALLET_PROVIDER switch', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns SupabaseWalletRepository when WALLET_PROVIDER=supabase (default)', () => {
    process.env.WALLET_PROVIDER = 'supabase';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.JWT_SECRET = 'test-jwt-secret-min-32-chars-long!!';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SupabaseWalletRepository } = require('../../../../src/adapters/repositories/SupabaseWalletRepository');
    jest.mock('../../../../src/adapters/repositories/SupabaseWalletRepository', () => ({
      SupabaseWalletRepository: jest.fn().mockImplementation(() => ({ _type: 'supabase' })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { container } = require('../../../../src/container');
    container._reset();

    const repo = container.walletRepository;
    expect(repo._type).toBe('supabase');
  });

  it('returns RedisWalletService when WALLET_PROVIDER=redis', () => {
    process.env.WALLET_PROVIDER = 'redis';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.JWT_SECRET = 'test-jwt-secret-min-32-chars-long!!';

    jest.mock('../../../../src/adapters/repositories/SupabaseWalletRepository', () => ({
      SupabaseWalletRepository: jest.fn().mockImplementation(() => ({ _type: 'supabase' })),
    }));
    jest.mock('../../../../src/adapters/game/RedisWalletService', () => ({
      RedisWalletService: jest.fn().mockImplementation(() => ({ _type: 'redis' })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { container } = require('../../../../src/container');
    container._reset();

    const repo = container.walletRepository;
    expect(repo._type).toBe('redis');
  });
});
