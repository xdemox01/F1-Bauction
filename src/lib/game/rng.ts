// Seedable random number generator (mulberry32). Game rules take an Rng
// argument so tests are deterministic and a future server can log seeds.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Uses crypto randomness when available (browser and Node 22). */
export function cryptoRng(): Rng {
  return {
    next() {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    },
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng.next() * maxExclusive);
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne: empty list");
  return items[randomInt(rng, items.length)];
}

/** Picks a key from a {key: weight} table. Weights need not sum to 1. */
export function pickWeighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights).filter(([, w]) => (w as number) > 0) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) throw new Error("pickWeighted: no positive weights");
  let roll = rng.next() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Weighted sampling without replacement. */
export function sampleWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number, count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((s, it) => s + weight(it), 0);
    let roll = rng.next() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weight(pool[i]);
      if (roll < 0) {
        index = i;
        break;
      }
    }
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}
