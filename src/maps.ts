// Real places as the background of a figure: a grid of heights (a "relief")
// drawn as a shaded map, with the sun, the water level and the colouring as
// parameters, so a figure can make them causes ("raise the lake", "turn the
// light"), plus labels, lines and a scale bar on top.
//
// A relief is made ahead of time by a script (the monorepo's tools/geo) and
// shipped next to the page as two files: `<name>.png`, heights packed into the
// colours (the Terrarium encoding: metres = R*256 + G + B/256 - 32768), and
// `<name>.json`, which says where the grid lies, where its heights came from
// and under what licence. The grid is in Web Mercator pixels at one tile zoom,
// as the source tiles are, so nothing is resampled on the way.
//
// The map is never the subject. Each one is a fixed view chosen for one
// question: no tiles, no panning or zooming, no live data, and it works
// offline once the two files are cached.
//
//   const relief = await loadRelief(asset('maps/zion'));
//   const view = mapView(relief);
//   view.paint({ sun: { azimuth: 315, altitude: 40 } });
//   view.svg.append(...mapLabels(view, [{ lon: -112.95, lat: 37.27, text: 'Angels Landing' }]));
//
// `maps({ palette, asset })` gives the `map` chart, a still drawn from a
// lesson block's options alone, like the charts in charts.ts.

import { el, svg } from './dom';
import { label } from './draw';
import { figure, frame, player, slider, type FigureFactory, type FigureHandle, type Options, type Slider } from './figure';
import { height as sayHeight, length as sayLength, type Units } from './units';

// ---- The grid -------------------------------------------------------------------

/** Where a relief's grid lies and where its heights came from: the `<name>.json` beside its image. */
export interface ReliefMeta {
  format: 'didactics-relief';
  version: 1;
  /** The image file, beside the meta file. */
  image: string;
  /** Grid size in cells (the image's pixels). */
  width: number;
  height: number;
  /** The Web Mercator zoom the grid's pixels were taken at (256-pixel tiles). */
  zoom: number;
  /** The grid's top-left corner, in whole-world pixels at `zoom`. */
  x0: number;
  y0: number;
  /** Source pixels per grid cell (1 = the source's own resolution). */
  step: number;
  /** West, south, east, north, in degrees. */
  bounds: [number, number, number, number];
  /** Who made the heights, for the line under the map. */
  credit: string;
  licence: string;
  source: string;
  fetched: string;
  /** The command that made it, so it can be made again. */
  made?: string;
}

/** A grid of heights in metres, row by row from the north-west corner. */
export interface Relief {
  meta: ReliefMeta;
  width: number;
  height: number;
  z: Float32Array;
}

const TILE = 256;
const EARTH = 40075016.686;

/** Heights from Terrarium-encoded RGBA pixels. */
export function decodeTerrarium(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const z = new Float32Array(width * height);
  for (let i = 0; i < z.length; i++) z[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return z;
}

/** Terrarium RGB for a height in metres. */
export function encodeTerrarium(m: number): [number, number, number] {
  const v = m + 32768;
  const r = Math.floor(v / 256);
  const g = Math.floor(v - r * 256);
  const b = Math.round((v - r * 256 - g) * 256);
  return [r, g, Math.min(255, b)];
}

/** A relief made from heights in hand: for tests and for figures that invent their ground. */
export function makeRelief(meta: Omit<ReliefMeta, 'format' | 'version' | 'image' | 'credit' | 'licence' | 'source' | 'fetched'> & Partial<ReliefMeta>, z: Float32Array): Relief {
  const full: ReliefMeta = { format: 'didactics-relief', version: 1, image: '', credit: '', licence: '', source: '', fetched: '', ...meta };
  if (z.length !== full.width * full.height) throw new Error(`a ${full.width}×${full.height} relief needs ${full.width * full.height} heights, not ${z.length}`);
  return { meta: full, width: full.width, height: full.height, z };
}

/** What is wrong with a relief's meta file, or nothing. */
export function reliefProblems(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return ['not a table'];
  const m = meta as Record<string, unknown>;
  const out: string[] = [];
  if (m.format !== 'didactics-relief') out.push('"format" should be "didactics-relief"');
  for (const k of ['width', 'height', 'zoom', 'x0', 'y0', 'step'] as const) if (typeof m[k] !== 'number') out.push(`"${k}" should be a number`);
  for (const k of ['image', 'credit', 'licence', 'source', 'fetched'] as const) if (typeof m[k] !== 'string' || !m[k]) out.push(`"${k}" should be text`);
  if (!Array.isArray(m.bounds) || m.bounds.length !== 4) out.push('"bounds" should be [west, south, east, north]');
  return out;
}

/**
 * Loads `<path>.json` and the image it names, in a browser. `path` is the
 * relief's name with its folder and without an extension ("maps/zion"), as
 * the course's `asset` resolves it.
 */
export async function loadRelief(path: string, fetcher: typeof fetch = fetch): Promise<Relief> {
  const meta = (await (await fetcher(`${path}.json`)).json()) as ReliefMeta;
  const problems = reliefProblems(meta);
  if (problems.length) throw new Error(`${path}.json: ${problems.join('; ')}`);
  const src = `${path.slice(0, path.lastIndexOf('/') + 1)}${meta.image}`;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error(`could not load ${src}`));
    img.src = src;
  });
  const c = document.createElement('canvas');
  c.width = meta.width;
  c.height = meta.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no canvas to read the relief with');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, meta.width, meta.height).data;
  return { meta, width: meta.width, height: meta.height, z: decodeTerrarium(data, meta.width, meta.height) };
}

// ---- Where things are -------------------------------------------------------------

/** Whole-world Web Mercator pixels at `zoom`. */
export function mercator(lon: number, lat: number, zoom: number): [number, number] {
  const n = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/** Longitude and latitude of whole-world pixels at `zoom`. */
export function unmercator(x: number, y: number, zoom: number): [number, number] {
  const n = TILE * 2 ** zoom;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat];
}

/** A place's position on the grid, in cells (fractional; may fall outside). */
export function toCell(r: Relief, lon: number, lat: number): [number, number] {
  const [x, y] = mercator(lon, lat, r.meta.zoom);
  return [(x - r.meta.x0) / r.meta.step, (y - r.meta.y0) / r.meta.step];
}

/** Longitude and latitude of a cell's position. */
export function fromCell(r: Relief, col: number, row: number): [number, number] {
  return unmercator(r.meta.x0 + col * r.meta.step, r.meta.y0 + row * r.meta.step, r.meta.zoom);
}

/** How many metres on the ground one cell spans at its middle row, east to west and north to south alike. */
export function cellSize(r: Relief, row = r.height / 2): number {
  const [, lat] = fromCell(r, 0, row);
  return ((EARTH * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** r.meta.zoom)) * r.meta.step;
}

/** The height at a fractional cell, interpolated between the four around it. */
export function heightAt(r: Relief, col: number, row: number): number {
  const c = Math.max(0, Math.min(r.width - 1.001, col));
  const w = Math.max(0, Math.min(r.height - 1.001, row));
  const c0 = Math.floor(c);
  const r0 = Math.floor(w);
  const fc = c - c0;
  const fr = w - r0;
  const at = (i: number, j: number) => r.z[j * r.width + i];
  return at(c0, r0) * (1 - fc) * (1 - fr) + at(c0 + 1, r0) * fc * (1 - fr) + at(c0, r0 + 1) * (1 - fc) * fr + at(c0 + 1, r0 + 1) * fc * fr;
}

/** Lowest and highest heights on the grid. */
export function heightRange(r: Relief): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of r.z) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** Heights along a straight line between two places: `n` samples, each with its distance from the start in metres. */
export function profile(r: Relief, a: [number, number], b: [number, number], n = 200): { d: number; z: number }[] {
  const [ac, ar] = toCell(r, a[0], a[1]);
  const [bc, br] = toCell(r, b[0], b[1]);
  const span = Math.hypot(bc - ac, br - ar) * cellSize(r, (ar + br) / 2);
  return Array.from({ length: n }, (_, i) => {
    const f = n > 1 ? i / (n - 1) : 0;
    return { d: f * span, z: heightAt(r, ac + (bc - ac) * f, ar + (br - ar) * f) };
  });
}

// ---- Light and colour ---------------------------------------------------------------

/** Where the light comes from: `azimuth` in degrees clockwise from north, `altitude` in degrees above the horizon. */
export interface Sun {
  azimuth: number;
  altitude: number;
}

/** The sun cartographers use by default: from the north-west, 45° up. */
export const NW_SUN: Sun = { azimuth: 315, altitude: 45 };

/**
 * How brightly each cell is lit, from 0 (facing away) to 1 (facing the sun),
 * with heights stretched by `exaggeration` (1 = true slopes). A sun low on
 * the horizon picks out small steps in the ground, which is how lidar maps
 * find old shorelines and fault scarps under a forest.
 */
export function hillshade(r: Relief, sun: Sun = NW_SUN, exaggeration = 1): Float32Array {
  const out = new Float32Array(r.width * r.height);
  const az = (sun.azimuth * Math.PI) / 180;
  const alt = (sun.altitude * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(alt);
  const ly = Math.cos(az) * Math.cos(alt);
  const lz = Math.sin(alt);
  for (let j = 0; j < r.height; j++) {
    const size = cellSize(r, j);
    const up = Math.max(0, j - 1);
    const down = Math.min(r.height - 1, j + 1);
    for (let i = 0; i < r.width; i++) {
      const left = Math.max(0, i - 1);
      const right = Math.min(r.width - 1, i + 1);
      const dzEast = ((r.z[j * r.width + right] - r.z[j * r.width + left]) / ((right - left) * size)) * exaggeration;
      // Rows run south, so north is up the grid.
      const dzNorth = ((r.z[up * r.width + i] - r.z[down * r.width + i]) / ((down - up) * size)) * exaggeration;
      const len = Math.hypot(dzEast, dzNorth, 1);
      out[j * r.width + i] = Math.max(0, (-dzEast * lx - dzNorth * ly + lz) / len);
    }
  }
  return out;
}

/** An RGB colour from CSS hex (#rgb or #rrggbb). */
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: readonly number[], b: readonly number[], f: number): [number, number, number] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/** A colour ramp by height: stops of [metres, CSS hex], low to high. */
export type Ramp = readonly (readonly [number, string])[];

function rampAt(stops: { at: number; c: [number, number, number] }[], v: number): [number, number, number] {
  if (v <= stops[0].at) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i].at) return mix(stops[i - 1].c, stops[i].c, (v - stops[i - 1].at) / (stops[i].at - stops[i - 1].at || 1));
  }
  return stops[stops.length - 1].c;
}

/** How to colour a relief. */
export interface PaintOptions {
  sun?: Sun;
  exaggeration?: number;
  /** The colour of the ground before shading, or a ramp by height. Default: a pale paper colour. */
  ground?: string | Ramp;
  /** Everything at or below this height is under water (sea level is 0). */
  water?: number;
  waterColor?: string;
  /** How strongly the shading shows, 0 to 1 (default 0.75). */
  relief?: number;
  /** A colour for a cell of your own, by its index (row * width + col), or null to leave the ground colour. */
  colorAt?: (i: number, z: number) => readonly [number, number, number] | null;
  /** Shading already computed with `hillshade`, to reuse while only colours change. */
  shade?: Float32Array;
}

/** The colours of the map, as RGBA pixels the size of the grid. */
export function paintRelief(r: Relief, o: PaintOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  const shade = o.shade ?? hillshade(r, o.sun, o.exaggeration ?? 1);
  const flat = Math.sin(((o.sun ?? NW_SUN).altitude * Math.PI) / 180);
  const strength = o.relief ?? 0.75;
  const ground = o.ground ?? '#f4ecd8';
  const stops = typeof ground === 'string' ? null : ground.map(([at, c]) => ({ at, c: rgb(c) }));
  const plain = typeof ground === 'string' ? rgb(ground) : null;
  const water = rgb(o.waterColor ?? '#8fb8c9');
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < r.z.length; i++) {
    const z = r.z[i];
    let c: readonly number[];
    const wet = o.water !== undefined && z <= o.water;
    if (wet) c = water;
    else c = o.colorAt?.(i, z) ?? plain ?? rampAt(stops!, z);
    // Lit relative to flat ground, so flat ground keeps its colour.
    const light = wet ? 1 : 1 + strength * (shade[i] - flat) * 1.4;
    out[i * 4] = c[0] * light;
    out[i * 4 + 1] = c[1] * light;
    out[i * 4 + 2] = c[2] * light;
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---- Layers of rock -----------------------------------------------------------------

/** A stack of flat layers of rock, tilted as one: where they meet the ground is what a geological map shows. */
export interface Strata {
  /** Compass direction the layers slope down toward, in degrees clockwise from north. */
  dipDirection: number;
  /** How steeply they slope, in degrees from flat (0) to upright (90). */
  dip: number;
  /** A place the base of layer 0 passes through: longitude, latitude and height in metres. */
  through: [number, number, number];
  /** Each layer's thickness, measured straight across the layer, in metres; the stack repeats past the last. */
  thickness: readonly number[];
}

/**
 * Which layer of `s` is at the surface in each cell (0 for the lowest, counting
 * up; negative below it). Ground that is cut down into the stack shows older
 * layers, so a valley through tilted layers bends their outcrops into a V.
 */
export function outcrops(r: Relief, s: Strata): Int16Array {
  const out = new Int16Array(r.width * r.height);
  const dip = (Math.min(89.5, Math.max(0, s.dip)) * Math.PI) / 180;
  const dir = (s.dipDirection * Math.PI) / 180;
  const [pc, pr] = toCell(r, s.through[0], s.through[1]);
  const size = cellSize(r);
  const total = s.thickness.reduce((a, b) => a + b, 0);
  const bounds: number[] = [0];
  for (const t of s.thickness) bounds.push(bounds[bounds.length - 1] + t);
  for (let j = 0; j < r.height; j++) {
    for (let i = 0; i < r.width; i++) {
      const east = (i - pc) * size;
      const north = (pr - j) * size;
      // Horizontal distance down the dip from the reference point.
      const along = east * Math.sin(dir) + north * Math.cos(dir);
      // Height above the base plane, then straight across the layers.
      const above = (r.z[j * r.width + i] - (s.through[2] - along * Math.tan(dip))) * Math.cos(dip);
      const cycles = Math.floor(above / total);
      const rest = above - cycles * total;
      let k = 0;
      while (k < s.thickness.length - 1 && rest >= bounds[k + 1]) k++;
      out[j * r.width + i] = cycles * s.thickness.length + k;
    }
  }
  return out;
}

// ---- On the page ---------------------------------------------------------------------

/** A map on the page: the painted canvas, with an SVG on top for labels and lines, 400 units wide. */
export interface MapView {
  node: HTMLElement;
  canvas: HTMLCanvasElement;
  svg: SVGSVGElement;
  relief: Relief;
  /** The SVG's size in its own units: 400 wide, as tall as the grid's shape. */
  w: number;
  h: number;
  /** A place's position in the SVG's units. */
  xy: (lon: number, lat: number) => [number, number];
  /** A cell's position in the SVG's units. */
  cellXY: (col: number, row: number) => [number, number];
  /** Paints the grid with these options; returns false where there is no canvas (tests). */
  paint: (o?: PaintOptions) => boolean;
}

/** A relief's map, 400 units wide, ready to paint. */
export function mapView(r: Relief, o: { alt?: string } = {}): MapView {
  const canvas = el('canvas', { width: r.width, height: r.height }) as HTMLCanvasElement;
  canvas.style.cssText = 'display:block;width:100%;height:auto;';
  canvas.style.aspectRatio = `${r.width} / ${r.height}`;
  const w = 400;
  const h = Math.round((400 * r.height) / r.width);
  const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' }) as SVGSVGElement;
  s.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;';
  const node = el('div.map-view.fig-drawing', { role: 'img' }, canvas, s);
  node.style.cssText = 'position:relative;line-height:0;';
  if (o.alt) node.setAttribute('aria-label', o.alt);
  const k = w / r.width;
  const cellXY = (col: number, row: number): [number, number] => [(col + 0.5) * k, (row + 0.5) * k];
  const xy = (lon: number, lat: number) => {
    const [c, rr] = toCell(r, lon, lat);
    return cellXY(c, rr);
  };
  const ctx = (() => {
    try {
      return canvas.getContext?.('2d') ?? null;
    } catch {
      return null;
    }
  })();
  const paint = (po: PaintOptions = {}) => {
    if (!ctx || typeof ImageData === 'undefined') return false;
    ctx.putImageData(new ImageData(paintRelief(r, po), r.width, r.height), 0, 0);
    return true;
  };
  return { node, canvas, svg: s, relief: r, w, h, xy, cellXY, paint };
}

/** A place to mark on a map. */
export interface MapLabel {
  lon: number;
  lat: number;
  text: string;
  /** Which side of its dot the words go; default right. */
  side?: 'left' | 'right' | 'above' | 'below';
  /** No dot, just the words centred on the place (for a valley or a range). */
  area?: boolean;
  color?: string;
}

/** Labels with a dot and a pale halo, so they read on any ground. */
export function mapLabels(v: Pick<MapView, 'xy'>, labels: readonly MapLabel[], ink = '#2a2547', paper = '#fffaf0'): SVGElement[] {
  return labels.flatMap((l) => {
    const [x, y] = v.xy(l.lon, l.lat);
    const side = l.area ? 'centre' : (l.side ?? 'right');
    const tx = side === 'right' ? x + 6 : side === 'left' ? x - 6 : x;
    const ty = side === 'above' ? y - 7 : side === 'below' ? y + 13 : y + 3.5;
    const anchor = side === 'left' ? 'end' : side === 'right' ? undefined : 'middle';
    const words = (fill: string, halo: boolean) => {
      const t = label(tx, ty, l.text, { size: 'note', bold: true, anchor, fill });
      if (halo) {
        t.setAttribute('stroke', paper);
        t.setAttribute('stroke-width', '3');
        t.setAttribute('stroke-linejoin', 'round');
        t.setAttribute('opacity', '0.85');
      }
      return t;
    };
    const fill = l.color ?? ink;
    return [
      ...(l.area ? [] : [svg('circle', { cx: x, cy: y, r: 2.6, fill, stroke: paper, 'stroke-width': 1.2 })]),
      words(paper, true),
      words(fill, false),
    ];
  });
}

/** A line through places, such as a fault or a river. */
export interface MapLine {
  points: readonly (readonly [number, number])[];
  color?: string;
  width?: number;
  dashed?: boolean;
}

export function mapLines(v: Pick<MapView, 'xy'>, lines: readonly MapLine[], ink = '#2a2547'): SVGElement[] {
  return lines.map((l) =>
    svg('polyline', {
      points: l.points.map(([lon, lat]) => v.xy(lon, lat).join(',')).join(' '),
      fill: 'none',
      stroke: l.color ?? ink,
      'stroke-width': l.width ?? 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...(l.dashed ? { 'stroke-dasharray': '6 4' } : {}),
    }),
  );
}

/** A filled region through places, such as a zone on a geological map. */
export interface MapArea {
  points: readonly (readonly [number, number])[];
  color?: string;
  /** How solid the fill is, 0 to 1; default 0.45, so the relief shows through. */
  opacity?: number;
}

/** Filled regions, clipped to the map's edges. */
export function mapAreas(v: Pick<MapView, 'xy' | 'w' | 'h'>, areas: readonly MapArea[], ink = '#2a2547'): SVGElement[] {
  if (!areas.length) return [];
  const id = `map-clip-${++clips}`;
  const clip = svg('clipPath', { id }, svg('rect', { x: 0, y: 0, width: v.w, height: v.h }));
  const g = svg('g', { 'clip-path': `url(#${id})` },
    ...areas.map((a) => svg('polygon', {
      points: a.points.map(([lon, lat]) => v.xy(lon, lat).join(',')).join(' '),
      fill: a.color ?? ink,
      'fill-opacity': a.opacity ?? 0.45,
      stroke: a.color ?? ink,
      'stroke-opacity': 0.8,
      'stroke-width': 0.6,
      'stroke-linejoin': 'round',
    })));
  return [svg('defs', {}, clip), g];
}
let clips = 0;

/** One entry in a map's key: a swatch and what it stands for. */
export interface MapKeyItem {
  color: string;
  text: string;
}

/** A map's key: a swatch and its words for each item, to put under a map (the map chart's own, or a figure's). */
export function mapKey(items: readonly MapKeyItem[]): HTMLElement {
  return el('ul.map-key', {}, ...items.map((k) => {
    const sw = el('span.map-swatch');
    sw.style.background = k.color;
    return el('li', {}, sw, k.text);
  }));
}

/** A round length for a scale bar about a fifth of the map wide, in the reader's units. */
function niceLength(metres: number, units: Units): { m: number; say: string } {
  const unit = units === 'metric' ? (metres >= 1000 ? 1000 : 1) : metres >= 1609 ? 1609.344 : 0.3048;
  const v = metres / unit;
  const p = 10 ** Math.floor(Math.log10(v));
  const nice = [1, 2, 5, 10].map((n) => n * p).filter((n) => n <= v).pop() ?? p;
  const m = nice * unit;
  return { m, say: sayLength(m, units) };
}

/** A scale bar and a north arrow in the bottom-left corner. */
export function scaleBar(v: Pick<MapView, 'relief' | 'w' | 'h'>, units: Units, ink = '#2a2547', paper = '#fffaf0', corner: 'left' | 'right' = 'left'): SVGElement[] {
  const perUnit = (cellSize(v.relief, v.relief.height - 4) * v.relief.width) / v.w;
  const { m, say } = niceLength(perUnit * v.w * 0.22, units);
  const len = m / perUnit;
  const x = corner === 'left' ? 10 : v.w - 10 - len - 22;
  const y = v.h - 10;
  return [
    svg('rect', { x: x - 4, y: y - 26, width: len + 8 + 22, height: 32, rx: 3, fill: paper, opacity: 0.8 }),
    svg('rect', { x, y: y - 4, width: len, height: 4, fill: ink }),
    label(x, y - 9, say, { size: 'small', bold: true }),
    svg('path', { d: `M ${x + len + 14} ${y - 20} l 4 10 l -4 -3 l -4 3 z`, fill: ink }),
    label(x + len + 14, y + 1, 'N', { size: 'small', bold: true, anchor: 'middle' }),
  ];
}

// ---- The map chart ----------------------------------------------------------------------

/** A `map` block's options: a relief and what to draw on it. */
export interface MapOptions {
  /** The relief's path without extension ("maps/zion"), resolved by the course's `asset`. */
  relief: string;
  title?: string;
  note?: string;
  alt?: string;
  sun?: Sun;
  exaggeration?: number;
  /** Water up to this height in metres; sea level is 0. */
  water?: number;
  /** "plain" (default) or "height", a ramp from low to high. */
  ground?: 'plain' | 'height';
  labels?: MapLabel[];
  lines?: MapLine[];
  /** Filled regions under the lines and labels, such as zones. */
  areas?: MapArea[];
  /** Swatches under the map saying what the colours mean. */
  key?: MapKeyItem[];
  /** Which bottom corner the scale bar sits in, to keep it off a label; default left. */
  scale?: 'left' | 'right';
}

export interface MapsOptions {
  /** Colours by name, for "color" in labels and lines; `ink`, `soft`, `paper` used if present. */
  palette?: Readonly<Record<string, string>>;
  /** Where the relief files are fetched from (asset.ts `assetFrom`). */
  asset?: (path: string) => string;
  /** How reliefs are loaded; tests hand in their own. */
  load?: (path: string) => Promise<Relief>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** What is wrong with a `map` block's options. */
export function mapOptionsProblems(o: Options | undefined): string[] {
  if (!o || typeof o !== 'object') return ['needs "options" with a "relief"'];
  const out: string[] = [];
  if (!isStr(o.relief) || !o.relief || /\.(png|json)$/.test(o.relief)) out.push('"relief" should be the relief\'s path without an extension, such as "maps/zion"');
  for (const k of ['title', 'note', 'alt'] as const) if (o[k] !== undefined && !isStr(o[k])) out.push(`"${k}" should be text`);
  if (o.sun !== undefined) {
    const s = o.sun as Record<string, unknown>;
    if (!isNum(s?.azimuth) || !isNum(s?.altitude)) out.push('"sun" should be { "azimuth", "altitude" } in degrees');
  }
  if (o.water !== undefined && !isNum(o.water)) out.push('"water" should be a height in metres');
  if (o.ground !== undefined && o.ground !== 'plain' && o.ground !== 'height') out.push('"ground" should be "plain" or "height"');
  if (o.scale !== undefined && o.scale !== 'left' && o.scale !== 'right') out.push('"scale" should be "left" or "right"');
  const place = (p: unknown) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  if (o.labels !== undefined) {
    if (!Array.isArray(o.labels)) out.push('"labels" should be a list');
    else o.labels.forEach((l: Record<string, unknown>, i) => {
      if (!place([l?.lon, l?.lat])) out.push(`label ${i + 1}: "lon" and "lat" should be degrees`);
      if (!isStr(l?.text)) out.push(`label ${i + 1}: "text" should be text`);
      if (l?.side !== undefined && !['left', 'right', 'above', 'below'].includes(l.side as string)) out.push(`label ${i + 1}: "side" should be left, right, above or below`);
    });
  }
  if (o.lines !== undefined) {
    if (!Array.isArray(o.lines)) out.push('"lines" should be a list');
    else o.lines.forEach((l: Record<string, unknown>, i) => {
      if (!Array.isArray(l?.points) || l.points.length < 2 || !l.points.every(place)) out.push(`line ${i + 1}: "points" should be two or more [lon, lat]`);
    });
  }
  if (o.areas !== undefined) {
    if (!Array.isArray(o.areas)) out.push('"areas" should be a list');
    else o.areas.forEach((a: Record<string, unknown>, i) => {
      if (!Array.isArray(a?.points) || a.points.length < 3 || !a.points.every(place)) out.push(`area ${i + 1}: "points" should be three or more [lon, lat]`);
      if (a?.opacity !== undefined && (!isNum(a.opacity) || a.opacity < 0 || a.opacity > 1)) out.push(`area ${i + 1}: "opacity" should be from 0 to 1`);
    });
  }
  if (o.key !== undefined) {
    if (!Array.isArray(o.key)) out.push('"key" should be a list');
    else o.key.forEach((k: Record<string, unknown>, i) => {
      if (!isStr(k?.color) || !isStr(k?.text)) out.push(`key ${i + 1}: needs "color" and "text"`);
    });
  }
  return out;
}

/** The ramp the `height` ground uses, stretched over the relief's own heights. */
export function heightRamp(r: Relief): Ramp {
  const [lo, hi] = heightRange(r);
  const base = Math.max(lo, 0);
  const span = Math.max(1, hi - base);
  return [
    [base, '#dfe6c9'],
    [base + span * 0.35, '#efe4c4'],
    [base + span * 0.7, '#e2cfae'],
    [base + span, '#f7f2ea'],
  ];
}

function drawMap(r: Relief, o: MapOptions, units: Units, pal: Record<string, string>): HTMLElement[] {
  const ink = pal.ink ?? '#2a2547';
  const paper = pal.paper ?? '#fffaf0';
  const v = mapView(r, { alt: o.alt });
  v.paint({ sun: o.sun, exaggeration: o.exaggeration, water: o.water, ground: o.ground === 'height' ? heightRamp(r) : undefined });
  const color = (c?: string) => (c ? (pal[c] ?? c) : undefined);
  v.svg.append(
    ...mapAreas(v, (o.areas ?? []).map((a) => ({ ...a, color: color(a.color) })), ink),
    ...mapLines(v, (o.lines ?? []).map((l) => ({ ...l, color: color(l.color) ?? ink })), ink),
    ...mapLabels(v, (o.labels ?? []).map((l) => ({ ...l, color: color(l.color) })), ink, paper),
    ...scaleBar(v, units, ink, paper, o.scale),
  );
  const parts: HTMLElement[] = [];
  if (o.title) parts.push(el('p.map-title', {}, o.title));
  parts.push(v.node);
  if (o.key?.length) {
    parts.push(mapKey(o.key.map((k) => ({ ...k, color: color(k.color) ?? k.color }))));
  }
  parts.push(el('p.map-credit', {}, `Heights: ${r.meta.credit}`));
  if (o.note) parts.push(el('p.map-note', {}, o.note));
  return parts;
}

/**
 * The `map` chart: a still map from a block's options alone. Spread it with
 * the charts, `{ ...charts(...), ...maps({ palette, asset }), ...FIGURES }`.
 *
 *   { "type": "diagram", "id": "map", "caption": "…",
 *     "options": { "relief": "maps/auvergne", "sun": { "azimuth": 300, "altitude": 30 },
 *       "labels": [{ "lon": 2.964, "lat": 45.772, "text": "Puy de Dôme" }] } }
 */
export function maps(o: MapsOptions = {}): { map: FigureFactory; 'map-live': FigureFactory } {
  const pal = { ...(o.palette ?? {}) } as Record<string, string>;
  const asset = o.asset ?? ((p: string) => p);
  const load = o.load ?? ((p: string) => loadRelief(asset(p)));
  const make = (ctx: Parameters<FigureFactory>[0], _goal?: string, raw?: Options): FigureHandle => {
    const problems = mapOptionsProblems(raw);
    if (problems.length) return { node: el('div.fig-body.fig-still', {}, el('p.fig-readout', {}, problems.join('; '))) };
    const opts = raw as unknown as MapOptions;
    const node = el('div.fig-body.fig-still.map-chart', {}, el('p.map-note', {}, 'Loading the map…'));
    const ready = reliefFor(load, opts.relief)
      .then((r) => node.replaceChildren(...drawMap(r, opts, ctx.save.units, pal)))
      .catch(() => node.replaceChildren(el('p.map-note', {}, 'The map could not be loaded here.')));
    return { node, ready };
  };
  return { map: Object.assign(make, { options: mapOptionsProblems, each: true as const }), 'map-live': mapLive(pal, load) };
}

const cache = new Map<string, Promise<Relief>>();

/** One load per relief per page, shared by every figure that shows it. */
export function reliefFor(load: (path: string) => Promise<Relief>, path: string): Promise<Relief> {
  let p = cache.get(path);
  if (!p) {
    p = load(path);
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p;
}

// ---- The live map ---------------------------------------------------------------------

/** A place on a live map to tap: its name and words in the text box. */
export interface MapSpot {
  lon: number;
  lat: number;
  name: string;
  text?: string;
}

/** One step of a live map's stages: what is drawn over the base at that step. */
export interface MapStage {
  label: string;
  text?: string;
  lines?: MapLine[];
  areas?: MapArea[];
  labels?: MapLabel[];
}

/** A `map-live` block's options: a map's, and what the reader can change on it. */
export interface LiveMapOptions extends MapOptions {
  /** Places to tap. */
  spots?: MapSpot[];
  /** A slider for the water level, in metres: the sea rising over the land, or a lake filling. */
  flood?: { from: number; to: number; start?: number; label?: string; text?: string };
  /** Steps to move through with a slider and Play, each drawn over the base map. */
  stages?: MapStage[];
  /** Lines the text box holds; default 3. */
  textLines?: number;
  /** Seconds a Play takes; default 2 a stage. */
  seconds?: number;
}

/** What is wrong with a `map-live` block's options. */
export function liveMapOptionsProblems(o: Options | undefined): string[] {
  const out = mapOptionsProblems(o);
  if (!o || typeof o !== 'object') return out;
  const place = (lon: unknown, lat: unknown) => isNum(lon) && isNum(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
  if (o.spots !== undefined) {
    if (!Array.isArray(o.spots) || !o.spots.length) out.push('"spots" should be a list of { "lon", "lat", "name" }');
    else o.spots.forEach((p: Record<string, unknown>, i) => {
      if (!place(p?.lon, p?.lat)) out.push(`spot ${i + 1}: "lon" and "lat" should be degrees`);
      if (!isStr(p?.name)) out.push(`spot ${i + 1}: "name" should be text`);
      if (p?.text !== undefined && !isStr(p.text)) out.push(`spot ${i + 1}: "text" should be text`);
    });
  }
  if (o.flood !== undefined) {
    const f = o.flood as Record<string, unknown>;
    if (!isNum(f?.from) || !isNum(f?.to) || f.to <= f.from) out.push('"flood" should be { "from", "to" } in metres, "to" above "from"');
    else if (f.start !== undefined && !(isNum(f.start) && f.start >= f.from && f.start <= f.to)) out.push('"flood": "start" should be between "from" and "to"');
    for (const k of ['label', 'text'] as const) if (f?.[k] !== undefined && !isStr(f[k])) out.push(`"flood": "${k}" should be text`);
  }
  if (o.stages !== undefined) {
    if (!Array.isArray(o.stages) || o.stages.length < 2) out.push('"stages" should be two or more { "label" }');
    else o.stages.forEach((st: Record<string, unknown>, i) => {
      if (!isStr(st?.label)) out.push(`stage ${i + 1}: "label" should be text`);
      for (const k of ['lines', 'areas', 'labels'] as const) if (st?.[k] !== undefined && !Array.isArray(st[k])) out.push(`stage ${i + 1}: "${k}" should be a list`);
      // The stage's own drawing is checked as a map's would be.
      for (const p of mapOptionsProblems({ relief: 'x', lines: st?.lines, areas: st?.areas, labels: st?.labels })) out.push(`stage ${i + 1}: ${p}`);
    });
  }
  if (o.flood !== undefined && o.stages !== undefined) out.push('use "flood" or "stages", not both: one slider a map');
  if (o.spots === undefined && o.flood === undefined && o.stages === undefined) out.push('a live map needs "spots", "flood" or "stages"; a map with none of them is the still "map"');
  if (o.textLines !== undefined && !(isNum(o.textLines) && o.textLines >= 1 && o.textLines <= 8)) out.push('"textLines" should be 1 to 8');
  if (o.seconds !== undefined && !(isNum(o.seconds) && o.seconds > 0)) out.push('"seconds" should be a number above 0');
  return out;
}

/**
 * The `map-live` figure: a map from a block's options, with places to tap
 * ("spots"), a water level to raise ("flood") or steps to play through
 * ("stages"). Goals: "explore", every spot tapped; "end", the slider at its far
 * end (the highest water, the last stage).
 */
function mapLive(pal: Record<string, string>, load: (path: string) => Promise<Relief>): FigureFactory {
  const ink = pal.ink ?? '#2a2547';
  const paper = pal.paper ?? '#fffaf0';
  const color = (c?: string) => (c ? (pal[c] ?? c) : undefined);
  const f = figure<Options>(['explore', 'end'], (ctx, t, raw) => {
    const problems = liveMapOptionsProblems(raw);
    if (problems.length) {
      t.done();
      return el('div.fig-body.fig-still', {}, el('p.fig-readout', {}, problems.join('; ')));
    }
    const o = raw as unknown as LiveMapOptions;
    const holder = el('div.map-chart', {}, el('p.map-note', {}, 'Loading the map…'));
    const fr = frame({ drawing: holder, lines: o.textLines ?? 3 });
    if (o.title) fr.node.prepend(el('p.map-title', {}, o.title));
    const readout = fr.readout;
    const tell = (lead: string, rest?: string) => readout.replaceChildren(el('strong', {}, lead), rest ? ` ${rest}` : '');
    const units = ctx.save.units;
    t.waitFor(reliefFor(load, o.relief).then((r) => {
      const v = mapView(r, { alt: o.alt });
      const shade = hillshade(r, o.sun, o.exaggeration ?? 1);
      const ground = o.ground === 'height' ? heightRamp(r) : undefined;
      let pending: number | undefined;
      let painted = false;
      const paint = (water: number | undefined) => {
        // One repaint a frame while a slider moves.
        const first = !painted;
        painted = true;
        if (first || typeof requestAnimationFrame === 'undefined') return void v.paint({ sun: o.sun, shade, ground, water });
        if (pending !== undefined) cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => {
          pending = undefined;
          v.paint({ sun: o.sun, shade, ground, water });
        });
      };
      paint(o.flood ? (o.flood.start ?? o.flood.from) : o.water);
      const stageG = svg('g');
      const spotG = svg('g');
      v.svg.append(
        ...mapAreas(v, (o.areas ?? []).map((a) => ({ ...a, color: color(a.color) })), ink),
        ...mapLines(v, (o.lines ?? []).map((l) => ({ ...l, color: color(l.color) ?? ink })), ink),
        stageG,
        ...mapLabels(v, (o.labels ?? []).map((l) => ({ ...l, color: color(l.color) })), ink, paper),
        spotG,
        ...scaleBar(v, units, ink, paper, o.scale),
      );
      const parts: HTMLElement[] = [v.node];
      if (o.key?.length) parts.push(mapKey(o.key.map((k) => ({ ...k, color: color(k.color) ?? k.color }))));
      parts.push(el('p.map-credit', {}, `Heights: ${r.meta.credit}`));
      if (o.note) parts.push(el('p.map-note', {}, o.note));
      holder.replaceChildren(...parts);

      // Spots.
      const spots = o.spots ?? [];
      const kept = (t.kept && typeof t.kept === 'object' ? t.kept : {}) as { seen?: number[] };
      const seen = new Set<number>(t.restored && !kept.seen ? spots.map((_, i) => i) : (kept.seen ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < spots.length));
      if (spots.length) v.svg.removeAttribute('aria-hidden');
      const rings = spots.map((p, i) => {
        const [x, y] = v.xy(p.lon, p.lat);
        const ring = svg('circle', { cx: x, cy: y, r: 6.5, fill: paper, stroke: ink, 'stroke-width': 2 });
        const g = svg('g', { tabindex: 0, role: 'button', 'aria-label': p.name, class: 'fig-tap' }, svg('circle', { cx: x, cy: y, r: 16, fill: 'transparent' }), ring);
        const tap = () => {
          seen.add(i);
          t.keep({ seen: [...seen] });
          ring.setAttribute('fill', ink);
          const left = spots.length - seen.size;
          tell(`${p.name}.`, `${p.text ?? ''}${t.goal === 'explore' && left ? ` (${left} more to tap.)` : ''}`.trim());
          if (t.goal === 'explore' && !left) t.done();
        };
        g.addEventListener('click', tap);
        g.addEventListener('keydown', (e) => {
          const key = (e as KeyboardEvent).key;
          if (key === 'Enter' || key === ' ') {
            e.preventDefault();
            tap();
          }
        });
        if (seen.has(i)) ring.setAttribute('fill', ink);
        return g;
      });
      spotG.append(...rings);

      // The slider: water or stages.
      let s: Slider | undefined;
      if (o.flood) {
        const fl = o.flood;
        const step = (fl.to - fl.from) / 200;
        s = slider(fl.label ?? 'Water level', { min: fl.from, max: fl.to, step, value: fl.start ?? fl.from, show: (h) => sayHeight(h, units), onInput: (h) => {
          paint(h);
          tell(`${fl.label ?? 'Water level'}: ${sayHeight(h, units)}.`, fl.text);
          if (t.goal === 'end' && h >= fl.to - step / 2) t.done();
        } });
        fr.controls.append(s.node);
      } else if (o.stages) {
        const stages = o.stages;
        const drawStage = (i: number) => {
          const st = stages[i];
          stageG.replaceChildren(
            ...mapAreas(v, (st.areas ?? []).map((a) => ({ ...a, color: color(a.color) })), ink),
            ...mapLines(v, (st.lines ?? []).map((l) => ({ ...l, color: color(l.color) ?? ink })), ink),
            ...mapLabels(v, (st.labels ?? []).map((l) => ({ ...l, color: color(l.color) })), ink, paper),
          );
          tell(`${st.label}.`, st.text);
          if (t.goal === 'end' && i === stages.length - 1) t.done();
        };
        s = slider('Step', { steps: stages.map((_, i) => i), value: 0, show: (i) => stages[i].label, onInput: drawStage });
        const play = player(s, ctx, { seconds: o.seconds ?? 2 * stages.length });
        fr.controls.append(el('div.fig-row', {}, s.node, play.node));
        drawStage(0);
      }
      if (!o.stages) {
        if (spots.length) readout.textContent = t.goal === 'explore' ? `Tap each ringed place (${spots.length - seen.size} to go).` : 'Tap a ringed place to see what it is.';
        else if (o.flood) tell(`${o.flood.label ?? 'Water level'}: ${sayHeight(s!.value(), units)}.`, o.flood.text);
      }
      if (t.restored && t.goal === 'end' && s) s.set(o.flood ? o.flood.to : (o.stages!.length - 1));
    }).catch(() => {
      holder.replaceChildren(el('p.map-note', {}, 'The map could not be loaded here.'));
      t.done();
    }));
    return fr.node;
  }, { options: liveMapOptionsProblems });
  return Object.assign(f, { each: true as const });
}
