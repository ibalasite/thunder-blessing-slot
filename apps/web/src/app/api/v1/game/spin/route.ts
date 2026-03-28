import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '../../../../../shared/middleware/withAuth';
import { container } from '../../../../../container';
import { AppError } from '../../../../../shared/errors/AppError';
import { handleError } from '../../../../../shared/errors/errorHandler';
import Decimal from 'decimal.js';

const schema = z.object({
  mode: z.enum(['main', 'extraBet', 'buyFG']),
  betLevel: z.number().int().positive(),
  currency: z.enum(['USD', 'TWD']),
  extraBetOn: z.boolean().optional().default(false),
  clientSeed: z.string().max(64).optional(),
});

export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation(parsed.error.errors[0]?.message /* istanbul ignore next */ ?? 'Invalid input');
    }

    const { mode, betLevel, currency, extraBetOn, clientSeed } = parsed.data;

    // Validate betLevel against allowed range
    const range = await container.probabilityProvider.getBetRange(currency);
    if (betLevel < range.minLevel || betLevel > range.maxLevel) {
      throw AppError.validation(`betLevel must be between ${range.minLevel} and ${range.maxLevel}`);
    }
    if (!range.levels.includes(betLevel)) {
      throw AppError.validation(`betLevel ${betLevel} is not in allowed levels`);
    }

    // Get wallet and check balance
    const wallet = await container.walletRepository.getByUserId(user.id);
    if (!wallet) throw AppError.notFound('Wallet');

    const baseUnit = new Decimal(range.baseUnit);

    // Bet multiplier: buyFG = 100× totalBet
    const betMultiplier = mode === 'buyFG' ? 100 : (mode === 'extraBet' ? 2 : 1);
    const totalBetLevel = betLevel * betMultiplier;
    const playerBetAmount = baseUnit.mul(totalBetLevel);

    if (new Decimal(wallet.balance).lt(playerBetAmount)) {
      throw AppError.insufficientFunds();
    }

    // Acquire spin lock (prevent double-submit)
    const lockKey = `spin:lock:${user.id}`;
    const acquired = await container.cache.acquireLock(lockKey, 10);
    if (!acquired) {
      throw AppError.validation('A spin is already in progress');
    }

    try {
      // Debit bet
      await container.walletRepository.debit(wallet.id, playerBetAmount.toFixed(), 'bet');

      // Run engine (engine uses betLevel integers; currency never touches probability logic)
      container.rng.resetSpinBytes();
      const { createSlotEngine } = await import('../../../../../shared/engine/slotEngine');
      const engine = createSlotEngine(container.rng);
      const outcome = engine.computeFullSpin({ mode, totalBet: betLevel, extraBetOn });

      const winLevel = outcome.totalWin as number;
      const playerWinAmount = baseUnit.mul(winLevel);

      // Credit win
      if (winLevel > 0) {
        await container.walletRepository.credit(wallet.id, playerWinAmount.toFixed(), 'win');
      }

      // Log spin
      const crypto = await import('crypto');
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const spinLog = await container.spinLogRepository.create({
        userId: user.id,
        sessionId: req.headers.get('x-session-id') ?? 'unknown',
        mode,
        currency,
        betLevel,
        winLevel,
        baseUnit: range.baseUnit,
        playerBet: playerBetAmount.toFixed(),
        playerWin: playerWinAmount.toFixed(),
        gridSnapshot: outcome.grid,
        rngBytes: Buffer.concat(container.rng.getSpinBytes()),
        rngByteCount: container.rng.getSpinBytes().reduce((a, b) => a + b.length, 0),
        serverSeed,
        clientSeed: clientSeed ?? null,
      });

      // Get updated balance
      const updatedWallet = await container.walletRepository.getByUserId(user.id);

      return NextResponse.json({
        spinId: spinLog.id,
        outcome,
        playerBet: playerBetAmount.toFixed(),
        playerWin: playerWinAmount.toFixed(),
        currency,
        balance: updatedWallet?.balance /* istanbul ignore next */ ?? '0',
      });
    } finally {
      await container.cache.releaseLock(lockKey);
    }
  } catch (err) {
    return handleError(err);
  }
});
