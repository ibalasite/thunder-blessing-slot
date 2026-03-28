import { CryptoRNGProvider } from '../../../../src/infrastructure/rng/CryptoRNGProvider';

describe('CryptoRNGProvider', () => {
  let rng: CryptoRNGProvider;

  beforeEach(() => {
    rng = new CryptoRNGProvider();
  });

  describe('random()', () => {
    it('returns float in [0, 1)', () => {
      for (let i = 0; i < 100; i++) {
        const v = rng.random();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('accumulates spin bytes (8 bytes per call)', () => {
      rng.resetSpinBytes();
      rng.random();
      expect(rng.getSpinBytes()).toHaveLength(1);
      expect(rng.getSpinBytes()[0]).toHaveLength(8);
    });

    it('produces different values each call (not deterministic)', () => {
      const values = Array.from({ length: 20 }, () => rng.random());
      const unique = new Set(values);
      expect(unique.size).toBeGreaterThan(15);
    });
  });

  describe('randomInt()', () => {
    it('returns integer in [0, max)', () => {
      for (let i = 0; i < 200; i++) {
        const v = rng.randomInt(6);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(6);
      }
    });

    it('covers all values in range (statistical)', () => {
      const counts = new Array(6).fill(0);
      for (let i = 0; i < 600; i++) {
        counts[rng.randomInt(6)]++;
      }
      counts.forEach((c) => expect(c).toBeGreaterThan(0));
    });

    it('throws for non-positive max', () => {
      expect(() => rng.randomInt(0)).toThrow(RangeError);
      expect(() => rng.randomInt(-1)).toThrow(RangeError);
    });

    it('throws for non-integer max', () => {
      expect(() => rng.randomInt(1.5)).toThrow(RangeError);
    });

    it('works with max=1 (always returns 0)', () => {
      for (let i = 0; i < 20; i++) {
        expect(rng.randomInt(1)).toBe(0);
      }
    });
  });

  describe('getSpinBytes() / resetSpinBytes()', () => {
    it('returns copy (mutation does not affect internal state)', () => {
      rng.random();
      const bytes = rng.getSpinBytes();
      bytes.push(Buffer.alloc(1));
      expect(rng.getSpinBytes()).toHaveLength(1);
    });

    it('resets clears all accumulated bytes', () => {
      rng.random();
      rng.random();
      rng.resetSpinBytes();
      expect(rng.getSpinBytes()).toHaveLength(0);
    });
  });
});
