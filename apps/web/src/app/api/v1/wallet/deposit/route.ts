import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '../../../../../shared/middleware/withAuth';
import { container } from '../../../../../container';
import { AppError } from '../../../../../shared/errors/AppError';

// Deposit limits: USD $1,000 / TWD $30,000 (per transaction)
const DEPOSIT_LIMITS: Record<string, number> = {
  USD: 100000,  // in cents (betLevel units)
  TWD: 30000,
};

const schema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
  provider: z.enum(['mock']).default('mock'),
});

export const POST = withAuth(async (req: NextRequest, user) => {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validation(parsed.error.errors[0]?.message /* istanbul ignore next */ ?? 'Invalid input');
  }

  const { amount, provider } = parsed.data;

  // S-01: Block mock provider in production
  if (provider === 'mock' && process.env.NODE_ENV === 'production') {
    throw AppError.providerForbidden();
  }

  const wallet = await container.walletRepository.getByUserId(user.id);
  if (!wallet) throw AppError.notFound('Wallet');

  const amountNum = parseFloat(amount);
  const limit = DEPOSIT_LIMITS[wallet.currency];
  if (limit && amountNum > limit) {
    throw AppError.validation(`Deposit exceeds maximum of ${limit} ${wallet.currency}`);
  }

  const updated = await container.walletRepository.credit(wallet.id, amount, 'deposit');

  return NextResponse.json({
    balance: updated.balance,
    currency: updated.currency,
    deposited: amount,
  });
});
