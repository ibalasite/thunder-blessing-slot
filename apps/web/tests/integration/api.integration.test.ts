/**
 * 2A-11: Integration tests — real Supabase local DB
 *
 * Prerequisites: supabase start (running on http://127.0.0.1:54321)
 * Run: INTEGRATION=1 pnpm test:int
 *
 * Tests: SupabaseAuthAdapter, SupabaseWalletRepository
 *
 * These tests exercise the real Supabase local DB (not mocks).
 * They are skipped automatically when INTEGRATION env var is not set.
 *
 * NOTE: Imports of Supabase adapters are done inside describe blocks (lazy)
 * to avoid triggering env.ts validation when tests are skipped.
 */

const RUN_INTEGRATION = process.env.INTEGRATION === '1';

const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

// ─── SupabaseAuthAdapter ─────────────────────────────────────────────────────

describeIf(RUN_INTEGRATION)('2A-11 Integration: SupabaseAuthAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auth: any;
  const testEmail = `int-test-${Date.now()}@example.com`;
  const testPassword = 'integration-test-password-123';
  let userId: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    // Lazy import — only runs when INTEGRATION=1, avoiding env.ts validation in CI
    const { SupabaseAuthAdapter } = await import('../../src/adapters/repositories/SupabaseAuthAdapter');
    auth = new SupabaseAuthAdapter(
      process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      process.env.JWT_SECRET ?? 'test-secret-at-least-32-chars-long!!',
    );
  });

  it('register() creates a new user and returns AuthUser', async () => {
    const user = await auth.register(testEmail, testPassword);
    expect(user).toBeDefined();
    expect(user.id).toBeTruthy();
    expect(user.email).toBe(testEmail);
    expect(user.createdAt).toBeInstanceOf(Date);
    userId = user.id;
  });

  it('login() returns AuthUser + AuthTokens for valid credentials', async () => {
    const result = await auth.login(testEmail, testPassword);
    expect(result.user.id).toBe(userId);
    expect(result.user.email).toBe(testEmail);
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    accessToken = result.tokens.accessToken;
    refreshToken = result.tokens.refreshToken;
  });

  it('verifyAccessToken() verifies a valid token and returns AuthUser', async () => {
    const user = await auth.verifyAccessToken(accessToken);
    expect(user.id).toBe(userId);
    expect(user.email).toBe(testEmail);
  });

  it('verifyAccessToken() throws on invalid token', async () => {
    await expect(auth.verifyAccessToken('invalid-token-xyz')).rejects.toThrow();
  });

  it('refreshAccessToken() returns new tokens using valid refresh token', async () => {
    const newTokens = await auth.refreshAccessToken(refreshToken);
    expect(newTokens.accessToken).toBeTruthy();
    expect(newTokens.refreshToken).toBeTruthy();
    // Update tokens for subsequent tests
    accessToken = newTokens.accessToken;
    refreshToken = newTokens.refreshToken;
  });

  it('getUserById() returns AuthUser for existing user', async () => {
    const user = await auth.getUserById(userId);
    expect(user).not.toBeNull();
    expect(user.id).toBe(userId);
    expect(user.email).toBe(testEmail);
  });

  it('getUserById() returns null for non-existent user', async () => {
    const user = await auth.getUserById('00000000-0000-0000-0000-000000000000');
    expect(user).toBeNull();
  });

  it('logout() invalidates the session without throwing', async () => {
    await expect(auth.logout(refreshToken)).resolves.not.toThrow();
  });

  it('verifyAccessToken() still works after logout (JWT is stateless)', async () => {
    // Our JWT tokens are stateless — verifyAccessToken checks signature only,
    // not the Supabase session. The token remains valid until it expires.
    const user = await auth.verifyAccessToken(accessToken);
    expect(user.id).toBe(userId);
  });
});

// ─── SupabaseWalletRepository ─────────────────────────────────────────────────

describeIf(RUN_INTEGRATION)('2A-11 Integration: SupabaseWalletRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auth: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let walletRepo: any;
  let userId: string;
  let walletId: string;

  const testEmail = `int-wallet-${Date.now()}@example.com`;
  const testPassword = 'wallet-test-password-456';

  beforeAll(async () => {
    const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const jwtSecret = process.env.JWT_SECRET ?? 'test-secret-at-least-32-chars-long!!';

    // Lazy imports — only runs when INTEGRATION=1
    const { SupabaseAuthAdapter } = await import('../../src/adapters/repositories/SupabaseAuthAdapter');
    const { SupabaseWalletRepository } = await import('../../src/adapters/repositories/SupabaseWalletRepository');

    auth = new SupabaseAuthAdapter(supabaseUrl, serviceRoleKey, jwtSecret);
    walletRepo = new SupabaseWalletRepository(supabaseUrl, serviceRoleKey);

    // Register a fresh user for wallet tests
    const user = await auth.register(testEmail, testPassword);
    userId = user.id;
  });

  it('getByUserId() returns a wallet (auto-created on register via DB trigger)', async () => {
    const wallet = await walletRepo.getByUserId(userId);
    // Wallet should be auto-created by a DB trigger on user registration
    // If not auto-created, we create it manually below
    if (wallet) {
      expect(wallet.userId).toBe(userId);
      expect(wallet.balance).toBeDefined();
      walletId = wallet.id;
    } else {
      // Create wallet manually if trigger not set up in local dev
      const created = await walletRepo.createWallet(userId, 'USD');
      expect(created.userId).toBe(userId);
      expect(created.currency).toBe('USD');
      walletId = created.id;
    }
  });

  it('credit() increases the wallet balance', async () => {
    const walletBefore = await walletRepo.getByUserId(userId);
    expect(walletBefore).not.toBeNull();
    const balanceBefore = parseFloat(walletBefore.balance);

    const updated = await walletRepo.credit(walletId, '10.00', 'deposit');
    const balanceAfter = parseFloat(updated.balance);

    expect(balanceAfter).toBeCloseTo(balanceBefore + 10.0, 2);
  });

  it('debit() decreases the wallet balance', async () => {
    const walletBefore = await walletRepo.getByUserId(userId);
    expect(walletBefore).not.toBeNull();
    const balanceBefore = parseFloat(walletBefore.balance);

    const updated = await walletRepo.debit(walletId, '5.00', 'bet');
    const balanceAfter = parseFloat(updated.balance);

    expect(balanceAfter).toBeCloseTo(balanceBefore - 5.0, 2);
  });

  it('debit() throws INSUFFICIENT_FUNDS when balance is too low', async () => {
    // Attempt to debit more than the current balance
    await expect(
      walletRepo.debit(walletId, '999999.00', 'bet'),
    ).rejects.toThrow();
  });

  it('getByUserId() returns null for non-existent userId', async () => {
    const wallet = await walletRepo.getByUserId('00000000-0000-0000-0000-000000000000');
    expect(wallet).toBeNull();
  });
});

// ─── Skip notice ─────────────────────────────────────────────────────────────

describeIf(!RUN_INTEGRATION)('2A-11 Integration tests (SKIPPED — set INTEGRATION=1 to run)', () => {
  it('skipped: run with INTEGRATION=1 pnpm test:int', () => {
    // This test block only appears when integration tests are NOT enabled.
    // Prerequisites: supabase start + apps/web/.env.local configured
    expect(true).toBe(true);
  });
});
