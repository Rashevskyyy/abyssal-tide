import type { Texture } from 'pixi.js';
import type { SymbolView } from './SymbolView';

/** Мінімальна клітина поля: ідентифікатор символу. Гра розширює її своїми полями (номінал, мітки). */
export interface BoardCell<Id extends string = string> {
  s: Id;
}

/**
 * Пресети анімації виграшу. Пак символів призначає кожному символу свій характер руху:
 * pulse — пульс, swing — коливання (компас), float — спливання (шолом), roll — перекочування,
 * flicker — мерехтіння (ліхтар), unfold — розгортання (карта), soft — стриманий пульс бонусних.
 */
export type MotionPreset = 'pulse' | 'swing' | 'float' | 'roll' | 'flicker' | 'unfold' | 'soft';

/** Пак символів: текстури й характер анімацій. Новий стиль гри — новий пак, поле не змінюється. */
export interface SymbolPack<Id extends string = string> {
  /** Розмір символу в клітині, px. */
  readonly size: number;
  /** Звичайна й «змазана» (для обертання) текстури. */
  texture(id: Id, blurred: boolean): Texture;
  motion(id: Id): MotionPreset;
  /** Бонусні символи: стриманіший «поп» і хвиля-кільце на посадці. */
  isBonus(id: Id): boolean;
  /** Колір ореолу символу (за замовчуванням білий). */
  glow?(id: Id): number;
  /** Текстури ефектів: м’яка пляма для ореолу й кільце для хвилі. */
  readonly fx: { dot: Texture; ring: Texture };
}

export interface BoardConfig<Id extends string, C extends BoardCell<Id>, V extends SymbolView<Id, C>> {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  /** Стрічки, з яких беруться символи під час обертання, — за режимом гри. */
  strips: Record<string, readonly (readonly Id[])[]>;
  /** Клітина-заповнювач для символу стрічки (наприклад, перлині — випадковий номінал). */
  filler?(id: Id): C;
  /** Фабрика символів: гра може підставити підклас із бирками номіналів чи мітками. */
  createSymbol(): V;
  /** Символи, що лишаються яскравими під час очікування (бонусні). */
  keepBright?(id: Id): boolean;
  /** Колір олівця для дужок очікування. */
  ink?: number;
  /** Колір затемнення барабанів під час очікування. */
  shade?: number;
}

export interface Pos {
  c: number;
  r: number;
}

/** Виграшна лінія для показу: номер лінії, клітини комбінації й сума. */
export interface WinLine {
  line: number;
  positions: Pos[];
  amount: number;
}
