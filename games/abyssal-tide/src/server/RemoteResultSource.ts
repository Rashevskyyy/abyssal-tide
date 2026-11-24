/**
 * Джерело результатів через справжній сервер (каталог server/, контракт — api.ts).
 * GameFlow бачить той самий інтерфейс, що й у локального «сервера»: повтори з тим самим stepId,
 * відновлення незавершеного раунду й історія працюють однаково, просто через HTTP.
 */
import type { JurisdictionId } from '../shared/jurisdiction';
import type { StepRequest, StepResult } from '../shared/types';
import { PLAYER_ID, type ApiError, type LaunchResponse } from './api';
import { SourceError, type LiveSource, type RoundRecord, type SessionSnapshot } from './protocol';

export interface RemoteOptions {
  baseUrl: string;
  jurisdiction: JurisdictionId;
  /** Скільки чекати відповіді, мс; далі — помилка мережі й повтор із тим самим stepId. */
  timeoutMs?: number;
}

const PLAYER_KEY = 'abyssal-tide/player';

export class RemoteResultSource implements LiveSource {
  readonly kind = 'live' as const;
  /** Імітація втрат лише для локального джерела; тут мережа справжня. */
  failRate = 0;
  private token = '';
  private snap: SessionSnapshot | null = null;
  private hist: RoundRecord[] = [];

  constructor(private readonly opts: RemoteOptions) {}

  get baseUrl(): string {
    return this.opts.baseUrl.replace(/\/+$/, '');
  }

  /**
   * Запуск сесії. Ідентифікатор гравця демо зберігається в браузері, тож баланс,
   * банки й незавершений раунд переживають перезавантаження сторінки.
   */
  async connect(): Promise<LaunchResponse> {
    let playerId = localStorage.getItem(PLAYER_KEY);
    if (!playerId || !PLAYER_ID.test(playerId)) {
      playerId = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, playerId);
    }
    const l = await this.call<LaunchResponse>('POST', '/api/launch', { playerId, jurisdiction: this.opts.jurisdiction }, false);
    this.token = l.token;
    this.snap = l.snapshot;
    this.hist = l.history;
    return l;
  }

  async session(): Promise<SessionSnapshot> {
    this.snap = await this.call<SessionSnapshot>('GET', '/api/session');
    return this.snapshot();
  }

  snapshot(): SessionSnapshot {
    if (!this.snap) throw new SourceError('NETWORK', 'Not connected', true);
    return structuredClone(this.snap);
  }

  async request(req: StepRequest): Promise<StepResult> {
    const r = await this.call<StepResult>('POST', '/api/play', req);
    if (this.snap) this.snap = { ...this.snap, balance: r.balanceAfter, lastResult: r, pots: { ...this.snap.pots, [String(r.bet)]: r.pots } };
    if (r.roundComplete) void this.refreshHistory();
    return r;
  }

  history(): RoundRecord[] {
    return structuredClone(this.hist);
  }

  async topUp(): Promise<SessionSnapshot> {
    this.snap = await this.call<SessionSnapshot>('POST', '/api/topup');
    return this.snapshot();
  }

  async reset(): Promise<void> {
    this.snap = await this.call<SessionSnapshot>('POST', '/api/reset');
    this.hist = [];
  }

  private async refreshHistory(): Promise<void> {
    try {
      this.hist = await this.call<RoundRecord[]>('GET', '/api/history');
    } catch {
      /* історія оновиться після наступного раунду */
    }
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: object, auth = true, retried = false): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 8000);
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        signal: ctrl.signal,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // таймаут або обрив: крок міг зафіксуватись — клієнт повторить той самий stepId
      throw new SourceError('NETWORK', 'The game server is not reachable', true);
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return (await res.json()) as T;
    let err: ApiError | null = null;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      /* тіло без JSON */
    }
    // сесію сервер не знає (перезапуск без бази) — новий запуск і той самий запит ще раз
    if (res.status === 401 && auth && !retried) {
      await this.connect();
      return this.call<T>(method, path, body, auth, true);
    }
    throw new SourceError(err?.code ?? 'NETWORK', err?.message ?? `HTTP ${res.status}`, res.status >= 500);
  }
}
