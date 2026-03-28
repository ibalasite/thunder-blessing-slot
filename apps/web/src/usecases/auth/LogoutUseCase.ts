import type { IAuthProvider } from '../../domain/interfaces/IAuthProvider';

export interface LogoutInput { refreshToken: string | undefined }
export interface LogoutOutput { success: boolean }

export class LogoutUseCase {
  constructor(private auth: IAuthProvider) {}

  async execute(input: LogoutInput): Promise<LogoutOutput> {
    if (input.refreshToken) {
      await this.auth.logout(input.refreshToken);
    }
    return { success: true };
  }
}
