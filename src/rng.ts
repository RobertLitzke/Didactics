// A small seeded generator (mulberry32), so a round can be dealt again.

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A number from `lo` to `hi`, rounded to `step` when given. */
export function between(rng: Rng, lo: number, hi: number, step?: number): number {
  const v = lo + rng() * (hi - lo);
  return step ? Math.min(hi, Math.max(lo, Math.round(v / step) * step)) : v;
}

/** One of `items`. */
export function oneOf<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** `v` moved at random by up to `by` either way, rounded to `step` when given. */
export function jitter(rng: Rng, v: number, by: number, step?: number): number {
  return between(rng, v - by, v + by, step);
}
