import { RegisterUseCase } from '../../../../src/usecases/auth/RegisterUseCase';
import { createMockAuthProvider, TEST_USER } from '../../helpers/mockContainer';

describe('RegisterUseCase', () => {
  it('registers a user and returns id and email', async () => {
    const auth = createMockAuthProvider();
    const useCase = new RegisterUseCase(auth);
    const result = await useCase.execute({ email: 'test@example.com', password: 'password123' });
    expect(result.id).toBe(TEST_USER.id);
    expect(result.email).toBe(TEST_USER.email);
    expect(auth.register).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('propagates errors from authProvider', async () => {
    const auth = createMockAuthProvider({
      register: jest.fn().mockRejectedValue(new Error('Registration failed')),
    });
    const useCase = new RegisterUseCase(auth);
    await expect(useCase.execute({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('Registration failed');
  });
});
