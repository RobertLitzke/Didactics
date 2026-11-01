// @vitest-environment happy-dom
// The time-lapse Play button: it walks a slider to its end through the
// slider's own onInput, pauses when a hand moves it, and follows a lock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { player, slider, testContext } from '../src/figure';
import { emptyProgress } from '../src/progress';

describe('player', () => {
  let now = 0;
  let frames: FrameRequestCallback[] = [];
  const run = (ms: number, every = 50) => {
    for (let t = 0; t < ms; t += every) {
      now += every;
      const due = frames;
      frames = [];
      for (const f of due) f(now);
    }
  };
  beforeEach(() => {
    now = 0;
    frames = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays to the end through onInput, then offers to play again from the start', () => {
    const seen: number[] = [];
    const s = slider('Time', 0, 100, 1, 0, String, (v) => seen.push(v));
    const ended = vi.fn();
    const p = player(s, testContext(emptyProgress()), { seconds: 2, onEnd: ended });
    expect(p.node.textContent).toBe('Play');
    p.node.click();
    expect(p.node.textContent).toBe('Pause');
    run(1000);
    expect(s.value()).toBeGreaterThan(30);
    expect(s.value()).toBeLessThan(70);
    run(1500);
    expect(s.value()).toBe(100);
    expect(ended).toHaveBeenCalledOnce();
    expect(p.node.textContent).toBe('Play again');
    expect(seen.length).toBeGreaterThan(10);
    p.node.click();
    expect(s.value()).toBeLessThan(5);
    expect(p.playing()).toBe(true);
  });

  it('pauses when the reader moves the slider, and when the figure closes', () => {
    const s = slider('Time', 0, 100, 1, 0, String, () => {});
    const ctx = testContext(emptyProgress());
    const p = player(s, ctx);
    p.play();
    run(500);
    s.input.value = '10';
    s.input.dispatchEvent(new Event('input'));
    expect(p.playing()).toBe(false);
    run(1000);
    expect(s.value()).toBe(10);
    p.play();
    ctx.close();
    expect(p.playing()).toBe(false);
  });

  it('will not play a locked slider', () => {
    const s = slider('Time', 0, 100, 1, 0, String, () => {});
    s.input.disabled = true;
    const p = player(s, testContext(emptyProgress()));
    expect(p.node.disabled).toBe(true);
    p.play();
    expect(p.playing()).toBe(false);
  });
});
