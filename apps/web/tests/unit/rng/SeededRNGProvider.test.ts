describe('SeededRNGProvider', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: ORIGINAL_ENV, writable: true });
  });

  function makeProvider(seed = 12345) {
    // Must be in non-production env
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
    const { SeededRNGProvider } = require('../../../src/rng/SeededRNGProvider');
    return new SeededRNGProvider(seed);
  }

  describe('production guard (S-02)', () => {
    it('throws in production environment', () => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
      const { SeededRNGProvider } = require('../../../src/rng/SeededRNGProvider');
      expect(() => new SeededRNGProvider(42)).toThrow('[SECURITY]');
    });
  });

  describe('random()', () => {
    it('returns float in [0, 1)', () => {
      const rng = makeProvider();
      for (let i = 0; i < 50; i++) {
        const v = rng.random();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('is deterministic with same seed', () => {
      const rng1 = makeProvider(999);
      const rng2 = makeProvider(999);
      for (let i = 0; i < 20; i++) {
        expect(rng1.random()).toBe(rng2.random());
      }
    });

    it('differs with different seeds', () => {
      const rng1 = makeProvider(1);
      const rng2 = makeProvider(2);
      const values1 = Array.from({ length: 10 }, () => rng1.random());
      const values2 = Array.from({ length: 10 }, () => rng2.random());
      expect(values1).not.toEqual(values2);
    });

    it('accumulates spin bytes', () => {
      const rng = makeProvider();
      rng.resetSpinBytes();
      rng.random();
      expect(rng.getSpinBytes()).toHaveLength(1);
    });
  });

  describe('randomInt()', () => {
    it('returns integer in [0, max)', () => {
      const rng = makeProvider();
      for (let i = 0; i < 100; i++) {
        const v = rng.randomInt(10);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(10);
      }
    });

    it('throws for non-positive max', () => {
      const rng = makeProvider();
      expect(() => rng.randomInt(0)).toThrow(RangeError);
    });

    it('throws for non-integer max', () => {
      const rng = makeProvider();
      expect(() => rng.randomInt(2.5)).toThrow(RangeError);
    });
  });

  describe('resetSpinBytes()', () => {
    it('clears accumulated bytes', () => {
      const rng = makeProvider();
      rng.random();
      rng.resetSpinBytes();
      expect(rng.getSpinBytes()).toHaveLength(0);
    });
  });
});
