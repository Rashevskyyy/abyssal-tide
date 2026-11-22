import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO, moneyInputValue, parseMoneyInput, shouldStopAutoplay } from '../src/autoplay';

const p = (o: Partial<{ left: number; startBalance: number; balance: number; lastWin: number }>) => ({ left: 10, startBalance: 100_000, balance: 100_000, lastWin: 0, ...o });

describe('autoplay stop conditions', () => {
  it('runs until the rounds are used up', () => {
    expect(shouldStopAutoplay(DEFAULT_AUTO, p({ left: 3 }))).toBe(false);
    expect(shouldStopAutoplay(DEFAULT_AUTO, p({ left: 0 }))).toBe(true);
  });

  it('stops on any win only when asked', () => {
    expect(shouldStopAutoplay(DEFAULT_AUTO, p({ lastWin: 50 }))).toBe(false);
    expect(shouldStopAutoplay({ ...DEFAULT_AUTO, stopOnAnyWin: true }, p({ lastWin: 50 }))).toBe(true);
  });

  it('single win limit is inclusive', () => {
    const cfg = { ...DEFAULT_AUTO, singleWin: 1000 };
    expect(shouldStopAutoplay(cfg, p({ lastWin: 999 }))).toBe(false);
    expect(shouldStopAutoplay(cfg, p({ lastWin: 1000 }))).toBe(true);
  });

  it('balance up / down limits count from the balance at the start of autoplay', () => {
    const cfg = { ...DEFAULT_AUTO, balanceUp: 2000, balanceDown: 300 };
    expect(shouldStopAutoplay(cfg, p({ balance: 101_999 }))).toBe(false);
    expect(shouldStopAutoplay(cfg, p({ balance: 102_000 }))).toBe(true);
    expect(shouldStopAutoplay(cfg, p({ balance: 99_701 }))).toBe(false);
    expect(shouldStopAutoplay(cfg, p({ balance: 99_700 }))).toBe(true);
  });
});

describe('money inputs', () => {
  it('accepts dot and comma, rejects empty, zero and junk', () => {
    expect(parseMoneyInput('3')).toBe(300);
    expect(parseMoneyInput('2,50')).toBe(250);
    expect(parseMoneyInput(' 2.5 ')).toBe(250);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('0')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(moneyInputValue(300)).toBe('3.00');
    expect(moneyInputValue(null)).toBe('');
  });
});
