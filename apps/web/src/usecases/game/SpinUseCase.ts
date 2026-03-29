import type { IWalletRepository } from '../../domain/interfaces/IWalletRepository';
import type { ISpinLogRepository } from '../../domain/interfaces/ISpinLogRepository';
import type { IProbabilityProvider } from '../../domain/interfaces/IProbabilityProvider';
import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';
import type { IRNGProvider } from '../../domain/interfaces/IRNGProvider';
import type { Currency } from '../../domain/interfaces/IWalletRepository';
import { GameRunner } from '../../services/GameRunner';
import { SlotEngineProbabilityCore } from '../../adapters/game/SlotEngineProbabilityCore';
import { SupabaseSpinLogger } from '../../adapters/game/SupabaseSpinLogger';
import { AppError } from '../../shared/errors/AppError';

export type SpinMode = 'main' | 'extraBet' | 'buyFG';

export interface SpinInput {
  userId: string;
  sessionId: string;
  mode: SpinMode;
  betLevel: number;
  currency: Currency;
  extraBetOn: boolean;
  clientSeed: string | null;
  /** Optional client-generated UUID for idempotency (2A-18). */
  txId?: string;
}

export interface SpinOutput {
  spinId: string;
  outcome: unknown;
  playerBet: string;
  playerWin: string;
  currency: Currency;
  balance: string;
}

/**
 * SpinUseCase — thin orchestration layer above GameRunner.
 *
 * Responsibilities:
 *   - txId idempotency (2A-18): return cached result on duplicate txId
 *   - Bet-level validation against IProbabilityProvider
 *   - Delegate spin execution to GameRunner
 *
 * Constructor signature is intentionally kept stable so container
 * and existing tests require no changes.
 */
export class SpinUseCase {
  constructor(
    private walletRepo: IWalletRepository,
    private spinLogRepo: ISpinLogRepository,
    private probabilityProvider: IProbabilityProvider,
    private cache: ICacheAdapter,
    private rng: IRNGProvider,
  ) {}

  async execute(input: SpinInput): Promise<SpinOutput> {
    const { userId, sessionId, mode, betLevel, currency, extraBetOn, clientSeed, txId } = input;

    // 2A-18: txId idempotency — return cached result if same txId seen before
    if (txId) {
      const cached = await this.cache.get(`spin:tx:${txId}`);
      if (cached) {
        return JSON.parse(cached) as SpinOutput;
      }
    }

    // Validate betLevel against allowed range
    const range = await this.probabilityProvider.getBetRange(currency);
    if (betLevel < range.minLevel || betLevel > range.maxLevel) {
      throw AppError.validation(`betLevel must be between ${range.minLevel} and ${range.maxLevel}`);
    }
    if (!range.levels.includes(betLevel)) {
      throw AppError.validation(`betLevel ${betLevel} is not in allowed levels`);
    }

    // Build GameRunner with pluggable adapters (2A-17)
    const probabilityCore = new SlotEngineProbabilityCore(this.rng);
    const spinLogger = new SupabaseSpinLogger(this.spinLogRepo);
    const runner = new GameRunner(probabilityCore, this.walletRepo, spinLogger, this.cache);

    const result = await runner.run({
      userId,
      sessionId,
      mode,
      betLevel,
      currency,
      extraBetOn,
      clientSeed,
      baseUnit: range.baseUnit,
    });

    // Cache result keyed by txId for idempotency (1 hour TTL)
    if (txId) {
      await this.cache.set(`spin:tx:${txId}`, JSON.stringify(result), 3600);
    }

    return result;
  }
}
