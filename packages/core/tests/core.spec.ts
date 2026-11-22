import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import { createMoneyFormat, diagnostics, Episode, play, Signal, wait } from '../src';

describe('time', () => {
  it('play() resolves when the animation completes and keeps its own onComplete', async () => {
    let own = 0;
    const tw = gsap.to({ x: 0 }, { x: 1, duration: 0.05, onComplete: () => void own++ });
    await play(tw);
    expect(own).toBe(1);
  });

  it('play() also resolves when the animation is killed — a flow never hangs on a dead tween', async () => {
    const tw = gsap.to({ x: 0 }, { x: 1, duration: 10 });
    const done = play(tw);
    setTimeout(() => tw.kill(), 20);
    await expect(Promise.race([done.then(() => 'resolved'), wait(500).then(() => 'stuck')])).resolves.toBe('resolved');
  });

  it('Episode.skip() finishes live animations and pending waits at once', async () => {
    const ep = new Episode();
    const o = { x: 0 };
    const a = ep.play(gsap.to(o, { x: 100, duration: 5 }));
    const b = ep.wait(5000);
    ep.skip();
    await Promise.all([a, b]);
    expect(o.x).toBe(100);
    // після пропуску нові кроки епізоду виконуються миттєво
    const t0 = performance.now();
    await ep.wait(5000);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('Signal fires once', async () => {
    const s = new Signal();
    expect(s.done).toBe(false);
    s.fire();
    s.fire();
    await s.promise;
    expect(s.done).toBe(true);
  });
});

describe('money', () => {
  it('formats integer cents in the chosen locale, short form drops whole cents', () => {
    let locale = 'en-IE';
    const m = createMoneyFormat({ currency: 'EUR', locale: () => locale });
    expect(m.formatMoney(1240)).toBe('€12.40');
    expect(m.formatMoneyShort(200)).toBe('€2');
    expect(m.formatMoneyShort(20)).toBe('€0.20');
    locale = 'uk-UA';
    // знак валюти залежить від ICU середовища (у браузері «€», у Node може бути «EUR»)
    expect(m.formatMoney(1240)).toMatch(/^12,40\s(€|EUR)$/);
  });
});

describe('diagnostics', () => {
  it('keeps a bounded log and notifies listeners', () => {
    let calls = 0;
    diagnostics.onChange(() => void calls++);
    for (let i = 0; i < 40; i++) diagnostics.add('stall', `n${i}`);
    expect(diagnostics.all.length).toBe(30);
    expect(diagnostics.last?.message).toBe('n39');
    expect(calls).toBe(40);
  });
});
