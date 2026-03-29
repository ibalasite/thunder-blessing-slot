import Decimal from 'decimal.js';
import crypto from 'crypto';
import type { IWalletRepository } from '../../domain/interfaces/IWalletRepository';
import type { ISpinLogRepository } from '../../domain/interfaces/ISpinLogRepository';
import type { IProbabilityProvider } from '../../domain/interfaces/IProbabilityProvider';
import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';
import type { IRNGProvider } from '../../domain/interfaces/IRNGProvider';
import { WalletEntity } from '../../domain/entities/WalletEntity';
import { SpinEntity } from '../../domain/entities/SpinEntity';
import { AppError } from '../../shared/errors/AppError';
import type { Currency } from '../../domain/interfaces/IWalletRepository';

export type SpinMode = 'main' | 'extraBet' | 'buyFG';

export interface SpinInput {
  userId: string;
  sessionId: string;
  mode: SpinMode;
  betLevel: number;
  currency: Currency;
  extraBetOn: boolean;
  clientSeed: string | null;
}

export interface SpinOutput {
  spinId: string;
  outcome: unknown;
  playerBet: string;
  playerWin: string;
  currency: Currency;
  balance: string;
}

export class SpinUseCase {
  constructor(
    private walletRepo: IWalletRepository,
    private spinLogRepo: ISpinLogRepository,
    private probabilityProvider: IProbabilityProvider,
    private cache: ICacheAdapter,
    private rng: IRNGProvider,
  ) {}

  async execute(input: SpinInput): Promise<SpinOutput> {
    const { userId, sessionId, mode, betLevel, currency, extraBetOn, clientSeed } = input;

    // Validate betLevel against allowed range
    const range = await this.probabilityProvider.getBetRange(currency);
    if (betLevel < range.minLevel || betLevel > range.maxLevel) {
      throw AppError.validation(`betLevel must be between ${range.minLevel} and ${range.maxLevel}`);
    }
    if (!range.levels.includes(betLevel)) {
      throw AppError.validation(`betLevel ${betLevel} is not in allowed levels`);
    }

    // Get wallet and check balance
    const row = await this.walletRepo.getByUserId(userId);
    if (!row) throw AppError.notFound('Wallet');
    const wallet = WalletEntity.fromRow(row);

    const baseUnit = new Decimal(range.baseUnit);
    const spin = SpinEntity.create(mode, betLevel, baseUnit, 0);
    wallet.assertCanDebit(spin.playerBetAmount);

    // Acquire spin lock (prevent double-submit)
    const lockKey = `spin:lock:${userId}`;
    const acquired = await this.cache.acquireLock(lockKey, 10);
    if (!acquired) throw AppError.validation('A spin is already in progress');

    try {
      // Debit bet
      await this.walletRepo.debit(wallet.id, spin.playerBetAmount.toFixed(), 'bet');

      // Run engine
      this.rng.resetSpinBytes();
      const { createSlotEngine } = await import('../../shared/engine/slotEngine');
      const engine = createSlotEngine(this.rng);
      const outcome = engine.computeFullSpin({ mode, totalBet: betLevel, extraBetOn });

      const winLevel = outcome.totalWin as number;
      const finalSpin = SpinEntity.create(mode, betLevel, baseUnit, winLevel);

      // Credit win
      if (winLevel > 0) {
        await this.walletRepo.credit(wallet.id, finalSpin.playerWinAmount.toFixed(), 'win');
      }

      // Log spin
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const spinBytes = this.rng.getSpinBytes();
      const spinLog = await this.spinLogRepo.create({
        userId,
        sessionId,
        mode,
        currency,
        betLevel,
        winLevel,
        baseUnit: range.baseUnit,
        playerBet: finalSpin.playerBetAmount.toFixed(),
        playerWin: finalSpin.playerWinAmount.toFixed(),
        gridSnapshot: (outcome as { baseSpins?: { grid?: unknown }[] }).baseSpins?.[0]?.grid ?? null,
        rngBytes: Buffer.concat(spinBytes),
        rngByteCount: spinBytes.reduce((a, b) => a + b.length, 0),
        serverSeed,
        clientSeed,
      });

      // Get updated balance
      const updatedRow = await this.walletRepo.getByUserId(userId);
      const balance = updatedRow?.balance /* istanbul ignore next */ ?? '0';

      return {
        spinId: spinLog.id,
        outcome,
        playerBet: finalSpin.playerBetAmount.toFixed(),
        playerWin: finalSpin.playerWinAmount.toFixed(),
        currency,
        balance,
      };
    } finally {
      await this.cache.releaseLock(lockKey);
    }
  }
}
