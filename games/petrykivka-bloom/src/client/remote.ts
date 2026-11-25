/**
 * Гра через сервер (`?server=http://localhost:8787`): кожен крок — запит до /api/petrykivka-bloom/play.
 * Потік гри бачить той самий інтерфейс, що й офлайн. Повтор після обриву мережі йде з тим самим stepId,
 * тож сервер не спише ставку вдруге. Якщо сервер недоступний на старті, гра переходить в офлайн-демо.
 */
import type { JurisdictionId } from '@slotkit/rules';
import { applyStroke, expectedAction } from '../engine/engine';
import type { EngineState, Spots, StepRequest, StepResult } from '../shared/types';
import type { ResultSource } from './source';

const PLAYER_KEY = 'petrykivka-bloom:player';
const PLAYER_ID = /^[A-Za-z0-9_-]{8,64}$/;

interface Snapshot {
  balance: number;
  round: EngineState['round'];
  lastGrid: EngineState['lastGrid'];
}

export class RemoteError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Рівні клітинок після кроку: остання сітка каскадів або, якщо каскадів не було, бутони від «Мазка». */
export function spotsAfter(res: StepResult): Spots {
  const last = res.tumbles.at(-1);
  if (last) return last.spots.slice();
  const s = res.spotsBefore.slice();
  if (res.stroke) applyStroke(s, res.stroke);
  return s;
}

export class RemoteSource implements ResultSource {
  state: EngineState = { balance: 0, roundSeq: 0, round: null, lastGrid: [] };
  private token = '';
  private seq = 0;
  /** Крок, на який не прийшла відповідь: повтор того самого запиту піде з тим самим stepId. */
  private pending: { key: string; stepId: string } | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly jurisdiction: JurisdictionId,
    private readonly timeoutMs = 8000,
  ) {}

  get next() {
    return expectedAction(this.state);
  }

  /** Сесія: ідентифікатор гравця демо живе в браузері, тож баланс і незавершений бонус переживають перезавантаження. */
  async connect(): Promise<void> {
    let playerId = localStorage.getItem(PLAYER_KEY);
    if (!playerId || !PLAYER_ID.test(playerId)) {
      playerId = `p-${crypto.randomUUID().replace(/-/g, '')}`;
      localStorage.setItem(PLAYER_KEY, playerId);
    }
    const res = await this.request<{ token: string; snapshot: Snapshot }>('POST', '/launch', { playerId, jurisdiction: this.jurisdiction }, false);
    this.token = res.token;
    this.apply(res.snapshot);
  }

  async play(req: Omit<StepRequest, 'stepId'>): Promise<StepResult> {
    const key = JSON.stringify(req);
    const stepId = this.pending?.key === key ? this.pending.stepId : `R${Date.now().toString(36)}${(this.seq++).toString(36)}`;
    this.pending = { key, stepId };
    const res = await this.request<StepResult>('POST', '/play', { ...req, stepId }, true);
    this.pending = null;
    this.state = {
      balance: res.balanceAfter,
      roundSeq: this.state.roundSeq,
      lastGrid: res.finalGrid,
      round:
        res.next === 'freeSpin'
          ? {
              id: res.roundId,
              bet: res.bet,
              ante: res.ante,
              bought: res.bought,
              win: res.roundWin,
              fs: { left: res.freeSpinsLeft, total: res.freeSpinsTotal, win: res.fsWin, spots: res.mode === 'free' ? spotsAfter(res) : new Array(49).fill(0), stroked: res.mode === 'free' },
            }
          : null,
    };
    return res;
  }

  async topUp(): Promise<void> {
    this.apply(await this.request<Snapshot>('POST', '/topup', undefined, false));
  }

  private apply(s: Snapshot): void {
    this.state = { balance: s.balance, roundSeq: this.state.roundSeq, round: s.round, lastGrid: s.lastGrid };
  }

  /**
   * Запит із тайм-аутом. Крок гри (`retry`) повторюється до трьох разів із тим самим тілом —
   * сервер ідемпотентний за stepId. Помилки правил (402, 409…) не повторюються.
   */
  private async request<T>(method: 'GET' | 'POST', path: string, body: object | undefined, retry: boolean): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/petrykivka-bloom${path}`;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new RemoteError((data as { code?: string }).code ?? 'NETWORK', (data as { message?: string }).message ?? r.statusText);
        return data as T;
      } catch (e) {
        if (e instanceof RemoteError) throw e;
        lastErr = e;
        await new Promise((res) => window.setTimeout(res, 400 * (attempt + 1)));
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw new RemoteError('NETWORK', lastErr instanceof Error ? lastErr.message : 'Network error');
  }
}
