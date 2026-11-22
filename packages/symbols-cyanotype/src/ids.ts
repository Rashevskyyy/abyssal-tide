/**
 * Набір символів паку: чотири руни, три старші, Wild, Scatter і бонусні (перлини, мушля, медальйони).
 * Ідентифікатори збігаються з грою Abyssal Tide; інша гра може взяти пак, якщо її набір такий самий,
 * або зробити власний пак за тим самим інтерфейсом SymbolPack.
 */
export const CYANOTYPE_IDS = [
  'R1', 'R2', 'R3', 'R4',
  'COMPASS', 'HELMET', 'NAUTILUS',
  'WILD', 'MAP',
  'PEARL', 'BLACK', 'SHELL',
  'JP1', 'JP2', 'JP3', 'JP4',
] as const;

export type CyanotypeId = (typeof CYANOTYPE_IDS)[number];
/** Картинки паку: символи + відкрита мушля (кадр розкриття). */
export type CyanotypeArt = CyanotypeId | 'SHELL_OPEN';

export const CYANOTYPE_NAMES: Record<CyanotypeId, string> = {
  R1: 'Trident rune', R2: 'Wave rune', R3: 'Eye rune', R4: 'Anchor rune',
  COMPASS: 'Compass', HELMET: 'Diving helmet', NAUTILUS: 'Nautilus',
  WILD: 'Lantern (Wild)', MAP: 'Map (Scatter)',
  PEARL: 'Pearl', BLACK: 'Black pearl (Super)', SHELL: 'Sealed shell',
  JP1: 'Shoal', JP2: 'Reef', JP3: 'Trench', JP4: 'Abyss',
};
