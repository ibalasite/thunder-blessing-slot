import { GetTransactionsUseCase } from '../../../../src/usecases/wallet/GetTransactionsUseCase';
import { createMockWalletRepo } from '../../helpers/mockContainer';

describe('GetTransactionsUseCase', () => {
  it('returns transactions for valid user', async () => {
    const repo = createMockWalletRepo();
    const useCase = new GetTransactionsUseCase(repo);
    const result = await useCase.execute({ userId: 'user-1', limit: 10, offset: 0 });
    expect(result.transactions).toEqual([]);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
    expect(repo.getTransactions).toHaveBeenCalledWith('wallet-1', 10, 0);
  });

  it('throws NOT_FOUND when wallet missing', async () => {
    const repo = createMockWalletRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const useCase = new GetTransactionsUseCase(repo);
    await expect(useCase.execute({ userId: 'user-1', limit: 10, offset: 0 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
