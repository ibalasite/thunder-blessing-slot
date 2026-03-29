import Decimal from 'decimal.js';
import crypto from 'crypto';
import type { IProbabilityCore } from '../domain/interfaces/IProbabilityCore';
import type { IWalletRepository } from '../domain/interfaces/IWalletRepository';
import type { ISpinLogger } from '../domain/interfaces/ISpinLogger';
import type { ICacheAdapter } from '../domain/interfaces/ICacheAdapter';
import type { Currency } from '../domain/interfaces/IWalletRepository';
import { WalletEntity } from '../domain/entities/WalletEntity';
import { SpinEntity } from '../domain/entities/SpinEntity';
import { AppError } from '../shared/errors/AppError';
import type { SpinMode, SpinOutput } from '../usecases/game/SpinUseCase';

export interface GameRunnerInput {
  userId: string;
  sessionId: string;
  mode: SpinMode;
  betLevel: number;
  currency: Currency;
  extraBetOn: boolean;
  clientSeed: string | null;
  baseUnit: string;
}

/**
 * GameRunner — game-agnostic spin orchestrator.
 *
 * Responsibilities:
 *   1. Pre-check wallet balance (fast-fail before lock)
 *   2. Acquire distributed spin lock (prevent double-submit)
 *   3. Debit bet via IWalletRepository
 *   4. Execute probability core (IProbabilityCore) — swap to change games
 *   5. Credit win via IWalletRepository
 *   6. Fire-and-forget audit log (ISpinLogger)
 *   7. Return SpinOutput
 *
 * Swap IProbabilityCore  → change game logic
 * Swap IWalletRepository → Redis-first or external wallet
 * Swap ISpinLogger       → stream-based async logging
 */
export class GameRunner {
  constructor(
    private probabilityCore: IProbabilityCore,
    private walletRepo: IWalletRepository,
    private spinLogger: ISpinLogger,
    private cache: ICacheAdapter,
  ) {}

  async run(input: GameRunnerInput): Promise<SpinOutput> {
    const { userId, sessionId, mode, betLevel, currency, extraBetOn, clientSeed, baseUnit } = input;

    const baseUnitDec = new Decimal(baseUnit);

    // Pre-check balance before acquiring lock (fast-fail)
    const walletRow = await this.walletRepo.getByUserId(userId);
    if (!walletRow) throw AppError.notFound('Wallet');
    const wallet = WalletEntity.fromRow(walletRow);
    const preSpin = SpinEntity.create(mode, betLevel, baseUnitDec, 0);
    wallet.assertCanDebit(preSpin.playerBetAmount);

    // Acquire spin lock (prevent concurrent spins for same user)
    const lockKey = `spin:lock:${userId}`;
    const acquired = await this.cache.acquireLock(lockKey, 10);
    if (!acquired) throw AppError.validation('A spin is already in progress');

    try {
      // Debit bet
      await this.walletRepo.debit(wallet.id, preSpin.playerBetAmount.toFixed(), 'bet');

      // Execute probability core
      this.probabilityCore.resetSpinBytes();
      const outcome = this.probabilityCore.computeSpin({ mode, totalBet: betLevel, extraBetOn });

      const winLevel = outcome.totalWin;
      const finalSpin = SpinEntity.create(mode, betLevel, baseUnitDec, winLevel);

      // Credit win
      if (winLevel > 0) {
        await this.walletRepo.credit(wallet.id, finalSpin.playerWinAmount.toFixed(), 'win');
      }

      // Get updated balance
      const updatedRow = await this.walletRepo.getByUserId(userId);
      const balance = updatedRow?.balance ?? '0';

      // Generate spinId and log async (fire-and-forget)
      const spinId = crypto.randomUUID();
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const spinBytes = this.probabilityCore.getSpinBytes();

      this.spinLogger.logAsync({
        id: spinId,
        userId,
        sessionId,
        mode,
        currency,
        betLevel,
        winLevel,
        baseUnit,
        playerBet: finalSpin.playerBetAmount.toFixed(),
        playerWin: finalSpin.playerWinAmount.toFixed(),
        gridSnapshot: (outcome as { baseSpins?: { grid?: unknown }[] }).baseSpins?.[0]?.grid ?? null,
        rngBytes: Buffer.concat(spinBytes),
        rngByteCount: spinBytes.reduce((a, b) => a + b.length, 0),
        serverSeed,
        clientSeed,
        createdAt: new Date(),
      });

      return {
        spinId,
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
