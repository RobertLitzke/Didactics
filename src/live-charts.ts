// Live figures a lesson sets up in its JSON alone, with no code in the course,
// beside the stills of charts.ts:
//
//   hotspots       a picture with points to tap: explore what each part is, or find each by name
//   compare        two pictures of one view, wiped across; or several, stepped through in order
//   timeline-live  a timeline to play through, or to put in order
//   scale-guess    a scale comparison with one bar hidden until the reader guesses it
//   groups         things to sort into groups, one at a time, each marked right or wrong
//   id-key         a key of paired choices that walks to a name, with specimens to key out
//   id-key         (or) a key entered anywhere: tick features in any order until one is left
//   id-drill       name what a picture shows: a quiz whose answers join the review deck
//   clue-board     a mystery's ideas, crossed out one by one as clues are turned on
//   loop           stages round a cycle, stepped through, or built arrow by arrow
//   regroup        the same things grouped two ways, a tree each, switched between
//
// A course adds them to its figures once, beside the charts:
//
//   { ...charts({ palette, asset }), ...liveCharts({ palette, asset, photos }), ...FIGURES }
//
// `photos` is the course's photo library (didactics/photos PhotoLibrary): a
// picture in the options is then `"photo": "<id>"`, and its credit line comes
// from the photo's record. A picture that is not in the library is
// `"image": "<path>"` with its `"width"` and `"height"` in pixels, and an
// optional `"alt"` and `"credit"`.
//
// They keep the figure rules: one text box of fixed height under the drawing
// (`"textLines"` sets how many lines it holds), the drawing never hidden while the
// reader works on it, each pick marked right or wrong where there is a right
// answer, and a guess before the controls where the figure turns on one.
// Each knows the goals listed with it, which a block sets with "goal".

import { el, svg } from './dom';
import { block, colorProblem, drawScale, framing, isNum, isStr, kit, lineHeight, list, loaded, sayValue, sayWhen, checkScale, checkTimeline, textWidth, wrap, type ChartsOptions, type Kit, type ScaleOptions, type TimelineEvent, type TimelineOptions, type TreeNode } from './charts';
import { check } from './check';
import { arrow, label, line } from './draw';
import { figure, frame, guessFirst, placeable, player, slider, startRng, verdict, type FigureFactory, type Options, type Task } from './figure';
import { credit, photoFigure, type Photo, type PhotoLibrary } from './photos';
import { oneOf, shuffle } from './rng';

/** The ids the live charts go by in a lesson's blocks. */
export const LIVE_CHART_IDS = ['hotspots', 'compare', 'timeline-live', 'scale-guess', 'groups', 'id-key', 'id-drill', 'clue-board', 'loop', 'regroup'] as const;
export type LiveChartId = (typeof LIVE_CHART_IDS)[number];

export interface LiveChartsOptions<P extends Photo & { about?: string } = Photo & { about?: string }> extends ChartsOptions {
  /** The course's photos, so options can name a picture by `"photo": "<id>"`. */
  photos?: PhotoLibrary<P>;
}

const W = 400;

// ---- Pictures ----------------------------------------------------------------------

/** A picture as options give it: a photo from the course's library, or an image by path. */
export interface PictureSpec {
  /** A photo id in the course's library; its credit comes from its record. */
  photo?: string;
  /** Or an image's path next to the page, or a URL. */
  image?: string;
  /** The image's size in pixels, for its shape (not needed with `photo`). */
  width?: number;
  height?: number;
  /** What it shows, for a screen reader. */
  alt?: string;
  /** Who made it, for an `image`. */
  credit?: string;
}

interface Pic {
  href: string;
  w: number;
  h: number;
  alt: string;
  /** The credit line, as HTML, to go under the drawing. */
  credit: () => HTMLElement | null;
  /** The picture with its credit, as a check shows it. */
  node: () => HTMLElement;
}

interface Env {
  k: Kit;
  asset: (p: string) => string;
  photos?: PhotoLibrary<Photo & { about?: string }>;
}

function pictureOf(spec: PictureSpec, env: Env): Pic | null {
  if (spec.photo) {
    const p = env.photos?.find(spec.photo);
    if (!p) return null;
    const href = env.photos!.src(p);
    return {
      href, w: p.width, h: p.height, alt: spec.alt ?? p.about ?? '',
      credit: () => credit(p),
      node: () => photoFigure(p, href, { alt: spec.alt, loading: 'lazy' }),
    };
  }
  if (!spec.image) return null;
  const href = env.asset(spec.image);
  const words = spec.credit;
  return {
    href, w: spec.width ?? 4, h: spec.height ?? 3, alt: spec.alt ?? '',
    credit: () => (words ? el('p.credit', {}, words) : null),
    node: () => el('figure.photo', {},
      el('img', { src: href, alt: spec.alt ?? '', width: spec.width, height: spec.height, decoding: 'async', loading: 'lazy' }),
      words ? el('figcaption', {}, el('p.credit', {}, words)) : null),
  };
}

const hasPicture = (v: Record<string, unknown>) => v.photo !== undefined || v.image !== undefined;

/** What is wrong with a picture in the options; `required` when it must have one. */
function pictureProblems(v: Record<string, unknown>, env: Env, where: string, required = true): string[] {
  const at = where ? `${where}: ` : '';
  if (v.photo !== undefined) {
    if (!isStr(v.photo) || !v.photo) return [`${at}"photo" should be a photo id`];
    if (!env.photos) return [`${at}"photo" needs the course's photos handed to liveCharts({ photos })`];
    return env.photos.find(v.photo) ? [] : [`${at}no photo "${v.photo}"`];
  }
  if (v.image !== undefined) {
    const out: string[] = [];
    if (!isStr(v.image) || !v.image) out.push(`${at}"image" should be a path`);
    for (const key of ['width', 'height'] as const) if (!(isNum(v[key]) && v[key] > 0)) out.push(`${at}"${key}" should be the image's ${key} in pixels`);
    for (const key of ['alt', 'credit'] as const) if (v[key] !== undefined && !isStr(v[key])) out.push(`${at}"${key}" should be text`);
    return out;
  }
  return required ? [`${at}needs a "photo" id or an "image" path`] : [];
}

/** A picture drawn into an SVG, filling `w` by `h` at (x, y); waits on it loading. */
function image(p: Pic, x: number, y: number, w: number, h: number, t: Task, fit: 'slice' | 'meet' = 'slice'): SVGElement {
  const wait = loaded(p.href);
  if (wait) t.waitFor(wait);
  return svg('image', { href: p.href, x, y, width: w, height: h, preserveAspectRatio: `xMidYMid ${fit}` });
}

/** A credit line under the drawing, when the picture has one. */
function creditUnder(drawing: Element, p: Pic | null): void {
  const c = p?.credit();
  if (c) drawing.after(c);
}

/** A place under the drawing for the credit of whichever pictures show now; `show` fills it. */
function creditSlot(drawing: Element): { show: (pics: (Pic | null | undefined)[]) => void } {
  const slot = el('div.fig-credits');
  drawing.after(slot);
  return { show: (pics) => slot.replaceChildren(...pics.map((p) => p?.credit()).filter((c): c is HTMLElement => !!c)) };
}

/** Words on a pale halo, to read on any picture. */
function haloLabel(x: number, y: number, text: string, k: Kit, style: { anchor?: 'middle' | 'end'; fill?: string; size?: 'note' | 'small' } = {}): SVGElement[] {
  const size = style.size ?? 'note';
  const back = label(x, y, text, { size, bold: true, anchor: style.anchor, fill: k.paper });
  back.setAttribute('stroke', k.paper);
  back.setAttribute('stroke-width', '4');
  back.setAttribute('stroke-linejoin', 'round');
  return [back, label(x, y, text, { size, bold: true, anchor: style.anchor, fill: style.fill ?? k.ink })];
}

/** The readout as a bold lead and the words after it. */
function say(readout: HTMLElement, lead: string, rest = ''): void {
  readout.replaceChildren(el('strong', {}, lead), rest ? ` ${rest}` : '');
}

/** A tappable thing in a drawing: a button to a keyboard and a screen reader too. */
function tappable(g: SVGElement, name: string, onTap: () => void): void {
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.setAttribute('aria-label', name);
  g.classList.add('fig-tap');
  g.addEventListener('click', onTap);
  g.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      onTap();
    }
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function linesProblem(o: Record<string, unknown>): string[] {
  return o.textLines === undefined || (isNum(o.textLines) && o.textLines >= 1 && o.textLines <= 8) ? [] : ['"textLines" should be how many lines the text box holds, 1 to 8'];
}

/** A figure from options, with its check: an options problem is shown in place of the drawing. */
function live<O>(goals: readonly string[], check: (o: Record<string, unknown>) => string[], build: (o: O, t: Task, ctx: Parameters<FigureFactory>[0]) => HTMLElement): FigureFactory {
  const options = (o: Options | undefined) => (isRecord(o) ? check(o) : ['needs "options" to draw from']);
  const f = figure(goals, (ctx, t, o) => {
    const problems = options(o);
    if (problems.length) {
      t.done();
      return el('div.fig-body.fig-still', {}, el('p.fig-readout', {}, problems.join('; ')));
    }
    return build(o as O, t, ctx);
  }, { options });
  return Object.assign(f, { each: true as const });
}

// ---- Hotspots ---------------------------------------------------------------------------

export interface Hotspot {
  /** Where on the picture, from 0 (left, top) to 1 (right, bottom). */
  x: number;
  y: number;
  name: string;
  /** Said in the text box once it is tapped or found. */
  text?: string;
}

export interface HotspotsOptions extends PictureSpec {
  spots: Hotspot[];
  /** Lines the text box holds; default 3. */
  textLines?: number;
  /** The text box's words before anything is tapped. */
  intro?: string;
}

function checkHotspots(env: Env) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...pictureProblems(o, env, ''), ...linesProblem(o)];
    if (o.intro !== undefined && !isStr(o.intro)) out.push('"intro" should be text');
    const spots = list(o, 'spots');
    if (!spots) return [...out, 'needs "spots", a list of { "x", "y", "name" }'];
    spots.forEach((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const at = `spot ${i + 1}`;
      for (const key of ['x', 'y'] as const) if (!(isNum(s[key]) && s[key] >= 0 && s[key] <= 1)) out.push(`${at}: "${key}" should be from 0 to 1, across the picture`);
      if (!isStr(s.name) || !s.name) out.push(`${at}: "name" should be text`);
      if (s.text !== undefined && !isStr(s.text)) out.push(`${at}: "text" should be text`);
    });
    return out;
  };
}

/**
 * A picture with spots to tap. With no goal or "explore", the spots are
 * numbered and each tap names the part in the text box; "explore" is done once
 * every spot has been tapped. With "find", the spots are blank and the text
 * box names one part at a time to find: a right tap marks it green and names it
 * on the picture, a wrong one flashes red and says what was tapped instead.
 */
function hotspots(env: Env): FigureFactory {
  const { k } = env;
  return live<HotspotsOptions>(['explore', 'find'], checkHotspots(env), (o, t) => {
    const pic = pictureOf(o, env)!;
    const ih = Math.round((W * pic.h) / pic.w);
    const find = t.goal === 'find';
    const f = frame(W, ih, o.textLines ?? (find ? 4 : 3));
    f.svg.append(svg('rect', { x: 0, y: 0, width: W, height: ih, fill: k.grid }), image(pic, 0, 0, W, ih, t));
    if (pic.alt) f.svg.setAttribute('aria-label', pic.alt);
    creditUnder(f.svg, pic);
    const n = o.spots.length;
    const kept = (isRecord(t.kept) ? t.kept : {}) as { seen?: number[]; order?: number[]; found?: number[]; misses?: number };
    const valid = (xs: unknown): number[] => (Array.isArray(xs) ? xs.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < n) : []);
    // Explore: what has been tapped. Find: the order the parts are asked in, and how far along.
    const seen = new Set<number>(t.restored && !kept.seen ? o.spots.map((_, i) => i) : valid(kept.seen));
    const keptOrder = valid(kept.order);
    const order = keptOrder.length === n ? keptOrder : shuffle(o.spots.map((_, i) => i), startRng(t));
    const found = new Set<number>(t.restored && !kept.found ? order : valid(kept.found));
    let misses = typeof kept.misses === 'number' ? kept.misses : 0;
    const next = () => order.find((i) => !found.has(i));

    const nodes = o.spots.map((s, i) => {
      const x = s.x * W;
      const y = s.y * ih;
      const ring = svg('circle', { cx: x, cy: y, r: 9, fill: k.paper, stroke: k.ink, 'stroke-width': 2, opacity: 0.92 });
      const num = label(x, y + 4, String(i + 1), { size: 'note', bold: true, anchor: 'middle' });
      const words = svg('g');
      const g = svg('g', {}, svg('circle', { cx: x, cy: y, r: 18, fill: 'transparent' }), ring, num, words);
      tappable(g, find ? `Spot ${i + 1}` : s.name, () => tap(i));
      return { g, ring, num, words, x, y };
    });
    f.svg.append(...nodes.map((d) => d.g));

    const nameOn = (i: number, color: string) => {
      const d = nodes[i];
      const left = d.x > W * 0.62;
      d.words.replaceChildren(...haloLabel(left ? d.x - 13 : d.x + 13, d.y + 4, o.spots[i].name, k, { anchor: left ? 'end' : undefined, fill: color }));
    };
    const paint = () => {
      nodes.forEach((d, i) => {
        const on = find ? found.has(i) : seen.has(i);
        d.ring.setAttribute('fill', on ? (find ? k.color('good', 0) : k.ink) : k.paper);
        d.num.setAttribute('fill', on ? k.paper : k.ink);
        d.num.style.display = find ? 'none' : '';
        if (on) nameOn(i, find ? k.color('good', 0) : k.ink);
        else d.words.replaceChildren();
      });
    };
    const ask = () => {
      const i = next();
      if (i === undefined) return `All ${n} found${misses ? `, with ${misses} wrong ${misses === 1 ? 'tap' : 'taps'} on the way` : ' without a wrong tap'}.`;
      return `Find: ${o.spots[i].name}.`;
    };
    const keep = () => t.keep(find ? { order, found: [...found], misses } : { seen: [...seen] });

    function tap(i: number) {
      const s = o.spots[i];
      if (!find) {
        seen.add(i);
        keep();
        paint();
        const left = n - seen.size;
        say(f.readout, `${s.name}.`, `${s.text ?? ''}${t.goal === 'explore' && left ? ` (${left} more to tap.)` : ''}`.trim());
        if (t.goal === 'explore' && !left) t.done();
        return;
      }
      const want = next();
      if (want === undefined) {
        say(f.readout, `${s.name}.`, s.text ?? '');
        return;
      }
      if (i === want) {
        found.add(i);
        keep();
        paint();
        say(f.readout, `Yes, the ${s.name}.`, `${s.text ? `${s.text} ` : ''}${ask()}`);
        if (next() === undefined) t.done();
      } else {
        misses++;
        keep();
        const d = nodes[i];
        d.ring.setAttribute('fill', k.color('bad', 0));
        setTimeout(paint, 700);
        say(f.readout, found.has(i) ? `That is the ${s.name}, found already.` : `That is the ${s.name}.`, ask());
      }
    }

    paint();
    if (find) f.readout.textContent = ask();
    else f.readout.textContent = o.intro ?? (t.goal === 'explore' ? `Tap each numbered spot to see what it is (${n - seen.size} to go).` : 'Tap a numbered spot to see what it is.');
    return f.node;
  });
}

// ---- Compare ------------------------------------------------------------------------------

export interface CompareFrame extends PictureSpec {
  label: string;
  /** Said in the text box while this picture shows. */
  text?: string;
}

export interface CompareOptions {
  /** Two pictures of the same view to wipe between, or three or more to step through. */
  frames: CompareFrame[];
  textLines?: number;
  /** Ask first, controls locked until the guess is in. */
  guess?: { ask: string; options: string[]; answer?: number };
  /** Seconds a Play takes through three or more pictures; default 2 a picture. */
  seconds?: number;
}

function checkGuess(o: Record<string, unknown>): string[] {
  if (o.guess === undefined) return [];
  const g = o.guess as Record<string, unknown>;
  const out: string[] = [];
  if (!isRecord(g) || !isStr(g.ask)) return ['"guess" should be { "ask", "options", "answer"? }'];
  if (!Array.isArray(g.options) || g.options.length < 2 || !g.options.every(isStr)) out.push('"guess": "options" should be two or more choices');
  else if (g.answer !== undefined && !(Number.isInteger(g.answer) && (g.answer as number) >= 0 && (g.answer as number) < g.options.length)) out.push('"guess": "answer" should be the index of one of its options');
  return out;
}

function checkCompare(env: Env) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...linesProblem(o), ...checkGuess(o)];
    const frames = list(o, 'frames');
    if (!frames || frames.length < 2) return [...out, 'needs "frames", two or more pictures with a "label"'];
    frames.forEach((raw, i) => {
      const fr = (raw ?? {}) as Record<string, unknown>;
      out.push(...pictureProblems(fr, env, `frame ${i + 1}`));
      if (!isStr(fr.label) || !fr.label) out.push(`frame ${i + 1}: "label" should be text`);
      if (fr.text !== undefined && !isStr(fr.text)) out.push(`frame ${i + 1}: "text" should be text`);
    });
    if (o.seconds !== undefined && !(isNum(o.seconds) && o.seconds > 0)) out.push('"seconds" should be a number above 0');
    return out;
  };
}

/**
 * Pictures of one view at different times or in different states. Two are
 * wiped across with a slider or a drag on the picture (the first on the left);
 * three or more are stepped through in order, with Play. "seen" is done once
 * the reader has seen each end.
 */
function compare(env: Env): FigureFactory {
  const { k } = env;
  return live<CompareOptions>(['seen'], checkCompare(env), (o, t, ctx) => {
    const pics = o.frames.map((fr) => pictureOf(fr, env)!);
    const ih = Math.round((W * pics[0].h) / pics[0].w);
    const f = frame(W, ih, o.textLines ?? 3);
    f.svg.append(svg('rect', { x: 0, y: 0, width: W, height: ih, fill: k.grid }));
    const sliders = [];
    const buttons: HTMLButtonElement[] = [];
    let update: () => void;
    let ends = new Set<'a' | 'b'>();
    const reached = () => {
      if (ends.size === 2) t.done();
    };
    if (pics.length === 2) {
      const [a, b] = o.frames;
      const clipId = `compare-${++clips}`;
      const cut = svg('rect', { x: W / 2, y: 0, width: W / 2, height: ih });
      const bar = line(W / 2, 0, W / 2, ih, k.paper, 3);
      const knob = svg('g', {}, svg('circle', { cx: W / 2, cy: ih / 2, r: 13, fill: k.paper, stroke: k.ink, 'stroke-width': 1.5 }), label(W / 2, ih / 2 + 4, '⇔', { anchor: 'middle', bold: true }));
      f.svg.append(
        image(pics[0], 0, 0, W, ih, t),
        svg('defs', {}, svg('clipPath', { id: clipId }, cut)),
        svg('g', { 'clip-path': `url(#${clipId})` }, image(pics[1], 0, 0, W, ih, t)),
        bar, knob,
        ...haloLabel(8, 18, a.label, k),
        ...haloLabel(W - 8, 18, b.label, k, { anchor: 'end' }),
      );
      const s = slider(`${a.label} or ${b.label}`, { min: 0, max: 100, step: 1, value: 50, show: (v) => `${Math.round(v)}%`, onInput: () => update() });
      update = () => {
        const v = s.value();
        const x = (v / 100) * W;
        cut.setAttribute('x', String(x));
        cut.setAttribute('width', String(W - x));
        bar.setAttribute('x1', String(x));
        bar.setAttribute('x2', String(x));
        knob.setAttribute('transform', `translate(${x - W / 2},0)`);
        if (v >= 90) ends.add('a');
        if (v <= 10) ends.add('b');
        if (v >= 90) say(f.readout, `${a.label}.`, a.text ?? '');
        else if (v <= 10) say(f.readout, `${b.label}.`, b.text ?? '');
        else f.readout.textContent = `${a.label} on the left, ${b.label} on the right. Drag across to compare.`;
        t.keep([...ends]);
        reached();
      };
      const drag = placeable(f.svg, knob, (x) => s.set(Math.max(0, Math.min(100, (x / W) * 100))), (step) => s.set(s.value() + step * 5));
      sliders.push(s);
      f.controls.append(s.node);
      queueMicrotask(() => drag.enable(!s.input.disabled));
      new MutationObserver(() => drag.enable(!s.input.disabled)).observe(s.input, { attributes: true, attributeFilter: ['disabled'] });
    } else {
      const img = image(pics[0], 0, 0, W, ih, t);
      // Load every picture now, so a step shows at once.
      for (const p of pics.slice(1)) {
        const w = loaded(p.href);
        if (w) t.waitFor(w);
      }
      const tag = svg('g');
      f.svg.append(img, tag);
      const last = pics.length - 1;
      const s = slider('Picture', { steps: pics.map((_, i) => i), value: 0, show: (i) => o.frames[i].label, onInput: () => update() });
      const play = player(s, ctx, { seconds: o.seconds ?? 2 * pics.length });
      update = () => {
        const i = s.value();
        img.setAttribute('href', pics[i].href);
        tag.replaceChildren(...haloLabel(8, 18, `${i + 1} of ${pics.length}: ${o.frames[i].label}`, k));
        say(f.readout, `${o.frames[i].label}.`, o.frames[i].text ?? '');
        if (i === 0) ends.add('a');
        if (i === last) ends.add('b');
        t.keep([...ends]);
        reached();
      };
      sliders.push(s);
      buttons.push(play.node);
      f.controls.append(el('div.fig-row', {}, s.node, play.node));
    }
    if (Array.isArray(t.kept)) ends = new Set(t.kept.filter((x): x is 'a' | 'b' => x === 'a' || x === 'b'));
    // Every picture showing is credited: both of a wipe, or the one at this step.
    const credits = creditSlot(f.svg);
    if (pics.length === 2) credits.show(pics);
    else {
      const step = f.controls.querySelector('input')!;
      const each = () => credits.show([pics[Number(step.value)] ?? pics[0]]);
      step.addEventListener('input', each);
      each();
    }
    if (o.guess && !t.restored) {
      guessFirst(t, f, { ask: o.guess.ask, options: o.guess.options, answer: o.guess.answer, sliders, buttons, reveal: t.goal ? 'done' : 'lock', after: () => update() });
      update();
      f.readout.textContent = o.guess.ask;
    } else update();
    return f.node;
  });
}
let clips = 0;

// ---- Timeline, live ------------------------------------------------------------------------

export interface LiveTimelineEvent extends TimelineEvent {
  /** Said in the text box when the event is reached. */
  text?: string;
}

export interface TimelineLiveOptions extends Omit<TimelineOptions, 'events'> {
  events: LiveTimelineEvent[];
  textLines?: number;
  /** Seconds a Play takes from first to last; default 12. */
  seconds?: number;
}

function checkTimelineLive(k: Kit) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...checkTimeline(o, k), ...linesProblem(o)];
    (list(o, 'events') ?? []).forEach((raw, i) => {
      const e = (raw ?? {}) as Record<string, unknown>;
      if (e.text !== undefined && !isStr(e.text)) out.push(`event ${i + 1}: "text" should be text`);
    });
    if ((list(o, 'events') ?? []).length < 2) out.push('needs two or more "events"');
    return out;
  };
}

/**
 * A timeline across the figure. With no goal or "end", a slider (and Play)
 * moves through time: events light up as they are passed, and the latest is
 * told in the text box; "end" is done at the last event. With "order", the
 * events are buttons in a muddle, to tap from earliest to latest: each right
 * tap puts the event on the line, a wrong one is marked and says so.
 */
function timelineLive(env: Env): FigureFactory {
  const { k } = env;
  return live<TimelineLiveOptions>(['end', 'order'], checkTimelineLive(k), (o, t, ctx) => {
    const events = [...o.events].sort((a, b) => a.at - b.at);
    const n = events.length;
    const from = events[0].at;
    const to = Math.max(...events.map((e) => e.to ?? e.at));
    const even = o.spacing === 'even' || to === from;
    const x0 = 22;
    const x1 = W - 22;
    const xAt = (v: number, i: number) => (even ? x0 + ((x1 - x0) * i) / Math.max(1, n - 1) : x0 + ((x1 - x0) * (v - from)) / (to - from));
    const xs = events.map((e, i) => xAt(e.at, i));
    // Spans sit in rows above the line, so two that overlap both show.
    const rows: number[] = [];
    const rowOf = events.map((e, i) => {
      if (e.to === undefined || even) return -1;
      const ex = xAt(e.to, i);
      let r = rows.findIndex((end) => end < xs[i] - 2);
      if (r < 0) r = rows.length;
      rows[r] = ex;
      return r;
    });
    const axisY = 44 + rows.length * 9;
    const H = axisY + 42;
    const titleLines = o.title ? wrap(o.title, W - 16, 'normal', true) : [];
    const top = titleLines.length ? titleLines.length * lineHeight('normal') + 8 : 0;
    const f = frame(W, H + top, o.textLines ?? 3);
    if (titleLines.length) f.svg.append(...block(W / 2, 16, titleLines, 'normal', { bold: true, anchor: 'middle' }));
    const g = svg('g', { transform: `translate(0,${top})` });
    f.svg.append(g);
    const colors = events.map((e, i) => k.color(e.color, i));
    const whens = events.map((e) => sayWhen(e, o));
    const order = t.goal === 'order';

    const draw = (passed: (i: number) => boolean, current: number, cursor?: number) => {
      const parts: SVGElement[] = [line(x0, axisY, x1, axisY, k.soft, 2)];
      if (!even) parts.push(
        label(x0, axisY + 34, whens[0], { size: 'small', soft: true }),
        label(x1, axisY + 34, sayWhen({ at: to, label: '' }, o), { size: 'small', soft: true, anchor: 'end' }),
      );
      events.forEach((e, i) => {
        const on = passed(i);
        if (rowOf[i] >= 0 && on) {
          const y = axisY - 12 - rowOf[i] * 9;
          parts.push(svg('rect', { x: xs[i], y: y - 3, width: Math.max(4, xAt(e.to!, i) - xs[i]), height: 6, rx: 3, fill: colors[i], opacity: 0.6 }));
        }
        parts.push(svg('circle', { cx: xs[i], cy: axisY, r: i === current ? 7 : 5, fill: on ? colors[i] : k.paper, stroke: on ? k.paper : k.soft, 'stroke-width': on ? 1.5 : 1.2 }));
        if (order && on) parts.push(label(xs[i], axisY + 4 - 12, String(i + 1), { size: 'small', bold: true, anchor: 'middle' }));
      });
      if (cursor !== undefined) parts.push(line(cursor, axisY - 8 - rows.length * 9, cursor, axisY + 12, k.ink, 1.5, { 'stroke-dasharray': '3 3' }));
      if (current >= 0) {
        const x = xs[current];
        const anchor = x < 70 ? undefined : x > W - 70 ? 'end' : 'middle';
        parts.push(...haloLabel(anchor === undefined ? x - 6 : anchor === 'end' ? x + 6 : x, axisY - 14 - rows.length * 9, whens[current], k, { anchor, fill: events[current].color ? colors[current] : k.ink }));
      }
      g.replaceChildren(...parts);
    };
    const tell = (i: number) => say(f.readout, `${whens[i]}: ${events[i].label}.`, events[i].text ?? '');

    if (!order) {
      // Time runs evenly from the first event to the last; "even" spacing steps from event to event.
      const s = even
        ? slider('Time', { steps: events.map((_, i) => i), value: 0, show: (i) => whens[i], onInput: () => update() })
        : slider('Time', { min: from, max: to, step: (to - from) / 400, value: from, show: (v) => sayWhen({ at: Math.round(v), label: '' }, o), onInput: () => update() });
      const play = player(s, ctx, { seconds: o.seconds ?? 12 });
      const update = () => {
        const v = s.value();
        const now = even ? events[v]?.at ?? from : v;
        let current = -1;
        events.forEach((e, i) => { if (e.at <= now + 1e-9) current = i; });
        draw((i) => events[i].at <= now + 1e-9, current, even ? xs[v] : xAt(v, 0));
        if (current >= 0) tell(current);
        if (t.goal === 'end' && (even ? v === n - 1 : v >= to - 1e-9)) t.done();
      };
      f.controls.append(el('div.fig-row', {}, s.node, play.node));
      update();
      if (t.restored && t.goal === 'end') s.set(even ? n - 1 : to);
      return f.node;
    }

    // In order.
    const kept = (isRecord(t.kept) ? t.kept : {}) as { muddle?: number[]; placed?: number; misses?: number };
    const muddle = Array.isArray(kept.muddle) && kept.muddle.length === n ? kept.muddle : shuffle(events.map((_, i) => i), startRng(t));
    let placed = t.restored && kept.placed === undefined ? n : typeof kept.placed === 'number' ? kept.placed : 0;
    let misses = typeof kept.misses === 'number' ? kept.misses : 0;
    const keep = () => t.keep({ muddle, placed, misses });
    const chips = muddle.map((i) => {
      const b = el('button.chip', { type: 'button' }, events[i].label) as HTMLButtonElement;
      b.addEventListener('click', () => pick(i, b));
      return b;
    });
    const row = el('div.chips.fig-choices.fig-sequence', {}, chips);
    f.controls.append(row);
    const show = () => {
      draw((i) => i < placed, placed - 1);
      chips.forEach((b, j) => {
        const done = muddle[j] < placed;
        b.disabled = done;
        b.classList.toggle('right', done);
      });
    };
    function pick(i: number, b: HTMLButtonElement) {
      // Two events at the same time can go either way round.
      const want = events.findIndex((_, j) => j >= placed && events[j].at === events[i].at);
      if (placed < n && events[i].at === events[placed].at && want >= 0) {
        if (i !== placed) {
          // Swap so the event tapped is the one placed.
          const a = muddle.indexOf(i);
          const c = muddle.indexOf(placed);
          [muddle[a], muddle[c]] = [muddle[c], muddle[a]];
          [chips[a], chips[c]] = [chips[c], chips[a]];
        }
        placed++;
        keep();
        show();
        tell(placed - 1);
        if (placed === n) {
          f.readout.append(` All in order${misses ? `, with ${misses} wrong ${misses === 1 ? 'tap' : 'taps'}` : ''}.`);
          t.done();
        }
      } else {
        misses++;
        keep();
        b.classList.add('wrong');
        setTimeout(() => b.classList.remove('wrong'), 800);
        say(f.readout, 'Not yet.', `“${events[i].label}” came later. Which came next?`);
      }
    }
    show();
    if (placed < n) f.readout.textContent = placed ? 'Go on: which came next?' : 'Tap the events from the earliest to the latest.';
    else tell(n - 1);
    return f.node;
  });
}

// ---- Scale, guess first ---------------------------------------------------------------------

export interface ScaleGuessOptions extends ScaleOptions {
  guess: {
    /** Which item's bar is hidden, from 0. */
    item: number;
    ask: string;
    /** Values to choose from, in the items' units; the item's own value among them. */
    options: number[];
  };
  textLines?: number;
}

function checkScaleGuess(k: Kit) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...checkScale(o, k), ...linesProblem(o)];
    const g = o.guess as Record<string, unknown> | undefined;
    const items = list(o, 'items') ?? [];
    if (!isRecord(g)) return [...out, 'needs "guess": { "item", "ask", "options" }'];
    if (!(Number.isInteger(g.item) && (g.item as number) >= 0 && (g.item as number) < items.length)) out.push('"guess": "item" should be the index of one of the items');
    if (!isStr(g.ask)) out.push('"guess": "ask" should be text');
    if (!Array.isArray(g.options) || g.options.length < 2 || !g.options.every(isNum)) out.push('"guess": "options" should be two or more numbers');
    else if (Number.isInteger(g.item) && items[g.item as number] && !g.options.includes((items[g.item as number] as { value: number }).value)) out.push('"guess": "options" should include the item\'s own value');
    return out;
  };
}

/**
 * A scale comparison with one bar hidden: the reader picks its size from a few
 * values before it is drawn, and the pick is marked right or wrong as the bar
 * appears. "guess" is done once it is drawn.
 */
function scaleGuess(env: Env): FigureFactory {
  const { k } = env;
  return live<ScaleGuessOptions>(['guess'], checkScaleGuess(k), (o, t, ctx) => {
    const units = ctx.save.units;
    const hidden = o.guess.item;
    const others = o.items.filter((_, i) => i !== hidden).map((it) => it.value);
    const veiled: ScaleOptions = { ...o, items: o.items.map((it, i) => (i === hidden ? { ...it, value: Math.min(...others.filter((v) => v > 0), Infinity) || 1, says: '?', color: k.grid } : it)) };
    const svgOf = (opts: ScaleOptions) => drawScale(k, units, opts).node.querySelector('svg')!;
    const drawing = svgOf(veiled);
    const f = frame({ drawing, lines: o.textLines ?? 2 });
    const item = o.items[hidden];
    const answer = o.guess.options.indexOf(item.value);
    const reveal = () => {
      drawing.replaceChildren(...Array.from(svgOf(o).childNodes));
      say(f.readout, `${item.label}: ${item.says ?? sayValue(item.value, o, units)}.`);
      t.done();
    };
    if (t.restored) {
      reveal();
      return f.node;
    }
    guessFirst(t, f, {
      ask: o.guess.ask,
      options: o.guess.options.map((v) => sayValue(v, o, units)),
      answer,
      sliders: [],
      after: reveal,
    });
    return f.node;
  });
}

// ---- Groups -----------------------------------------------------------------------------------

export interface GroupsOptions {
  /** Words over the buttons, such as "Which family?" */
  ask?: string;
  groups: { name: string; color?: string }[];
  items: (PictureSpec & {
    name: string;
    /** Its group, by name or by index from 0. */
    group: string | number;
    /** Words to sort it by, shown with its name: a clue to its group. */
    clue?: string;
    /** Said once it is filed: why it belongs there. */
    why?: string;
  })[];
  textLines?: number;
}

function checkGroups(env: Env) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...linesProblem(o)];
    if (o.ask !== undefined && !isStr(o.ask)) out.push('"ask" should be text');
    const groups = list(o, 'groups');
    if (!groups || groups.length < 2) return [...out, 'needs "groups", two or more { "name" }'];
    if (groups.length > 4) out.push('has more than 4 "groups", too many columns for a phone');
    const names = groups.map((g) => (g as { name?: unknown })?.name);
    groups.forEach((g, i) => {
      if (!isStr(names[i])) out.push(`group ${i + 1}: "name" should be text`);
      out.push(...colorProblem((g as { color?: unknown })?.color, env.k, `group ${i + 1}`));
    });
    const items = list(o, 'items');
    if (!items) return [...out, 'needs "items", a list of { "name", "group" }'];
    items.forEach((raw, i) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const at = `item ${i + 1}`;
      if (!isStr(it.name)) out.push(`${at}: "name" should be text`);
      const ok = (isStr(it.group) && names.includes(it.group)) || (Number.isInteger(it.group) && (it.group as number) >= 0 && (it.group as number) < groups.length);
      if (!ok) out.push(`${at}: "group" should be one of the groups' names, or its index`);
      for (const key of ['why', 'clue'] as const) if (it[key] !== undefined && !isStr(it[key])) out.push(`${at}: "${key}" should be text`);
      out.push(...pictureProblems(it, env, at, false));
    });
    return out;
  };
}

/**
 * Things to sort, one at a time: the thing (its picture, if it has one) on
 * top, the groups as columns under it and as buttons. Each pick files the
 * thing in its right column, ticked or crossed, and the text box says why.
 * "sorted" is done once every thing is filed.
 */
function groups(env: Env): FigureFactory {
  const { k } = env;
  return live<GroupsOptions>(['sorted'], checkGroups(env), (o, t) => {
    const ng = o.groups.length;
    const groupOf = (it: GroupsOptions['items'][number]) => (typeof it.group === 'number' ? it.group : o.groups.findIndex((g) => g.name === it.group));
    const answers = o.items.map(groupOf);
    const pics = o.items.map((it) => (hasPicture(it as unknown as Record<string, unknown>) ? pictureOf(it, env) : null));
    const clues = o.items.map((it) => (it.clue ? wrap(it.clue, W - 140, 'note') : []));
    const picH = pics.some(Boolean) ? 170 : 44 + Math.max(0, ...clues.map((c) => c.length)) * lineHeight('note');
    const colW = (W - 16) / ng;
    const rowH = 15;
    const most = Math.max(...o.groups.map((_, g) => answers.filter((a) => a === g).length));
    const headLines = Math.max(...o.groups.map((g) => wrap(g.name, colW - 10, 'note', true).length));
    const headY = picH + 16;
    const listY = headY + headLines * lineHeight('note') + 10;
    const H = listY + most * rowH + 8;
    const f = frame(W, H, o.textLines ?? 3);
    const top = svg('g');
    const cols = svg('g');
    f.svg.append(top, cols);
    const credits = creditSlot(f.svg);
    const color = (g: number) => k.color(o.groups[g].color, g);

    const kept = (isRecord(t.kept) ? t.kept : {}) as { order?: number[]; picks?: number[] };
    const order = Array.isArray(kept.order) && kept.order.length === o.items.length ? kept.order : shuffle(o.items.map((_, i) => i), startRng(t));
    const picks: number[] = Array.isArray(kept.picks) ? kept.picks.slice(0, order.length) : t.restored ? order.map((i) => answers[i]) : [];

    const draw = () => {
      const at = picks.length;
      const parts: SVGElement[] = [];
      if (at < order.length) {
        const i = order[at];
        const p = pics[i];
        if (p) parts.push(svg('rect', { x: 0, y: 0, width: W, height: picH, fill: k.grid }), image(p, 0, 0, W, picH, t, 'meet'));
        else {
          const first = (picH - clues[i].length * lineHeight('note')) / 2 + (clues[i].length ? -2 : 5);
          parts.push(
            svg('rect', { x: 60, y: 6, width: W - 120, height: picH - 12, rx: 8, fill: k.paper, stroke: k.soft, 'stroke-width': 1.2 }),
            label(W / 2, first, `${at + 1} of ${order.length}: ${o.items[i].name}`, { bold: true, anchor: 'middle' }),
            ...block(W / 2, first + lineHeight('note') + 6, clues[i], 'note', { anchor: 'middle' }),
          );
        }
        if (p) parts.push(...haloLabel(8, 18, o.items[i].name, k));
      } else {
        parts.push(label(W / 2, picH / 2 + 5, `All ${order.length} sorted: ${picks.filter((g, j) => g === answers[order[j]]).length} right.`, { bold: true, anchor: 'middle' }));
      }
      top.replaceChildren(...parts);
      credits.show([at < order.length ? pics[order[at]] : null]);
      const colParts: SVGElement[] = [];
      o.groups.forEach((g, gi) => {
        const x = 8 + gi * colW;
        colParts.push(
          svg('rect', { x: x + 2, y: headY - 12, width: colW - 4, height: H - headY + 8, rx: 6, fill: color(gi), opacity: 0.1 }),
          ...block(x + colW / 2, headY + 2, wrap(g.name, colW - 10, 'note', true), 'note', { bold: true, anchor: 'middle', fill: color(gi) }),
        );
        let r = 0;
        picks.forEach((pick, j) => {
          const i = order[j];
          if (answers[i] !== gi) return;
          const right = pick === gi;
          const words = wrap(`${right ? '✓' : '✗'} ${o.items[i].name}`, colW - 10, 'small', true)[0];
          colParts.push(label(x + 8, listY + r * rowH, words, { size: 'small', bold: true, fill: right ? k.color('good', 0) : k.color('bad', 0) }));
          r++;
        });
      });
      cols.replaceChildren(...colParts);
      buttons.forEach((b) => (b.disabled = at >= order.length));
    };
    const buttons = o.groups.map((g, gi) => {
      const b = el('button.chip', { type: 'button' }, g.name) as HTMLButtonElement;
      b.addEventListener('click', () => file(gi));
      return b;
    });
    function file(gi: number) {
      const at = picks.length;
      if (at >= order.length) return;
      const i = order[at];
      const it = o.items[i];
      const right = gi === answers[i];
      picks.push(gi);
      t.keep({ order, picks });
      draw();
      f.readout.replaceChildren(verdict(right, right ? `Yes: ${it.name}, ${o.groups[gi].name}.` : `No: ${it.name} goes with ${o.groups[answers[i]].name}.`), it.why ?? '');
      if (picks.length === order.length) t.done();
    }
    f.controls.append(el('p.fig-ask', {}, o.ask ?? 'Which group?'), el('div.chips.fig-row', {}, buttons));
    draw();
    if (picks.length < order.length) f.readout.textContent = `${order.length - picks.length} to sort. Pick the group for the one on top.`;
    return f.node;
  });
}

// ---- Key ----------------------------------------------------------------------------------------

/** One step of a key: a question and the choices that answer it. */
export interface KeyStep {
  /** Default "Which fits?" */
  ask?: string;
  choices: KeyChoice[];
}

/** A choice leads on to another step, or ends at a name. */
export interface KeyChoice {
  text: string;
  then?: KeyStep;
  name?: string;
  /** Said once the name is reached. */
  about?: string;
}

export interface IdKeyOptions {
  title?: string;
  /** An either-or key, walked from the top. Or, in its place, `features` and `taxa`. */
  root?: KeyStep;
  /** A key entered anywhere: the features to tick, in any order... */
  features?: KeyFeature[];
  /** ...and what each candidate shows for them. */
  taxa?: KeyTaxon[];
  /** Things to key out, one after another; with these, "keyed" means each reached its right name. */
  specimens?: (PictureSpec & { name: string; hint?: string })[];
  textLines?: number;
}

function keyNames(s: KeyStep): string[] {
  return s.choices.flatMap((c) => (c.then ? keyNames(c.then) : c.name ? [c.name] : []));
}
function keyDepth(s: KeyStep): number {
  return 1 + Math.max(0, ...s.choices.map((c) => (c.then ? keyDepth(c.then) : 0)));
}

function checkIdKey(env: Env) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...framing(o), ...linesProblem(o)];
    if (o.features !== undefined || o.taxa !== undefined) {
      if (o.root !== undefined) return [...out, 'has both "root" and "features"; a key is either-or or entered anywhere, not both'];
      out.push(...checkMultiKey(env, o));
      if (out.length) return out;
      const names = (o.taxa as KeyTaxon[]).map((tx) => tx.name);
      if (o.specimens !== undefined) {
        if (!Array.isArray(o.specimens) || !o.specimens.length) out.push('"specimens" should be a list');
        else o.specimens.forEach((sp: Record<string, unknown>, i) => {
          if (!isStr(sp?.name) || !names.includes(sp.name)) out.push(`specimen ${i + 1}: "name" should be one of the taxa`);
          out.push(...pictureProblems(sp ?? {}, env, `specimen ${i + 1}`, false));
        });
      }
      return out;
    }
    const step = (raw: unknown, at: string) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      if (s.ask !== undefined && !isStr(s.ask)) out.push(`${at}: "ask" should be text`);
      if (!Array.isArray(s.choices) || s.choices.length < 2) return void out.push(`${at}: needs "choices", two or more`);
      s.choices.forEach((c: Record<string, unknown>, i: number) => {
        const where = `${at} > ${isStr(c?.text) ? c.text : `choice ${i + 1}`}`;
        if (!isStr(c?.text)) out.push(`${where}: "text" should be text`);
        if (c?.then !== undefined && c?.name !== undefined) out.push(`${where}: has both "then" and "name"; a choice leads on or names, not both`);
        else if (c?.then !== undefined) step(c.then, where);
        else if (!isStr(c?.name)) out.push(`${where}: needs "then" (the next step) or "name"`);
        if (c?.about !== undefined && !isStr(c.about)) out.push(`${where}: "about" should be text`);
      });
    };
    if (!isRecord(o.root)) return [...out, 'needs "root": { "ask", "choices" }'];
    step(o.root, 'root');
    if (out.length) return out;
    const names = keyNames(o.root as unknown as KeyStep);
    if (o.specimens !== undefined) {
      if (!Array.isArray(o.specimens) || !o.specimens.length) out.push('"specimens" should be a list');
      else o.specimens.forEach((sp: Record<string, unknown>, i) => {
        if (!isStr(sp?.name) || !names.includes(sp.name)) out.push(`specimen ${i + 1}: "name" should be one the key ends at`);
        out.push(...pictureProblems(sp ?? {}, env, `specimen ${i + 1}`, false));
      });
    }
    return out;
  };
}

/**
 * A key of paired (or more) choices, walked one step at a time to a name:
 * the choices are buttons, the trail so far is drawn, and Back steps up. With
 * "specimens", each is shown (its picture, or its name hidden) and keyed out
 * in turn; reaching the wrong name says so, and "keyed" is done once each has
 * reached its own. Without, "keyed" is done at any name, "every" once every
 * name has been reached.
 */
function idKey(env: Env): FigureFactory {
  const { k } = env;
  return live<IdKeyOptions>(['keyed', 'every'], checkIdKey(env), (o, t) => {
    if (o.features) return multiKey(env, o, t);
    const root = o.root!;
    const specimens = o.specimens ?? [];
    const pics = specimens.map((sp) => (hasPicture(sp as unknown as Record<string, unknown>) ? pictureOf(sp, env) : null));
    const picH = pics.some(Boolean) ? 170 : 0;
    const depth = keyDepth(root);
    const rowH = 2 * lineHeight('note') + 8;
    const titleLines = o.title ? wrap(o.title, W - 16, 'normal', true) : [];
    const top = (titleLines.length ? titleLines.length * lineHeight('normal') + 10 : 0) + (picH ? picH + 8 : 0);
    const H = top + depth * rowH + 34;
    const f = frame(W, H, o.textLines ?? 3);
    if (titleLines.length) f.svg.append(...block(W / 2, 16, titleLines, 'normal', { bold: true, anchor: 'middle' }));
    const picG = svg('g');
    const trailG = svg('g');
    f.svg.append(picG, trailG);
    const credits = creditSlot(f.svg);
    const names = keyNames(root);
    const kept = (isRecord(t.kept) ? t.kept : {}) as { reached?: string[]; keyed?: number };
    const reached = new Set<string>(Array.isArray(kept.reached) ? kept.reached.filter(isStr) : []);
    let keyed = typeof kept.keyed === 'number' ? kept.keyed : t.restored ? specimens.length : 0;
    let path: number[] = [];
    const stepAt = (p: number[]): KeyStep => p.reduce((s, i) => s.choices[i].then ?? s, root);
    const choiceAt = (p: number[]): KeyChoice | undefined => {
      if (!p.length) return undefined;
      return stepAt(p.slice(0, -1)).choices[p[p.length - 1]];
    };
    const ended = () => !!choiceAt(path)?.name;
    const keep = () => t.keep({ reached: [...reached], keyed });

    const back = el('button.btn.btn-ghost', { type: 'button' }, 'Back') as HTMLButtonElement;
    const again = el('button.btn', { type: 'button' }, specimens.length ? 'Next one' : 'Start again') as HTMLButtonElement;
    const choiceRow = el('div.answer-list');
    f.controls.append(choiceRow, el('div.fig-row', {}, back, again));
    back.addEventListener('click', () => {
      path = path.slice(0, -1);
      show();
    });
    again.addEventListener('click', () => {
      path = [];
      show();
    });

    const show = () => {
      const sp = specimens[Math.min(keyed, specimens.length - 1)];
      const p = pics[Math.min(keyed, specimens.length - 1)];
      const pp: SVGElement[] = [];
      if (picH) {
        const y = top - picH - 8;
        pp.push(svg('rect', { x: 0, y, width: W, height: picH, fill: k.grid }));
        if (p) pp.push(image(p, 0, y, W, picH, t, 'meet'));
        else if (sp) pp.push(label(W / 2, y + picH / 2, 'Specimen', { bold: true, anchor: 'middle' }));
      }
      picG.replaceChildren(...pp);
      credits.show([p]);
      // The trail: each step taken, the choice made, and where it ended.
      const tp: SVGElement[] = [];
      let y = top + 4;
      let s: KeyStep = root;
      path.forEach((ci, d) => {
        const c = s.choices[ci];
        const lines = wrap(`${d + 1}. ${c.text}`, W - 40, 'note', true).slice(0, 2);
        tp.push(svg('circle', { cx: 14, cy: y + 6, r: 4, fill: k.color('teal', 0) }), ...block(26, y + 10, lines, 'note', { bold: true }));
        if (d) tp.push(line(14, y - rowH + 10, 14, y + 2, k.soft, 1.2));
        y += rowH;
        s = c.then ?? s;
      });
      const end = choiceAt(path);
      if (end?.name) {
        const right = !specimens.length || end.name === specimens[keyed]?.name;
        tp.push(...block(26, y + 12, [end.name], 'normal', { bold: true, fill: k.color(right ? 'good' : 'bad', 0) }));
      } else if (!path.length) {
        tp.push(label(14, y + 12, specimens.length ? `Answer each step for the one ${picH ? 'above' : 'described below'}.` : 'Answer each step to reach a name.', { size: 'note', soft: true }));
      }
      trailG.replaceChildren(...tp);
      back.disabled = !path.length;
      again.style.display = ended() ? '' : 'none';
      if (end?.name) {
        choiceRow.replaceChildren();
        return;
      }
      const step = stepAt(path);
      choiceRow.replaceChildren(...step.choices.map((c, i) => {
        const b = el('button.btn.btn-ghost.wide', { type: 'button' }, c.text) as HTMLButtonElement;
        b.addEventListener('click', () => choose(i));
        return b;
      }));
      if (specimens.length && keyed >= specimens.length) f.readout.textContent = `All ${specimens.length} keyed out. Walk the key again for any you like.`;
      else f.readout.textContent = `${step.ask ?? 'Which fits?'}${specimens.length ? ` (${keyed + 1} of ${specimens.length}${specimens[keyed]?.hint ? `: ${specimens[keyed].hint}` : ''})` : ''}`;
    };
    function choose(i: number) {
      path = [...path, i];
      const c = choiceAt(path)!;
      if (c.name) {
        reached.add(c.name);
        if (specimens.length && keyed < specimens.length) {
          const want = specimens[keyed].name;
          if (c.name === want) {
            keyed++;
            f.readout.replaceChildren(verdict(true, `Keyed out: ${c.name}.`), c.about ?? '');
            if (keyed >= specimens.length) {
              again.textContent = 'Start again';
              if (t.goal) t.done();
            }
          } else {
            f.readout.replaceChildren(verdict(false, `This leads to ${c.name}, which is not this one.`), 'Step back and look again.');
            show();
            again.style.display = 'none';
            return;
          }
        } else say(f.readout, `${c.name}.`, c.about ?? '');
        keep();
        if (!specimens.length && (t.goal === 'keyed' || (t.goal === 'every' && names.every((nm) => reached.has(nm))))) t.done();
      }
      show();
    }
    show();
    if (specimens.length && keyed > 0 && keyed < specimens.length) f.readout.textContent = `${keyed} of ${specimens.length} keyed out. ${f.readout.textContent}`;
    return f.node;
  });
}

// ---- ID drill ------------------------------------------------------------------------------------

export interface DrillItem extends PictureSpec {
  name: string;
  /** More pictures of the same thing; each asking shows one of them. */
  more?: PictureSpec[];
  /** Said once answered, after "Right." or "Not quite." */
  why?: string;
}

export interface IdDrillOptions {
  /** Default "What is this?" */
  ask?: string;
  items: DrillItem[];
  /** How many to ask; default all. */
  count?: number;
  /** Choices a question offers, the right one among them; default 4. */
  choices?: number;
}

function checkIdDrill(env: Env) {
  return (o: Record<string, unknown>): string[] => {
    const out: string[] = [];
    if (o.ask !== undefined && !isStr(o.ask)) out.push('"ask" should be text');
    const items = list(o, 'items');
    if (!items || items.length < 2) return [...out, 'needs "items", two or more { "name", "photo" }'];
    const names = new Set<string>();
    items.forEach((raw, i) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const at = `item ${i + 1}`;
      if (!isStr(it.name) || !it.name) out.push(`${at}: "name" should be text`);
      else if (names.has(it.name)) out.push(`${at}: "${it.name}" is named twice`);
      else names.add(it.name);
      out.push(...pictureProblems(it, env, at));
      if (it.more !== undefined) {
        if (!Array.isArray(it.more)) out.push(`${at}: "more" should be a list of pictures`);
        else it.more.forEach((m: Record<string, unknown>, j) => out.push(...pictureProblems(m ?? {}, env, `${at} picture ${j + 2}`)));
      }
      if (it.why !== undefined && !isStr(it.why)) out.push(`${at}: "why" should be text`);
    });
    if (o.count !== undefined && !(Number.isInteger(o.count) && (o.count as number) >= 1)) out.push('"count" should be a whole number from 1');
    if (o.choices !== undefined && !(Number.isInteger(o.choices) && (o.choices as number) >= 2)) out.push('"choices" should be a whole number from 2');
    return out;
  };
}

/**
 * Name what each picture shows, from a few names: a quiz (block type "quiz")
 * built on didactics/check, so every answer is kept for review like the end
 * check's, each picture its own card. The wrong names are drawn from the other
 * items, and each asking may show another of an item's pictures.
 */
function idDrill(env: Env): FigureFactory {
  const problems = checkIdDrill(env);
  const options = (o: Options | undefined) => (isRecord(o) ? problems(o) : ['needs "options" to draw from']);
  const factory = check((_ctx, raw, rng) => {
    if (options(raw).length) return [];
    const o = raw as unknown as IdDrillOptions;
    const names = o.items.map((it) => it.name);
    const many = Math.min(names.length, o.choices ?? 4);
    return shuffle(o.items, rng).slice(0, o.count ?? o.items.length).map((it) => {
      const spec = oneOf(rng, [it, ...(it.more ?? [])]);
      const pic = pictureOf(spec, env);
      const wrong = shuffle(names.filter((nm) => nm !== it.name), rng).slice(0, many - 1);
      const choices = shuffle([it.name, ...wrong], rng);
      return {
        picture: pic ? () => pic.node() : undefined,
        ask: o.ask ?? 'What is this?',
        choices,
        answer: choices.indexOf(it.name),
        why: it.why ?? `It is ${it.name}.`,
        key: spec.photo ?? spec.image,
        row: choices.every((c) => c.length <= 18),
      };
    });
  }, { options });
  return Object.assign(factory, { each: true as const });
}

// ---- Clue board ------------------------------------------------------------------------------------

export interface ClueBoardOptions {
  /** The ideas the evidence weighs, two to six: what the thing might be. */
  ideas: { name: string; text?: string }[];
  /** Each clue, and the ideas it rules out, by name or by index from 0. */
  clues: { name: string; text?: string; rules: (string | number)[] }[];
  /** Ask which idea survives before the clues can be turned on; the answer is the survivor. */
  guess?: string;
  /** Said once every clue is on, in place of the plain count. */
  end?: string;
  /** The text box's words before any clue is on. */
  intro?: string;
  textLines?: number;
}

const ideaIndex = (ideas: { name?: unknown }[], v: unknown): number =>
  typeof v === 'number' ? (Number.isInteger(v) && v >= 0 && v < ideas.length ? v : -1) : ideas.findIndex((i) => i?.name === v);

function checkClueBoard(o: Record<string, unknown>): string[] {
  const out = [...linesProblem(o)];
  for (const key of ['guess', 'end', 'intro'] as const) if (o[key] !== undefined && !isStr(o[key])) out.push(`"${key}" should be text`);
  const ideas = list(o, 'ideas') as { name?: unknown; text?: unknown }[] | null;
  if (!ideas || ideas.length < 2) return [...out, 'needs "ideas", two or more { "name" }'];
  if (ideas.length > 6) out.push('has more than 6 "ideas", too many for a phone');
  ideas.forEach((it, i) => {
    if (!isStr(it?.name) || !it.name) out.push(`idea ${i + 1}: "name" should be text`);
    if (it?.text !== undefined && !isStr(it.text)) out.push(`idea ${i + 1}: "text" should be text`);
  });
  const clues = list(o, 'clues') as { name?: unknown; text?: unknown; rules?: unknown }[] | null;
  if (!clues || !clues.length) return [...out, 'needs "clues", a list of { "name", "rules" }'];
  if (clues.length > 6) out.push('has more than 6 "clues"');
  clues.forEach((c, i) => {
    const at = `clue ${i + 1}`;
    if (!isStr(c?.name) || !c.name) out.push(`${at}: "name" should be text`);
    if (c?.text !== undefined && !isStr(c.text)) out.push(`${at}: "text" should be text`);
    if (!Array.isArray(c?.rules)) out.push(`${at}: "rules" should list the ideas it rules out`);
    else for (const r of c.rules) if (ideaIndex(ideas, r) < 0) out.push(`${at}: rules out "${String(r)}", which is not one of the ideas`);
  });
  if (out.length) return out;
  const left = ideas.filter((_, i) => !clues.some((c) => (c.rules as unknown[]).some((r) => ideaIndex(ideas, r) === i)));
  if (o.guess !== undefined && left.length !== 1) out.push(`"guess" needs the clues to leave one idea standing; they leave ${left.length}`);
  return out;
}

/**
 * A mystery's ideas as cards, and the clues under them, worked one step at a
 * time. With "guess", step 1 asks which idea survives (the reader taps a name,
 * then locks it in, and the guessed card is marked). Then one button shows
 * the next clue: its row opens in the list, the ideas it rules out are crossed
 * through with the clue's name on them, and the text box says what it ruled
 * out and how many ideas are left. Clues not yet shown sit as dashed rows, so
 * the reader sees how many are to come. "clues" is done once every clue is
 * shown; a last button starts the clues again.
 */
function clueBoard(env: Env): FigureFactory {
  const { k } = env;
  return live<ClueBoardOptions>(['clues'], checkClueBoard, (o, t) => {
    const ni = o.ideas.length;
    const nc = o.clues.length;
    const perRow = ni <= 4 ? ni : 3;
    const rows = Math.ceil(ni / perRow);
    const cardW = (W - 16 - (perRow - 1) * 8) / perRow;
    const nameLines = o.ideas.map((it) => wrap(it.name, cardW - 14, 'note', true));
    const textLines = o.ideas.map((it) => (it.text ? wrap(it.text, cardW - 14, 'small') : []));
    const stepY = 18;
    const cardsY = 30;
    const cardH = 24 + Math.max(...nameLines.map((l, i) => l.length * lineHeight('note') + textLines[i].length * lineHeight('small'))) + lineHeight('small') + 6;
    const cluesY = cardsY + rows * (cardH + 8) + 10;
    const rules = o.clues.map((c) => c.rules.map((r) => ideaIndex(o.ideas, r)));
    const outNames = (c: number) => rules[c].map((i) => o.ideas[i].name);
    const clueLines = o.clues.map((c, i) => wrap(`Clue ${i + 1}, ${c.name}${c.text ? `: ${c.text}` : ''}`, W - 40, 'note'));
    const ruleLines = o.clues.map((_, c) => wrap(rules[c].length ? `Rules out ${joinNames(outNames(c))}` : 'Rules out nothing new', W - 40, 'small'));
    const rowH = (c: number) => 12 + Math.max(clueLines[c].length * lineHeight('note') + ruleLines[c].length * lineHeight('small'), 2 * lineHeight('note'));
    const H = cluesY + 18 + o.clues.reduce((a, _, c) => a + rowH(c) + 6, 0) + 4;
    const f = frame(W, H, o.textLines ?? 4);
    const g = svg('g');
    f.svg.append(g);
    const kept = Array.isArray(t.kept) ? t.kept : null;
    // How many clues are shown, in order. A save from the old board (any clues on) counts as that many.
    let shown = kept ? Math.min(nc, kept.length) : t.restored ? nc : 0;
    const ruledBy = (i: number) => o.clues.findIndex((_, c) => c < shown && rules[c].includes(i));
    const survivors = o.ideas.map((_, i) => i).filter((i) => !rules.some((r) => r.includes(i)));
    let guessed = -1;

    function joinNames(names: string[]): string {
      return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }

    const step = () => (o.guess && !open() ? 0 : shown < nc ? 1 : 2);
    const paint = () => {
      const parts: SVGElement[] = [];
      // Where the reader is: the steps across the top, the current one bold.
      const steps = [...(o.guess ? ['Guess'] : []), 'Show the clues', 'What is left'];
      const now = o.guess ? step() : step() - 1;
      steps.forEach((name, i) => {
        const x = 8 + i * (W - 16) / steps.length;
        parts.push(svg('circle', { cx: x + 7, cy: stepY - 4, r: 7, fill: i === now ? k.ink : i < now ? k.color('good', 0) : k.paper, stroke: i <= now ? 'none' : k.soft, 'stroke-width': 1 }));
        parts.push(label(x + 7, stepY, i < now ? '✓' : String(i + 1), { size: 'small', anchor: 'middle', bold: true, fill: i <= now ? k.paper : k.soft }));
        parts.push(label(x + 19, stepY, name, { size: 'small', bold: i === now, fill: i === now ? k.ink : k.soft }));
      });
      o.ideas.forEach((_, i) => {
        const x = 8 + (i % perRow) * (cardW + 8);
        const y = cardsY + Math.floor(i / perRow) * (cardH + 8);
        const by = ruledBy(i);
        const ok = by < 0;
        const fresh = !ok && by === shown - 1;
        parts.push(svg('rect', { x, y, width: cardW, height: cardH, rx: 6, fill: ok ? k.paper : k.grid, stroke: ok ? (shown === nc ? k.color('good', 0) : k.soft) : k.color('bad', 0), 'stroke-width': fresh || (ok && shown === nc) ? 2.5 : 1 }));
        if (i === guessed) parts.push(label(x + cardW - 6, y + 12, 'your guess', { size: 'small', anchor: 'end', bold: true, fill: k.ink }));
        const top = y + 17 + (i === guessed ? 8 : 0);
        parts.push(...block(x + 7, top, nameLines[i], 'note', { bold: true, fill: ok ? k.ink : k.soft }));
        parts.push(...block(x + 7, top + nameLines[i].length * lineHeight('note'), textLines[i], 'small', { soft: true }));
        const tag = ok ? (shown ? 'still fits' : '') : `out: clue ${by + 1}`;
        if (tag) parts.push(label(x + 7, y + cardH - 7, tag, { size: 'small', bold: true, fill: k.color(ok ? 'good' : 'bad', 0) }));
        if (!ok) parts.push(line(x + 5, y + 5, x + cardW - 5, y + cardH - 5, k.color('bad', 0), 1.5, { opacity: 0.5 }));
      });
      parts.push(label(8, cluesY + 6, `The clues, ${shown} of ${nc} shown`, { size: 'small', bold: true, fill: k.soft }));
      let y = cluesY + 16;
      o.clues.forEach((_, c) => {
        const h = rowH(c);
        const open_ = c < shown;
        const newest = open_ && c === shown - 1;
        parts.push(svg('rect', { x: 8, y, width: W - 16, height: h, rx: 6, fill: open_ ? k.paper : k.grid, 'fill-opacity': open_ ? 1 : 0.35, stroke: open_ ? k.ink : k.soft, 'stroke-width': newest ? 2 : 1, 'stroke-dasharray': open_ ? 'none' : '4 3' }));
        if (newest) parts.push(label(W - 16, y + 14, 'new', { size: 'small', anchor: 'end', bold: true, fill: k.color('bad', 0) }));
        if (open_) {
          parts.push(...block(18, y + 16, clueLines[c], 'note', { bold: newest }));
          parts.push(...block(18, y + 16 + clueLines[c].length * lineHeight('note'), ruleLines[c], 'small', { bold: true, fill: k.color('bad', 0) }));
        } else {
          parts.push(label(18, y + 16, `Clue ${c + 1}, ${o.clues[c].name}`, { size: 'note', fill: k.soft }));
          parts.push(label(18, y + 16 + lineHeight('note'), c === shown && step() === 1 ? 'Next: tap the button below to show it' : 'Not shown yet', { size: 'small', fill: k.soft }));
        }
        y += h + 6;
      });
      g.replaceChildren(...parts);
      next.textContent = shown < nc ? `Show clue ${shown + 1}: ${o.clues[shown].name}` : 'Start the clues again';
      if (!open()) return;
      const left = o.ideas.filter((_, i) => ruledBy(i) < 0);
      const fits = left.length === 1 ? `Only ${left[0].name} still fits` : left.length ? `${left.length} ideas still fit` : 'No idea fits every clue';
      if (!shown) {
        f.readout.textContent = o.intro ?? `Show the ${nc} clues one at a time with the button below. Each one crosses out the ideas it rules out.`;
      } else if (shown === nc) {
        if (o.end) f.readout.textContent = o.end;
        else say(f.readout, `${fits}.`, guessed >= 0 ? (left.some((it) => o.ideas.indexOf(it) === guessed) ? 'Your guess stands.' : 'Your guess is crossed out.') : '');
      } else {
        const c = shown - 1;
        say(f.readout, `Clue ${c + 1}, ${o.clues[c].name}: ${rules[c].length ? `rules out ${joinNames(outNames(c))}` : 'rules out nothing new'}.`, `${fits}. ${nc - shown} more ${nc - shown === 1 ? 'clue' : 'clues'} to show.`);
      }
    };
    const next = el('button.btn.btn-small', { type: 'button' }, '') as HTMLButtonElement;
    next.addEventListener('click', () => {
      shown = shown < nc ? shown + 1 : 0;
      t.keep(Array.from({ length: shown }, (_, j) => j));
      paint();
      if (shown === nc) t.done();
    });
    f.controls.append(next);
    let open = () => true;
    if (o.guess && !t.restored && !Array.isArray(t.kept)) {
      open = guessFirst(t, f, {
        ask: `Step 1. ${o.guess} Tap the idea you think survives, then Lock it in.`,
        options: o.ideas.map((it) => it.name),
        answer: survivors[0],
        sliders: [],
        hidden: [next],
        reveal: t.goal ? 'done' : 'lock',
        after: (pick) => {
          guessed = pick;
          paint();
        },
      });
    }
    paint();
    return f.node;
  });
}

// ---- Loop -----------------------------------------------------------------------------------------

export interface LoopOptions {
  title?: string;
  /** The stages, in order round the loop; the last leads back to the first. Three to eight. */
  stages: {
    name: string;
    /** A muted line under the name in its box ("lesson 4"). */
    note?: string;
    color?: string;
    /** Said in the text box at this stage. */
    text?: string;
    /** How this stage becomes the next one, beside the arrow ("buried and cemented"). */
    how?: string;
  }[];
  /** Words in the middle of the loop. */
  middle?: string;
  textLines?: number;
}

function checkLoop(k: Kit) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...framing(o), ...linesProblem(o)];
    if (o.middle !== undefined && !isStr(o.middle)) out.push('"middle" should be text');
    const stages = list(o, 'stages');
    if (!stages || stages.length < 3) return [...out, 'needs "stages", three or more { "name" }'];
    if (stages.length > 8) out.push('has more than 8 "stages", too many to read round a loop on a phone');
    stages.forEach((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const at = `stage ${i + 1}`;
      if (!isStr(s.name) || !s.name) out.push(`${at}: "name" should be text`);
      for (const key of ['note', 'text', 'how'] as const) if (s[key] !== undefined && !isStr(s[key])) out.push(`${at}: "${key}" should be text`);
      out.push(...colorProblem(s.color, k, at));
    });
    return out;
  };
}

/**
 * Stages round a loop, each joined to the next by an arrow that says how. With
 * no goal or "round", a tap on a stage (or Next) lights it and its arrow out
 * and says its text; "round" is done once every stage has been seen. With
 * "next", the arrows start hidden and the reader builds the loop: at each
 * stage they pick what comes next, marked right or wrong, until it closes.
 */
function loop(env: Env): FigureFactory {
  const { k } = env;
  return live<LoopOptions>(['round', 'next'], checkLoop(k), (o, t) => {
    const n = o.stages.length;
    const build = t.goal === 'next';
    const titleLines = o.title ? wrap(o.title, W - 16, 'normal', true) : [];
    const top = titleLines.length ? titleLines.length * lineHeight('normal') + 10 : 0;
    const boxLines = o.stages.map((s) => wrap(s.name, 104, 'note', true));
    const boxH = (i: number) => boxLines[i].length * lineHeight('note') + (o.stages[i].note ? lineHeight('small') : 0) + 12;
    const boxW = (i: number) => Math.max(...boxLines[i].map((l) => textWidth(l, 'note', true)), o.stages[i].note ? textWidth(o.stages[i].note!, 'small') : 0) + 18;
    const rx = 140;
    const ry = n <= 4 ? 78 : 96;
    const cx = W / 2;
    const cy = top + ry + 26;
    const H = cy + ry + 30;
    const at = o.stages.map((_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    });
    const f = frame(W, H, o.textLines ?? 3);
    if (titleLines.length) f.svg.append(...block(W / 2, 16, titleLines, 'normal', { bold: true, anchor: 'middle' }));
    if (o.middle) f.svg.append(...block(cx, cy + 4, wrap(o.middle, 90, 'note', true), 'note', { bold: true, soft: true, anchor: 'middle' }));
    const arrowsG = svg('g');
    const boxesG = svg('g');
    f.svg.append(arrowsG, boxesG);

    // Where a line from a box's centre toward (dx, dy) leaves the box.
    const edge = (i: number, dx: number, dy: number) => {
      const hw = boxW(i) / 2 + 4;
      const hh = boxH(i) / 2 + 4;
      const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      return { x: at[i].x + dx * s, y: at[i].y + dy * s };
    };
    const kept = (isRecord(t.kept) ? t.kept : {}) as { seen?: number[]; built?: number; misses?: number };
    const seen = new Set<number>(Array.isArray(kept.seen) ? kept.seen.filter((i) => Number.isInteger(i) && i >= 0 && i < n) : t.restored ? o.stages.map((_, i) => i) : []);
    let built = typeof kept.built === 'number' ? Math.min(kept.built, n) : t.restored ? n : 0;
    let misses = typeof kept.misses === 'number' ? kept.misses : 0;
    let current = build ? built % n : -1;
    const keep = () => t.keep({ seen: [...seen], built, misses });

    const paint = () => {
      const ap: SVGElement[] = [];
      o.stages.forEach((s, i) => {
        if (build && i >= built) return;
        const j = (i + 1) % n;
        const dx = at[j].x - at[i].x;
        const dy = at[j].y - at[i].y;
        const len = Math.hypot(dx, dy);
        const a = edge(i, dx / len, dy / len);
        const b = edge(j, -dx / len, -dy / len);
        const lit = !build && i === current;
        ap.push(arrow(a.x, a.y, b.x, b.y, lit ? k.ink : k.soft, lit ? 2.2 : 1.5));
        if (s.how) {
          // The words sit beside the arrow's middle, on the side toward the middle of the loop.
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const centred = Math.abs(mx - cx) < 30;
          const anchor = centred ? 'middle' : mx > cx ? 'end' : undefined;
          const ix = centred ? mx : mx > cx ? mx - 8 : mx + 8;
          const words = wrap(s.how, 96, 'small');
          const iy = centred ? my + (my < cy ? 14 : -6 - (words.length - 1) * lineHeight('small')) : my - ((words.length - 1) * lineHeight('small')) / 2 + 3;
          ap.push(...block(ix, iy, words, 'small', { anchor, soft: !lit, bold: lit }));
        }
      });
      arrowsG.replaceChildren(...ap);
      const bp: SVGElement[] = [];
      o.stages.forEach((s, i) => {
        const w = boxW(i);
        const h = boxH(i);
        const c = k.color(s.color, i);
        const lit = i === current;
        const g = svg('g');
        g.append(
          svg('rect', { x: at[i].x - w / 2, y: at[i].y - h / 2, width: w, height: h, rx: 7, fill: c, opacity: lit ? 1 : 0.85, stroke: lit ? k.ink : 'none', 'stroke-width': 2.5 }),
          ...haloBlock(at[i].x, at[i].y - h / 2 + 15, boxLines[i], s.note),
        );
        if (!build) tappable(g, s.name, () => visit(i));
        bp.push(g);
      });
      boxesG.replaceChildren(...bp);
      next.style.display = build ? 'none' : '';
    };
    const haloBlock = (x: number, y: number, lines: string[], noteText?: string): SVGElement[] => {
      const out: SVGElement[] = [];
      lines.forEach((l, li) => out.push(...haloLabel(x, y + li * lineHeight('note'), l, k, { anchor: 'middle' })));
      if (noteText) out.push(label(x, y + lines.length * lineHeight('note') - 2, noteText, { size: 'small', anchor: 'middle', fill: k.ink }));
      return out;
    };
    function visit(i: number) {
      current = i;
      seen.add(i);
      keep();
      paint();
      const s = o.stages[i];
      const then = o.stages[(i + 1) % n];
      say(f.readout, `${i + 1}. ${s.name}.`, `${s.text ?? ''}${s.how ? ` Then ${s.how}, it becomes ${then.name.toLowerCase()}.` : ''}`.trim());
      if (t.goal === 'round' && seen.size === n) t.done();
    }
    const next = el('button.btn', { type: 'button' }, 'Next') as HTMLButtonElement;
    next.addEventListener('click', () => visit((current + 1) % n));
    f.controls.append(el('div.fig-row', {}, next));

    // Building the loop: what does the current stage become?
    const ask = el('p.fig-ask');
    const picks = o.stages.map((s, i) => {
      const b = el('button.chip', { type: 'button' }, s.name) as HTMLButtonElement;
      b.addEventListener('click', () => choose(i));
      return b;
    });
    if (build) f.controls.append(ask, el('div.chips.fig-row', {}, picks));
    const askNow = () => {
      if (built >= n) {
        ask.textContent = '';
        picks.forEach((b) => (b.disabled = true));
        return;
      }
      ask.textContent = `What does ${o.stages[current].name.toLowerCase()} become?`;
      picks.forEach((b, i) => (b.disabled = i === current));
    };
    function choose(i: number) {
      if (built >= n) return;
      const want = (current + 1) % n;
      const s = o.stages[current];
      if (i !== want) {
        misses++;
        keep();
        f.readout.replaceChildren(verdict(false, `Not ${o.stages[i].name.toLowerCase()}.`), ' Try again.');
        return;
      }
      built++;
      current = want;
      seen.add(current);
      keep();
      paint();
      f.readout.replaceChildren(verdict(true, `${s.how ? `${s.how[0].toUpperCase()}${s.how.slice(1)}, ` : ''}${s.name.toLowerCase()} becomes ${o.stages[want].name.toLowerCase()}.`), ` ${built >= n ? `The loop is closed${misses ? `, with ${misses} wrong ${misses === 1 ? 'pick' : 'picks'} on the way` : ''}.` : o.stages[want].text ?? ''}`);
      askNow();
      if (built >= n) t.done();
    }

    paint();
    if (build) {
      askNow();
      if (built >= n) f.readout.textContent = 'The loop is closed.';
      else f.readout.textContent = built ? `${built} of ${n} arrows drawn. ${ask.textContent}` : `Start at ${o.stages[0].name.toLowerCase()} and build the loop one arrow at a time.`;
    } else f.readout.textContent = t.goal === 'round' ? `Tap each stage, or press Next, to go round the loop (${n - seen.size} to see).` : 'Tap a stage, or press Next, to go round the loop.';
    return f.node;
  });
}

// ---- Regroup ----------------------------------------------------------------------------------------

export interface RegroupView {
  /** The button's words ("By looks, 1753"). */
  label: string;
  /** Over the tree; the label otherwise. */
  title?: string;
  /** The tree: a node's `label` names a group (left out, it is drawn bare) or a leaf. */
  root: TreeNode;
  /** Said while this view shows. */
  text?: string;
}

export interface RegroupOptions {
  /** Two or more ways of grouping the same leaves. */
  views: RegroupView[];
  /** A leaf to follow: it and the others in its smallest group are drawn bold. */
  follow?: string;
  guess?: { ask: string; options: string[]; answer?: number };
  textLines?: number;
}

const leafLabels = (n: TreeNode): string[] => (n.children?.length ? n.children.flatMap(leafLabels) : [n.label]);
const treeDepth = (n: TreeNode): number => (n.children?.length ? 1 + Math.max(...n.children.map(treeDepth)) : 0);

function checkRegroup(k: Kit) {
  return (o: Record<string, unknown>): string[] => {
    const out = [...linesProblem(o), ...checkGuess(o)];
    const views = list(o, 'views');
    if (!views || views.length < 2) return [...out, 'needs "views", two or more { "label", "root" }'];
    const node = (raw: unknown, at: string) => {
      const n = (raw ?? {}) as Record<string, unknown>;
      if (n.label !== undefined && !isStr(n.label)) out.push(`${at}: "label" should be text`);
      if (n.note !== undefined && !isStr(n.note)) out.push(`${at}: "note" should be text`);
      out.push(...colorProblem(n.color, k, at));
      if (n.children === undefined) {
        if (!isStr(n.label) || !n.label) out.push(`${at}: a leaf needs a "label"`);
      } else if (!Array.isArray(n.children) || !n.children.length) out.push(`${at}: "children" should be a list`);
      else n.children.forEach((c, i) => node(c, `${at} > ${isStr((c as TreeNode)?.label) && (c as TreeNode).label ? (c as TreeNode).label : i + 1}`));
    };
    views.forEach((raw, i) => {
      const v = (raw ?? {}) as Record<string, unknown>;
      const at = `view ${i + 1}`;
      if (!isStr(v.label) || !v.label) out.push(`${at}: "label" should be text`);
      for (const key of ['title', 'text'] as const) if (v[key] !== undefined && !isStr(v[key])) out.push(`${at}: "${key}" should be text`);
      if (!isRecord(v.root)) out.push(`${at}: needs "root", a tree`);
      else node(v.root, at);
    });
    if (out.length) return out;
    const sets = (views as RegroupView[]).map((v) => leafLabels(v.root).slice().sort().join('|'));
    if (sets.some((s) => s !== sets[0])) out.push('every view should hold the same leaves, grouped differently');
    if (o.follow !== undefined && !(isStr(o.follow) && leafLabels((views[0] as RegroupView).root).includes(o.follow))) out.push('"follow" should be one of the leaves');
    return out;
  };
}

/**
 * The same things grouped two or more ways, a tree for each, switched with
 * buttons: by looks and by genes, say. The leaves keep their colours from view
 * to view, so the eye can follow one; "follow" draws one leaf and its closest
 * kin in bold. "switched" is done once the last view has been seen. With
 * "guess", the reader answers first and the buttons unlock after.
 */
function regroup(env: Env): FigureFactory {
  const { k } = env;
  return live<RegroupOptions>(['switched'], checkRegroup(k), (o, t) => {
    const leaves = leafLabels(o.views[0].root);
    const hasNote = o.views.some((v) => JSON.stringify(v.root).includes('"note"'));
    const gap = hasNote ? 30 : 19;
    const top = 40;
    const H = top + leaves.length * gap + 4;
    const f = frame(W, H, o.textLines ?? 3);
    const g = svg('g');
    f.svg.append(g);
    // A leaf's colour, from the first view that gives it one, so it stays the same in every view.
    const colorOf = new Map<string, string>();
    for (const v of o.views) {
      const walk = (n: TreeNode, inherited?: string) => {
        const c = n.color ?? inherited;
        if (n.children?.length) n.children.forEach((ch) => walk(ch, c));
        else if (c && !colorOf.has(n.label)) colorOf.set(n.label, k.color(c, 0));
      };
      walk(v.root);
    }
    const labelX = 236;
    // Kept as { view } once a view is picked; a bare number is guessFirst's guess.
    const keptView = isRecord(t.kept) && typeof t.kept.view === 'number' ? t.kept.view : 0;
    let view = t.restored ? o.views.length - 1 : Math.min(keptView, o.views.length - 1);

    const kinOf = (root: TreeNode): Set<string> => {
      if (!o.follow) return new Set();
      const find = (n: TreeNode): TreeNode | null => {
        if (!n.children?.length) return null;
        for (const c of n.children) {
          const got = find(c);
          if (got) return got;
        }
        return n.children.some((c) => !c.children?.length && c.label === o.follow) ? n : null;
      };
      const grp = find(root);
      return new Set(grp ? leafLabels(grp) : []);
    };

    const paint = () => {
      const v = o.views[view];
      const levels = Math.max(1, treeDepth(v.root));
      const colX = (d: number) => 14 + ((labelX - 22) * d) / levels;
      const parts: SVGElement[] = [...block(10, 18, wrap(v.title ?? v.label, W - 20, 'normal', true).slice(0, 1), 'normal', { bold: true })];
      const kin = kinOf(v.root);
      let row = 0;
      const place = (n: TreeNode, d: number): number => {
        if (!n.children?.length) {
          const y = top + row++ * gap;
          const c = colorOf.get(n.label) ?? k.ink;
          const followed = n.label === o.follow;
          const near = kin.has(n.label);
          parts.push(
            line(colX(d), y, labelX - 4, y, c, followed ? 3 : 2),
            svg('circle', { cx: labelX - 4, cy: y, r: followed ? 4.5 : 3, fill: c }),
            label(labelX + 4, y + 4, n.label, { size: 'note', bold: !o.follow || near, fill: o.follow && !near ? k.soft : c }),
          );
          if (n.note) parts.push(label(labelX + 4, y + 16, n.note, { size: 'small', soft: true }));
          return y;
        }
        const ys = n.children.map((ch) => place(ch, d + 1));
        const x = colX(d);
        parts.push(line(x, Math.min(...ys), x, Math.max(...ys), k.ink, 1.5));
        for (const yk of ys) parts.push(line(x, yk, colX(d + 1), yk, k.ink, 1.5));
        if (n.label) parts.push(label(x + 4, Math.min(...ys) - 5, n.label, { size: 'small', bold: true, fill: n.color ? k.color(n.color, 0) : k.soft, halo: k.paper }));
        return (Math.min(...ys) + Math.max(...ys)) / 2;
      };
      const y0 = place(v.root, 0);
      parts.push(line(6, y0, 14, y0, k.ink, 1.5));
      g.replaceChildren(...parts);
      buttons.forEach((b, i) => {
        b.classList.toggle('on', i === view);
        b.setAttribute('aria-pressed', String(i === view));
      });
      if (!open()) return;
      seen.add(view);
      const unseen = o.views.findIndex((_, i) => !seen.has(i));
      say(f.readout, `${v.label}.`, [v.text ?? '', unseen >= 0 ? `Tap “${o.views[unseen].label}” below to see them grouped another way.` : ''].filter(Boolean).join(' '));
    };
    const seen = new Set<number>();
    const buttons = o.views.map((v, i) => {
      const b = el('button.chip', { type: 'button', 'aria-pressed': 'false' }, v.label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        view = i;
        t.keep({ view });
        paint();
        if (view === o.views.length - 1) t.done();
      });
      return b;
    });
    const row = el('div.chips.fig-row', {}, el('span.chip-label', {}, 'Group:'), ...buttons);
    f.controls.append(row);
    let open = () => true;
    if (o.guess && !t.restored && !isRecord(t.kept)) {
      open = guessFirst(t, f, { ask: o.guess.ask, options: o.guess.options, answer: o.guess.answer, sliders: [], hidden: [row], reveal: t.goal ? 'done' : 'lock', after: () => paint() });
    }
    paint();
    return f.node;
  });
}

// ---- Key you can enter anywhere ----------------------------------------------------------------------

export interface KeyFeature {
  name: string;
  values: string[];
}

export interface KeyTaxon extends PictureSpec {
  name: string;
  /** Its value for each feature, by feature name; a list where it varies. A feature left out fits any value. */
  traits: Record<string, string | string[]>;
  /** Said once it is the only one left. */
  about?: string;
}

function checkMultiKey(env: Env, o: Record<string, unknown>): string[] {
  const out: string[] = [];
  const features = list(o, 'features') as { name?: unknown; values?: unknown }[] | null;
  if (!features || !features.length) return ['needs "features", a list of { "name", "values" }'];
  features.forEach((ft, i) => {
    if (!isStr(ft?.name) || !ft.name) out.push(`feature ${i + 1}: "name" should be text`);
    if (!Array.isArray(ft?.values) || ft.values.length < 2 || !ft.values.every(isStr)) out.push(`feature ${i + 1}: "values" should be two or more words`);
  });
  const taxa = list(o, 'taxa') as Record<string, unknown>[] | null;
  if (!taxa || taxa.length < 2) return [...out, 'needs "taxa", two or more { "name", "traits" }'];
  if (taxa.length > 12) out.push('has more than 12 "taxa", too many to show at once');
  if (out.length) return out;
  taxa.forEach((tx, i) => {
    const at = `taxon ${i + 1}`;
    if (!isStr(tx?.name) || !tx.name) out.push(`${at}: "name" should be text`);
    if (tx?.about !== undefined && !isStr(tx.about)) out.push(`${at}: "about" should be text`);
    if (!isRecord(tx?.traits)) return void out.push(`${at}: needs "traits", its value for each feature`);
    for (const [key, v] of Object.entries(tx.traits)) {
      const ft = features.find((f) => f.name === key);
      if (!ft) out.push(`${at}: "${key}" is not one of the features`);
      else for (const one of Array.isArray(v) ? v : [v]) if (!(ft.values as string[]).includes(one)) out.push(`${at}: "${String(one)}" is not a value of ${key}`);
    }
    out.push(...pictureProblems(tx, env, at, false));
  });
  return out;
}

/** The multi-access key: tick features in any order and watch the candidates narrow. */
function multiKey(env: Env, o: IdKeyOptions, t: Task): HTMLElement {
  const { k } = env;
  const features = o.features!;
  const taxa = o.taxa!;
  const specimens = o.specimens ?? [];
  const n = taxa.length;
  const pics = taxa.map((tx) => (hasPicture(tx as unknown as Record<string, unknown>) ? pictureOf(tx, env) : null));
  const specPics = specimens.map((sp) => (hasPicture(sp as unknown as Record<string, unknown>) ? pictureOf(sp, env) : null));
  const withPics = pics.some(Boolean);
  const perRow = withPics ? (n <= 6 ? 3 : 4) : n <= 4 ? 2 : 3;
  const cardW = (W - 16 - (perRow - 1) * 6) / perRow;
  const nameLines = taxa.map((tx) => wrap(tx.name, cardW - 10, 'note', true).slice(0, 2));
  const imgH = withPics ? Math.round(cardW * 0.62) : 0;
  const cardH = imgH + 8 + Math.max(...nameLines.map((l) => l.length)) * lineHeight('note') + 4;
  const titleLines = o.title ? wrap(o.title, W - 16, 'normal', true) : [];
  const specH = specPics.some(Boolean) ? 150 : 0;
  const top = (titleLines.length ? titleLines.length * lineHeight('normal') + 10 : 4) + (specH ? specH + 8 : 0);
  const rows = Math.ceil(n / perRow);
  const H = top + rows * (cardH + 6);
  const f = frame(W, H, o.textLines ?? 3);
  if (titleLines.length) f.svg.append(...block(W / 2, 16, titleLines, 'normal', { bold: true, anchor: 'middle' }));
  const specG = svg('g');
  const cardsG = svg('g');
  f.svg.append(specG, cardsG);
  const credits = creditSlot(f.svg);

  const kept = (isRecord(t.kept) ? t.kept : {}) as { reached?: string[]; keyed?: number };
  const reached = new Set<string>(Array.isArray(kept.reached) ? kept.reached.filter(isStr) : []);
  let keyed = typeof kept.keyed === 'number' ? kept.keyed : t.restored ? specimens.length : 0;
  const ticks = new Map<string, string>();
  const fits = (tx: KeyTaxon) => features.every((ft) => {
    const want = ticks.get(ft.name);
    const has = tx.traits[ft.name];
    return want === undefined || has === undefined || (Array.isArray(has) ? has.includes(want) : has === want);
  });
  const keep = () => t.keep({ reached: [...reached], keyed });

  const rowsUi = features.map((ft) => {
    const chips = ft.values.map((v) => {
      const b = el('button.chip', { type: 'button', 'aria-pressed': 'false' }, v) as HTMLButtonElement;
      b.addEventListener('click', () => {
        if (ticks.get(ft.name) === v) ticks.delete(ft.name);
        else ticks.set(ft.name, v);
        changed();
      });
      return b;
    });
    return { ft, chips, node: el('div.chips.fig-row', {}, el('span.chip-label', {}, `${ft.name}:`), chips) };
  });
  const again = el('button.btn', { type: 'button' }, specimens.length ? 'Next one' : 'Clear') as HTMLButtonElement;
  again.addEventListener('click', () => {
    ticks.clear();
    changed(true);
  });
  f.controls.append(...rowsUi.map((r) => r.node), el('div.fig-row', {}, again));

  const draw = () => {
    const left = taxa.map(fits);
    const sp = specimens[Math.min(keyed, specimens.length - 1)];
    const sPic = specPics[Math.min(keyed, specimens.length - 1)];
    const sp2: SVGElement[] = [];
    if (specH) {
      const y = top - specH - 8;
      sp2.push(svg('rect', { x: 0, y, width: W, height: specH, fill: k.grid }));
      if (sPic) sp2.push(image(sPic, 0, y, W, specH, t, 'meet'));
      else if (sp) sp2.push(label(W / 2, y + specH / 2, 'Specimen', { bold: true, anchor: 'middle' }));
    }
    specG.replaceChildren(...sp2);
    const cp: SVGElement[] = [];
    taxa.forEach((_, i) => {
      const x = 8 + (i % perRow) * (cardW + 6);
      const y = top + Math.floor(i / perRow) * (cardH + 6);
      const on = left[i];
      const g = svg('g', { opacity: on ? 1 : 0.22 });
      g.append(svg('rect', { x, y, width: cardW, height: cardH, rx: 6, fill: k.paper, stroke: on ? k.ink : k.soft, 'stroke-width': on ? 1.5 : 1 }));
      const p = pics[i];
      if (p) g.append(svg('rect', { x: x + 3, y: y + 3, width: cardW - 6, height: imgH, fill: k.grid }), image(p, x + 3, y + 3, cardW - 6, imgH, t));
      g.append(...block(x + cardW / 2, y + imgH + 4 + lineHeight('note'), nameLines[i], 'note', { bold: true, anchor: 'middle' }));
      cp.push(g);
    });
    cardsG.replaceChildren(...cp);
    credits.show(specH ? [sPic] : pics.filter((_, i) => left[i]));
    for (const r of rowsUi) r.chips.forEach((b, vi) => {
      const on = ticks.get(r.ft.name) === r.ft.values[vi];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    return left;
  };
  function changed(reset = false) {
    const left = draw();
    const count = left.filter(Boolean).length;
    const only = count === 1 ? taxa[left.indexOf(true)] : undefined;
    if (specimens.length && keyed < specimens.length) {
      const want = specimens[keyed].name;
      const wantIn = left[taxa.findIndex((tx) => tx.name === want)];
      if (only && only.name === want) {
        reached.add(want);
        keyed++;
        keep();
        f.readout.replaceChildren(verdict(true, `Keyed out: ${want}.`), only.about ? ` ${only.about}` : '');
        if (keyed >= specimens.length && t.goal) t.done();
        again.textContent = keyed >= specimens.length ? 'Clear' : 'Next one';
        return;
      }
      if (!wantIn) {
        f.readout.replaceChildren(verdict(false, 'That rules out the right one.'), ' Untick a feature and look again.');
        return;
      }
      f.readout.textContent = `${reset ? '' : `${count} still fit. `}${keyed + 1} of ${specimens.length}${specimens[keyed].hint ? `: ${specimens[keyed].hint}` : ''}. Tick what you can see, in any order.`;
      return;
    }
    if (only) {
      reached.add(only.name);
      keep();
      say(f.readout, `Only ${only.name} fits.`, only.about ?? '');
      if (t.goal === 'keyed' || (t.goal === 'every' && taxa.every((tx) => reached.has(tx.name)))) t.done();
    } else if (!count) f.readout.textContent = 'Nothing fits every tick. Untick one.';
    else if (specimens.length) f.readout.textContent = `All ${specimens.length} keyed out. Tick features to narrow the list again.`;
    else f.readout.textContent = `${count} of ${n} fit. Tick what you can see, in any order.${t.goal === 'every' ? ` (${taxa.filter((tx) => !reached.has(tx.name)).length} still to reach alone.)` : ''}`;
  }
  changed(true);
  return f.node;
}

// ---- The set --------------------------------------------------------------------------------------

/**
 * The live charts, by the ids lessons use, drawn in `palette`. Spread them
 * with the charts, under the course's own figures, so a course figure of the
 * same id wins.
 */
export function liveCharts<P extends Photo & { about?: string }>(o: LiveChartsOptions<P> = {}): Record<LiveChartId, FigureFactory> {
  const lib = o.photos;
  const photos = lib && { find: (id: string) => lib.find(id), src: (p: Photo) => lib.src(p as P) };
  const env: Env = { k: kit(o.palette ?? {}), asset: o.asset ?? ((p: string) => p), photos };
  return {
    hotspots: hotspots(env),
    compare: compare(env),
    'timeline-live': timelineLive(env),
    'scale-guess': scaleGuess(env),
    groups: groups(env),
    'id-key': idKey(env),
    'id-drill': idDrill(env),
    'clue-board': clueBoard(env),
    loop: loop(env),
    regroup: regroup(env),
  };
}
