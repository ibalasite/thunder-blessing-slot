import { GetWalletUseCase } from '../../../../src/usecases/wallet/GetWalletUseCase';
import { createMockWalletRepo, TEST_WALLET } from '../../helpers/mockContainer';
import { AppError } from '../../../../src/shared/errors/AppError';

describe('GetWalletUseCase', () => {
  it('returns wallet data for valid user', async () => {
    const repo = createMockWalletRepo();
    const useCase = new GetWalletUseCase(repo);
    const result = await useCase.execute({ userId: 'user-1' });
    expect(result.id).toBe(TEST_WALLET.id);
    expect(result.currency).toBe(TEST_WALLET.currency);
    expect(result.balance).toBe('100');
    expect(repo.getByUserId).toHaveBeenCalledWith('user-1');
  });

  it('throws NOT_FOUND when wallet does not exist', async () => {
    const repo = createMockWalletRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const useCase = new GetWalletUseCase(repo);
    await expect(useCase.execute({ userId: 'unknown' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
