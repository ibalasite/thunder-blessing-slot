import type { Currency } from './IWalletRepository';

export interface BetRange {
  currency: Currency;
  baseUnit: string;   // e.g. "0.01" (USD cent), "1" (TWD)
  levels: number[];   // e.g. [1, 5, 10, 25, 50, 100]
  minLevel: number;
  maxLevel: number;
}

export interface IProbabilityProvider {
  getBetRange(currency: Currency): Promise<BetRange>;
}
