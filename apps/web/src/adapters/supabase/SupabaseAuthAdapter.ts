import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import crypto from 'crypto';
import type { IAuthProvider, AuthUser, AuthTokens } from '../../interfaces/IAuthProvider';
import { AppError } from '../../shared/errors/AppError';
import { env } from '../../config/env';

/**
 * Supabase-backed authentication adapter.
 * Uses Supabase Auth for user management + custom JWT for API tokens.
 * S-06: JWT algorithm hardcoded to HS256; alg:none rejected at verification.
 * S-07: Session limit enforced by caller (AuthService).
 */
export class SupabaseAuthAdapter implements IAuthProvider {
  private readonly _client: SupabaseClient;
  private readonly _jwtSecret: Uint8Array;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this._client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    this._jwtSecret = new TextEncoder().encode(env.JWT_SECRET);
  }

  async register(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this._client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      // S-13: Don't distinguish "email already exists" — return generic error
      throw AppError.validation('Registration failed');
    }
    return this._mapUser(data.user);
  }

  async login(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const { data, error } = await this._client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      throw AppError.unauthorized('Invalid credentials');
    }
    const user = this._mapUser(data.user);
    const tokens = await this._issueTokens(user.id);
    return { user, tokens };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const { data, error } = await this._client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }
    return this._issueTokens(data.user!.id);
  }

  async logout(refreshToken: string): Promise<void> {
    await this._client.auth.admin.signOut(refreshToken);
  }

  async verifyAccessToken(accessToken: string): Promise<AuthUser> {
    try {
      const { payload } = await jose.jwtVerify(accessToken, this._jwtSecret, {
        algorithms: ['HS256'], // S-06: Whitelist only — rejects alg:none
        clockTolerance: 5,
      });
      if (typeof payload.sub !== 'string') throw new Error('Invalid token subject');
      return {
        id: payload.sub,
        email: payload['email'] as string,
        createdAt: new Date((payload['iat'] as number) * 1000),
      };
    } catch {
      throw AppError.unauthorized('Invalid or expired access token');
    }
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const { data, error } = await this._client.auth.admin.getUserById(id);
    if (error || !data.user) return null;
    return this._mapUser(data.user);
  }

  private async _issueTokens(userId: string): Promise<AuthTokens> {
    const { data } = await this._client.auth.admin.getUserById(userId);
    const email = data.user?.email ?? '';

    const accessToken = await new jose.SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
      .sign(this._jwtSecret);

    const refreshToken = crypto.randomBytes(64).toString('hex');
    return { accessToken, refreshToken };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mapUser(user: any): AuthUser {
    return {
      id: user.id as string,
      email: user.email as string,
      createdAt: new Date(user.created_at as string),
    };
  }
}
