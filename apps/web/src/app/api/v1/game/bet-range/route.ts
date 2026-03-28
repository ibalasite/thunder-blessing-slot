import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../shared/middleware/withAuth';
import { container } from '../../../../../container';
import { AppError } from '../../../../../shared/errors/AppError';
import type { Currency } from '../../../../../interfaces/IWalletRepository';

const VALID_CURRENCIES: Currency[] = ['USD', 'TWD'];

export const GET = withAuth(async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url);
  const currency = (searchParams.get('currency') /* istanbul ignore next */ ?? 'USD') as Currency;

  if (!VALID_CURRENCIES.includes(currency)) {
    throw AppError.validation(`Unsupported currency: ${currency}`);
  }

  const range = await container.probabilityProvider.getBetRange(currency);

  return NextResponse.json(range);
});
