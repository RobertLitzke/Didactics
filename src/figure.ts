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
import { makeRng, type Rng } from './rng';

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
  /**
   * A question of the lesson's check has been answered: the lesson passes it
   * on, to be kept for review (review.ts). Absent outside a lesson.
   */
  answered?: (q: AnsweredQuestion) => void;
  /**
   * The figure is being asked as a flash card on the review page, not shown
   * in a lesson (see FigureCard): it starts from readings of its own, drawn
   * from `seed`, asks its guess afresh, and says through `verdict` whether
   * the guess was right once that is known.
   */
  card?: CardRun;
}

/** A figure asked as a flash card: where its readings come from, and where its verdict goes. */
export interface CardRun {
  seed: number;
  verdict: (right: boolean) => void;
}

/**
 * What a figure that can be a flash card says about that card: the words it
 * goes by away from the figure (the Anki package, the review of every course),
 * and the goal it is built with when asked. A card's figure starts from
 * readings drawn at random each time (`t.card.seed`), so the answer cannot
 * be learned by heart, asks its guess, and gives its verdict.
 */
export interface FigureCard {
  /** The card's question, in words. */
  front: string;
  /** Its answer, in words, as said when the figure cannot be shown. */
  back: string;
  /** The goal to build it with; default the first of its goals. */
  goal?: string;
}

/** A check question as answered, with what it takes to ask it again (check.ts, review.ts). */
export interface AnsweredQuestion {
  /** The step's own key, when the question's words alone do not tell it from another (the same words over another photo). */
  key?: string;
  ask: string;
  choices: string[];
  answer: number;
  why: string;
  /** The choice picked. */
  picked: number;
  /** The address of the photo it showed, if it showed one; `drawing` when its picture was drawn instead. */
  image?: string;
  drawing?: boolean;
  /** The question's place in the check, and the check's seed: with these the check makes the same question again. */
  index: number;
  seed: number;
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
  /** It can be asked as a flash card once its lesson is done (review.ts). */
  card?: FigureCard;
  /** Drawn from its options alone (charts.ts), so each block that uses it is a different drawing: a gallery shows every one. */
  each?: true;
};

/** What a figure says about itself beyond how it is built. */
export interface FigureSpec {
  /** Checks a block's options, so a wrong id in a lesson's JSON fails the content test, not the reader. */
  options?: OptionsCheck;
  /** It is also a flash card, once its lesson is done (review.ts). */
  card?: FigureCard;
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
  /** Present when the figure is asked as a flash card: see FigureContext.card. */
  readonly card?: CardRun;
}

/**
 * Where a figure's starting readings come from: the flash card's seed when it
 * is one, so each asking is new, otherwise a fresh seed each time it is built.
 * Draw from it with rng.ts `between`, `oneOf` and `jitter`.
 */
export function startRng(t: Pick<Task, 'card'>): Rng {
  return makeRng(t.card?.seed ?? (Math.random() * 2 ** 32) >>> 0);
}

const task = (ctx: FigureContext, goal: string | undefined, p: { promise: Promise<void>; resolve: () => void }, waits: Promise<unknown>[]): Task => ({
  goal,
  done: p.resolve,
  promise: p.promise,
  kept: ctx.memo?.kept,
  keep: ctx.memo?.keep ?? (() => {}),
  restored: ctx.memo?.restored ?? false,
  waitFor: (w) => void waits.push(w),
  ...(ctx.card ? { card: ctx.card } : {}),
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
  return Object.assign(make, { goals }, spec.options ? { options: spec.options } : {}, spec.card ? { card: spec.card } : {});
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

/**
 * A readout that only ever grows: `--lines` is a guess, and a figure whose text runs longer than it
 * (a narrow phone, a long state) would push the controls below it up and down as the text changes.
 * Once a longer text has been seen the box stays that tall, until the column's width changes.
 */
function keepTallest(readout: HTMLElement) {
  if (typeof ResizeObserver === 'undefined') return;
  let width = 0;
  new ResizeObserver(() => {
    const w = readout.clientWidth;
    if (!w) return;
    if (w !== width) {
      width = w;
      readout.style.minHeight = '';
      return;
    }
    const h = readout.offsetHeight;
    if (h > (parseFloat(readout.style.minHeight) || 0)) readout.style.minHeight = `${h}px`;
  }).observe(readout);
}

/** The box a figure's text lives in, `lines` lines of readout tall. */
export function textBox(readout: HTMLElement, lines = 3): HTMLElement {
  readout.style.setProperty('--lines', String(lines));
  keepTallest(readout);
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

export interface Player {
  /** The Play / Pause / Play again button, to put beside the slider. */
  node: HTMLButtonElement;
  play: () => void;
  pause: () => void;
  playing: () => boolean;
}

export interface PlayerOptions {
  /** Seconds from one end of the slider to the other. Default 12. */
  seconds?: number;
  /** Called when a run reaches the end. */
  onEnd?: () => void;
}

/**
 * A Play button that walks `s` from where it stands to its far end, a time
 * lapse: each frame moves the input as a hand would, so the figure redraws
 * through its own `onInput`. Moving the slider by hand pauses it; at the end
 * it offers "Play again" from the start. A locked slider (a guess first)
 * locks the button too. Stops for good when the figure closes.
 */
export function player(s: Slider, ctx: FigureContext, o: PlayerOptions = {}): Player {
  const input = s.input;
  const lo = () => Number(input.min);
  const hi = () => Number(input.max);
  const button = el('button.btn.btn-ghost.fig-play', { type: 'button' }) as HTMLButtonElement;
  let on = false;
  let driving = false;
  const atEnd = () => Number(input.value) >= hi();
  const show = () => {
    button.textContent = on ? 'Pause' : atEnd() ? 'Play again' : 'Play';
    button.setAttribute('aria-pressed', String(on));
  };
  const pause = () => {
    on = false;
    show();
  };
  const play = () => {
    if (on || input.disabled || ctx.closed.aborted) return;
    if (atEnd()) {
      driving = true;
      input.value = String(lo());
      input.dispatchEvent(new Event('input'));
      driving = false;
    }
    on = true;
    show();
    const rate = (hi() - lo()) / Math.max(0.5, o.seconds ?? 12);
    let clock = Number(input.value);
    let last = performance.now();
    const step = (now: number) => {
      if (!on || ctx.closed.aborted) return;
      clock = Math.min(hi(), clock + Math.min(1 / REDUCED_FPS, (now - last) / 1000) * rate);
      last = now;
      const before = input.value;
      input.value = String(clock);
      if (input.value !== before) {
        driving = true;
        input.dispatchEvent(new Event('input'));
        driving = false;
      }
      if (clock >= hi()) {
        input.value = input.max;
        on = false;
        show();
        o.onEnd?.();
        return;
      }
      nextFrame(step);
    };
    nextFrame(step);
  };
  button.addEventListener('click', () => (on ? pause() : play()));
  input.addEventListener('input', () => {
    if (driving) return;
    if (on) pause();
    else show();
  });
  // A guess first locks the slider; the button follows it.
  new MutationObserver(() => {
    button.disabled = input.disabled;
    if (input.disabled) pause();
  }).observe(input, { attributes: true, attributeFilter: ['disabled'] });
  button.disabled = input.disabled;
  ctx.closed.addEventListener('abort', pause, { once: true });
  show();
  return { node: button, play, pause, playing: () => on };
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
  /** Stop or allow picking. Frozen, the pick stands out as the reader's guess. */
  freeze: (frozen: boolean) => void;
  /** Pick option `i`, as a tap would. */
  pick: (i: number) => void;
  /**
   * Say which option was right: the pick turns green with a tick or red with
   * a cross, the right one is ringed when the pick was not it, and a verdict
   * line says so under them. Returns whether the pick was right. Freezes them.
   */
  mark: (answer: number) => boolean;
}

/** A row of options for a guess, one of which can be picked. */
export function choices(options: readonly string[], onPick: (i: number) => void): Choices {
  let at = -1;
  const chips = options.map((text, i) => el('button.chip', { type: 'button', onclick: () => pick(i) }, text) as HTMLButtonElement);
  const node = el('div.chips.fig-choices', {}, chips);
  const pick = (i: number) => {
    at = i;
    chips.forEach((c, k) => c.classList.toggle('on', k === i));
    onPick(i);
  };
  const freeze = (frozen: boolean) => {
    chips.forEach((c) => (c.disabled = frozen));
    node.classList.toggle('frozen', frozen);
    chips.forEach((c, k) => {
      if (frozen && k === at) c.setAttribute('aria-label', `Your guess: ${options[k]}`);
      else c.removeAttribute('aria-label');
    });
  };
  let marked: { at: number; answer: number } | undefined;
  const mark = (answer: number) => {
    const right = at === answer;
    // Marked the same already: a figure may mark on every redraw.
    if (marked?.at === at && marked.answer === answer) return right;
    marked = { at, answer };
    freeze(true);
    chips.forEach((c, k) => {
      c.classList.toggle('right', k === at && right);
      c.classList.toggle('wrong', k === at && !right);
      c.classList.toggle('answer', k === answer && !right);
    });
    node.querySelector(':scope > .fig-verdict')?.remove();
    node.append(verdict(right, right ? 'Your guess was right.' : `Your guess was wrong. The answer: ${options[answer]}.`));
    return right;
  };
  return { node, picked: () => at, freeze, pick, mark };
}

/**
 * A guess's verdict, plain to see: a green tick or a red cross, and words.
 * For a guess put on the drawing (see placeable), set it in the controls.
 */
export function verdict(right: boolean, text?: string): HTMLElement {
  return el(`p.fig-verdict.${right ? 'right' : 'wrong'}`, { role: 'status' },
    el('span.fig-verdict-mark', { 'aria-hidden': 'true' }, right ? '✓' : '✗'),
    el('span', {}, text ?? (right ? 'Your guess was right.' : 'Your guess was wrong.')));
}

/** Pass a verdict on when the figure is a flash card; returns `right`. Use it as `tellCard(t, pick.mark(answer))`, so the marking happens either way. */
export function tellCard(t: Pick<Task, 'card'>, right: boolean): boolean {
  t.card?.verdict(right);
  return right;
}

/**
 * Show a guess's verdict in `where`, in place of any shown there before, and
 * pass it on when the figure is a flash card. Returns `right`.
 */
export function showVerdict(t: Pick<Task, 'card'>, where: HTMLElement, right: boolean, text?: string): boolean {
  where.querySelector(':scope > .fig-verdict')?.remove();
  where.append(verdict(right, text));
  t.card?.verdict(right);
  return right;
}

/** The button that locks a guess in. */
export function lockIn(text: string, onClick: () => void): HTMLButtonElement {
  return el('button.btn.btn-small', { type: 'button', onclick: onClick }, text) as HTMLButtonElement;
}

export interface GuessFirstOptions {
  /** The question, shown in the readout until the guess is in. */
  ask: string;
  options: readonly string[];
  /** Locked until the guess is in. */
  sliders: readonly Slider[];
  /** Other controls kept out of sight until the guess is in, so they are not mistaken for the guess's own chips. */
  buttons?: readonly HTMLButtonElement[];
  /** Controls hidden until the guess is in. */
  hidden?: readonly HTMLElement[];
  /** The right option, or a function giving it (for readings drawn at random); leave out when no option is wrong. */
  answer?: number | (() => number);
  /**
   * When the verdict shows: as the guess is locked in (default), or when the
   * figure's task is done, for a figure whose controls are there to find the
   * answer. A flash card always shows it as the guess is locked in.
   */
  reveal?: 'lock' | 'done';
  /** Runs once the guess is in, with the option picked. */
  after: (guess: number) => void;
  /** The lock-in button's words. Default "Lock it in". */
  lockText?: string;
}

/**
 * A guess before the controls: `ask` in the readout, the options as chips, and
 * the sliders locked until a pick is locked in; then `after(guess)` runs. The
 * pick stays standing out as the reader's guess, and with an `answer` it is
 * marked right or wrong (see Choices.mark). The guess is kept, so a reader who
 * comes back finds it made; a flash card asks it afresh. Returns whether the
 * guess is in.
 */
export function guessFirst(t: Task, f: { controls: HTMLElement; readout: HTMLElement }, o: GuessFirstOptions): () => boolean {
  let open = false;
  const pick = choices(o.options, () => (go.disabled = false));
  const answerOf = () => (typeof o.answer === 'function' ? o.answer() : o.answer);
  const reveal = () => {
    const a = answerOf();
    if (a === undefined) return;
    const right = pick.mark(a);
    t.card?.verdict(right);
  };
  const go = lockIn(o.lockText ?? 'Lock it in', () => {
    const guess = pick.picked();
    if (guess < 0 || open) return;
    if (!t.card) t.keep(guess);
    pick.freeze(true);
    go.remove();
    lock(o.sliders, false);
    for (const h of [...(o.buttons ?? []), ...(o.hidden ?? [])]) h.style.display = '';
    open = true;
    o.after(guess);
    if (o.reveal === 'done' && !t.card && !t.restored) void t.promise.then(reveal);
    else reveal();
  });
  go.disabled = true;
  lock(o.sliders, true);
  for (const h of [...(o.buttons ?? []), ...(o.hidden ?? [])]) h.style.display = 'none';
  f.controls.prepend(pick.node, go);
  f.readout.textContent = o.ask;
  queueMicrotask(() => {
    if (!t.card && typeof t.kept === 'number' && !open) {
      pick.pick(t.kept);
      go.click();
    }
  });
  return () => open;
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
  nameDrawing(node, caption);
  const box = node.querySelector('.fig-text');
  if (box) {
    box.prepend(caption);
    return null;
  }
  return el('div.fig-text', {}, caption);
}

let captions = 0;

/** The figure's drawing (its first SVG or canvas) is an image to a screen reader, named by its caption. */
function nameDrawing(node: HTMLElement, caption: HTMLElement): void {
  const drawing = node.querySelector('svg, canvas');
  if (!drawing || drawing.hasAttribute('aria-label') || drawing.hasAttribute('aria-labelledby')) return;
  caption.id ||= `fig-caption-${++captions}`;
  drawing.setAttribute('role', 'img');
  drawing.setAttribute('aria-labelledby', caption.id);
}

/** The reader has asked for less motion: continuous animation steps a few times a second instead. */
export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Frames per second to step at under reduced motion. */
const REDUCED_FPS = 2;

/**
 * requestAnimationFrame, or under reduced motion a slow tick: the figure
 * still moves, as a cause still has its effect, but in steps rather than a
 * smooth run.
 */
export function nextFrame(cb: (now: number) => void): void {
  if (reducedMotion()) setTimeout(() => cb(performance.now()), 1000 / REDUCED_FPS);
  else requestAnimationFrame(cb);
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
 * Run `tick` every frame while the figure is on screen and the lesson is open.
 * `tick` gets the seconds since the last frame (capped, so a tab that was
 * hidden does not jump). Under reduced motion it runs a few times a second.
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
    tick(Math.min(reducedMotion() ? 1 / REDUCED_FPS : 0.05, (now - last) / 1000));
    last = now;
    nextFrame(loop);
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible && !running) {
      running = true;
      last = performance.now();
      nextFrame(loop);
    }
  });
  io.observe(node);
  ctx.closed.addEventListener('abort', () => io.disconnect(), { once: true });
}
