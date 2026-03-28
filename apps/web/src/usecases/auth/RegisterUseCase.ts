import type { IAuthProvider } from '../../domain/interfaces/IAuthProvider';

export interface RegisterInput { email: string; password: string }
export interface RegisterOutput { id: string; email: string }

export class RegisterUseCase {
  constructor(private auth: IAuthProvider) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const user = await this.auth.register(input.email, input.password);
    return { id: user.id, email: user.email };
  }
}
