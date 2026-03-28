import crypto from 'crypto';
import type { IRNGProvider } from '../../domain/interfaces/IRNGProvider';

/**
 * Production-grade CSPRNG using OS entropy via crypto.randomBytes().
 * Every random value draws fresh entropy — no PRNG layer, no seeding.
 * All consumed bytes are stored for audit logging in spin_logs.rng_bytes.
 */
export class CryptoRNGProvider implements IRNGProvider {
  private _spinBytes: Buffer[] = [];

  random(): number {
    const buf = crypto.randomBytes(8);
    this._spinBytes.push(buf);
    // Use 53 bits of precision (same as Math.random specification)
    const hi = buf.readUInt32BE(0) >>> 5;   // top 27 bits
    const lo = buf.readUInt32BE(4) >>> 6;   // top 26 bits
    return (hi * 0x4000000 + lo) / 0x20000000000000;
  }

  randomInt(max: number): number {
    if (max <= 0 || !Number.isInteger(max)) {
      throw new RangeError(`CryptoRNGProvider.randomInt: max must be positive integer, got ${max}`);
    }
    // Rejection sampling to avoid modulo bias
    const threshold = 2 ** 32 - (2 ** 32 % max);
    let val: number;
    do {
      const buf = crypto.randomBytes(4);
      this._spinBytes.push(buf);
      val = buf.readUInt32BE(0);
    } while (val >= threshold);
    return val % max;
  }

  getSpinBytes(): Buffer[] {
    return [...this._spinBytes];
  }

  resetSpinBytes(): void {
    this._spinBytes = [];
  }
}
