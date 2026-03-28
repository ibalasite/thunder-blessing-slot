/**
 * RemoteApiClient.ts
 * HTTP client for Thunder Blessing Slot API (Phase 2 server mode)
 * Pure TypeScript — no Cocos dependencies
 */
export interface RemoteSpinResult {
  spinId: string;
  outcome: unknown; // FullSpinOutcome from server
  playerBet: string;
  playerWin: string;
  currency: string;
  balance: string;
}

export class RemoteApiClient {
  private _token: string | null = null;
  private _balance: number = 0;
  private _currency: string = 'USD';
  private _baseUnit: number = 0.01;

  constructor(private readonly _baseUrl: string = 'http://localhost:3000') {}

  get balance(): number { return this._balance; }
  get currency(): string { return this._currency; }
  get baseUnit(): number { return this._baseUnit; }
  get isAuthenticated(): boolean { return this._token !== null; }

  setToken(token: string): void { this._token = token; }
  clearToken(): void { this._token = null; }

  private _headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this._baseUrl}${path}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`API ${path} failed (${res.status}): ${err.message ?? res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async _get<T>(path: string): Promise<T> {
    const res = await fetch(`${this._baseUrl}${path}`, {
      method: 'GET',
      headers: this._headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`API ${path} failed (${res.status}): ${err.message ?? res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async login(email: string, password: string): Promise<void> {
    const result = await this._post<{ accessToken: string }>('/api/v1/auth/login', { email, password });
    this._token = result.accessToken;
  }

  async fetchWallet(): Promise<void> {
    const result = await this._get<{ balance: string; currency: string }>('/api/v1/wallet');
    this._balance = parseFloat(result.balance);
    this._currency = result.currency;
  }

  async fetchBetRange(currency: string = 'USD'): Promise<void> {
    const result = await this._get<{ baseUnit: string }>(`/api/v1/game/bet-range?currency=${currency}`);
    this._baseUnit = parseFloat(result.baseUnit);
  }

  async spin(params: {
    mode: string;
    betLevel: number;
    currency: string;
    extraBetOn?: boolean;
    clientSeed?: string;
  }): Promise<RemoteSpinResult> {
    const result = await this._post<RemoteSpinResult>('/api/v1/game/spin', params);
    this._balance = parseFloat(result.balance);
    return result;
  }
}
