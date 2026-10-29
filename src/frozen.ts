// The same picture on every load, for comparing screenshots of figures:
// Math.random is seeded, and animation frames run a fixed number of steps on
// a fake clock, with every figure counted as on screen. Import this module
// first in a gallery page (before any figure), and it freezes the page when
// its address has ?frozen; or call freezeClock yourself.

export interface FreezeOptions {
  /** Seed for Math.random. Default 12345. */
  seed?: number;
  /** Frames to run before animation stops. Default 4000. */
  frames?: number;
  /** Milliseconds per frame. Default 16. */
  step?: number;
}

/** Seed Math.random and swap the clock, animation frames and IntersectionObserver for still ones. */
export function freezeClock(o: FreezeOptions = {}): void {
  let s = o.seed ?? 12345;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  let now = 0;
  let frames = 0;
  const limit = o.frames ?? 4000;
  const step = o.step ?? 16;
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => {
    if (frames++ > limit) return 0;
    queueMicrotask(() => {
      now += step;
      cb(now);
    });
    return frames;
  };
  window.IntersectionObserver = class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(t: Element) {
      queueMicrotask(() => this.cb([{ isIntersecting: true, target: t } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('frozen')) freezeClock();
