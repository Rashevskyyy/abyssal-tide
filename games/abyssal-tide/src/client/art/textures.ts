import { Texture } from 'pixi.js';
import { loadCyanotypeAtlasPack, loadDiverSkeleton, PAPER, type CyanotypeArt, type CyanotypePack } from '@slotkit/symbols-cyanotype';
import type { SkeletonData } from '@esotericsoftware/spine-pixi-v8';
import type { SymbolId } from '../../shared/symbols';
import { FONT_STENCIL } from '../core/fonts';

/**
 * Растеризація графіки сцени. Стиль — ціанотипія: синій папір із зерном і плямами проявки,
 * паспарту навколо поля. Символи й ефекти символів дає пак @slotkit/symbols-cyanotype.
 * Усе генерується в коді, без файлів зображень.
 */

export type ArtId = CyanotypeArt;
// пак символів має покривати весь набір символів гри
const _packCoversGame: SymbolId extends CyanotypeArt ? true : never = true;
void _packCoversGame;

export interface SymbolTextures {
  normal: Texture;
  blur: Texture;
}

export interface Art {
  /** Пак символів для поля (@slotkit/board). */
  pack: CyanotypePack;
  symbols: Record<ArtId, SymbolTextures>;
  fx: {
    bubble: Texture;
    dot: Texture;
    ring: Texture;
    socket: Texture;
    algae: Texture;
    fish: Texture;
    wave: Texture;
    grain: Texture;
  };
  env: { surface: Texture; route: Texture; seabed: Texture };
  sheet: Texture;
  frame: Texture;
  logo: Texture;
  /** Те саме зображення символу як data URL — для таблиці виплат у DOM. */
  previews: Record<ArtId, string>;
  /** Скелет Spine персонажа великого виграшу. */
  diver: SkeletonData;
}

export const FIELD = { cellW: 172, cellH: 160, cols: 5, rows: 3 } as const;
export const FRAME_PAD = 34;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}


/** Псевдовипадкові числа з сидом — щоб папір був однаковим між запусками. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Зерно паперу: додає шум яскравості до вже намальованого. */
function grainify(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const rnd = seeded(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 1.1;
  }
  ctx.putImageData(img, 0, 0);
}



function bubble(): HTMLCanvasElement {
  // бульбашка у фотограмі — тонке біле кільце з яскравою точкою
  const [c, ctx] = canvas(64, 64);
  ctx.strokeStyle = 'rgba(244,248,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(244,248,255,0.9)';
  ctx.beginPath();
  ctx.arc(22, 22, 4, 0, Math.PI * 2);
  ctx.fill();
  return c;
}


function socket(): HTMLCanvasElement {
  // порожня клітина Salvage — пунктирний контур «місця для зразка»
  const [c, ctx] = canvas(256, 240);
  ctx.fillStyle = 'rgba(244,248,255,0.05)';
  roundRect(ctx, 16, 16, 224, 208, 22);
  ctx.fill();
  ctx.setLineDash([10, 9]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(244,248,255,0.42)';
  roundRect(ctx, 16, 16, 224, 208, 22);
  ctx.stroke();
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Водорость у дусі альбому Анни Аткінс: розгалужені пір’ясті гілки. */
function algae(): HTMLCanvasElement {
  const [c, ctx] = canvas(384, 768);
  const rnd = seeded(1843);
  ctx.strokeStyle = PAPER;
  ctx.fillStyle = PAPER;
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number) => {
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    const bend = (rnd() - 0.5) * len * 0.5;
    const mx = (x + ex) / 2 + Math.cos(angle + Math.PI / 2) * bend;
    const my = (y + ey) / 2 + Math.sin(angle + Math.PI / 2) * bend;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    if (depth <= 0) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, width * 2.2, width * 1.2, angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const kids = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < kids; i++) {
      const t = 0.45 + rnd() * 0.55;
      const qx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * ex;
      const qy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ey;
      const side = i % 2 === 0 ? 1 : -1;
      branch(qx, qy, angle + side * (0.35 + rnd() * 0.45), len * (0.5 + rnd() * 0.2), Math.max(1, width * 0.62), depth - 1);
    }
  };
  branch(192, 760, -Math.PI / 2, 260, 9, 5);
  branch(150, 760, -Math.PI / 2 - 0.25, 200, 6, 4);
  return c;
}

function fish(): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(10, 32);
  ctx.quadraticCurveTo(50, 6, 92, 28);
  ctx.lineTo(120, 12);
  ctx.lineTo(112, 32);
  ctx.lineTo(120, 52);
  ctx.lineTo(92, 36);
  ctx.quadraticCurveTo(50, 58, 10, 32);
  ctx.fill();
  return c;
}

function wave(): HTMLCanvasElement {
  // «засвітка» під час переходу: м’яка біла смуга без жорстких країв
  const [c, ctx] = canvas(512, 256);
  ctx.translate(256, 128);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 256);
  g.addColorStop(0, 'rgba(244,248,255,0.55)');
  g.addColorStop(0.4, 'rgba(244,248,255,0.2)');
  g.addColorStop(1, 'rgba(244,248,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-256, -256, 512, 512);
  return c;
}

/** Плитка зерна для накладання поверх усієї сцени (робить «друк» живим). */
function grainTile(): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 256);
  const rnd = seeded(77);
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(rnd() * 22);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Синій папір: експозиція згори вниз, плями проявки, волокна, зерно. */
function cyanoPaper(top: string, bottom: string, seed: number, extra?: (ctx: CanvasRenderingContext2D, rnd: () => number) => void): HTMLCanvasElement {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const rnd = seeded(seed);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 80 + rnd() * 260;
    const light = rnd() < 0.5;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, light ? `rgba(200,220,255,${0.04 + rnd() * 0.05})` : `rgba(3,14,40,${0.08 + rnd() * 0.1})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // мазки пензля, яким наносили розчин
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = PAPER;
  for (let i = 0; i < 18; i++) {
    const y = rnd() * S;
    ctx.lineWidth = 20 + rnd() * 60;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 80, S * 0.7, y + (rnd() - 0.5) * 80, S + 40, y + (rnd() - 0.5) * 60);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  extra?.(ctx, rnd);
  // темніші краї (переекспоновані поля аркуша)
  const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(2,10,30,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, S, S);
  grainify(ctx, S, S, 22, seed + 1);
  return c;
}

function envSurface(): HTMLCanvasElement {
  return cyanoPaper('#2F69B8', '#14427F', 101, (ctx, rnd) => {
    // брижі поверхні — світлі хвилясті лінії вгорі
    ctx.strokeStyle = 'rgba(244,248,255,0.14)';
    for (let i = 0; i < 9; i++) {
      const y = 30 + i * 18 + rnd() * 6;
      ctx.lineWidth = 2 + rnd() * 2;
      ctx.beginPath();
      for (let x = -20; x <= 1044; x += 16) ctx.lineTo(x, y + Math.sin(x / (40 + i * 6) + i) * 5);
      ctx.stroke();
    }
  });
}

function envRoute(): HTMLCanvasElement {
  return cyanoPaper('#1F579F', '#0F3370', 202, (ctx, rnd) => {
    ctx.setLineDash([16, 14]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(244,248,255,0.24)';
    ctx.beginPath();
    ctx.moveTo(-20, 760);
    ctx.bezierCurveTo(240, 520, 420, 900, 620, 640);
    ctx.bezierCurveTo(780, 430, 900, 560, 1060, 300);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(244,248,255,0.16)';
    // глибинні ізолінії
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      const y0 = 140 + k * 140;
      for (let x = -20; x <= 1044; x += 20) ctx.lineTo(x, y0 + Math.sin(x / 130 + k) * 36 + Math.sin(x / 47) * 8);
      ctx.stroke();
    }
    void rnd;
  });
}

function envSeabed(): HTMLCanvasElement {
  return cyanoPaper('#123A7C', '#061A40', 303, (ctx) => {
    ctx.fillStyle = 'rgba(244,248,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(560, 860);
    ctx.lineTo(600, 740);
    ctx.quadraticCurveTo(760, 700, 960, 760);
    ctx.lineTo(1000, 880);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(700, 520, 10, 230);
    ctx.save();
    ctx.translate(705, 540);
    ctx.rotate(0.35);
    ctx.fillRect(-90, 0, 180, 7);
    ctx.restore();
    ctx.strokeStyle = 'rgba(244,248,255,0.12)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 8; k++) {
      ctx.beginPath();
      const y0 = 860 + k * 22;
      for (let x = -20; x <= 1044; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 60 + k * 1.3) * 6);
      ctx.stroke();
    }
  });
}

/** Аркуш ціанотипії під барабанами — трохи інший тон, щоб поле читалося як предмет. */
function sheet(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1E559F');
  g.addColorStop(1, '#14417F');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(9);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 60 + rnd() * 180;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, rnd() < 0.5 ? 'rgba(210,228,255,0.06)' : 'rgba(3,14,40,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grainify(ctx, w, h, 26, 10);
  return c;
}

/** Паспарту: світлий картон із вікном, куточками для кріплення й тиснутим краєм. */
function mat(w: number, h: number, pad: number): HTMLCanvasElement {
  const k = 2;
  const [c, ctx] = canvas(w * k, h * k);
  ctx.scale(k, k);
  ctx.fillStyle = '#E9EEF4';
  roundRect(ctx, 0, 0, w, h, 6);
  ctx.fill();
  // вікно
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.globalCompositeOperation = 'source-over';
  // скіс вікна
  ctx.strokeStyle = '#C3CEDC';
  ctx.lineWidth = 3;
  ctx.strokeRect(pad - 1.5, pad - 1.5, w - pad * 2 + 3, h - pad * 2 + 3);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad - 4, pad - 4, w - pad * 2 + 8, h - pad * 2 + 8);
  // куточки кріплення
  ctx.fillStyle = '#D3DCE8';
  const corner = (x: number, y: number, sx: number, sy: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 30 * sx, y);
    ctx.lineTo(x, y + 30 * sy);
    ctx.closePath();
    ctx.fill();
  };
  corner(pad, pad, 1, 1);
  corner(w - pad, pad, -1, 1);
  corner(pad, h - pad, 1, -1);
  corner(w - pad, h - pad, -1, -1);
  // зовнішня тінь краю
  ctx.strokeStyle = 'rgba(16,53,122,0.25)';
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, w - 2, h - 2, 6);
  ctx.stroke();
  const img = ctx.getImageData(0, 0, w * k, h * k);
  const rnd = seeded(5);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const n = (rnd() - 0.5) * 12;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Логотип — трафаретні літери, «відбиті» на папері: біле із засвіткою та зерном. */
function logoTexture(): HTMLCanvasElement {
  const [c, ctx] = canvas(1400, 240);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 168px ${FONT_STENCIL}`;
  ctx.letterSpacing = '6px';
  ctx.shadowColor = 'rgba(244,248,255,0.55)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = PAPER;
  ctx.fillText('ABYSSAL TIDE', 700, 124);
  ctx.shadowBlur = 0;
  ctx.fillText('ABYSSAL TIDE', 700, 124);
  // зерно в білому
  const img = ctx.getImageData(0, 0, 1400, 240);
  const rnd = seeded(42);
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] > 0) img.data[i] = Math.max(0, img.data[i] - Math.floor(rnd() * 70));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function buildArt(): Promise<Art> {
  // символи — з готового атласу (AssetPack); «Водолаз» великого виграшу — Spine
  const [pack, diver] = await Promise.all([loadCyanotypeAtlasPack(), loadDiverSkeleton()]);
  const fw = FIELD.cellW * FIELD.cols + FRAME_PAD * 2;
  const fh = FIELD.cellH * FIELD.rows + FRAME_PAD * 2;
  return {
    pack,
    symbols: pack.textures,
    previews: pack.previews,
    fx: {
      bubble: Texture.from(bubble()),
      dot: pack.fx.dot,
      ring: pack.fx.ring,
      socket: Texture.from(socket()),
      algae: Texture.from(algae()),
      fish: Texture.from(fish()),
      wave: Texture.from(wave()),
      grain: Texture.from(grainTile()),
    },
    env: { surface: Texture.from(envSurface()), route: Texture.from(envRoute()), seabed: Texture.from(envSeabed()) },
    sheet: Texture.from(sheet(FIELD.cellW * FIELD.cols, FIELD.cellH * FIELD.rows)),
    frame: Texture.from(mat(fw, fh, FRAME_PAD)),
    logo: Texture.from(logoTexture()),
    diver,
  };
}
