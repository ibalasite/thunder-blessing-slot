import type { IAuthProvider } from '../../domain/interfaces/IAuthProvider';
import { AppError } from '../../shared/errors/AppError';

export interface RefreshInput { refreshToken: string | undefined }
export interface RefreshOutput { accessToken: string; refreshToken: string }

export class RefreshTokenUseCase {
  constructor(private auth: IAuthProvider) {}

  async execute(input: RefreshInput): Promise<RefreshOutput> {
    if (!input.refreshToken) throw AppError.unauthorized('No refresh token');
    const tokens = await this.auth.refreshAccessToken(input.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
}
