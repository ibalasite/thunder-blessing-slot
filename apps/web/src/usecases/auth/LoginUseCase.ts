import crypto from 'crypto';
import type { IAuthProvider } from '../../domain/interfaces/IAuthProvider';
import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';
import { AppError } from '../../shared/errors/AppError';

export interface LoginInput {
  email: string;
  password: string;
  nodeEnv: string;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
}
export interface LoginOutput { accessToken: string; refreshToken: string; userId: string }

export class LoginUseCase {
  constructor(
    private auth: IAuthProvider,
    private cache: ICacheAdapter,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    // S-10: Rate limit by email hash
    const emailHash = crypto.createHash('sha256').update(input.email).digest('hex');
    const key = `auth:ratelimit:${emailHash}`;
    const count = await this.cache.incr(key, input.rateLimitWindowSeconds);
    if (count > input.rateLimitMax) throw AppError.rateLimited();

    const { tokens, user } = await this.auth.login(input.email, input.password);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, userId: user.id };
  }
}
