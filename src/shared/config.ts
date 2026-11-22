/** Лінії з GDD §2: номери рядів 1..3 згори вниз для кожного з п’яти барабанів. */
const LINE_SPEC = `
11111 22222 33333 12321 32123
11211 33233 22122 22322 12221
32223 21112 23332 12121 32323
21212 23232 11233 33211 12233
32211 12333 32111 11123 33321
`;

export const LINES: readonly (readonly number[])[] = LINE_SPEC.trim()
  .split(/\s+/)
  .map((spec) => spec.split('').map((d) => Number(d) - 1));

/**
 * Гроші зберігаються цілими центами EUR — без дробових похибок, як на реальному сервері.
 * Рівні ставок — як у слотах 3 Oaks (Sun of Egypt 3: від €0.25 до €50). Ставки GDD «1, 2, 5, 10»
 * входять у список як €1 / €2 / €5 / €10, а стартові 1000 кредитів GDD = €1 000.00.
 * Усі виплати — кратні ставки, тож суми завжди в цілих центах.
 */
export const CURRENCY = 'EUR';
export const BETS: readonly number[] = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 5000];
export const DEFAULT_BET = 100;
export const START_BALANCE = 100_000;
export const TOP_UP_AMOUNT = 100_000;

export const FREE_DIVES_AWARD = 8;
export const SCATTER_REELS = [1, 2, 3] as const; // барабани 2–4
export const SCATTERS_TO_TRIGGER = 3;
export const SALVAGE_TRIGGER = 6;
export const RESPINS = 3;
export const BIG_WIN_X = 20;
export const MEGA_WIN_X = 50;
export const EPIC_WIN_X = 100;

/**
 * 3 Pots (як у слотах 3 Oaks): перлини на барабанах бази інколи несуть кольорову мітку,
 * мітка летить у свою банку. Повна банка вмикає модифікатор у найближчому Salvage і спорожнюється.
 * Банки зберігаються між спінами окремо для кожної ставки.
 */
export const POT_IDS = ['extra', 'boost', 'multi'] as const;
export const POT_SIZE = 30;
/** Extra: стільки респінів (замість RESPINS) і до стількох лічильник повертається після нової перлини. */
export const RESPINS_EXTRA = 4;

/**
 * Правила, які оператор чи юрисдикція можуть змінити без зміни математики:
 * максимальний виграш за раунд у ставках. Досягнувши його, раунд одразу закінчується,
 * а решта фіч (Free Dives, Salvage) згорає — так зазвичай пишуть у правилах слотів.
 */
export interface GameRules {
  maxWinX: number;
}
export const DEFAULT_RULES: GameRules = { maxWinX: 5000 };
