/**
 * Composition Root — single place where all adapters and services are wired together.
 * Swap implementations here (e.g. NullCacheAdapter ↔ UpstashCacheAdapter) without
 * touching any business logic.
 */

import type { IAuthProvider } from './domain/interfaces/IAuthProvider';
import type { IWalletRepository } from './domain/interfaces/IWalletRepository';
import type { ISpinLogRepository } from './domain/interfaces/ISpinLogRepository';
import type { ICacheAdapter } from './domain/interfaces/ICacheAdapter';
import type { IProbabilityProvider } from './domain/interfaces/IProbabilityProvider';
import type { IRNGProvider } from './domain/interfaces/IRNGProvider';
import { RegisterUseCase } from './usecases/auth/RegisterUseCase';
import { LoginUseCase } from './usecases/auth/LoginUseCase';
import { RefreshTokenUseCase } from './usecases/auth/RefreshTokenUseCase';
import { LogoutUseCase } from './usecases/auth/LogoutUseCase';
import { GetWalletUseCase } from './usecases/wallet/GetWalletUseCase';
import { DepositUseCase } from './usecases/wallet/DepositUseCase';
import { WithdrawUseCase } from './usecases/wallet/WithdrawUseCase';
import { GetTransactionsUseCase } from './usecases/wallet/GetTransactionsUseCase';
import { GetBetRangeUseCase } from './usecases/game/GetBetRangeUseCase';
import { SpinUseCase } from './usecases/game/SpinUseCase';
import { ReplayUseCase } from './usecases/game/ReplayUseCase';
import { NullCacheAdapter } from './adapters/cache/NullCacheAdapter';
import { CryptoRNGProvider } from './infrastructure/rng/CryptoRNGProvider';

// Lazy imports to avoid loading Supabase SDK at test time
let _authProvider: IAuthProvider | null = null;
let _walletRepo: IWalletRepository | null = null;
let _spinLogRepo: ISpinLogRepository | null = null;
let _cache: ICacheAdapter | null = null;
let _rng: IRNGProvider | null = null;
let _probabilityProvider: IProbabilityProvider | null = null;

function buildCache(): ICacheAdapter {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IoRedisAdapter } = require('./adapters/cache/IoRedisAdapter');
    return new IoRedisAdapter(redisUrl);
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UpstashCacheAdapter } = require('./adapters/cache/UpstashCacheAdapter');
    return new UpstashCacheAdapter(url, token);
  }
  return new NullCacheAdapter();
}

function buildWalletRepo(cache: ICacheAdapter): IWalletRepository {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SupabaseWalletRepository } = require('./adapters/repositories/SupabaseWalletRepository');
  const supabaseRepo = new SupabaseWalletRepository(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (process.env.WALLET_PROVIDER === 'redis') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RedisWalletService } = require('./adapters/game/RedisWalletService');
    return new RedisWalletService(cache, supabaseRepo);
  }

  return supabaseRepo;
}

/**
 * Dependency container — production implementations wired at first access.
 * Test suites can override any adapter via `container._override(...)`.
 */
export const container = {
  get authProvider(): IAuthProvider {
    /* istanbul ignore next */
    if (!_authProvider) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SupabaseAuthAdapter } = require('./adapters/repositories/SupabaseAuthAdapter');
      _authProvider = new SupabaseAuthAdapter(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
    }
    return _authProvider!;
  },

  get walletRepository(): IWalletRepository {
    /* istanbul ignore next */
    if (!_walletRepo) {
      _walletRepo = buildWalletRepo(this.cache);
    }
    return _walletRepo!;
  },

  get spinLogRepository(): ISpinLogRepository {
    /* istanbul ignore next */
    if (!_spinLogRepo) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SupabaseSpinLogRepository } = require('./adapters/repositories/SupabaseSpinLogRepository');
      _spinLogRepo = new SupabaseSpinLogRepository(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
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

  // Use Cases (stateless — new instance each call)
  get registerUseCase(): RegisterUseCase {
    return new RegisterUseCase(this.authProvider);
  },
  get loginUseCase(): LoginUseCase {
    return new LoginUseCase(this.authProvider, this.cache);
  },
  get refreshTokenUseCase(): RefreshTokenUseCase {
    return new RefreshTokenUseCase(this.authProvider);
  },
  get logoutUseCase(): LogoutUseCase {
    return new LogoutUseCase(this.authProvider);
  },
  get getWalletUseCase(): GetWalletUseCase {
    return new GetWalletUseCase(this.walletRepository);
  },
  get depositUseCase(): DepositUseCase {
    return new DepositUseCase(this.walletRepository);
  },
  get withdrawUseCase(): WithdrawUseCase {
    return new WithdrawUseCase(this.walletRepository);
  },
  get getTransactionsUseCase(): GetTransactionsUseCase {
    return new GetTransactionsUseCase(this.walletRepository);
  },
  get getBetRangeUseCase(): GetBetRangeUseCase {
    return new GetBetRangeUseCase(this.probabilityProvider);
  },
  get spinUseCase(): SpinUseCase {
    return new SpinUseCase(
      this.walletRepository,
      this.spinLogRepository,
      this.probabilityProvider,
      this.cache,
      this.rng,
    );
  },
  get replayUseCase(): ReplayUseCase {
    return new ReplayUseCase(this.spinLogRepository);
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
