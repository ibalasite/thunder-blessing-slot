import { LoginUseCase } from '../../../../src/usecases/auth/LoginUseCase';
import { createMockAuthProvider, createMockCache, TEST_USER, TEST_TOKENS } from '../../helpers/mockContainer';
import { AppError } from '../../../../src/shared/errors/AppError';

const defaultInput = {
  email: 'test@example.com',
  password: 'password',
  nodeEnv: 'test',
  rateLimitMax: 5,
  rateLimitWindowSeconds: 900,
};

describe('LoginUseCase', () => {
  it('returns tokens on successful login', async () => {
    const auth = createMockAuthProvider();
    const cache = createMockCache();
    const useCase = new LoginUseCase(auth, cache);
    const result = await useCase.execute(defaultInput);
    expect(result.accessToken).toBe(TEST_TOKENS.accessToken);
    expect(result.refreshToken).toBe(TEST_TOKENS.refreshToken);
    expect(result.userId).toBe(TEST_USER.id);
  });

  it('throws RATE_LIMITED when count exceeds max', async () => {
    const auth = createMockAuthProvider();
    const cache = createMockCache({ incr: jest.fn().mockResolvedValue(6) });
    const useCase = new LoginUseCase(auth, cache);
    await expect(useCase.execute(defaultInput)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('increments rate limit counter', async () => {
    const auth = createMockAuthProvider();
    const cache = createMockCache();
    const useCase = new LoginUseCase(auth, cache);
    await useCase.execute(defaultInput);
    expect(cache.incr).toHaveBeenCalledWith(expect.stringContaining('auth:ratelimit:'), 900);
  });

  it('propagates auth errors', async () => {
    const auth = createMockAuthProvider({ login: jest.fn().mockRejectedValue(AppError.unauthorized('bad creds')) });
    const cache = createMockCache();
    const useCase = new LoginUseCase(auth, cache);
    await expect(useCase.execute(defaultInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
