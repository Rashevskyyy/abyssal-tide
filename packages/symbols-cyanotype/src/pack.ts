import { Texture, type Spritesheet } from 'pixi.js';
import type { MotionPreset, SymbolPack } from '@slotkit/board';
import { CYANOTYPE_IDS, type CyanotypeArt, type CyanotypeId } from './ids';
import { CORAL, PAPER, PRUSSIAN, SYMBOL_PLAQUE, symbolSvg } from './svg';

/**
 * Ціанотипний пак символів: SVG-фотограми растеризуються в текстури (звичайна + «змазана» для обертання),
 * плюс характер руху кожного символу й текстури ефектів (ореол, кільце).
 */
export interface CyanotypePack extends SymbolPack<CyanotypeId> {
  /** Текстури за картинкою, включно з кадром відкритої мушлі. */
  readonly textures: Record<CyanotypeArt, { normal: Texture; blur: Texture }>;
  /** Ті самі картинки як data URL — для DOM (таблиця виплат, стартовий екран). */
  readonly previews: Record<CyanotypeArt, string>;
  textureOf(art: CyanotypeArt, blurred: boolean): Texture;
}

export const MOTION: Record<CyanotypeId, MotionPreset> = {
  R1: 'pulse', R2: 'pulse', R3: 'pulse', R4: 'pulse',
  COMPASS: 'swing', HELMET: 'float', NAUTILUS: 'roll',
  WILD: 'flicker', MAP: 'unfold',
  PEARL: 'soft', BLACK: 'soft', SHELL: 'soft', JP1: 'soft', JP2: 'soft', JP3: 'soft', JP4: 'soft',
};

const BONUS = new Set<CyanotypeId>(['PEARL', 'BLACK', 'SHELL', 'JP1', 'JP2', 'JP3', 'JP4']);
const SYMBOL_PX = 320;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

async function loadSvg(svgText: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await img.decode();
  return img;
}

/** Растеризує один символ (звичайна й «змазана» версія) — і для паку в браузері, і для збірки атласу. */
export async function rasterSymbol(id: CyanotypeArt, fonts: PackFonts): Promise<{ normal: HTMLCanvasElement; blur: HTMLCanvasElement }> {
  const img = await loadSvg(symbolSvg(id));
  const [c, ctx] = canvas(SYMBOL_PX, SYMBOL_PX);
  ctx.drawImage(img, 0, 0, SYMBOL_PX, SYMBOL_PX);
  const k = SYMBOL_PX / 200;
  const plaque = id !== 'SHELL_OPEN' ? SYMBOL_PLAQUE[id] : undefined;
  if (plaque) {
    ctx.font = `500 ${plaque.size * k}px ${fonts.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PRUSSIAN;
    ctx.fillText(plaque.text, 106 * k, plaque.y * k + 1);
  }
  if (id === 'SHELL') {
    // мушля запечатана: коралова позначка олівцем
    ctx.font = `900 ${70 * k}px ${fonts.stencil}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6 * k;
    ctx.strokeStyle = PAPER;
    ctx.strokeText('?', 100 * k, 92 * k);
    ctx.fillStyle = CORAL;
    ctx.fillText('?', 100 * k, 92 * k);
  }
  // «змазана» версія для обертання: кілька зсунутих копій по вертикалі
  const [b, bctx] = canvas(SYMBOL_PX, SYMBOL_PX);
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const dy = (i / (steps - 1) - 0.5) * SYMBOL_PX * 0.22;
    bctx.globalAlpha = 0.2;
    bctx.drawImage(c, 0, dy);
  }
  return { normal: c, blur: b };
}

/** М’яка біла пляма — ореол «засвітки». */
export function dotCanvas(): HTMLCanvasElement {
  const size = 64;
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(244,248,255,1)');
  g.addColorStop(0.35, 'rgba(244,248,255,0.45)');
  g.addColorStop(1, 'rgba(244,248,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Тонке світле кільце — хвиля на посадці й виграші. */
export function ringCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 100, 128, 128, 126);
  g.addColorStop(0, 'rgba(244,248,255,0)');
  g.addColorStop(0.55, 'rgba(244,248,255,0.95)');
  g.addColorStop(1, 'rgba(244,248,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

export interface PackFonts {
  /** Шрифт написів на бирках (WILD, SCATTER, SUPER…). Має бути вже завантажений. */
  mono: string;
  /** Шрифт знака «?» на запечатаній мушлі. */
  stencil: string;
}

export async function createCyanotypePack(fonts: PackFonts): Promise<CyanotypePack> {
  const ids: CyanotypeArt[] = [...CYANOTYPE_IDS, 'SHELL_OPEN'];
  const rasters = await Promise.all(ids.map(async (id) => [id, await rasterSymbol(id, fonts)] as const));
  const textures = {} as Record<CyanotypeArt, { normal: Texture; blur: Texture }>;
  const previews = {} as Record<CyanotypeArt, string>;
  for (const [id, r] of rasters) {
    textures[id] = { normal: Texture.from(r.normal), blur: Texture.from(r.blur) };
    previews[id] = r.normal.toDataURL('image/png');
  }
  const textureOf = (art: CyanotypeArt, blurred: boolean) => textures[art][blurred ? 'blur' : 'normal'];
  return {
    size: 178,
    textures,
    previews,
    textureOf,
    texture: (id, blurred) => textureOf(id, blurred),
    motion: (id) => MOTION[id],
    isBonus: (id) => BONUS.has(id),
    glow: () => 0xf4f8ff, // у ціанотипії ореол завжди білий — це «засвітка», а не неон
    fx: { dot: Texture.from(dotCanvas()), ring: Texture.from(ringCanvas()) },
  };
}

/**
 * Той самий пак з готового атласу (збірка: scripts/build-assets.ts → AssetPack).
 * Кадри атласу: `<ID>` і `<ID>_blur`. Мініатюри для DOM вирізаються з картинки атласу.
 */
export function cyanotypePackFromSheet(sheet: Spritesheet, previewSize = 160): CyanotypePack {
  const ids: CyanotypeArt[] = [...CYANOTYPE_IDS, 'SHELL_OPEN'];
  const textures = {} as Record<CyanotypeArt, { normal: Texture; blur: Texture }>;
  const previews = {} as Record<CyanotypeArt, string>;
  for (const id of ids) {
    const normal = sheet.textures[id];
    const blur = sheet.textures[`${id}_blur`];
    if (!normal || !blur) throw new Error(`Atlas has no frame for ${id}`);
    textures[id] = { normal, blur };
    previews[id] = framePreview(normal, previewSize);
  }
  const textureOf = (art: CyanotypeArt, blurred: boolean) => textures[art][blurred ? 'blur' : 'normal'];
  return {
    size: 178,
    textures,
    previews,
    textureOf,
    texture: (id, blurred) => textureOf(id, blurred),
    motion: (id) => MOTION[id],
    isBonus: (id) => BONUS.has(id),
    glow: () => 0xf4f8ff,
    fx: { dot: Texture.from(dotCanvas()), ring: Texture.from(ringCanvas()) },
  };
}

function framePreview(tex: Texture, size: number): string {
  const [c, ctx] = canvas(size, size);
  const f = tex.frame;
  ctx.drawImage(tex.source.resource as CanvasImageSource, f.x, f.y, f.width, f.height, 0, 0, size, size);
  return c.toDataURL('image/png');
}
