// Figures a lesson sets up in its JSON alone, with no code in the course:
// a timeline, a tree, a scale comparison and a labelled plate. Each is a
// still, drawn from the block's "options", which hold its words and numbers:
//
//   { "type": "diagram", "id": "scale", "caption": "Thunder, by place",
//     "options": { "title": "Days a year with thunder", "items": [
//       { "label": "Fort Myers, Florida", "value": 90, "color": "sun" },
//       { "label": "Seattle, Washington", "value": 6, "color": "dew" } ] } }
//
// A course adds them to its figures once, `{ ...charts({ palette }), ...FIGURES }`,
// and every lesson can use them by id, as often as it likes. Since their
// words are in the lesson file, the course file (course.ts) carries them, and
// editing them there edits the drawing. A colour is a key of the palette
// handed in, or any CSS colour.
//
// They follow the figure rules: drawn on the paper, 400 units wide, as tall
// as their content needs, with the caption in the one text box under them.

import { el, svg } from './dom';
import { label, line, still } from './draw';
import type { FigureFactory, FigureHandle, Options } from './figure';
import { height as sayHeight, length as sayLength, type Units } from './units';

/** The ids the charts go by in a lesson's blocks. */
export const CHART_IDS = ['timeline', 'tree', 'scale', 'plate'] as const;
export type ChartId = (typeof CHART_IDS)[number];

export interface ChartsOptions {
  /** Colours by name, for "color" in the options; `ink`, `soft`, `paper` and `grid` are used if present. */
  palette?: Readonly<Record<string, string>>;
  /** Where a plate's "image" path is fetched from (asset.ts `assetFrom`); default the path as written. */
  asset?: (path: string) => string;
}

/** The colours the stylesheet's paper and ink use (styles/kit.css), and a few to tell things apart. */
const DEFAULT_PALETTE: Record<string, string> = {
  ink: '#2a2547',
  soft: '#6a5c80',
  paper: '#fffaf0',
  grid: 'rgba(42, 37, 71, 0.14)',
  rose: '#a8448f',
  teal: '#0e6a80',
  sun: '#e68999',
  good: '#3f9b6a',
  bad: '#c9473f',
};

/** The colours a chart cycles through when an item names none. */
const CYCLE = ['teal', 'rose', 'sun', 'good'];

const W = 400;

// ---- Options as a lesson writes them ----------------------------------------

/** Shared by every chart: a bold line over the drawing and a muted one under it. */
interface Framing {
  title?: string;
  note?: string;
}

/** What a scale comparison's values are, for showing them in the reader's units. */
export type Quantity = 'number' | 'length' | 'height';

export interface ScaleItem {
  label: string;
  value: number;
  /** Shown at the end of the bar in place of the value. */
  says?: string;
  color?: string;
  bold?: boolean;
}

export interface ScaleOptions extends Framing {
  items: ScaleItem[];
  /** Written after each value ("days", "km/h"); not used with a `quantity`. */
  unit?: string;
  /** "length" and "height" values are metres, shown in the reader's units. Default "number". */
  quantity?: Quantity;
  /** Bars by ratio, for things a thousand times apart; the axis is marked at each power of ten. */
  log?: boolean;
}

export interface TimelineEvent {
  /** When, as a number: a year, or millions of years ago with a negative sign. */
  at: number;
  /** For a span, when it ends. */
  to?: number;
  label: string;
  /** Shown in place of `at` ("spring 1931"). */
  when?: string;
  color?: string;
  bold?: boolean;
}

export interface TimelineOptions extends Framing {
  events: TimelineEvent[];
  /** Written after each `at` ("Ma", "BC"). */
  unit?: string;
  /** "time" (default) spaces events by how far apart they are; "even" gives each the same room. */
  spacing?: 'time' | 'even';
}

export interface TreeNode {
  label: string;
  /** A muted line after the label. */
  note?: string;
  color?: string;
  children?: TreeNode[];
}

export interface TreeOptions extends Framing {
  root: TreeNode;
  /** "across" (default): an outline, indented by depth, for any size. "down": the root on top, for a few leaves. */
  layout?: 'across' | 'down';
}

export interface PlateLabel {
  /** Where on the image the label points, from 0 (left, top) to 1 (right, bottom). */
  x: number;
  y: number;
  text: string;
  /** Which margin the label sits in; by default the side its point is nearer. */
  side?: 'left' | 'right';
}

export interface PlateOptions extends Framing {
  /** The picture, as a path next to the page or a URL. */
  image: string;
  /** The image's size in pixels, for its shape. */
  width: number;
  height: number;
  /** What the picture shows, for a screen reader. */
  alt?: string;
  /** Who made it, under the image. */
  credit?: string;
  labels: PlateLabel[];
}

// ---- Text --------------------------------------------------------------------

const SIZE = { normal: 11, note: 10, small: 9 } as const;
type Size = keyof typeof SIZE;

/** About how wide a run of text is: system fonts average a little over half their size. */
function textWidth(text: string, size: Size, bold = false): number {
  return text.length * SIZE[size] * (bold ? 0.6 : 0.55);
}

/** Lines of at most `width` units, broken between words. */
export function wrap(text: string, width: number, size: Size = 'normal', bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

const lineHeight = (size: Size) => Math.round(SIZE[size] * 1.25);

/** Lines of text, the first baseline at y. */
function block(x: number, y: number, lines: string[], size: Size, style: { bold?: boolean; soft?: boolean; anchor?: 'middle' | 'end'; fill?: string } = {}): SVGElement[] {
  const s = size === 'normal' ? undefined : size;
  return lines.map((t, i) => label(x, y + i * lineHeight(size), t, { size: s, ...style }));
}

// ---- Shared ------------------------------------------------------------------

interface Kit {
  color: (name: string | undefined, i: number) => string;
  ink: string;
  soft: string;
  paper: string;
  grid: string;
  isColor: (name: string) => boolean;
}

function kit(palette: Readonly<Record<string, string>>): Kit {
  const all = { ...DEFAULT_PALETTE, ...palette };
  const cycle = CYCLE.filter((k) => k in all).concat(Object.keys(palette).filter((k) => !['ink', 'soft', 'paper', 'grid'].includes(k)));
  const isColor = (name: string) => name in all || /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|var)\(.+\))$/i.test(name.trim());
  return {
    color: (name, i) => (name ? (all[name] ?? name) : all[cycle[i % cycle.length]] ?? all.ink),
    ink: all.ink,
    soft: all.soft,
    paper: all.paper,
    grid: all.grid,
    isColor,
  };
}

/** The drawing, its title on top, its note underneath; `draw` lays out from `top` and returns where it ended. */
function chart(k: Kit, o: Framing, draw: (s: SVGSVGElement, top: number) => number, alt?: string): FigureHandle {
  const s = svg('svg') as SVGSVGElement;
  let y = 8;
  const title = o.title ? wrap(o.title, W - 16, 'normal', true) : [];
  if (title.length) {
    s.append(...block(W / 2, y + 12, title, 'normal', { bold: true, anchor: 'middle' }));
    y += 6 + title.length * lineHeight('normal');
  }
  y = draw(s, y + 6);
  if (o.note) {
    const lines = wrap(o.note, W - 16, 'note');
    s.append(...block(8, y + 14, lines, 'note', { soft: true }));
    y += 6 + lines.length * lineHeight('note');
  }
  const h = Math.ceil(y + 8);
  const d = still(W, h);
  d.svg.append(svg('rect', { x: 0, y: 0, width: W, height: h, fill: k.paper }), ...Array.from(s.childNodes));
  if (alt) d.svg.setAttribute('aria-label', alt);
  return { node: d.node };
}

/** A factory for a chart, with its check, marked so a gallery shows every block that uses it. */
function made<O>(draw: (k: Kit, units: Units, o: O, asset: (p: string) => string) => FigureHandle, check: (o: Record<string, unknown>, k: Kit) => string[], palette: Readonly<Record<string, string>>, asset: (p: string) => string): FigureFactory {
  const k = kit(palette);
  const options = (o: Options | undefined) => (o && typeof o === 'object' ? check(o, k) : ['needs "options" to draw from']);
  const make = (ctx: Parameters<FigureFactory>[0], _goal?: string, o?: Options): FigureHandle => {
    if (options(o).length) return { node: el('div.fig-body.fig-still', {}, el('p.fig-readout', {}, options(o).join('; '))) };
    return draw(k, ctx.save.units, o as O, asset);
  };
  return Object.assign(make, { options, each: true as const });
}

// ---- Checks ------------------------------------------------------------------

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function framing(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ['title', 'note'] as const) if (o[k] !== undefined && !isStr(o[k])) out.push(`"${k}" should be text`);
  return out;
}

function colorProblem(v: unknown, k: Kit, where: string): string[] {
  if (v === undefined) return [];
  return isStr(v) && k.isColor(v) ? [] : [`${where}: "color" should be a palette name or a CSS colour, not ${JSON.stringify(v)}`];
}

function list(o: Record<string, unknown>, key: string): unknown[] | null {
  return Array.isArray(o[key]) && (o[key] as unknown[]).length ? (o[key] as unknown[]) : null;
}

// ---- Scale comparison --------------------------------------------------------

/** Two significant figures, for sizes far below a centimetre or an inch. */
const sig = (v: number) => Number(v.toPrecision(2)).toLocaleString('en-US', { maximumSignificantDigits: 2 });

/** A length in the reader's units, down to a cloud droplet: mm and µm, or fractions of an inch, below what units.ts says. */
function sayFine(m: number, units: Units): string {
  if (units === 'metric') return m >= 0.01 ? sayLength(m, units) : m >= 0.0001 ? `${sig(m * 1000)} mm` : `${sig(m * 1e6)} µm`;
  return m * 39.3701 >= 1 ? sayLength(m, units) : `${sig(m * 39.3701)} in`;
}

function sayValue(v: number, o: ScaleOptions, units: Units): string {
  if (o.quantity === 'length') return sayFine(v, units);
  if (o.quantity === 'height') return sayHeight(v, units);
  return `${v.toLocaleString('en-US')}${o.unit ? ` ${o.unit}` : ''}`;
}

function drawScale(k: Kit, units: Units, o: ScaleOptions): FigureHandle {
  return chart(k, o, (s, top) => {
    const says = o.items.map((it) => it.says ?? sayValue(it.value, o, units));
    const labels = o.items.map((it) => wrap(it.label, 150, 'note', it.bold));
    const labelW = Math.min(150, Math.max(...labels.flatMap((ls, i) => ls.map((t) => textWidth(t, 'note', o.items[i].bold) + 2))));
    const x0 = 8 + labelW + 8;
    const room = W - x0 - Math.max(...says.map((t) => textWidth(t, 'note', true))) - 20;
    const values = o.items.map((it) => it.value);
    const hi = Math.max(...values);
    let len: (v: number) => number;
    let ticks: number[] = [];
    if (o.log) {
      const lo = 10 ** Math.floor(Math.log10(Math.min(...values)));
      const top10 = 10 ** Math.ceil(Math.log10(hi));
      len = (v) => (Math.log10(v / lo) / Math.log10(top10 / lo)) * room;
      for (let t = lo; t <= top10 * 1.0001; t *= 10) ticks.push(t);
    } else len = (v) => (hi > 0 ? (Math.max(0, v) / hi) * room : 0);
    let y = top;
    o.items.forEach((it, i) => {
      const rowH = Math.max(26, labels[i].length * lineHeight('note') + 10);
      const c = k.color(it.color, i);
      const w = Math.max(3, len(it.value));
      const mid = y + rowH / 2;
      const first = mid + 3.5 - ((labels[i].length - 1) * lineHeight('note')) / 2;
      s.append(
        ...block(x0 - 8, first, labels[i], 'note', { anchor: 'end', bold: it.bold, fill: it.color ? c : undefined }),
        svg('rect', { x: x0, y: mid - 8, width: w, height: 16, rx: 2, fill: c }),
        label(x0 + w + 6, mid + 3.5, says[i], { size: 'note', bold: true }),
      );
      y += rowH;
    });
    if (ticks.length) {
      s.append(line(x0, y + 4, x0 + room, y + 4, k.soft, 1));
      for (const t of ticks) {
        const x = x0 + len(t);
        s.append(line(x, y + 1, x, y + 7, k.soft, 1), label(x, y + 18, sayValue(t, o, units), { size: 'small', soft: true, anchor: 'middle' }));
        s.append(line(x, top, x, y, k.grid, 1));
      }
      y += 22;
    }
    return y;
  });
}

function checkScale(o: Record<string, unknown>, k: Kit): string[] {
  const out = framing(o);
  const items = list(o, 'items');
  if (!items) return [...out, 'a scale needs "items", a list of { "label", "value" }'];
  items.forEach((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const at = `item ${i + 1}`;
    if (!isStr(it.label)) out.push(`${at}: "label" should be text`);
    if (!isNum(it.value)) out.push(`${at}: "value" should be a number`);
    else if (o.log && it.value <= 0) out.push(`${at}: a log scale needs values above 0`);
    if (it.says !== undefined && !isStr(it.says)) out.push(`${at}: "says" should be text`);
    out.push(...colorProblem(it.color, k, at));
  });
  if (o.unit !== undefined && !isStr(o.unit)) out.push('"unit" should be text');
  if (o.quantity !== undefined && !['number', 'length', 'height'].includes(o.quantity as string)) out.push('"quantity" should be "number", "length" or "height"');
  return out;
}

// ---- Timeline ------------------------------------------------------------------

function sayWhen(e: TimelineEvent, o: TimelineOptions): string {
  if (e.when) return e.when;
  // Years read as years: 1931, not 1,931.
  const say = (t: number) => (Math.abs(t) >= 10000 ? t.toLocaleString('en-US') : String(t)).replace('-', '−');
  return `${say(e.at)}${e.to !== undefined && e.to !== e.at ? `–${say(e.to)}` : ''}${o.unit ? ` ${o.unit}` : ''}`;
}

function drawTimeline(k: Kit, _units: Units, o: TimelineOptions): FigureHandle {
  return chart(k, o, (s, top) => {
    const events = [...o.events].sort((a, b) => a.at - b.at);
    const whens = events.map((e) => sayWhen(e, o));
    const axis = Math.min(140, Math.max(...whens.map((t) => textWidth(t, 'note', true))) + 20);
    const textX = axis + 16;
    const lines = events.map((e) => wrap(e.label, W - textX - 8, 'normal', e.bold));
    const heights = lines.map((l) => l.length * lineHeight('normal') + 8);
    const from = events[0].at;
    const to = Math.max(...events.map((e) => e.to ?? e.at));
    // The axis is long enough that the events, set by time, have room on average.
    const length = Math.max(160, heights.reduce((a, b) => a + b, 0) * 1.2);
    const yOf = (t: number) => top + 8 + (o.spacing === 'even' || to === from ? 0 : ((t - from) / (to - from)) * length);
    // Where each event's words go: at its time, or pushed down off the one above.
    const at: number[] = [];
    events.forEach((e, i) => {
      const want = o.spacing === 'even' ? top + 8 + heights.slice(0, i).reduce((a, b) => a + b, 0) : yOf(e.at);
      at.push(i ? Math.max(want, at[i - 1] + heights[i - 1]) : want);
    });
    const pointOf = (e: TimelineEvent, i: number) => (o.spacing === 'even' ? at[i] : yOf(e.at));
    const end = Math.max(at[at.length - 1] + heights[heights.length - 1], o.spacing === 'even' ? 0 : yOf(to) + 8);
    s.append(line(axis, top, axis, end, k.soft, 2));
    events.forEach((e, i) => {
      const c = k.color(e.color, i);
      const y = pointOf(e, i);
      if (e.to !== undefined && o.spacing !== 'even') {
        s.append(svg('rect', { x: axis - 4, y, width: 8, height: Math.max(4, yOf(e.to) - y), rx: 3, fill: c, opacity: 0.55 }));
      }
      const base = at[i] + 4;
      s.append(
        svg('circle', { cx: axis, cy: y, r: 4.5, fill: c, stroke: k.paper, 'stroke-width': 1.5 }),
        // A bend from the point in time to its words, when they were pushed down.
        ...(base - 4 - y > 2 ? [svg('polyline', { points: `${axis + 5},${y} ${axis + 9},${y} ${axis + 9},${base - 4} ${textX - 3},${base - 4}`, fill: 'none', stroke: k.grid, 'stroke-width': 1 })] : [line(axis + 6, y, textX - 4, y, k.grid, 1)]),
        label(axis - 8, base, whens[i], { size: 'note', bold: true, anchor: 'end', fill: e.color ? c : undefined }),
        ...block(textX, base, lines[i], 'normal', { bold: e.bold }),
      );
    });
    return end + 4;
  });
}

function checkTimeline(o: Record<string, unknown>, k: Kit): string[] {
  const out = framing(o);
  const events = list(o, 'events');
  if (!events) return [...out, 'a timeline needs "events", a list of { "at", "label" }'];
  events.forEach((raw, i) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    const at = `event ${i + 1}`;
    if (!isNum(e.at)) out.push(`${at}: "at" should be a number`);
    if (e.to !== undefined && !(isNum(e.to) && isNum(e.at) && e.to >= e.at)) out.push(`${at}: "to" should be a number no earlier than "at"`);
    if (!isStr(e.label)) out.push(`${at}: "label" should be text`);
    if (e.when !== undefined && !isStr(e.when)) out.push(`${at}: "when" should be text`);
    out.push(...colorProblem(e.color, k, at));
  });
  if (o.unit !== undefined && !isStr(o.unit)) out.push('"unit" should be text');
  if (o.spacing !== undefined && !['time', 'even'].includes(o.spacing as string)) out.push('"spacing" should be "time" or "even"');
  return out;
}

// ---- Tree ----------------------------------------------------------------------

const leaves = (n: TreeNode): number => (n.children?.length ? n.children.reduce((t, c) => t + leaves(c), 0) : 1);
const depthOf = (n: TreeNode): number => 1 + Math.max(0, ...(n.children ?? []).map(depthOf));

/** Most leaves a tree drawn downward can hold and still be read on a phone. */
const DOWN_LEAVES = 6;

function drawTree(k: Kit, _units: Units, o: TreeOptions): FigureHandle {
  return chart(k, o, (s, top) => (o.layout === 'down' ? treeDown(s, top, k, o.root) : treeAcross(s, top, k, o.root)));
}

/** An outline: each node a row, indented by depth, joined to its parent by an elbow. */
function treeAcross(s: SVGSVGElement, top: number, k: Kit, root: TreeNode): number {
  const indent = 22;
  let y = top;
  const row = (n: TreeNode, depth: number, i: number, inherited?: string): number => {
    const x = 14 + depth * indent;
    const bold = depth === 0 || !!n.children?.length;
    const color = n.color ?? inherited;
    const c = k.color(color, depth === 0 ? 0 : i);
    const words = wrap(n.label, W - x - 16, 'normal', bold);
    const notes = n.note ? wrap(n.note, W - x - 16, 'note') : [];
    const mid = y + 10;
    s.append(
      svg('circle', { cx: x, cy: mid, r: depth === 0 ? 5 : 4, fill: color ? c : k.ink }),
      ...block(x + 10, mid + 4, words, 'normal', { bold }),
      ...block(x + 10, mid + 4 + words.length * lineHeight('normal'), notes, 'note', { soft: true }),
    );
    y += 8 + (words.length * lineHeight('normal')) + notes.length * lineHeight('note') + 4;
    let last = mid;
    (n.children ?? []).forEach((child, j) => {
      const cy = row(child, depth + 1, j, color);
      s.append(svg('polyline', { points: `${x},${j ? last : mid + 5} ${x},${cy} ${x + indent - 6},${cy}`, fill: 'none', stroke: k.soft, 'stroke-width': 1.2 }));
      last = cy;
    });
    return mid;
  };
  row(root, 0, 0);
  return y;
}

/** The root on top and each generation under it, the leaves sharing the width. */
function treeDown(s: SVGSVGElement, top: number, k: Kit, root: TreeNode): number {
  const slot = (W - 16) / leaves(root);
  // Each generation is as tall as its wordiest node.
  const levels: number[] = [];
  const measure = (n: TreeNode, depth: number, width: number) => {
    const h = wrap(n.label, width - 6, 'note', true).length * lineHeight('note') + (n.note ? wrap(n.note, width - 6, 'small').length * lineHeight('small') : 0);
    levels[depth] = Math.max(levels[depth] ?? 0, h);
    for (const c of n.children ?? []) measure(c, depth + 1, leaves(c) * slot);
  };
  measure(root, 0, W - 16);
  const gap = 26;
  const yAt = levels.map((_, d) => top + levels.slice(0, d).reduce((a, b) => a + b + gap, 0));
  const place = (n: TreeNode, depth: number, left: number, i: number, inherited?: string): number => {
    const width = leaves(n) * slot;
    const cx = left + width / 2;
    const color = n.color ?? inherited;
    const y = yAt[depth];
    const words = wrap(n.label, width - 6, 'note', true);
    s.append(...block(cx, y + 10, words, 'note', { bold: true, anchor: 'middle', fill: color ? k.color(color, i) : undefined }));
    if (n.note) s.append(...block(cx, y + 10 + words.length * lineHeight('note'), wrap(n.note, width - 6, 'small'), 'small', { soft: true, anchor: 'middle' }));
    let at = left;
    const bottom = y + levels[depth] + 4;
    (n.children ?? []).forEach((c, j) => {
      const ccx = place(c, depth + 1, at, j, color);
      const mid = bottom + (gap - 8) / 2;
      s.append(svg('polyline', { points: `${cx},${bottom} ${cx},${mid} ${ccx},${mid} ${ccx},${yAt[depth + 1] - 2}`, fill: 'none', stroke: k.soft, 'stroke-width': 1.2 }));
      at += leaves(c) * slot;
    });
    return cx;
  };
  place(root, 0, 8, 0);
  return yAt[yAt.length - 1] + levels[levels.length - 1] + 6;
}

function checkTree(o: Record<string, unknown>, k: Kit): string[] {
  const out = framing(o);
  const node = (raw: unknown, at: string) => {
    const n = (raw ?? {}) as Record<string, unknown>;
    if (!isStr(n.label)) out.push(`${at}: "label" should be text`);
    if (n.note !== undefined && !isStr(n.note)) out.push(`${at}: "note" should be text`);
    out.push(...colorProblem(n.color, k, at));
    if (n.children === undefined) return;
    if (!Array.isArray(n.children)) return void out.push(`${at}: "children" should be a list`);
    n.children.forEach((c, i) => node(c, `${at} > ${isStr((c as TreeNode)?.label) ? (c as TreeNode).label : i + 1}`));
  };
  if (!o.root || typeof o.root !== 'object') return [...out, 'a tree needs a "root": { "label", "children" }'];
  node(o.root, isStr((o.root as TreeNode).label) ? (o.root as TreeNode).label : 'root');
  if (o.layout !== undefined && !['across', 'down'].includes(o.layout as string)) out.push('"layout" should be "across" or "down"');
  if (o.layout === 'down' && !out.length) {
    const n = leaves(o.root as TreeNode);
    if (n > DOWN_LEAVES) out.push(`has ${n} leaves, too many to draw downward on a phone (at most ${DOWN_LEAVES}); use "layout": "across"`);
    if (depthOf(o.root as TreeNode) > 4) out.push('is more than 4 deep to draw downward; use "layout": "across"');
  }
  return out;
}

// ---- Labelled plate ------------------------------------------------------------

function drawPlate(k: Kit, _units: Units, o: PlateOptions, asset: (p: string) => string): FigureHandle {
  const sides = o.labels.map((l) => l.side ?? (l.x < 0.5 ? 'left' : 'right'));
  const left = sides.includes('left');
  const right = sides.includes('right');
  const margin = 96;
  const iw = W - (left ? margin : 8) - (right ? margin : 8);
  const ix = left ? margin : 8;
  const ih = (iw * o.height) / o.width;
  let ready: Promise<void> | undefined;
  const handle = chart(k, o, (s, top) => {
    const href = asset(o.image);
    s.append(svg('rect', { x: ix, y: top, width: iw, height: ih, fill: k.grid }));
    const img = svg('image', { href, x: ix, y: top, width: iw, height: ih, preserveAspectRatio: 'xMidYMid slice' });
    s.append(img);
    ready = loaded(href);
    // Each margin's labels in order down the page, spread so none overlap.
    for (const side of ['left', 'right'] as const) {
      const mine = o.labels.map((l, i) => ({ l, i })).filter(({ i }) => sides[i] === side).sort((a, b) => a.l.y - b.l.y);
      let next = top;
      for (const { l } of mine) {
        const words = wrap(l.text, margin - 14, 'note', true);
        const h = words.length * lineHeight('note');
        const px = ix + l.x * iw;
        const py = top + l.y * ih;
        const y = Math.max(next, py - h / 2 + 2);
        next = y + h + 6;
        const tx = side === 'left' ? ix - 8 : ix + iw + 8;
        const anchor = side === 'left' ? 'end' : undefined;
        const ly = y + h / 2 - 3;
        s.append(
          svg('polyline', { points: `${tx + (side === 'left' ? 2 : -2)},${ly} ${side === 'left' ? ix + 4 : ix + iw - 4},${ly} ${px},${py}`, fill: 'none', stroke: k.paper, 'stroke-width': 3, opacity: 0.8 }),
          svg('polyline', { points: `${tx + (side === 'left' ? 2 : -2)},${ly} ${side === 'left' ? ix + 4 : ix + iw - 4},${ly} ${px},${py}`, fill: 'none', stroke: k.ink, 'stroke-width': 1 }),
          svg('circle', { cx: px, cy: py, r: 3, fill: k.ink, stroke: k.paper, 'stroke-width': 1.5 }),
          ...block(tx, y + 8, words, 'note', { bold: true, anchor }),
        );
      }
    }
    let y = top + ih;
    if (o.credit) {
      s.append(label(ix + iw, y + 12, o.credit, { size: 'small', soft: true, anchor: 'end' }));
      y += 14;
    }
    return y;
  }, o.alt);
  return { ...handle, ready };
}

/** Settles once the image has loaded or failed, so a screenshot shows it; at once where nothing loads images. */
function loaded(href: string): Promise<void> | undefined {
  if (typeof Image === 'undefined' || typeof navigator === 'undefined' || /happy-?dom|jsdom/i.test(navigator.userAgent)) return undefined;
  return new Promise((done) => {
    const i = new Image();
    i.onload = i.onerror = () => done();
    i.src = href;
  });
}

function checkPlate(o: Record<string, unknown>): string[] {
  const out = framing(o);
  if (!isStr(o.image) || !o.image) out.push('a plate needs an "image" path');
  for (const key of ['width', 'height'] as const) if (!(isNum(o[key]) && o[key] > 0)) out.push(`"${key}" should be the image's ${key} in pixels`);
  for (const key of ['alt', 'credit'] as const) if (o[key] !== undefined && !isStr(o[key])) out.push(`"${key}" should be text`);
  const labels = list(o, 'labels');
  if (!labels) return [...out, 'a plate needs "labels", a list of { "x", "y", "text" }'];
  labels.forEach((raw, i) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const at = `label ${i + 1}`;
    for (const key of ['x', 'y'] as const) if (!(isNum(l[key]) && l[key] >= 0 && l[key] <= 1)) out.push(`${at}: "${key}" should be from 0 to 1, across the image`);
    if (!isStr(l.text)) out.push(`${at}: "text" should be text`);
    if (l.side !== undefined && l.side !== 'left' && l.side !== 'right') out.push(`${at}: "side" should be "left" or "right"`);
  });
  return out;
}

// ---- The set -------------------------------------------------------------------

/**
 * The charts, by the ids lessons use, drawn in `palette` (keys a lesson can
 * name as a "color"). Spread them under the course's own figures, so a
 * course figure of the same id wins.
 */
export function charts(o: ChartsOptions = {}): Record<ChartId, FigureFactory> {
  const palette = o.palette ?? {};
  const asset = o.asset ?? ((p: string) => p);
  return {
    timeline: made(drawTimeline, checkTimeline, palette, asset),
    tree: made(drawTree, checkTree, palette, asset),
    scale: made(drawScale, checkScale, palette, asset),
    plate: made(drawPlate, checkPlate, palette, asset),
  };
}
