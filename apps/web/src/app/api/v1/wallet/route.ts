import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../shared/middleware/withAuth';
import { container } from '../../../../container';
import { AppError } from '../../../../shared/errors/AppError';

export const GET = withAuth(async (_req: NextRequest, user) => {
  const wallet = await container.walletRepository.getByUserId(user.id);
  if (!wallet) throw AppError.notFound('Wallet');
  return NextResponse.json({
    id: wallet.id,
    currency: wallet.currency,
    balance: wallet.balance,
  });
});
