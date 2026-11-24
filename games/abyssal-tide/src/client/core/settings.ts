import { runtime, SPEED_PROFILES, type Speed, type SpeedProfile } from '@slotkit/core';
import { DEFAULT_AUTO, type AutoConfig } from '@slotkit/controls';
import { BETS, DEFAULT_BET } from '../../shared/config';
import { isJurisdictionId, resolveJurisdiction, type Jurisdiction, type JurisdictionId } from '../../shared/jurisdiction';

export type { Speed } from '@slotkit/core';
export type Lang = 'en' | 'uk';
/** Таймінги поточної швидкості (GDD §4) — спільні з пакетами через runtime. */
export type Profile = SpeedProfile;
export const PROFILES = SPEED_PROFILES;
export { DEFAULT_AUTO, type AutoConfig };

export interface Prefs {
  speed: Speed;
  bet: number;
  music: number; // 0..1
  sfx: number;
  muted: boolean;
  motion: 'system' | 'reduced' | 'full';
  lang: Lang;
  netFail: boolean;
  debug: boolean;
  /** Стартовий екран з фічами (як у 3 Oaks), з галочкою «не показувати». */
  startScreen: boolean;
  auto: AutoConfig;
  /** Ринок для демо; параметр запуску ?jurisdiction= має пріоритет. */
  jurisdiction: JurisdictionId;
}

const KEY = 'abyssal-tide/prefs/v3';

const DEFAULTS: Prefs = {
  speed: 'normal',
  bet: DEFAULT_BET,
  music: 0.55,
  sfx: 0.8,
  muted: false,
  motion: 'system',
  lang: navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en',
  netFail: false,
  debug: false,
  startScreen: true,
  auto: DEFAULT_AUTO,
  jurisdiction: 'default',
};

type Listener = (p: Prefs) => void;

class Settings {
  prefs: Prefs;
  readonly jurisdiction: Jurisdiction;
  private listeners = new Set<Listener>();
  private readonly mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  constructor() {
    let stored: Partial<Prefs> = {};
    try {
      stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    } catch {
      /* без збережених налаштувань */
    }
    this.prefs = { ...DEFAULTS, ...stored };
    if (!BETS.includes(this.prefs.bet)) this.prefs.bet = DEFAULT_BET;
    if (!isJurisdictionId(this.prefs.jurisdiction)) this.prefs.jurisdiction = 'default';
    // юрисдикція фіксується на запуск, як параметр від оператора; зміна в налаштуваннях — з перезавантаженням
    this.jurisdiction = resolveJurisdiction(typeof location === 'undefined' ? '' : location.search, this.prefs.jurisdiction);
    this.mq?.addEventListener?.('change', () => this.emit());
    this.syncRuntime();
  }

  private holdTurbo_ = false;

  /** Поки «Спін» затиснутий — турбо, незалежно від обраної швидкості (як у 3 Oaks). */
  get holdTurbo(): boolean {
    return this.holdTurbo_;
  }

  set holdTurbo(on: boolean) {
    this.holdTurbo_ = on && this.jurisdiction.allowSpeedUp;
    this.syncRuntime();
  }

  /** Пакети (барабани, анімації символів) читають швидкість і зменшений рух із runtime. */
  private syncRuntime(): void {
    runtime.profile = this.profile;
    runtime.reducedMotion = this.reducedMotion;
  }

  get profile(): Profile {
    if (!this.jurisdiction.allowSpeedUp) return PROFILES.normal; // UKGC: без quick і turbo
    return PROFILES[this.holdTurbo ? 'turbo' : this.prefs.speed];
  }

  get reducedMotion(): boolean {
    if (this.prefs.motion === 'reduced') return true;
    if (this.prefs.motion === 'full') return false;
    return this.mq?.matches ?? false;
  }

  set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs = { ...this.prefs, [key]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* сховище недоступне */
    }
    this.emit();
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.syncRuntime();
    for (const l of this.listeners) l(this.prefs);
  }
}

export const settings = new Settings();
