/**
 * Текстури сцени й ефектів, намальовані кодом тими самими мазками, що й символи:
 * гілки розпису на стіні, зерно лаку, м’які плями світла, промені, іскри.
 */
import { Texture } from 'pixi.js';
import { PALETTE as P, canvas, dot, seed } from '../art';

/** Детермінований генератор для малюнка: гілки однакові на кожному завантаженні. */
function prng(seed0: number): () => number {
  let s = seed0 >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Точка на кубічній кривій Безьє. */
function bez(p: number[][], t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}

/**
 * Гілка петриківського розпису: стебло, що тоншає, листя-зернятка обабіч,
 * кілька квіток і грон калини. Малюється на прозорому тлі й стоїть по краях сцени.
 */
export function branch(variant: number, w = 720, h = 1100): Texture {
  const [c, g] = canvas(w, h);
  const rnd = prng(17 + variant * 101);
  const stem = [
    [w * 0.18, h * 1.02],
    [w * 0.05, h * 0.62],
    [w * 0.78, h * 0.5],
    [w * 0.52, h * 0.06],
  ];
  // стебло — ланцюжок кіл, що зменшуються: виходить мазок, що тоншає вгору
  for (let k = 0; k <= 160; k++) {
    const t = k / 160;
    const [x, y] = bez(stem, t);
    dot(g, x, y, 15 * (1 - t) + 3, k % 2 ? P.greenDeep : P.green);
  }
  // листя обабіч стебла
  for (let k = 1; k < 15; k++) {
    const t = k / 15;
    const [x, y] = bez(stem, t);
    const [x2, y2] = bez(stem, Math.min(1, t + 0.01));
    const ang = Math.atan2(y2 - y, x2 - x);
    const side = k % 2 ? 1 : -1;
    const len = (110 - t * 60) * (0.8 + rnd() * 0.4);
    const a = ang + side * (1.05 + rnd() * 0.35);
    seed(g, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 13 - t * 6, k % 3 ? P.green : P.greenDeep, side * 0.18, true);
  }
  // квітки-мальви й грона калини на кінцях відгалужень
  const blooms = [0.32, 0.58, 0.82, 1];
  blooms.forEach((t, n) => {
    const [x, y] = bez(stem, t);
    const off = n % 2 ? 1 : -1;
    const fx = x + off * (60 + rnd() * 40);
    const fy = y - 30 - rnd() * 30;
    seed(g, x, y, fx, fy, 6, P.greenDeep, 0.2, false);
    if (n % 2 === 0 || n === 3) {
      const r = n === 3 ? 58 : 44;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rnd();
        seed(g, fx + Math.cos(a) * r * 0.25, fy + Math.sin(a) * r * 0.25, fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.34, k % 2 ? P.red : P.redDeep, 0.12);
      }
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        seed(g, fx + Math.cos(a) * r * 0.18, fy + Math.sin(a) * r * 0.18, fx + Math.cos(a) * r * 0.62, fy + Math.sin(a) * r * 0.62, 3.5, P.ochre, 0.1, false);
      }
      dot(g, fx, fy, r * 0.22, P.ochre);
    } else {
      for (let k = 0; k < 9; k++) {
        const bx = fx + (rnd() - 0.5) * 60;
        const by = fy + (rnd() - 0.5) * 50;
        dot(g, bx, by, 11, P.redDeep);
        dot(g, bx - 1, by - 1, 9.5, P.red);
        dot(g, bx - 3, by - 4, 2.6, 'rgba(255,255,255,0.7)');
      }
    }
  });
  // жовті «зерна» вздовж стебла
  for (let k = 0; k < 26; k++) {
    const [x, y] = bez(stem, rnd());
    dot(g, x + (rnd() - 0.5) * 140, y + (rnd() - 0.5) * 140, 3 + rnd() * 3, rnd() > 0.5 ? P.ochre : P.cream);
  }
  return Texture.from(c);
}

/** Зерно лаку: дрібний теплий шум, що тайлиться. */
export function grain(size = 256): Texture {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const rnd = prng(5);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 90;
    img.data[i] = v + 10;
    img.data[i + 1] = v;
    img.data[i + 2] = v - 12;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

/** Темніші краї екрана — віньєтка дає глибину. */
export function vignette(): Texture {
  const [c, g] = canvas(512, 512);
  const r = g.createRadialGradient(256, 236, 120, 256, 256, 360);
  r.addColorStop(0, 'rgba(0,0,0,0)');
  r.addColorStop(1, 'rgba(0,0,0,0.78)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  return Texture.from(c);
}

/** М’яка пляма світла (для сяйва під квітками й частинок). */
export function softDot(color = '#ffffff'): Texture {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color);
  r.addColorStop(0.35, color.startsWith('#') ? `${color}aa` : color);
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

/** Відблиск на лаку: широка діагональна смуга світла. */
export function sheen(): Texture {
  const [c, g] = canvas(256, 512);
  const l = g.createLinearGradient(0, 0, 256, 0);
  l.addColorStop(0, 'rgba(255,240,210,0)');
  l.addColorStop(0.5, 'rgba(255,240,210,0.16)');
  l.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = l;
  g.fillRect(0, 0, 256, 512);
  return Texture.from(c);
}

/** Промінь для сонця за полем: клин, що тане до кінця. */
export function ray(): Texture {
  const [c, g] = canvas(128, 1024);
  const l = g.createLinearGradient(0, 1024, 0, 0);
  l.addColorStop(0, 'rgba(255,230,170,0.5)');
  l.addColorStop(0.6, 'rgba(255,230,170,0.16)');
  l.addColorStop(1, 'rgba(255,230,170,0)');
  g.fillStyle = l;
  // м’які краї: світло, а не вирізаний клин
  g.filter = 'blur(10px)';
  g.beginPath();
  g.moveTo(64, 1024);
  g.lineTo(22, 0);
  g.lineTo(106, 0);
  g.closePath();
  g.fill();
  return Texture.from(c);
}

/** Іскра-зірочка з чотирма променями. */
export function sparkle(): Texture {
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.beginPath();
  g.moveTo(32, 0);
  g.quadraticCurveTo(35, 29, 64, 32);
  g.quadraticCurveTo(35, 35, 32, 64);
  g.quadraticCurveTo(29, 35, 0, 32);
  g.quadraticCurveTo(29, 29, 32, 0);
  g.fill();
  return Texture.from(c);
}
