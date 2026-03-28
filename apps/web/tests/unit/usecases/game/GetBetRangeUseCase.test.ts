import { GetBetRangeUseCase } from '../../../../src/usecases/game/GetBetRangeUseCase';
import { createMockProbabilityProvider, TEST_BET_RANGE } from '../../helpers/mockContainer';

describe('GetBetRangeUseCase', () => {
  it('returns bet range for USD', async () => {
    const provider = createMockProbabilityProvider();
    const useCase = new GetBetRangeUseCase(provider);
    const result = await useCase.execute({ currency: 'USD' });
    expect(result).toEqual(TEST_BET_RANGE);
    expect(provider.getBetRange).toHaveBeenCalledWith('USD');
  });

  it('returns bet range for TWD', async () => {
    const provider = createMockProbabilityProvider({
      getBetRange: jest.fn().mockResolvedValue({ ...TEST_BET_RANGE, currency: 'TWD' }),
    });
    const useCase = new GetBetRangeUseCase(provider);
    const result = await useCase.execute({ currency: 'TWD' });
    expect(result.currency).toBe('TWD');
  });

  it('throws VALIDATION_ERROR for unsupported currency', async () => {
    const provider = createMockProbabilityProvider();
    const useCase = new GetBetRangeUseCase(provider);
    await expect(useCase.execute({ currency: 'EUR' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(provider.getBetRange).not.toHaveBeenCalled();
  });

  it('throws VALIDATION_ERROR for empty currency', async () => {
    const provider = createMockProbabilityProvider();
    const useCase = new GetBetRangeUseCase(provider);
    await expect(useCase.execute({ currency: '' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
