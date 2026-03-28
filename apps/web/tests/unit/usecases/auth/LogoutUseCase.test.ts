import { LogoutUseCase } from '../../../../src/usecases/auth/LogoutUseCase';
import { createMockAuthProvider } from '../../helpers/mockContainer';

describe('LogoutUseCase', () => {
  it('calls auth.logout with refresh token', async () => {
    const auth = createMockAuthProvider();
    const useCase = new LogoutUseCase(auth);
    const result = await useCase.execute({ refreshToken: 'my-token' });
    expect(result.success).toBe(true);
    expect(auth.logout).toHaveBeenCalledWith('my-token');
  });

  it('succeeds without calling logout when no refresh token', async () => {
    const auth = createMockAuthProvider();
    const useCase = new LogoutUseCase(auth);
    const result = await useCase.execute({ refreshToken: undefined });
    expect(result.success).toBe(true);
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
