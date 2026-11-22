import type { Graphics } from 'pixi.js';

/** Кораловий «олівець» дослідника: нерівні лінії й обведення від руки поверх відбитка. */
export const CORAL_HEX = 0xff5b4a;
export const PAPER_HEX = 0xf4f8ff;
export const PRUSSIAN_HEX = 0x10357a;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Обведення навколо точки: трохи більше ніж повний оберт, з тремтінням руки. */
export function pencilLoop(g: Graphics, cx: number, cy: number, rx: number, ry: number, seed: number, progress = 1, color = CORAL_HEX, width = 4): void {
  const r = rng(seed);
  const start = r() * Math.PI * 2;
  const turns = 1.12;
  const steps = 64;
  const n = Math.max(2, Math.floor(steps * progress));
  const wob = [r(), r(), r()];
  for (let i = 0; i <= n; i++) {
    const t = i / steps;
    const a = start + t * Math.PI * 2 * turns;
    const k = 1 + Math.sin(a * 2 + wob[0] * 6) * 0.04 + (t - 0.5) * 0.06 + Math.sin(a * 5 + wob[1] * 9) * 0.012;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k + Math.sin(a * 3 + wob[2] * 5) * 1.2;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke({ width, color, alpha: 0.95, cap: 'round', join: 'round' });
}

/** Лінія олівцем через точки, з легким тремтінням; progress — частка намальованого шляху. */
export function pencilLine(g: Graphics, pts: { x: number; y: number }[], seed: number, progress = 1, color = CORAL_HEX, width = 4.5, alpha = 1): void {
  const r = rng(seed);
  const fine: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const seg = Math.max(2, Math.ceil(len / 14));
    const nx = -(b.y - a.y) / (len || 1);
    const ny = (b.x - a.x) / (len || 1);
    for (let j = 0; j < seg; j++) {
      const t = j / seg;
      const off = (r() - 0.5) * 2.4;
      fine.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
    }
  }
  fine.push(pts[pts.length - 1]);
  const n = Math.max(2, Math.floor(fine.length * progress));
  g.moveTo(fine[0].x, fine[0].y);
  for (let i = 1; i < n; i++) g.lineTo(fine[i].x, fine[i].y);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}
