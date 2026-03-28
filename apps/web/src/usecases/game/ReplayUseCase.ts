import type { ISpinLogRepository } from '../../domain/interfaces/ISpinLogRepository';
import { AppError } from '../../shared/errors/AppError';

export interface ReplayInput { spinId: string; userId: string }
export interface ReplayOutput {
  spinId: string;
  mode: string;
  currency: string;
  betLevel: number;
  winLevel: number;
  playerBet: string;
  playerWin: string;
  gridSnapshot: unknown;
  rngByteCount: number;
  createdAt: string;
}

export class ReplayUseCase {
  constructor(private spinLogRepo: ISpinLogRepository) {}

  async execute(input: ReplayInput): Promise<ReplayOutput> {
    const log = await this.spinLogRepo.getById(input.spinId);
    if (!log) throw AppError.notFound('SpinLog');
    // S-08: Ownership check
    if (log.userId !== input.userId) throw AppError.forbidden('Access denied');
    return {
      spinId: log.id,
      mode: log.mode,
      currency: log.currency,
      betLevel: log.betLevel,
      winLevel: log.winLevel,
      playerBet: log.playerBet,
      playerWin: log.playerWin,
      gridSnapshot: log.gridSnapshot,
      rngByteCount: log.rngByteCount,
      createdAt: log.createdAt.toISOString(),
    };
  }
}
