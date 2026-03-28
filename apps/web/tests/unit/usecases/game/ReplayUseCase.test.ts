import { ReplayUseCase } from '../../../../src/usecases/game/ReplayUseCase';
import { createMockSpinLogRepo, TEST_SPIN_LOG } from '../../helpers/mockContainer';

describe('ReplayUseCase', () => {
  it('returns spin data for owner', async () => {
    const repo = createMockSpinLogRepo();
    const useCase = new ReplayUseCase(repo);
    const result = await useCase.execute({ spinId: 'spin-1', userId: 'user-1' });
    expect(result.spinId).toBe('spin-1');
    expect(result.mode).toBe(TEST_SPIN_LOG.mode);
    expect(result.currency).toBe(TEST_SPIN_LOG.currency);
    expect(result.betLevel).toBe(TEST_SPIN_LOG.betLevel);
    expect(result.winLevel).toBe(TEST_SPIN_LOG.winLevel);
    expect(result.createdAt).toBe(TEST_SPIN_LOG.createdAt.toISOString());
  });

  it('throws NOT_FOUND when spin log missing', async () => {
    const repo = createMockSpinLogRepo({ getById: jest.fn().mockResolvedValue(null) });
    const useCase = new ReplayUseCase(repo);
    await expect(useCase.execute({ spinId: 'unknown', userId: 'user-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when user does not own spin', async () => {
    const repo = createMockSpinLogRepo();
    const useCase = new ReplayUseCase(repo);
    await expect(useCase.execute({ spinId: 'spin-1', userId: 'other-user' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
