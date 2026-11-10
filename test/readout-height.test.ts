// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { frame } from '../src/figure';

type Cb = () => void;
const observers: Cb[] = [];
globalThis.ResizeObserver = class {
  constructor(cb: Cb) { observers.push(cb); }
  observe() {}
  disconnect() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

const size = (el: HTMLElement, w: number, h: number) => {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: h, configurable: true });
  observers.forEach((cb) => cb());
};

afterEach(() => (observers.length = 0));

describe('the readout box', () => {
  it('grows to the tallest text seen and does not shrink back', () => {
    const f = frame(400, 300, 3);
    size(f.readout, 300, 60);
    size(f.readout, 300, 100);
    expect(f.readout.style.minHeight).toBe('100px');
    size(f.readout, 300, 60);
    expect(f.readout.style.minHeight).toBe('100px');
  });

  it('starts again when the column changes width', () => {
    const f = frame(400, 300, 3);
    size(f.readout, 300, 60);
    size(f.readout, 300, 100);
    size(f.readout, 500, 50);
    expect(f.readout.style.minHeight).toBe('');
  });
});
