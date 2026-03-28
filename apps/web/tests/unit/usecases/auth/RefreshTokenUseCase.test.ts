import { RefreshTokenUseCase } from '../../../../src/usecases/auth/RefreshTokenUseCase';
import { createMockAuthProvider, TEST_TOKENS } from '../../helpers/mockContainer';
import { AppError } from '../../../../src/shared/errors/AppError';

describe('RefreshTokenUseCase', () => {
  it('returns new tokens on valid refresh token', async () => {
    const auth = createMockAuthProvider();
    const useCase = new RefreshTokenUseCase(auth);
    const result = await useCase.execute({ refreshToken: 'my-refresh-token' });
    expect(result.accessToken).toBe(TEST_TOKENS.accessToken);
    expect(result.refreshToken).toBe(TEST_TOKENS.refreshToken);
    expect(auth.refreshAccessToken).toHaveBeenCalledWith('my-refresh-token');
  });

  it('throws UNAUTHORIZED when refreshToken is undefined', async () => {
    const auth = createMockAuthProvider();
    const useCase = new RefreshTokenUseCase(auth);
    await expect(useCase.execute({ refreshToken: undefined })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('propagates auth errors', async () => {
    const auth = createMockAuthProvider({
      refreshAccessToken: jest.fn().mockRejectedValue(AppError.unauthorized('expired')),
    });
    const useCase = new RefreshTokenUseCase(auth);
    await expect(useCase.execute({ refreshToken: 'old-token' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
