import Decimal from 'decimal.js';

export type SpinMode = 'main' | 'extraBet' | 'buyFG';

export class SpinEntity {
  private constructor(
    public readonly mode: SpinMode,
    public readonly betLevel: number,
    public readonly baseUnit: Decimal,
    public readonly winLevel: number,
  ) {}

  get betMultiplier(): number {
    if (this.mode === 'buyFG') return 100;
    if (this.mode === 'extraBet') return 2;
    return 1;
  }

  get totalBetLevel(): number {
    return this.betLevel * this.betMultiplier;
  }

  get playerBetAmount(): Decimal {
    return this.baseUnit.mul(this.totalBetLevel);
  }

  get playerWinAmount(): Decimal {
    return this.baseUnit.mul(this.winLevel);
  }

  static create(mode: SpinMode, betLevel: number, baseUnit: Decimal, winLevel: number): SpinEntity {
    return new SpinEntity(mode, betLevel, baseUnit, winLevel);
  }
}
