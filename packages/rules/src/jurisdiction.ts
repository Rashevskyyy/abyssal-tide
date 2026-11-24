/**
 * Вимоги юрисдикцій до гри. Справжня гра отримує юрисдикцію від оператора в параметрах запуску;
 * демо бере її з `?jurisdiction=` або з налаштувань.
 *
 * `ukgc` — Велика Британія, Remote Technical Standards Gambling Commission:
 * - RTS 14: від старту гри до можливого старту наступної — щонайменше 2,5 с, кожен раунд — окреме натискання;
 * - RTS 14E: заборонені функції, що прискорюють показ результату чи дають ілюзію контролю (turbo, quick spin, slam stop);
 * - RTS 8A/8C: без автогри;
 * - RTS 14F: не святкувати виграш, що не більший за ставку;
 * - RTS 2E, 13C: показувати чистий результат і час сесії;
 * - без купівлі бонусу (попередження Gambling Commission щодо feature buy-in).
 */
import { DEFAULT_RULES, type GameRules } from './rules';

export type JurisdictionId = 'default' | 'ukgc';

export interface Jurisdiction {
  id: JurisdictionId;
  /** Мінімальний ігровий цикл, мс: від старту раунду до можливості почати наступний. */
  minCycleMs: number;
  /** Quick і turbo, утримання «Спін», quick stop барабанів і респінів. */
  allowSpeedUp: boolean;
  allowAutoplay: boolean;
  /** Святкувати (бирка, звук, підсвітка) виграш, що не більший за ставку. */
  celebrateAtOrBelowStake: boolean;
  /** Чистий результат і час сесії в смузі. */
  showSession: boolean;
  /** Нагадування про час гри, хвилин; null — вимкнено. */
  realityCheckMin: number | null;
  /** Купівля бонусу (feature buy). Британським гравцям недоступна. */
  allowBonusBuy: boolean;
  rules: GameRules;
}

export const JURISDICTIONS: Record<JurisdictionId, Jurisdiction> = {
  default: {
    id: 'default',
    minCycleMs: 0,
    allowSpeedUp: true,
    allowAutoplay: true,
    celebrateAtOrBelowStake: true,
    showSession: false,
    realityCheckMin: null,
    allowBonusBuy: true,
    rules: DEFAULT_RULES,
  },
  ukgc: {
    id: 'ukgc',
    minCycleMs: 2500,
    allowSpeedUp: false,
    allowAutoplay: false,
    celebrateAtOrBelowStake: false,
    showSession: true,
    realityCheckMin: 60,
    allowBonusBuy: false,
    rules: DEFAULT_RULES,
  },
};

export const isJurisdictionId = (v: unknown): v is JurisdictionId => v === 'default' || v === 'ukgc';

/**
 * Параметр запуску має пріоритет над налаштуванням гравця (так оператор передає ринок).
 * `rc` — інтервал нагадування в хвилинах, щоб показати його в демо без години очікування.
 */
export function resolveJurisdiction(search: string, pref: JurisdictionId): Jurisdiction {
  const q = new URLSearchParams(search);
  const id = q.get('jurisdiction');
  const base = JURISDICTIONS[isJurisdictionId(id) ? id : pref];
  const rc = Number(q.get('rc'));
  return rc > 0 && base.realityCheckMin !== null ? { ...base, realityCheckMin: rc } : base;
}
