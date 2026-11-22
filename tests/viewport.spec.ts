import { describe, expect, it } from 'vitest';
import { computeViewport, MAX_ASPECT } from '../src/client/core/viewport';

describe('viewport', () => {
  it('a phone held sideways gets the landscape HUD, not the portrait row', () => {
    const v = computeViewport(667, 375);
    expect(v.layout).toBe('landscape');
    expect(v.k).toBeGreaterThanOrEqual(0.6); // кнопки менші, але не дрібніші за поріг дотику
    expect(v.kb).toBeGreaterThanOrEqual(0.8); // суми в смузі лишаються читабельними
  });

  it('portrait phones and tablets get the row under the field, scaled with the screen', () => {
    const phone = computeViewport(375, 667);
    const tablet = computeViewport(820, 1180);
    expect(phone.layout).toBe('portrait');
    expect(tablet.layout).toBe('portrait');
    expect(tablet.k).toBeGreaterThan(phone.k);
    expect(tablet.k).toBeLessThanOrEqual(1.4);
  });

  it('desktop HUD grows with the screen and stops growing on huge monitors', () => {
    expect(computeViewport(1280, 720).k).toBeLessThan(computeViewport(1920, 1080).k);
    expect(computeViewport(5120, 2880).k).toBe(1.8);
  });

  it('ultrawide monitors keep the HUD next to the game with side margins', () => {
    expect(computeViewport(1920, 1080).insetX).toBe(0);
    const uw = computeViewport(3440, 1440);
    expect(uw.insetX).toBe(Math.round((3440 - 1440 * MAX_ASPECT) / 2));
    expect(uw.w - uw.insetX * 2).toBeCloseTo(1440 * MAX_ASPECT, 0);
  });
});
