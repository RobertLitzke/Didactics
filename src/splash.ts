// A poster as a loading screen. It stays up for a moment even when the app
// is ready at once, because a poster that flashes past reads as a glitch, and
// a tap takes it away early.

import { el } from './dom';

export interface SplashOptions {
  /** The poster image. */
  src: string;
  /** What the poster says, for screen readers. */
  alt: string;
  /** The shortest time it stays up, in ms. */
  minMs?: number;
}

export function showSplash({ src, alt, minMs = 1600 }: SplashOptions): void {
  const img = el('img', { src, alt, decoding: 'async' }) as HTMLImageElement;
  const node = el('div.splash', { role: 'img', 'aria-label': alt }, img);
  document.body.append(node);
  const started = performance.now();
  let gone = false;
  const hide = () => {
    if (gone) return;
    gone = true;
    node.classList.add('out');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    // In case the transition never fires (reduced motion, a background tab).
    setTimeout(() => node.remove(), 800);
  };
  node.addEventListener('click', hide);
  const ready = img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = img.onerror = () => r(); });
  void ready.then(() => setTimeout(hide, Math.max(0, minMs - (performance.now() - started))));
}
