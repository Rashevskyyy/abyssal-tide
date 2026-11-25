/**
 * Графіка гри малюється кодом на Canvas 2D, як і в Abyssal Tide: символи складені з мазків
 * петриківського розпису (зернятко, гребінчик, кучерик), тож у репозиторії немає файлів картинок.
 * Кожен символ має власний силует, а не лише колір.
 */
import { Texture } from 'pixi.js';
import type { SymbolId } from '../shared/symbols';

export const PALETTE = {
  lacquer: '#16120E',
  lacquerHi: '#2A221B',
  red: '#D7261E',
  redDeep: '#9E1712',
  ochre: '#F2B630',
  ochreDeep: '#C98A12',
  green: '#3F8F3A',
  greenDeep: '#24602A',
  cobalt: '#2457A6',
  cobaltDeep: '#163A75',
  cream: '#F5EFE3',
} as const;

const S = 160; // розмір полотна символу

export function canvas(w = S, h = S): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/**
 * Зернятко — основний мазок розпису: кругла «голівка» й гострий хвіст.
 * `bend` вигинає хвіст убік (у частках довжини), як рух пензля.
 */
export function seed(
  g: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  tx: number,
  ty: number,
  r: number,
  color: string,
  bend = 0,
  shine = true,
): void {
  const dx = tx - hx;
  const dy = ty - hy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const bx = nx * len * bend;
  const by = ny * len * bend;
  const a = Math.atan2(ny, nx);
  g.beginPath();
  g.moveTo(hx + nx * r, hy + ny * r);
  g.quadraticCurveTo(hx + nx * r * 0.9 + ux * len * 0.55 + bx, hy + ny * r * 0.9 + uy * len * 0.55 + by, tx, ty);
  g.quadraticCurveTo(hx - nx * r * 0.7 + ux * len * 0.5 + bx, hy - ny * r * 0.7 + uy * len * 0.5 + by, hx - nx * r, hy - ny * r);
  g.arc(hx, hy, r, a + Math.PI, a, true); // голівка — з боку, протилежного хвосту
  g.closePath();
  g.fillStyle = color;
  g.fill();
  if (shine) {
    // світлий відблиск на голівці — так пензель лишає слід, набравши дві фарби
    g.beginPath();
    g.ellipse(hx - ux * r * 0.25 + nx * r * 0.3, hy - uy * r * 0.25 + ny * r * 0.3, r * 0.38, r * 0.2, Math.atan2(uy, ux), 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
  }
}

export function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

const P = PALETTE;

const DRAW: Record<SymbolId, (g: CanvasRenderingContext2D) => void> = {
  // Півень: компактний, стоїть, гребінь і серпасті пера хвоста вгору
  ROOSTER(g) {
    seed(g, 92, 64, 132, 26, 10, P.green, -0.25);
    seed(g, 96, 72, 146, 52, 9, P.cobalt, -0.2);
    seed(g, 98, 80, 144, 84, 8, P.ochre, -0.15);
    seed(g, 74, 92, 104, 70, 34, P.red, 0.1);
    dot(g, 52, 56, 18, P.red);
    dot(g, 42, 34, 7, P.ochre);
    dot(g, 52, 30, 7, P.ochre);
    dot(g, 62, 34, 7, P.ochre);
    seed(g, 36, 58, 22, 64, 5, P.ochre, 0, false);
    dot(g, 50, 52, 3.5, P.lacquer);
    seed(g, 64, 118, 52, 140, 5, P.ochre, 0.1, false);
    seed(g, 84, 118, 92, 142, 5, P.ochre, -0.1, false);
  },
  // Жар-птиця: горизонтальна, з довгим хвостом, що тягнеться вниз-праворуч
  FIREBIRD(g) {
    seed(g, 78, 82, 150, 140, 9, P.red, 0.25);
    seed(g, 80, 86, 140, 150, 8, P.cobalt, 0.15);
    seed(g, 82, 88, 120, 154, 7, P.green, 0.05);
    seed(g, 62, 78, 104, 92, 26, P.ochre, -0.1);
    dot(g, 44, 54, 13, P.ochre);
    seed(g, 44, 44, 52, 16, 4, P.red, 0.2, false);
    seed(g, 40, 46, 30, 20, 4, P.red, -0.2, false);
    seed(g, 34, 58, 18, 62, 4, P.red, 0, false);
    dot(g, 42, 52, 3, P.lacquer);
    seed(g, 70, 70, 96, 46, 10, P.red, -0.2);
  },
  // Калина: грона ягід із листям
  KALYNA(g) {
    seed(g, 80, 38, 128, 20, 12, P.green, -0.2);
    seed(g, 76, 40, 30, 24, 11, P.green, 0.2);
    const berries: [number, number][] = [
      [62, 66], [86, 64], [74, 86], [98, 86], [50, 88], [86, 108], [62, 108], [110, 108], [74, 128], [98, 128],
    ];
    for (const [x, y] of berries) {
      dot(g, x, y, 13, P.redDeep);
      dot(g, x - 1, y - 1, 11.5, P.red);
      dot(g, x - 4, y - 5, 3.2, 'rgba(255,255,255,0.75)');
    }
  },
  // Мальва: велика квітка з п’яти круглих пелюсток
  MALLOW(g) {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      dot(g, 80 + Math.cos(a) * 34, 80 + Math.sin(a) * 34, 30, P.redDeep);
      dot(g, 80 + Math.cos(a) * 32, 80 + Math.sin(a) * 32, 26, P.red);
    }
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + Math.PI / 5 + (k * 2 * Math.PI) / 5;
      seed(g, 80 + Math.cos(a) * 18, 80 + Math.sin(a) * 18, 80 + Math.cos(a) * 52, 80 + Math.sin(a) * 52, 4.5, P.ochre, 0, false);
    }
    dot(g, 80, 80, 17, P.ochre);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      dot(g, 80 + Math.cos(a) * 9, 80 + Math.sin(a) * 9, 2.6, P.redDeep);
    }
  },
  // Зернятко: три мазки віялом, як паросток
  SEED(g) {
    seed(g, 80, 120, 80, 30, 18, P.ochre, 0);
    seed(g, 70, 124, 30, 60, 14, P.ochre, -0.15);
    seed(g, 90, 124, 130, 60, 14, P.ochre, 0.15);
    dot(g, 80, 136, 6, P.redDeep);
  },
  // Гребінчик: ряд мазків на дузі, як зубці гребінця
  COMB(g) {
    for (let k = 0; k < 6; k++) {
      const x = 28 + k * 21;
      const y = 112 - Math.sin((k / 5) * Math.PI) * 18;
      seed(g, x, y, x + 10, y - 62 + Math.abs(k - 2.5) * 6, 9, P.cobalt, 0.12);
    }
    seed(g, 20, 122, 142, 118, 7, P.cobaltDeep, -0.08, false);
  },
  // Кучерик: спіраль із мазків, що меншають до центру
  CURL(g) {
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const a = Math.PI * 0.15 + k * 0.78;
      const rad = 62 - k * 6.4;
      const x = 80 + Math.cos(a) * rad;
      const y = 82 + Math.sin(a) * rad;
      const a2 = a + 0.75;
      const r2 = rad - 6;
      seed(g, x, y, 80 + Math.cos(a2) * r2, 82 + Math.sin(a2) * r2, 16 - k * 1.3, k % 2 ? P.red : P.redDeep, 0.3, k < 5);
    }
    dot(g, 80, 82, 9, P.ochre);
  },
  // Листок: один великий мазок із прожилкою
  LEAF(g) {
    seed(g, 44, 120, 128, 30, 26, P.green, -0.12);
    g.strokeStyle = P.greenDeep;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(44, 120);
    g.quadraticCurveTo(86, 86, 120, 40);
    g.stroke();
    seed(g, 46, 122, 30, 144, 5, P.greenDeep, 0, false);
  },
  // Розписна тарілка — scatter
  PLATE(g) {
    dot(g, 80, 80, 70, P.cream);
    dot(g, 80, 80, 62, P.lacquer);
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      dot(g, 80 + Math.cos(a) * 66, 80 + Math.sin(a) * 66, 2.8, k % 2 ? P.red : P.ochre);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      seed(g, 80 + Math.cos(a) * 22, 80 + Math.sin(a) * 22, 80 + Math.cos(a) * 54, 80 + Math.sin(a) * 54, 7, k % 2 ? P.ochre : P.green, 0.18);
    }
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      dot(g, 80 + Math.cos(a) * 12, 80 + Math.sin(a) * 12, 10, P.red);
    }
    dot(g, 80, 80, 7, P.ochre);
  },
};

export interface Art {
  symbols: Record<SymbolId, Texture>;
  /** Ті самі символи як data URL — для таблиці виплат. */
  symbolUrls: Record<SymbolId, string>;
  bud: Texture;
  flower: Texture;
  petal: Texture;
  /** Мазок пензля для «Мазка»: голівка ліворуч, гострий хвіст праворуч. */
  brush: Texture;
  cell: Texture;
}

function symbol(id: SymbolId): HTMLCanvasElement {
  const [c, g] = canvas();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 6;
  g.shadowOffsetY = 3;
  DRAW[id](g);
  return c;
}

function bud(): HTMLCanvasElement {
  const [c, g] = canvas(64, 64);
  seed(g, 32, 50, 22, 12, 9, P.green, -0.15);
  seed(g, 32, 50, 42, 12, 9, P.greenDeep, 0.15);
  seed(g, 32, 46, 32, 20, 6, P.red, 0, false);
  return c;
}

/** Квітка під символом: розетка пелюсток. Розмір і яскравість задає рівень (у BoardView). */
function flower(): HTMLCanvasElement {
  const [c, g] = canvas(S, S);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    seed(g, 80 + Math.cos(a) * 14, 80 + Math.sin(a) * 14, 80 + Math.cos(a) * 76, 80 + Math.sin(a) * 76, 16, k % 2 ? P.ochreDeep : P.redDeep, 0.12, false);
  }
  dot(g, 80, 80, 20, P.ochreDeep);
  return c;
}

function petal(): HTMLCanvasElement {
  const [c, g] = canvas(32, 32);
  seed(g, 10, 16, 30, 16, 7, '#ffffff', 0.1, false);
  return c;
}

function brush(): HTMLCanvasElement {
  const [c, g] = canvas(512, 64);
  seed(g, 34, 32, 506, 32, 26, P.red, 0, false);
  const grad = g.createLinearGradient(0, 8, 0, 56);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 64);
  return c;
}

function cell(): HTMLCanvasElement {
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(80, 70, 10, 80, 80, 100);
  grad.addColorStop(0, P.lacquerHi);
  grad.addColorStop(1, P.lacquer);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(4, 4, S - 8, S - 8, 18);
  g.fill();
  g.strokeStyle = 'rgba(245,239,227,0.07)';
  g.lineWidth = 2;
  g.stroke();
  return c;
}

export function buildArt(): Art {
  const ids: SymbolId[] = ['ROOSTER', 'FIREBIRD', 'KALYNA', 'MALLOW', 'SEED', 'COMB', 'CURL', 'LEAF', 'PLATE'];
  const symbols = {} as Record<SymbolId, Texture>;
  const symbolUrls = {} as Record<SymbolId, string>;
  for (const id of ids) {
    const c = symbol(id);
    symbols[id] = Texture.from(c);
    symbolUrls[id] = c.toDataURL();
  }
  return {
    symbols,
    symbolUrls,
    bud: Texture.from(bud()),
    flower: Texture.from(flower()),
    petal: Texture.from(petal()),
    brush: Texture.from(brush()),
    cell: Texture.from(cell()),
  };
}
