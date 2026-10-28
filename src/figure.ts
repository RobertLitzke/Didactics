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
}

export type Options = Record<string, unknown>;

/**
 * Makes a figure for a lesson block. A live figure lists the `goals` a lesson
 * may set it, so the content test can catch a goal that no figure would ever
 * meet; a quiz is always a task. Stills have neither.
 */
export type FigureFactory = ((ctx: FigureContext, goal?: string, options?: Options) => FigureHandle) & {
  goals?: readonly string[];
  quiz?: true;
};

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
}

const task = (ctx: FigureContext, goal: string | undefined, p: { promise: Promise<void>; resolve: () => void }): Task => ({
  goal,
  done: p.resolve,
  promise: p.promise,
  kept: ctx.memo?.kept,
  keep: ctx.memo?.keep ?? (() => {}),
  restored: ctx.memo?.restored ?? false,
});

/** A live figure, which knows the goals in `goals`. */
export function figure(goals: readonly string[], build: (ctx: FigureContext, t: Task, options?: Options) => HTMLElement): FigureFactory {
  const make = (ctx: FigureContext, goal?: string, options?: Options): FigureHandle => {
    const p = promised();
    const node = build(ctx, task(ctx, goal, p), options);
    return { node, done: goal ? p.promise : undefined };
  };
  return Object.assign(make, { goals });
}

/** A figure that is a test: its task is to be answered, whatever the lesson says. */
export function quiz(build: (ctx: FigureContext, t: Task, options?: Options) => HTMLElement): FigureFactory {
  const make = (ctx: FigureContext, _goal?: string, options?: Options): FigureHandle => {
    const p = promised();
    const node = build(ctx, task(ctx, undefined, p), options);
    return { node, done: p.promise };
  };
  return Object.assign(make, { quiz: true as const });
}

export interface Frame {
  node: HTMLElement;
  svg: SVGSVGElement;
  controls: HTMLElement;
  /** The live part of the text box under the drawing: what the figure is showing now. */
  readout: HTMLElement;
}

/**
 * The standard figure: a drawing `w` by `h` units, scaled to the column. The
 * text box under it keeps room for `lines` lines of readout at phone width, so
 * the controls below stay put while the text changes; the lesson puts the
 * figure's caption at the top of the same box (views/shift.ts).
 */
export function frame(w: number, h: number, lines = 3, ...extra: Child[]): Frame {
  const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'fig-svg', role: 'img' }) as SVGSVGElement;
  const readout = el('p.fig-readout');
  const controls = el('div.fig-controls');
  const node = el('div.fig-body', {}, s, textBox(readout, lines), controls, ...extra);
  return { node, svg: s, controls, readout };
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

/** A labelled range input that shows its value with `show`; `color` is any CSS colour, for the thumb. */
export function slider(label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, onInput: (v: number) => void, color?: string): Slider {
  const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label }) as HTMLInputElement;
  if (color) input.style.setProperty('--thumb', color);
  const out = el('output', {}, show(value));
  const node = el('label.fig-slider', {}, el('span', {}, label), input, out);
  const fire = () => {
    const v = Number(input.value);
    out.textContent = show(v);
    onInput(v);
  };
  input.addEventListener('input', fire);
  return {
    node,
    input,
    value: () => Number(input.value),
    set: (v) => {
      input.value = String(v);
      fire();
    },
  };
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
  return { node, done: handle.done, close: ctx.close };
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
