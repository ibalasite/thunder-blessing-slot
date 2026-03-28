import type { IRNGProvider } from '../interfaces/IRNGProvider';

/**
 * Deterministic RNG for tests only (mulberry32 PRNG).
 * Throws in production — gaming compliance requirement (S-02).
 */
export class SeededRNGProvider implements IRNGProvider {
  private _state: number;
  private _spinBytes: Buffer[] = [];

  constructor(seed: number) {
    // S-02: Forbid in production to prevent predictable spin outcomes
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY] SeededRNGProvider is FORBIDDEN in production. Use CryptoRNGProvider.');
    }
    this._state = seed >>> 0;
  }

  private _next(): number {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let z = this._state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  random(): number {
    const val = this._next();
    // Store a fake 8-byte buffer for interface compatibility
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(val, 0);
    this._spinBytes.push(buf);
    return val;
  }

  randomInt(max: number): number {
    if (max <= 0 || !Number.isInteger(max)) {
      throw new RangeError(`SeededRNGProvider.randomInt: max must be positive integer, got ${max}`);
    }
    return Math.floor(this._next() * max);
  }

  getSpinBytes(): Buffer[] {
    return [...this._spinBytes];
  }

  resetSpinBytes(): void {
    this._spinBytes = [];
  }
}
