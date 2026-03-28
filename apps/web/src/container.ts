/**
 * Composition Root — single place where all adapters and services are wired together.
 * Swap implementations here (e.g. NullCacheAdapter ↔ UpstashCacheAdapter) without
 * touching any business logic.
 */

import type { IAuthProvider } from './interfaces/IAuthProvider';
import type { IWalletRepository } from './interfaces/IWalletRepository';
import type { ISpinLogRepository } from './interfaces/ISpinLogRepository';
import type { ICacheAdapter } from './interfaces/ICacheAdapter';
import type { IRNGProvider } from './interfaces/IRNGProvider';
import type { IProbabilityProvider } from './interfaces/IProbabilityProvider';

import { NullCacheAdapter } from './adapters/cache/NullCacheAdapter';
import { UpstashCacheAdapter } from './adapters/cache/UpstashCacheAdapter';
import { CryptoRNGProvider } from './rng/CryptoRNGProvider';

// Lazy imports to avoid loading Supabase SDK at test time
let _authProvider: IAuthProvider | null = null;
let _walletRepo: IWalletRepository | null = null;
let _spinLogRepo: ISpinLogRepository | null = null;
let _cache: ICacheAdapter | null = null;
let _rng: IRNGProvider | null = null;
let _probabilityProvider: IProbabilityProvider | null = null;

function buildCache(): ICacheAdapter {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashCacheAdapter(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN);
  }
  return new NullCacheAdapter();
}

/**
 * Dependency container — production implementations wired at first access.
 * Test suites can override any adapter via `container._override(...)`.
 */
export const container = {
  get authProvider(): IAuthProvider {
    /* istanbul ignore next */
    if (!_authProvider) {
      // Dynamic import avoids Supabase SDK loading in test environment
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SupabaseAuthAdapter } = require('./adapters/supabase/SupabaseAuthAdapter');
      _authProvider = new SupabaseAuthAdapter(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    }
    return _authProvider!;
  },

  get walletRepository(): IWalletRepository {
    /* istanbul ignore next */
    if (!_walletRepo) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SupabaseWalletRepository } = require('./adapters/supabase/SupabaseWalletRepository');
      _walletRepo = new SupabaseWalletRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    }
    return _walletRepo!;
  },

  get spinLogRepository(): ISpinLogRepository {
    /* istanbul ignore next */
    if (!_spinLogRepo) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SupabaseSpinLogRepository } = require('./adapters/supabase/SupabaseSpinLogRepository');
      _spinLogRepo = new SupabaseSpinLogRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    }
    return _spinLogRepo!;
  },

  get cache(): ICacheAdapter {
    if (!_cache) _cache = buildCache();
    return _cache!;
  },

  get rng(): IRNGProvider {
    if (!_rng) _rng = new CryptoRNGProvider();
    return _rng!;
  },

  get probabilityProvider(): IProbabilityProvider {
    if (!_probabilityProvider) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BetRangeService } = require('./services/BetRangeService');
      _probabilityProvider = new BetRangeService(container.cache);
    }
    return _probabilityProvider!;
  },

  /** For tests: override any adapter without restarting. */
  _override(overrides: {
    authProvider?: IAuthProvider;
    walletRepository?: IWalletRepository;
    spinLogRepository?: ISpinLogRepository;
    cache?: ICacheAdapter;
    rng?: IRNGProvider;
    probabilityProvider?: IProbabilityProvider;
  }): void {
    if (overrides.authProvider !== undefined) _authProvider = overrides.authProvider;
    if (overrides.walletRepository !== undefined) _walletRepo = overrides.walletRepository;
    if (overrides.spinLogRepository !== undefined) _spinLogRepo = overrides.spinLogRepository;
    if (overrides.cache !== undefined) _cache = overrides.cache;
    if (overrides.rng !== undefined) _rng = overrides.rng;
    if (overrides.probabilityProvider !== undefined) _probabilityProvider = overrides.probabilityProvider;
  },

  /** Reset all to null (production singletons) — call in test afterEach. */
  _reset(): void {
    _authProvider = null;
    _walletRepo = null;
    _spinLogRepo = null;
    _cache = null;
    _rng = null;
    _probabilityProvider = null;
  },
};
