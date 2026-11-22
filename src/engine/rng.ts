/** Детермінований PRNG (mulberry32). Для демо достатньо; сид — з crypto, якщо не задано. */
export interface Rng {
  next(): number; // [0, 1)
  int(maxExclusive: number): number;
  pick<T>(weighted: readonly (readonly [T, number])[]): T;
}

export function createRng(seed?: number): Rng {
  let s = (seed ?? randomSeed()) >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (weighted) => {
      let total = 0;
      for (const [, w] of weighted) total += w;
      let roll = next() * total;
      for (const [value, w] of weighted) {
        roll -= w;
        if (roll < 0) return value;
      }
      return weighted[weighted.length - 1][0];
    },
  };
}

function randomSeed(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * Криптографічний RNG для сервера: кожне число — з `crypto.getRandomValues`, без сиду,
 * який можна відновити. Ціле в діапазоні береться відкиданням (rejection sampling), тож без зсуву.
 */
export function createCryptoRng(): Rng {
  const c = globalThis.crypto;
  const buf = new Uint32Array(2);
  const next = (): number => {
    c.getRandomValues(buf);
    // 53 біти випадковості → [0, 1)
    return (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53;
  };
  const int = (max: number): number => {
    if (max <= 1) return 0;
    const limit = Math.floor(2 ** 32 / max) * max;
    const one = new Uint32Array(1);
    for (;;) {
      c.getRandomValues(one);
      if (one[0] < limit) return one[0] % max;
    }
  };
  return {
    next,
    int,
    pick: (weighted) => {
      let total = 0;
      for (const [, w] of weighted) total += w;
      let roll = next() * total;
      for (const [value, w] of weighted) {
        roll -= w;
        if (roll < 0) return value;
      }
      return weighted[weighted.length - 1][0];
    },
  };
}
