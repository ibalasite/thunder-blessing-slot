export interface IRNGProvider {
  /** Returns a float in [0, 1) using cryptographically secure entropy. */
  random(): number;

  /** Returns an integer in [0, max) using rejection sampling. */
  randomInt(max: number): number;

  /** Returns all raw entropy bytes consumed during this spin (for audit logging). */
  getSpinBytes(): Buffer[];

  /** Clears accumulated spin bytes (call before each spin). */
  resetSpinBytes(): void;
}
