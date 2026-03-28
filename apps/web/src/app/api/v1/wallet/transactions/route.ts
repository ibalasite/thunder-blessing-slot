import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../shared/middleware/withAuth';
import { container } from '../../../../../container';
import { AppError } from '../../../../../shared/errors/AppError';

export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  const wallet = await container.walletRepository.getByUserId(user.id);
  if (!wallet) throw AppError.notFound('Wallet');

  const txns = await container.walletRepository.getTransactions(wallet.id, limit, offset);
  return NextResponse.json({ transactions: txns, limit, offset });
});
