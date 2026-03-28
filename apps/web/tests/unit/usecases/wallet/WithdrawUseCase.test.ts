import { WithdrawUseCase } from '../../../../src/usecases/wallet/WithdrawUseCase';
import { createMockWalletRepo } from '../../helpers/mockContainer';

describe('WithdrawUseCase', () => {
  it('debits wallet and returns result', async () => {
    const repo = createMockWalletRepo();
    const useCase = new WithdrawUseCase(repo);
    const result = await useCase.execute({ userId: 'user-1', amount: '5' });
    expect(result.withdrawn).toBe('5');
    expect(repo.debit).toHaveBeenCalledWith('wallet-1', '5', 'withdrawal');
  });

  it('throws VALIDATION_ERROR for non-positive amount', async () => {
    const repo = createMockWalletRepo();
    const useCase = new WithdrawUseCase(repo);
    await expect(useCase.execute({ userId: 'user-1', amount: '0' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when wallet missing', async () => {
    const repo = createMockWalletRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const useCase = new WithdrawUseCase(repo);
    await expect(useCase.execute({ userId: 'user-1', amount: '5' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR when amount below USD minimum', async () => {
    const repo = createMockWalletRepo();
    const useCase = new WithdrawUseCase(repo);
    // USD minimum is 1
    await expect(useCase.execute({ userId: 'user-1', amount: '0.5' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
