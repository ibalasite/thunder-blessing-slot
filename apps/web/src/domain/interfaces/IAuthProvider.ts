export interface AuthUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthProvider {
  register(email: string, password: string): Promise<AuthUser>;
  login(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }>;
  refreshAccessToken(refreshToken: string): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
  verifyAccessToken(accessToken: string): Promise<AuthUser>;
  getUserById(id: string): Promise<AuthUser | null>;
}
