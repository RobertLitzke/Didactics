// @vitest-environment happy-dom
// Gaps found moving a fourth course (Out of Auto, photography) onto
// Didactics: frames around a canvas, stepped and log sliders, distances,
// checked figure options, the photo credits, the gallery and frozen clock,
// figures that are ready later, and counting coming lessons.

import { describe, expect, it } from 'vitest';
import { check } from '../src/check';
import { el } from '../src/dom';
import { canvasFrame, figure, figureReady, frame, slider, standaloneFigure } from '../src/figure';
import { freezeClock } from '../src/frozen';
import { galleryPage } from '../src/gallery';
import { lessonProblems, lessonView, prose, type Lesson } from '../src/lesson';
import { credit, creditsView, isLicenseId, photoProblems, type Photo } from '../src/photos';
import { emptyProgress, migrateProgress } from '../src/progress';
import { referenceProblems } from '../src/reference';
import { createStore } from '../src/store';
import { length } from '../src/units';

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;

const nav = { params: {}, navigate: () => {}, replace: () => {} };
const lesson = (id: string, n: number, blocks: Lesson['parts'][number]['blocks'] = [{ type: 'text', text: 'Hi.' }], written = true): Lesson => ({
  id, n, title: id, teaches: '', learned: [], next: '', journal: [], coming: !written || undefined,
  parts: written ? [{ title: 'One', blocks }] : [],
});

describe('a frame around any drawing', () => {
  it('keeps the text box and controls under a canvas', () => {
    const f = canvasFrame(300, 200, 2, { scale: 2 });
    expect(f.drawing.tagName).toBe('CANVAS');
    expect(f.drawing.width).toBe(600);
    expect(f.drawing.classList.contains('fig-drawing')).toBe(true);
    expect([...f.node.children].map((c) => c.className)).toEqual(['fig-drawing', 'fig-text', 'fig-controls']);
    expect((f.node.querySelector('.fig-readout') as HTMLElement).style.getPropertyValue('--lines')).toBe('2');
  });

  it('takes a video or an image too, and still makes an svg when given a size', () => {
    const video = el('video');
    const f = frame({ drawing: video, lines: 1, extra: [el('p.task', {}, 'Pan.')] });
    expect(f.node.firstElementChild).toBe(video);
    expect(f.node.lastElementChild!.matches('p.task')).toBe(true);
    const s = frame(100, 50);
    expect(s.svg.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(s.drawing).toBe(s.svg);
    expect(s.svg.classList.contains('fig-drawing')).toBe(false);
  });
});

describe('sliders', () => {
  const move = (s: { input: HTMLInputElement }, pos: number) => {
    s.input.value = String(pos);
    s.input.dispatchEvent(new Event('input'));
  };

  it('walks a list of set values', () => {
    const seen: number[] = [];
    const s = slider('Shutter', { steps: [1 / 250, 1 / 500, 1 / 1000], value: 1 / 500, show: (v) => `1/${Math.round(1 / v)}`, onInput: (v) => seen.push(v) });
    expect(s.input.max).toBe('2');
    expect(s.input.value).toBe('1');
    expect(s.node.querySelector('output')!.textContent).toBe('1/500');
    move(s, 2);
    expect(seen).toEqual([1 / 1000]);
    expect(s.node.querySelector('output')!.textContent).toBe('1/1000');
    s.set(0.0039);
    expect(s.value()).toBe(1 / 250);
  });

  it('runs on a log scale, rounding to its step', () => {
    let at = 0;
    const s = slider('Zoom', { min: 24, max: 2000, step: 1, scale: 'log', value: 200, show: (v) => `${v} mm`, onInput: (v) => (at = v) });
    expect(s.value()).toBeGreaterThan(195);
    expect(s.value()).toBeLessThan(205);
    move(s, 0);
    expect(at).toBe(24);
    move(s, 1000);
    expect(at).toBe(2000);
    move(s, 500);
    expect(at).toBe(Math.round(Math.sqrt(24 * 2000)));
    expect(() => slider('Bad', { min: 0, max: 10, scale: 'log', value: 1, show: String, onInput: () => {} })).toThrow();
  });

  it('still takes the old arguments', () => {
    const s = slider('Push', 0, 10, 0.5, 3, String, () => {});
    expect([s.input.min, s.input.max, s.input.step, s.input.value]).toEqual(['0', '10', '0.5', '3']);
  });
});

describe('distances', () => {
  it('says each in the unit a person would', () => {
    expect(['0.05', '0.35', '1.5', '120', '15000'].map((m) => length(Number(m), 'metric'))).toEqual(['5 cm', '35 cm', '1.5 m', '120 m', '15 km']);
    expect([0.05, 2, 100, 4000].map((m) => length(m, 'imperial'))).toEqual(['2 in', '6.6 ft', '328 ft', '2.5 mi']);
    expect(length(-2, 'metric')).toBe('−2 m');
  });
});

describe('checked figure options', () => {
  type ShotOptions = { photo?: string };
  const PHOTOS = ['lake', 'owl'];
  const shot = figure<ShotOptions>([], (_ctx, _t, o) => el('div', {}, o?.photo ?? 'none'), {
    options: (o) => (PHOTOS.includes(String(o?.photo)) ? [] : [`has no photo "${o?.photo}"`]),
  });

  it('runs in lessonProblems and referenceProblems', () => {
    const lessons = [lesson('a', 1, [{ type: 'interactive_diagram', id: 'shot', caption: 'A', options: { photo: 'lake' } }, { type: 'interactive_diagram', id: 'shot', caption: 'B', options: { photo: 'oul' } }])];
    expect(lessonProblems(lessons, { shot })).toEqual(['a: shot has no photo "oul"']);
    expect(referenceProblems([{ id: 's', title: 'S', summary: '', blocks: [{ type: 'interactive_diagram', id: 'shot', caption: 'C' } as { type: string }] }], { figures: { shot } })).toEqual(['reference "s": shot has no photo "undefined"']);
  });

  it('works on a check and on a still', () => {
    const c = check(() => [], { options: (o) => (o?.items ? [] : ['has no items']) });
    const still = Object.assign(() => ({ node: el('div') }), { options: () => ['is never right'] });
    expect(lessonProblems([lesson('a', 1, [{ type: 'quiz', id: 'check', caption: 'Q' }, { type: 'diagram', id: 'still', caption: 'S' }])], { check: c, still })).toEqual(['a: check has no items', 'a: still is never right']);
  });
});

describe('a figure that is ready later', () => {
  it('waits for what the figure waits for', async () => {
    let load!: () => void;
    const image = new Promise<void>((r) => (load = r));
    const photo = figure([], (_ctx, t) => {
      t.waitFor(image);
      t.waitFor(Promise.reject(new Error('no depth map')));
      return el('div');
    });
    const fig = standaloneFigure(photo, { caption: 'Photo', save: emptyProgress() });
    let ready = false;
    void fig.ready.then(() => (ready = true));
    await new Promise((r) => setTimeout(r));
    expect(ready).toBe(false);
    load();
    await fig.ready;
    expect(ready).toBe(true);
    await figureReady({});
  });
});

describe('photo credits', () => {
  const owl: Photo = { id: 'owl-01', width: 800, height: 600, author: 'A. Person', license: 'CC-BY-SA-4.0', sourceUrl: 'https://commons.wikimedia.org/x', source: 'Wikimedia Commons' };

  it('checks entries, writes the credit line and the Credits page', () => {
    expect(photoProblems(owl)).toEqual([]);
    expect(photoProblems({ ...owl, id: 'Owl', license: 'CC-BY-NC-4.0' as Photo['license'], sourceUrl: 'http://x' })).toHaveLength(3);
    expect(isLicenseId('CC0')).toBe(true);
    expect(credit(owl).textContent).toBe('Photo: A. Person · CC BY-SA 4.0 · Wikimedia Commons');
    const root = el('div');
    creditsView({ photos: [owl], name: () => 'Owl', after: el('p', {}, 'Type: Nunito.') })(root, nav);
    expect(root.querySelector('.credit-list li')!.textContent).toBe('Owl by A. Person, CC BY-SA 4.0, via Wikimedia Commons');
    expect(root.textContent).toContain('Type: Nunito.');
    const none = el('div');
    creditsView({ photos: [], empty: 'Drawings only.' })(none, nav);
    expect(none.textContent).toContain('Drawings only.');
  });
});

describe('the gallery', () => {
  it('shows every figure with its lesson caption, or one, and marks itself ready', async () => {
    const a = figure(['x'], () => el('div.a'));
    const b = figure([], () => el('div.b'));
    const lessons = [lesson('l', 1, [{ type: 'interactive_diagram', id: 'a', caption: 'Lever', goal: 'x' }])];
    const g = galleryPage({ figures: { a, b }, lessons, save: emptyProgress(), only: null });
    expect([...g.node.querySelectorAll('figure.fig')].map((f) => (f as HTMLElement).dataset.figure)).toEqual(['a', 'b']);
    expect(g.node.querySelector('[data-figure=a] .fig-lead')!.textContent).toBe('a: Lever');
    expect(g.node.querySelector('[data-figure=b] .fig-lead')!.textContent).toBe('b: (not in any lesson)');
    await g.ready;
    expect(g.node.hasAttribute('data-ready')).toBe(true);
    expect(galleryPage({ figures: { a, b }, lessons, save: emptyProgress(), only: 'b' }).figures).toHaveLength(1);
  });

  it('freezes the clock: the same numbers every time', async () => {
    const real = { random: Math.random, now: performance.now, raf: window.requestAnimationFrame, io: window.IntersectionObserver };
    freezeClock({ seed: 7, frames: 2 });
    const first = [Math.random(), Math.random()];
    freezeClock({ seed: 7, frames: 2 });
    expect([Math.random(), Math.random()]).toEqual(first);
    const times: number[] = [];
    const tick = (t: number) => (times.push(t), requestAnimationFrame(tick));
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r));
    expect(times).toEqual([16, 32, 48]);
    Object.assign(Math, { random: real.random });
    Object.assign(performance, { now: real.now });
    Object.assign(window, { requestAnimationFrame: real.raf, IntersectionObserver: real.io });
  });
});

describe('the lesson count', () => {
  it('counts coming lessons when asked', () => {
    const lessons = [lesson('a', 1), lesson('b', 2), lesson('c', 3, undefined, false)];
    const root = el('div');
    const store = createStore({ key: 'count4', empty: () => emptyProgress('metric', { radio: false }), migrate: (r) => migrateProgress(r, emptyProgress('metric', { radio: false })) });
    lessonView({ lessons, figures: {}, store, prose: (t) => prose(t, { ink: '#000' }), countComing: true })(root, { ...nav, params: { id: 'b' } });
    expect(root.querySelector('.article-intro .eyebrow')!.textContent).toBe('Lesson 2 of 3');
  });
});
