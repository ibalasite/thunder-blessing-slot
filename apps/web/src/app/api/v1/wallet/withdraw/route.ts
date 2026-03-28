import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '../../../../../shared/middleware/withAuth';
import { container } from '../../../../../container';
import { AppError } from '../../../../../shared/errors/AppError';

const schema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
});

const MIN_WITHDRAW = '1';

export const POST = withAuth(async (req: NextRequest, user) => {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validation(parsed.error.errors[0]?.message /* istanbul ignore next */ ?? 'Invalid input');
  }

  const { amount } = parsed.data;

  if (parseFloat(amount) < parseFloat(MIN_WITHDRAW)) {
    throw AppError.validation(`Minimum withdrawal is ${MIN_WITHDRAW}`);
  }

  const wallet = await container.walletRepository.getByUserId(user.id);
  if (!wallet) throw AppError.notFound('Wallet');

  const updated = await container.walletRepository.debit(wallet.id, amount, 'withdraw');

  return NextResponse.json({
    balance: updated.balance,
    currency: updated.currency,
    withdrawn: amount,
  });
});
