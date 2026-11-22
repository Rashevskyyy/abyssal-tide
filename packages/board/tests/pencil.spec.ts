import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { pencilLine, pencilLoop } from '../src/pencil';

/** Підставна Graphics: записує шлях, без рендера (тести йдуть у Node). */
function recorder() {
  const pts: [number, number][] = [];
  const strokes: unknown[] = [];
  const g = {
    moveTo: (x: number, y: number) => (pts.push([x, y]), g),
    lineTo: (x: number, y: number) => (pts.push([x, y]), g),
    stroke: (s: unknown) => (strokes.push(s), g),
  };
  return { g: g as unknown as Graphics, pts, strokes };
}

describe('pencil', () => {
  it('a line is deterministic for the same seed and wobbles only slightly off the path', () => {
    const a = recorder();
    const b = recorder();
    const path = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
    pencilLine(a.g, path, 7);
    pencilLine(b.g, path, 7);
    expect(a.pts).toEqual(b.pts);
    expect(Math.max(...a.pts.map(([, y]) => Math.abs(y)))).toBeLessThan(2);
    expect(a.pts[a.pts.length - 1][0]).toBeCloseTo(300, 0);
  });

  it('progress draws only a part of the path', () => {
    const full = recorder();
    const half = recorder();
    const path = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
    pencilLine(full.g, path, 3, 1);
    pencilLine(half.g, path, 3, 0.5);
    expect(half.pts.length).toBeLessThan(full.pts.length);
    expect(half.pts[half.pts.length - 1][0]).toBeLessThan(260);
  });

  it('a loop goes a bit more than a full turn around the centre', () => {
    const r = recorder();
    pencilLoop(r.g, 100, 100, 50, 40, 11);
    const radii = r.pts.map(([x, y]) => Math.hypot((x - 100) / 50, (y - 100) / 40));
    expect(Math.min(...radii)).toBeGreaterThan(0.85);
    expect(Math.max(...radii)).toBeLessThan(1.15);
    expect(r.strokes).toHaveLength(1);
  });
});
