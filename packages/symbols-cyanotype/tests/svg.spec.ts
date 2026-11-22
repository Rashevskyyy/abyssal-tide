import { describe, expect, it } from 'vitest';
import { CYANOTYPE_IDS, CYANOTYPE_NAMES } from '../src/ids';
import { SYMBOL_PLAQUE, symbolSvg } from '../src/svg';

describe('cyanotype pack art', () => {
  it('every symbol and the open shell produce a 200×200 svg', () => {
    for (const id of [...CYANOTYPE_IDS, 'SHELL_OPEN' as const]) {
      const svg = symbolSvg(id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 200 200"');
      expect(svg.length).toBeGreaterThan(300);
    }
  });

  it('special symbols carry a readable plaque, and every symbol has a name', () => {
    expect(SYMBOL_PLAQUE.WILD?.text).toBe('WILD');
    expect(SYMBOL_PLAQUE.MAP?.text).toBe('SCATTER');
    expect(SYMBOL_PLAQUE.BLACK?.text).toBe('SUPER');
    for (const id of CYANOTYPE_IDS) expect(CYANOTYPE_NAMES[id].length).toBeGreaterThan(2);
  });

  it('art is deterministic', () => {
    expect(symbolSvg('NAUTILUS')).toBe(symbolSvg('NAUTILUS'));
  });
});
