import type { IProbabilityProvider, BetRange } from '../../domain/interfaces/IProbabilityProvider';
import type { Currency } from '../../domain/interfaces/IWalletRepository';
import { AppError } from '../../shared/errors/AppError';

export interface GetBetRangeInput { currency: string }
export type GetBetRangeOutput = BetRange;

export class GetBetRangeUseCase {
  constructor(private probabilityProvider: IProbabilityProvider) {}

  async execute(input: GetBetRangeInput): Promise<GetBetRangeOutput> {
    if (input.currency !== 'USD' && input.currency !== 'TWD') {
      throw AppError.validation(`Unsupported currency: ${input.currency}`);
    }
    return this.probabilityProvider.getBetRange(input.currency as Currency);
  }
}
