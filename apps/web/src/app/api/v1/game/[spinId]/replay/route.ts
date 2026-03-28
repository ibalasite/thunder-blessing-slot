import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../../shared/middleware/withAuth';
import { container } from '../../../../../../container';
import { AppError } from '../../../../../../shared/errors/AppError';

export const GET = withAuth(async (_req: NextRequest, user, context) => {
  const spinId = context?.params?.spinId /* istanbul ignore next */;
  if (!spinId) throw AppError.validation('spinId is required');

  const log = await container.spinLogRepository.getById(spinId);
  if (!log) throw AppError.notFound('Spin log');

  // S-08: Ownership check — user can only replay their own spins
  if (log.userId !== user.id) {
    throw AppError.forbidden('You do not own this spin log');
  }

  return NextResponse.json({
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
  });
});
