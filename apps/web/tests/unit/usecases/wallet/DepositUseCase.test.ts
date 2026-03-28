import { DepositUseCase } from '../../../../src/usecases/wallet/DepositUseCase';
import { createMockWalletRepo } from '../../helpers/mockContainer';
import { AppError } from '../../../../src/shared/errors/AppError';

const baseInput = { userId: 'user-1', nodeEnv: 'test' };

describe('DepositUseCase', () => {
  it('credits wallet and returns updated balance', async () => {
    const repo = createMockWalletRepo();
    const useCase = new DepositUseCase(repo);
    const result = await useCase.execute({ ...baseInput, amount: '50' });
    expect(result.deposited).toBe('50');
    expect(repo.credit).toHaveBeenCalledWith('wallet-1', '50', 'deposit');
  });

  it('throws PROVIDER_FORBIDDEN for mock provider in production', async () => {
    const repo = createMockWalletRepo();
    const useCase = new DepositUseCase(repo);
    await expect(useCase.execute({ ...baseInput, nodeEnv: 'production', amount: '10', provider: 'mock' }))
      .rejects.toMatchObject({ code: 'PROVIDER_FORBIDDEN' });
  });

  it('throws VALIDATION_ERROR for non-positive amount', async () => {
    const repo = createMockWalletRepo();
    const useCase = new DepositUseCase(repo);
    await expect(useCase.execute({ ...baseInput, amount: '0' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when wallet missing', async () => {
    const repo = createMockWalletRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const useCase = new DepositUseCase(repo);
    await expect(useCase.execute({ ...baseInput, amount: '10' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR when deposit exceeds limit', async () => {
    const repo = createMockWalletRepo();
    const useCase = new DepositUseCase(repo);
    await expect(useCase.execute({ ...baseInput, amount: '200000' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('allows provider other than mock in production', async () => {
    const repo = createMockWalletRepo();
    const useCase = new DepositUseCase(repo);
    const result = await useCase.execute({ ...baseInput, nodeEnv: 'production', amount: '10', provider: 'stripe' });
    expect(result.deposited).toBe('10');
  });
});
