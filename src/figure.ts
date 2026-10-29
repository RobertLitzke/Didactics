// What every figure is made of. A figure is a drawing, one text box that says
// what the drawing is and what it is showing now, a few controls, and sometimes
// a small task; it says when the task is done so the lesson can move on.
//
// The colours a figure is drawn in belong to the app: each topic keeps a
// palette in which a colour always means the same thing, in every figure and
// in the text around them (see prose in lesson.ts).

import { el, svg, type Child } from './dom';
import type { Progress } from './progress';
import type { Talk } from './radio';

export interface FigureContext {
  /** The reader's progress and settings (units, the radio); an app may pass its own larger save. */
  save: Progress;
  /** Aborted when the lesson closes; figures that animate stop then, and only run while on screen. */
  closed: AbortSignal;
  /** A figure that is a test reports its result here. */
  score: (right: number, of: number) => void;
  /** This block's memory across visits, when the lesson keeps one (resume.ts); see Task. */
  memo?: Memo;
  /**
   * In the lesson's check, with the radio on: the check's talk, which frames
   * the questions (check.ts), and the station it comes from.
   */
  radio?: { talk: Talk; them?: { call: string; place: string } };
}

/** What a lesson remembers of one figure between visits. */
export interface Memo {
  /** Its task was done on an earlier visit. */
  restored: boolean;
  /** What it last passed to keep, if anything. */
  kept?: unknown;
  keep: (state: unknown) => void;
}

export interface FigureHandle {
  node: HTMLElement;
  /** Resolves when the figure's task is done; absent when it has none. */
  done?: Promise<void>;
  /**
   * Resolves once the figure has drawn what it first shows, for a figure that
   * waits on something (an image, a depth map); absent when it draws at once.
   * Screenshots, tests and the gallery wait on it (`figureReady`).
   */
  ready?: Promise<void>;
}

export type Options = Record<string, unknown>;

/** What is wrong with a block's options for this figure, or an empty list. */
export type OptionsCheck = (options: Options | undefined) => string[];

/**
 * Makes a figure for a lesson block. A live figure lists the `goals` a lesson
 * may set it, so the content test can catch a goal that no figure would ever
 * meet; a quiz is always a task. Stills have neither. Any of them may carry
 * an `options` check, which `lessonProblems` and `referenceProblems` run on
 * each block that uses it (a still adds one with `Object.assign`).
 */
export type FigureFactory = ((ctx: FigureContext, goal?: string, options?: Options) => FigureHandle) & {
  goals?: readonly string[];
  quiz?: true;
  options?: OptionsCheck;
};

/** What a figure says about itself beyond how it is built. */
export interface FigureSpec {
  /** Checks a block's options, so a wrong id in a lesson's JSON fails the content test, not the reader. */
  options?: OptionsCheck;
}

/** The figure's ready promise, or a settled one when it draws at once. */
export function figureReady(handle: Pick<FigureHandle, 'ready'>): Promise<void> {
  return handle.ready ?? Promise.resolve();
}

/** A figure's task, as the figure sees it. */
export interface Task {
  /** What the lesson asked for; absent when the figure is only to be played with. */
  readonly goal?: string;
  /** Mark the task done. Safe to call again. */
  done: () => void;
  readonly promise: Promise<void>;
  /**
   * What this figure passed to `keep` on an earlier visit, when the reader
   * left the lesson part way and has come back. A figure that has a state
   * worth coming back to (a guess made, quiz answers given) keeps it, and on
   * build puts itself back in that state. Sliders are put back by the lesson.
   */
  readonly kept?: unknown;
  /** Remember `state` (any JSON) for the next visit. */
  keep: (state: unknown) => void;
  /** The task was done on an earlier visit; the lesson counts it done already. */
  readonly restored: boolean;
  /**
   * Say the figure is not finished drawing until `p` settles (an image
   * loading, say). Call it while building; the figure's `ready` waits on every
   * promise given, and settles even if one fails.
   */
  waitFor: (p: Promise<unknown>) => void;
}

const task = (ctx: FigureContext, goal: string | undefined, p: { promise: Promise<void>; resolve: () => void }, waits: Promise<unknown>[]): Task => ({
  goal,
  done: p.resolve,
  promise: p.promise,
  kept: ctx.memo?.kept,
  keep: ctx.memo?.keep ?? (() => {}),
  restored: ctx.memo?.restored ?? false,
  waitFor: (w) => void waits.push(w),
});

const settled = (waits: Promise<unknown>[]): Promise<void> | undefined =>
  waits.length ? Promise.allSettled(waits).then(() => {}) : undefined;

/**
 * A live figure, which knows the goals in `goals`. `O` is the shape of its
 * options; give `spec.options` a check, so the content test holds lessons to it.
 */
export function figure<O extends Options = Options>(goals: readonly string[], build: (ctx: FigureContext, t: Task, options?: O) => HTMLElement, spec: FigureSpec = {}): FigureFactory {
  const make = (ctx: FigureContext, goal?: string, options?: Options): FigureHandle => {
    const p = promised();
    const waits: Promise<unknown>[] = [];
    const node = build(ctx, task(ctx, goal, p, waits), options as O | undefined);
    return { node, done: goal ? p.promise : undefined, ready: settled(waits) };
  };
  return Object.assign(make, { goals }, spec.options ? { options: spec.options } : {});
}

/** A figure that is a test: its task is to be answered, whatever the lesson says. */
export function quiz<O extends Options = Options>(build: (ctx: FigureContext, t: Task, options?: O) => HTMLElement, spec: FigureSpec = {}): FigureFactory {
  const make = (ctx: FigureContext, _goal?: string, options?: Options): FigureHandle => {
    const p = promised();
    const waits: Promise<unknown>[] = [];
    const node = build(ctx, task(ctx, undefined, p, waits), options as O | undefined);
    return { node, done: p.promise, ready: settled(waits) };
  };
  return Object.assign(make, { quiz: true as const }, spec.options ? { options: spec.options } : {});
}

/** A figure's frame around a drawing of any kind. */
export interface DrawingFrame<D extends Element = Element> {
  node: HTMLElement;
  /** What the figure draws on, as given. */
  drawing: D;
  controls: HTMLElement;
  /** The live part of the text box under the drawing: what the figure is showing now. */
  readout: HTMLElement;
}

/** The standard frame, around an SVG drawing. */
export interface Frame extends DrawingFrame<SVGSVGElement> {
  svg: SVGSVGElement;
}

/**
 * The standard figure: a drawing `w` by `h` units, scaled to the column. The
 * text box under it keeps room for `lines` lines of readout at phone width, so
 * the controls below stay put while the text changes; the lesson puts the
 * figure's caption at the top of the same box (placeCaption).
 *
 * `frame({ drawing, lines?, extra? })` puts the same text box and controls
 * under any other drawing: a canvas (see canvasFrame), a video, a photo.
 * The drawing gets the class `fig-drawing`, which spans the column.
 */
export function frame(w: number, h: number, lines?: number, ...extra: Child[]): Frame;
export function frame<D extends Element>(o: { drawing: D; lines?: number; extra?: Child[] }): DrawingFrame<D>;
export function frame(a: number | { drawing: Element; lines?: number; extra?: Child[] }, h = 0, lines = 3, ...extra: Child[]): Frame | DrawingFrame {
  if (typeof a === 'object') return around(a.drawing, a.lines ?? 3, a.extra ?? []);
  const s = svg('svg', { viewBox: `0 0 ${a} ${h}`, class: 'fig-svg', role: 'img' }) as SVGSVGElement;
  return { ...around(s, lines, extra), svg: s };
}

function around<D extends Element>(drawing: D, lines: number, extra: Child[]): DrawingFrame<D> {
  if (!drawing.classList.contains('fig-svg')) drawing.classList.add('fig-drawing');
  const readout = el('p.fig-readout');
  const controls = el('div.fig-controls');
  const node = el('div.fig-body', {}, drawing, textBox(readout, lines), controls, ...extra);
  return { node, drawing, controls, readout };
}

/** A frame around a canvas `w` by `h` pixels (times `scale`, for sharp lines on a dense screen), scaled to the column. */
export function canvasFrame(w: number, h: number, lines = 3, o: { scale?: number; extra?: Child[] } = {}): DrawingFrame<HTMLCanvasElement> & { ctx: CanvasRenderingContext2D | null } {
  const scale = o.scale ?? 1;
  const canvas = el('canvas', { width: Math.round(w * scale), height: Math.round(h * scale), role: 'img' }) as HTMLCanvasElement;
  canvas.style.aspectRatio = `${w} / ${h}`;
  const f = frame({ drawing: canvas, lines, extra: o.extra });
  const ctx = canvas.getContext?.('2d') ?? null;
  if (ctx && scale !== 1) ctx.scale(scale, scale);
  return { ...f, ctx };
}

/** The box a figure's text lives in, `lines` lines of readout tall. */
export function textBox(readout: HTMLElement, lines = 3): HTMLElement {
  readout.style.setProperty('--lines', String(lines));
  return el('div.fig-text', {}, readout);
}

export interface Slider {
  node: HTMLElement;
  input: HTMLInputElement;
  value: () => number;
  set: (v: number) => void;
}

export interface SliderOptions {
  /** The value it starts at. With `steps`, the nearest step. */
  value: number;
  show: (v: number) => string;
  onInput: (v: number) => void;
  /** Any CSS colour, for the thumb. */
  color?: string;
  min?: number;
  max?: number;
  /** Rounds the value to a multiple of this (on a log scale too). Default 1, or none on a log scale. */
  step?: number;
  /** Set values to walk through, in order (camera stops: 1/250, 1/500); `min`, `max` and `step` are not used. */
  steps?: readonly number[];
  /** 'log' spreads min to max evenly by ratio, as a zoom from 24 to 2000 mm reads. Default 'linear'. */
  scale?: 'linear' | 'log';
}

/** How far along a log slider runs: this many positions from min to max. */
const LOG_POSITIONS = 1000;

/**
 * A labelled range input that shows its value with `show`; `color` is any CSS
 * colour, for the thumb. `slider(label, { value, show, onInput, steps | scale, ... })`
 * makes one that walks a list of set values, or runs on a log scale; either
 * way `show`, `onInput`, `value` and `set` deal in real values, and the input
 * itself in positions (which is what a lesson keeps and puts back).
 */
export function slider(label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, onInput: (v: number) => void, color?: string): Slider;
export function slider(label: string, o: SliderOptions): Slider;
export function slider(label: string, a: number | SliderOptions, max?: number, step?: number, value?: number, show?: (v: number) => string, onInput?: (v: number) => void, color?: string): Slider {
  const o: SliderOptions = typeof a === 'object' ? a : { min: a, max, step, value: value!, show: show!, onInput: onInput!, color };
  const scale = positions(o);
  const input = el('input', { type: 'range', min: scale.min, max: scale.max, step: scale.step, value: scale.to(o.value), 'aria-label': label }) as HTMLInputElement;
  if (o.color) input.style.setProperty('--thumb', o.color);
  const current = () => scale.from(Number(input.value));
  const out = el('output', {}, o.show(current()));
  const node = el('label.fig-slider', {}, el('span', {}, label), input, out);
  const fire = () => {
    const v = current();
    out.textContent = o.show(v);
    o.onInput(v);
  };
  input.addEventListener('input', fire);
  return {
    node,
    input,
    value: current,
    set: (v) => {
      input.value = String(scale.to(v));
      fire();
    },
  };
}

/** The input's own range, and the way between its positions and real values. */
function positions(o: SliderOptions): { min: number; max: number; step: number | 'any'; to: (v: number) => number; from: (pos: number) => number } {
  const round = (v: number, step?: number) => (step ? Math.round(v / step) * step : v);
  if (o.steps?.length) {
    const steps = o.steps;
    const nearest = (v: number) => steps.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(steps[best] - v) ? i : best), 0);
    return { min: 0, max: steps.length - 1, step: 1, to: nearest, from: (i) => steps[Math.max(0, Math.min(steps.length - 1, Math.round(i)))] };
  }
  const min = o.min ?? 0;
  const max = o.max ?? 100;
  if (o.scale === 'log') {
    if (!(min > 0 && max > min)) throw new Error(`a log slider needs 0 < min < max, not ${min} to ${max}`);
    const span = Math.log(max / min);
    return {
      min: 0, max: LOG_POSITIONS, step: 1,
      to: (v) => Math.round((Math.log(Math.max(min, Math.min(max, v)) / min) / span) * LOG_POSITIONS),
      from: (pos) => Math.max(min, Math.min(max, round(min * Math.exp((pos / LOG_POSITIONS) * span), o.step))),
    };
  }
  return { min, max, step: o.step ?? 1, to: (v) => v, from: (v) => v };
}

// ---------------------------------------------------------------------------
// Guess first. A figure that turns on one threshold asks the reader to say
// where it will be before the controls that reach it unlock, then checks the
// guess when the drawing gets there.

/** Lock or unlock sliders while a guess is being made. */
export function lock(sliders: readonly Slider[], locked: boolean): void {
  for (const s of sliders) s.input.disabled = locked;
}

export interface Choices {
  node: HTMLElement;
  /** The option picked, or -1. */
  picked: () => number;
  /** Stop or allow picking. */
  freeze: (frozen: boolean) => void;
  /** Pick option `i`, as a tap would. */
  pick: (i: number) => void;
}

/** A row of options for a guess, one of which can be picked. */
export function choices(options: readonly string[], onPick: (i: number) => void): Choices {
  let at = -1;
  const chips = options.map((text, i) => el('button.chip', { type: 'button', onclick: () => pick(i) }, text) as HTMLButtonElement);
  const pick = (i: number) => {
    at = i;
    chips.forEach((c, k) => c.classList.toggle('on', k === i));
    onPick(i);
  };
  return {
    node: el('div.chips.fig-choices', {}, chips),
    picked: () => at,
    freeze: (frozen) => chips.forEach((c) => (c.disabled = frozen)),
    pick,
  };
}

/** The button that locks a guess in. */
export function lockIn(text: string, onClick: () => void): HTMLButtonElement {
  return el('button.btn.btn-small', { type: 'button', onclick: onClick }, text) as HTMLButtonElement;
}

/**
 * Lets the reader put a guess on the drawing. A tap anywhere on it, or a drag
 * that starts on `handle`, sends the point (in drawing units) to `to`; with the
 * drawing focused, the arrow keys call `nudge` with -1 or 1. Only the handle
 * holds the page still for a drag, so the figure still scrolls on a phone.
 */
export function placeable(s: SVGSVGElement, handle: SVGElement, to: (x: number, y: number) => void, nudge: (step: number) => void): { enable: (on: boolean) => void } {
  let on = false;
  let dragging = false;
  const vb = s.viewBox.baseVal;
  const at = (e: PointerEvent) => {
    const r = s.getBoundingClientRect();
    if (!r.width) return;
    to(((e.clientX - r.left) / r.width) * vb.width, ((e.clientY - r.top) / r.height) * vb.height);
  };
  handle.style.touchAction = 'none';
  handle.style.cursor = 'grab';
  s.addEventListener('pointerdown', (e) => {
    if (!on) return;
    if (handle.contains(e.target as Node)) {
      dragging = true;
      s.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  });
  s.addEventListener('pointermove', (e) => { if (on && dragging) at(e); });
  const stop = () => (dragging = false);
  s.addEventListener('pointerup', (e) => { if (on && !dragging) at(e); stop(); });
  s.addEventListener('pointercancel', stop);
  s.addEventListener('keydown', (e) => {
    if (!on) return;
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (step) {
      nudge(step);
      e.preventDefault();
    }
  });
  return {
    enable: (v) => {
      on = v;
      s.classList.toggle('placing', v);
      if (v) s.setAttribute('tabindex', '0');
      else s.removeAttribute('tabindex');
    },
  };
}

/**
 * Puts a figure's caption at the top of its text box, above what it is showing
 * now. A still or a quiz has no live text box, so the caption gets one of its
 * own; that box is returned, to go under the figure.
 */
export function placeCaption(node: HTMLElement, caption: HTMLElement): HTMLElement | null {
  const box = node.querySelector('.fig-text');
  if (box) {
    box.prepend(caption);
    return null;
  }
  return el('div.fig-text', {}, caption);
}

export interface StandaloneFigure {
  /** The figure with its caption, as a lesson shows it: a `figure.fig`. */
  node: HTMLElement;
  /** Resolves when its task is done, when given a goal it has one for. */
  done?: Promise<void>;
  /** Resolves once it has drawn what it first shows (at once, for most figures). */
  ready: Promise<void>;
  /** Stop it: animations end, and anything it listens to is let go. */
  close: () => void;
}

/**
 * A figure outside a lesson, on a reference page, in a gallery of every
 * figure, or in a test: live, with its caption in its text box, scoring
 * nowhere and remembering nothing between visits.
 */
export function standaloneFigure(factory: FigureFactory, o: { caption: string; save: Progress; goal?: string; options?: Options }): StandaloneFigure {
  const ctx = testContext(o.save);
  const handle = factory(ctx, o.goal, o.options);
  const own = placeCaption(handle.node, el('p.fig-lead', {}, o.caption));
  const node = el('figure.fig', {}, handle.node, own);
  if (handle.done) void handle.done.then(() => node.classList.add('done'));
  return { node, done: handle.done, ready: figureReady(handle), close: ctx.close };
}

export interface TestContext extends FigureContext {
  /** Every score the figure reported, in order. */
  scores: [right: number, of: number][];
  /** Aborts `closed`. */
  close: () => void;
}

/** A context to build a figure with by hand: no lesson around it, its scores collected, closed when asked. */
export function testContext(save: Progress): TestContext {
  const ac = new AbortController();
  const scores: [number, number][] = [];
  return { save, closed: ac.signal, scores, score: (right, of) => void scores.push([right, of]), close: () => ac.abort() };
}

/** A promise with its resolver, settled once. */
function promised(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * Run `tick` every frame while the figure is on screen and the shift is open.
 * `tick` gets the seconds since the last frame (capped, so a tab that was
 * hidden does not jump).
 */
export function animate(node: Element, ctx: FigureContext, tick: (dt: number) => void): void {
  let visible = false;
  let running = false;
  let last = 0;
  const loop = (now: number) => {
    if (ctx.closed.aborted || !visible) {
      running = false;
      return;
    }
    tick(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible && !running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  });
  io.observe(node);
  ctx.closed.addEventListener('abort', () => io.disconnect(), { once: true });
}
