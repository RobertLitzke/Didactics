// The Earth cut along a line: a cross-section through the plates, built from
// what is known at the surface, drawn to true scale down and across.
//
// Nothing here is simulated. The section is put together the way a geologist
// would sketch it from a map:
//
// - The ground and the sea floor come from a relief (didactics/maps), sampled
//   along the great circle between the line's two ends.
// - Where the ground stands above about 1,500 m below sea level the crust is
//   continental, about 35 km thick under low ground and thicker under high
//   ground, as a floating block's root is (Airy isostasy: about 6 km of root
//   for each km of height). Deeper floor is ocean crust, 7 km thick.
// - Ocean floor sinks as it ages and cools, so its depth tells its age
//   (Stein and Stein 1992, GDH1), and its age tells how thick the cold, stiff
//   plate under it has grown (about 2.3·√(κt), capped at 100 km). Under the
//   continents the plate is taken as 120 km.
// - Where the line crosses a trench, the plate on the lower side goes down
//   under the higher side as a slab, at the dip the course gives for that
//   trench, made shallower on the drawing when the line crosses the trench at
//   a slant (the dip seen in a slanting cut). Where its top is 100 km down,
//   water driven out of it melts the rock above, and volcanoes stand over
//   that point.
// - Shallow floor more than 300 km from any ridge the line crosses (a
//   marginal sea, a plateau) is not taken as young: its plate is drawn at
//   least 40 km thick.
// - Ridges, rifts, transforms and collisions are marked where the line
//   crosses them.
//
// The same picture can be drawn at plate scale (the top few hundred km, the
// ground's heights stretched so they show) or down to the centre, as a slice
// of the whole Earth, where the plates turn out to be a skin.

import { svg } from './dom';
import { angle, arc, cross, dot, EARTH_KM, lonLat, unit, xyz, type LL, type V3 } from './globe';
import { heightAt, toCell, type Relief } from './maps';

// ---- The model ------------------------------------------------------------------

export type BoundaryKind = 'trench' | 'ridge' | 'rift' | 'transform' | 'collision';

/** A plate boundary the line crosses. */
export interface Crossing {
  kind: BoundaryKind;
  /** Distance along the line, km. */
  at: number;
  /** For a trench: which way the slab goes down, +1 toward the line's far end, −1 back toward its start. */
  under?: 1 | -1;
  /** For a trench: its dip there (degrees), and the dip the cut shows. */
  dip?: number;
  seenDip?: number;
  /** For a trench: how far behind it the slab's top is 100 km down (the volcanoes), km; absent past the line's end. */
  arcAt?: number;
  /** The angle between the line and the boundary where they cross, degrees (90 = square across). */
  across: number;
}

/** A slab going down from a trench, in km: `top` lists [distance along the line, depth below sea level]. */
export interface Slab {
  trench: number;
  under: 1 | -1;
  /** Thickness of the plate going down (its crust and stiff mantle), km. */
  thick: number;
  top: [number, number][];
}

export interface Section {
  from: V3;
  to: V3;
  /** Its length, km. */
  length: number;
  /** Distance along the line of each sample, km. */
  at: number[];
  /** Height of the ground or sea floor, m (negative under the sea). */
  height: number[];
  /** Continental or ocean crust at each sample. */
  land: boolean[];
  /** Crust thickness, km. */
  crust: number[];
  /** Thickness of the whole plate (crust and stiff mantle under it), km. */
  plate: number[];
  /** Age of the ocean floor where there is one, million years; NaN under continents. */
  age: number[];
  crossings: Crossing[];
  slabs: Slab[];
}

/** Plate boundaries as lines of places, by kind (the course's plates.json). */
export type Boundaries = Partial<Record<BoundaryKind, LL[][]>>;

export interface SectionOptions {
  relief: Relief;
  boundaries: Boundaries;
  /** A trench's dip near a place, degrees; default 35° everywhere. */
  dipAt?: (lon: number, lat: number) => number;
  /** Samples along the line. Default 300. */
  samples?: number;
}

const KAPPA = 1e-6;
const MYR = 3.156e13;
/** Thickness of the cold, stiff plate under ocean floor of `age` million years, km. */
export const oceanPlate = (age: number) => Math.min(100, 2.32 * Math.sqrt(KAPPA * Math.max(0, age) * MYR) / 1000);
/** The age of ocean floor at `depth` metres, million years (GDH1 turned round). */
export function ageFromDepth(depth: number): number {
  if (depth <= 2600) return 0;
  if (depth <= 2600 + 365 * Math.sqrt(20)) return ((depth - 2600) / 365) ** 2;
  return Math.min(180, -Math.log(Math.max(1e-3, (5651 - depth) / 2473)) / 0.0278);
}
/** Below this height (m) the crust is taken as ocean crust. */
export const SHELF_EDGE = -1500;
export const OCEAN_CRUST = 7;
export const LAND_CRUST = 35;
export const LAND_PLATE = 120;
/** The thinnest plate drawn under ocean floor more than 300 km from any ridge the line crosses, km. */
export const FAR_FROM_RIDGE = 40;
/** Depth (km) at which a slab's water melts the rock above it. */
export const MELT_DEPTH = 100;
/** Where the slab stops being drawn, km down. */
export const SLAB_END = 660;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Height of the relief at a place, m; off the relief, deep sea. */
function sample(r: Relief, p: V3): number {
  const [lon, lat] = lonLat(p);
  const [w, s, e, n] = r.meta.bounds;
  if (lat < s || lat > n) return lat > n ? 0 : -3000;
  const lo = lon < w ? lon + 360 : lon > e + 0.5 ? lon - 360 : lon;
  const [c, row] = toCell(r, lo, lat);
  return heightAt(r, c, row);
}

/** Where the great-circle segment p–q crosses the one a–b, as a unit vector, or null. */
function meet(a: V3, b: V3, p: V3, q: V3): V3 | null {
  const n1 = cross(a, b);
  const n2 = cross(p, q);
  const d = cross(n1, n2);
  if (Math.hypot(...d) < 1e-12) return null;
  const x = unit(d);
  const on = (u: V3, v: V3, w: V3) => Math.abs(angle(u, w) + angle(w, v) - angle(u, v)) < 1e-6;
  for (const c of [x, [-x[0], -x[1], -x[2]] as V3]) if (on(a, b, c) && on(p, q, c)) return c;
  return null;
}

/** The section from `from` to `to`. */
export function section(from: V3, to: V3, o: SectionOptions): Section {
  const n = o.samples ?? 300;
  const length = angle(from, to) * EARTH_KM;
  const pts = arc(from, to, n - 1);
  const at = pts.map((_, i) => (length * i) / (n - 1));
  const raw = pts.map((p) => sample(o.relief, p));
  // A light smoothing: the relief's cells are tens of km across.
  const height = raw.map((_, i) => (raw[Math.max(0, i - 1)] + 2 * raw[i] + raw[Math.min(n - 1, i + 1)]) / 4);
  const land = height.map((z) => z > SHELF_EDGE);
  // Age from depth, taken as a median over about 300 km so a seamount or a trench does not make the floor young or old.
  const span = Math.max(1, Math.round((150 / Math.max(1, length)) * (n - 1)));
  const age = height.map((_, i) => {
    if (land[i]) return NaN;
    const near: number[] = [];
    for (let j = Math.max(0, i - span); j <= Math.min(n - 1, i + span); j++) if (!land[j]) near.push(-height[j]);
    return ageFromDepth(Math.min(median(near), 5600));
  });
  const crust = height.map((z, i) => {
    if (!land[i]) return OCEAN_CRUST;
    if (z >= 0) return LAND_CRUST + 6 * (z / 1000);
    // Thinning across the continental slope, from 35 km at the shore to about 20 km at the shelf's edge.
    return LAND_CRUST - 15 * (z / SHELF_EDGE);
  });
  const plate = height.map((_, i) => (land[i] ? Math.max(LAND_PLATE, crust[i] + 60) : Math.max(OCEAN_CRUST + 3, oceanPlate(age[i]))));

  // Where the line crosses each boundary.
  const crossings: Crossing[] = [];
  for (const [kind, lines] of Object.entries(o.boundaries) as [BoundaryKind, LL[][]][]) {
    for (const line of lines ?? []) {
      for (let i = 1; i < line.length; i++) {
        const p = xyz(...line[i - 1]);
        const q = xyz(...line[i]);
        const x = meet(from, to, p, q);
        if (!x) continue;
        const d = angle(from, x) * EARTH_KM;
        // The angle between the two lines where they meet.
        const tLine = unit(cross(cross(from, to), x));
        const tBound = unit(cross(cross(p, q), x));
        const across = (Math.acos(Math.min(1, Math.abs(dot(tLine, tBound)))) * 180) / Math.PI;
        if (crossings.some((c) => c.kind === kind && Math.abs(c.at - d) < 60)) continue;
        crossings.push({ kind, at: d, across });
      }
    }
  }
  crossings.sort((a, b) => a.at - b.at);
  // Shallow floor far from any ridge is a plateau or a marginal sea, not new floor: its plate is not thin.
  const ridges = crossings.filter((c) => c.kind === 'ridge' || c.kind === 'rift').map((c) => c.at);
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const far = ridges.every((r) => Math.abs(r - at[i]) > 300);
    if (far) plate[i] = Math.max(plate[i], FAR_FROM_RIDGE);
  }
  // The base of a plate is a gradual thing, not a step where the crust changes: smooth it over about 150 km.
  {
    const w = Math.max(1, Math.round((75 / Math.max(1, length)) * (n - 1)));
    const raw = plate.slice();
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let k = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { sum += raw[j]; k++; }
      plate[i] = Math.max(crust[i] + 3, sum / k);
    }
  }

  // Each trench: the slab goes down under the higher side.
  const slabs: Slab[] = [];
  const iAt = (d: number) => Math.max(0, Math.min(n - 1, Math.round((d / Math.max(1, length)) * (n - 1))));
  const mean = (d0: number, d1: number) => {
    const xs: number[] = [];
    for (let d = d0; d <= d1; d += 10) {
      if (d < 0 || d > length) continue;
      xs.push(height[iAt(d)]);
    }
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
  };
  for (const c of crossings) {
    if (c.kind !== 'trench') continue;
    const before = mean(c.at - 300, c.at - 60);
    const after = mean(c.at + 60, c.at + 300);
    const ahead: 1 | -1 = Number.isNaN(after) ? -1 : Number.isNaN(before) ? 1 : after > before ? 1 : -1;
    c.under = ahead;
    const [lon, lat] = lonLat(arc(from, to, 1000)[Math.round((c.at / Math.max(1, length)) * 1000)]);
    const dip = o.dipAt?.(lon, lat) ?? 35;
    c.dip = dip;
    // A cut that runs at a slant across the trench shows the slab at less than its true dip.
    const seen = (Math.atan(Math.tan((dip * Math.PI) / 180) * Math.sin((c.across * Math.PI) / 180)) * 180) / Math.PI;
    c.seenDip = seen;
    // The plate going down: the ocean plate just in front of the trench.
    const front = iAt(c.at - ahead * 150);
    const thick = land[front] ? 90 : Math.max(40, plate[front]);
    const trenchDepth = Math.max(0, -height[iAt(c.at)] / 1000);
    const top: [number, number][] = [];
    let z = trenchDepth;
    let behind = 0;
    for (; z < SLAB_END && behind < 1600; behind += 5) {
      top.push([c.at + ahead * behind, z]);
      const d = (Math.min(1, behind / 120) * seen * Math.PI) / 180;
      z += Math.tan(d) * 5;
      if (c.arcAt === undefined && z >= MELT_DEPTH) {
        const where = c.at + ahead * behind;
        if (where >= 0 && where <= length) c.arcAt = behind;
      }
    }
    slabs.push({ trench: c.at, under: ahead, thick, top });
  }
  return { from, to, length, at, height, land, crust, plate, age, crossings, slabs };
}

// ---- Drawing --------------------------------------------------------------------

export interface CutawayColours {
  paper: string;
  ink: string;
  soft: string;
  sea: string;
  /** The hot, solid, creeping mantle under the plates. */
  mantle: string;
  /** The deep mantle, below 660 km (whole-Earth view). */
  deepMantle?: string;
  /** Stiff mantle that is part of a plate. */
  lid: string;
  oceanCrust: string;
  landCrust: string;
  outerCore: string;
  innerCore: string;
  heat: string;
  ridge?: string;
}

export interface CutawayOptions {
  width: number;
  height: number;
  colours: CutawayColours;
  /** 'plate': the top of the Earth, true scale across and down. 'whole': a slice down to the centre. */
  scale?: 'plate' | 'whole';
  /** How many times the ground's heights and the sea's depths are stretched; default chosen from the line's length. */
  stretch?: number;
}

/** The stretch the drawing uses for heights and sea depths at plate scale, from the line's length: a round number. */
export function stretchFor(lengthKm: number): number {
  // Enough that the sea and the mountains show as more than a hairline, not so much that the sea outweighs the plate under it.
  const s = lengthKm / 450;
  return [2, 3, 4, 5, 6].reduce((b, v) => (Math.abs(v - s) < Math.abs(b - s) ? v : b), 2);
}

type XY = [number, number];
const pts = (list: XY[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * The section as SVG elements in a box `width` by `height`, the line's start
 * on the left. At plate scale one km is the same length across and down; the
 * ground's heights and the sea's depths alone are stretched, by `stretch`,
 * which the drawing says in its corner. Returns the elements and the stretch.
 */
export function drawSection(s: Section, o: CutawayOptions): { parts: SVGElement[]; stretch: number; depth: number } {
  const C = o.colours;
  const W = o.width;
  const H = o.height;
  const whole = o.scale === 'whole';
  const L = Math.max(1, s.length);
  const stretch = o.stretch ?? (whole ? 10 : stretchFor(L));
  /** How far a slab is drawn lower than its true depth, so it leaves the trench's stretched floor: none in the whole-Earth slice. */
  const lift = (trench: number) => (whole ? 0 : trench * (stretch - 1));
  const parts: SVGElement[] = [];

  // Where (distance along, km; depth below sea level, km) lands on the drawing.
  let toXY: (d: number, z: number) => XY;
  let seaY = 0;
  let depthShown: number;
  if (!whole) {
    const k = W / L;
    seaY = 30;
    depthShown = (H - seaY) / k;
    toXY = (d, z) => [d * k, seaY + z * k];
  } else {
    // The whole face of the cut: the Earth sliced through its centre along the line's great circle, the line itself at the top.
    const span = L / EARTH_KM;
    const R = Math.min(H - 26, W - 20) / 2;
    const cx = W / 2;
    const cy = 14 + R;
    depthShown = EARTH_KM;
    toXY = (d, z) => {
      const t = d / EARTH_KM - span / 2;
      const r = (R * (EARTH_KM - z)) / EARTH_KM;
      return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
    };
  }
  /** The surface drawn, km below sea level (negative above), stretched. */
  const surf = (i: number) => (-s.height[i] / 1000) * stretch;
  const n = s.at.length;
  const along = (f: (i: number) => number) => s.at.map((d, i): XY => toXY(d, f(i)));
  const back = (list: XY[]) => list.slice().reverse();

  // The mantle: everything below the surface.
  if (!whole) {
    parts.push(svg('rect', { width: W, height: H, fill: C.paper }));
    parts.push(svg('polygon', { points: pts([...along((i) => Math.max(0, surf(i))), [W, H], [0, H]]), fill: C.mantle }));
  } else {
    parts.push(svg('rect', { width: W, height: H, fill: C.paper }));
    const [ox, oy] = toXY(0, EARTH_KM);
    const shell = (z0: number, fill: string) => {
      const [x, y] = toXY(0, z0);
      parts.push(svg('circle', { cx: ox, cy: oy, r: Math.hypot(x - ox, y - oy), fill }));
    };
    shell(0, C.mantle);
    shell(660, C.deepMantle ?? C.mantle);
    shell(2890, C.outerCore);
    shell(5150, C.innerCore);
    // The part under the line, outlined from the centre.
    const [ax, ay] = toXY(0, 0);
    const [bx, by] = toXY(L, 0);
    parts.push(svg('path', { d: `M${ax},${ay} L${ox},${oy} L${bx},${by}`, stroke: C.ink, 'stroke-width': 0.8, 'stroke-dasharray': '3 2', fill: 'none' }));
  }

  // The plate going down at each trench limits the plate above it.
  const slabTop = (d: number): number => {
    let best = Infinity;
    for (const sl of s.slabs) {
      const behind = (d - sl.trench) * sl.under;
      if (behind <= 0) continue;
      for (let i = 1; i < sl.top.length; i++) {
        const [d0, z0] = sl.top[i - 1];
        const [d1, z1] = sl.top[i];
        if ((d - d0) * (d - d1) <= 0) {
          const f = (d - d0) / (d1 - d0 || 1);
          best = Math.min(best, z0 + (z1 - z0) * f + lift(sl.top[0][1]));
          break;
        }
      }
    }
    return best;
  };
  /** Which plate each sample is on: cut at each trench so the layers do not run across it. */
  const segments: [number, number][] = [];
  {
    let start = 0;
    const cuts = s.slabs.map((sl) => sl.trench).sort((a, b) => a - b);
    for (const c of cuts) {
      const i = s.at.findIndex((d) => d >= c);
      if (i > start) segments.push([start, i]);
      start = Math.max(start, i);
    }
    segments.push([start, n - 1]);
  }
  const limit = (i: number, z: number) => Math.min(z, slabTop(s.at[i]));
  for (const [i0, i1] of segments) {
    const idx = Array.from({ length: i1 - i0 + 1 }, (_, k) => i0 + k);
    const top = idx.map((i) => toXY(s.at[i], surf(i)));
    const crustBase = idx.map((i) => toXY(s.at[i], limit(i, surf(i) + s.crust[i])));
    const plateBase = idx.map((i) => toXY(s.at[i], limit(i, Math.max(0, surf(i)) + s.plate[i])));
    parts.push(svg('polygon', { points: pts([...top, ...back(plateBase)]), fill: C.lid }));
    // Crust by kind: runs of land and of ocean.
    let k = 0;
    while (k < idx.length) {
      const isLand = s.land[idx[k]];
      let e = k;
      while (e + 1 < idx.length && s.land[idx[e + 1]] === isLand) e++;
      const run = top.slice(k, e + 2);
      const base = crustBase.slice(k, e + 2);
      parts.push(svg('polygon', { points: pts([...run, ...back(base)]), fill: isLand ? C.landCrust : C.oceanCrust }));
      k = e + 1;
    }
  }

  // The slabs: the plate's crust and stiff mantle, going down. Worked in km
  // (distance along, depth as drawn), then placed, so the slab keeps its
  // thickness in the whole-Earth slice too.
  for (const sl of s.slabs) {
    // The first point sits on the stretched trench floor; the rest go down at true scale from there.
    const up = lift(sl.top[0][1]);
    // Only the part under the line: in the whole-Earth slice anything past its ends would hang outside the wedge.
    const top = sl.top.filter(([d]) => d >= 0 && d <= L).map(([d, z]): XY => [d, z + up]);
    if (top.length < 2) continue;
    /** The line `list` moved `km` down and away, square to itself. */
    const below = (list: XY[], km: number): XY[] => list.map(([d, z], i) => {
      const [ad, az] = list[Math.max(0, i - 1)];
      const [bd, bz] = list[Math.min(list.length - 1, i + 1)];
      const len = Math.hypot(bd - ad, bz - az) || 1;
      let nd = -(bz - az) / len;
      let nz = (bd - ad) / len;
      if (nz < 0) { nd = -nd; nz = -nz; }
      return [d + nd * km, z + nz * km];
    });
    const place = (list: XY[]) => list.map(([d, z]) => toXY(d, z));
    parts.push(svg('polygon', { points: pts([...place(top), ...back(place(below(top, sl.thick)))]), fill: C.lid }));
    parts.push(svg('polygon', { points: pts([...place(top), ...back(place(below(top, OCEAN_CRUST)))]), fill: C.oceanCrust }));
  }

  // The sea, between sea level and the sea floor.
  {
    let k = 0;
    while (k < n) {
      if (s.height[k] >= 0) { k++; continue; }
      let e = k;
      while (e + 1 < n && s.height[e + 1] < 0) e++;
      const floor = s.at.slice(k, e + 1).map((d, j): XY => toXY(d, surf(k + j)));
      const level = back(s.at.slice(k, e + 1).map((d): XY => toXY(d, 0)));
      parts.push(svg('polygon', { points: pts([...floor, ...level]), fill: C.sea }));
      k = e + 1;
    }
  }

  // What happens at each crossing.
  for (const c of s.crossings) {
    const i = Math.max(0, Math.min(n - 1, Math.round((c.at / L) * (n - 1))));
    const [x, ySurf] = toXY(c.at, surf(i));
    if (c.kind === 'ridge' || c.kind === 'rift') {
      // Hot mantle rising under the ridge, to the base of the crust.
      const [, yDeep] = toXY(c.at, whole ? 300 : Math.min(depthShown * 0.6, 80));
      parts.push(svg('path', { d: `M${x},${yDeep} V${ySurf + 3}`, stroke: C.heat, 'stroke-width': 2.5, 'stroke-dasharray': '4 3', fill: 'none', opacity: 0.85 }));
      if (!whole) {
        parts.push(svg('path', { d: `M${x - 6},${seaY - 10} h-14 m0,0 l4,-3 m-4,3 l4,3 M${x + 6},${seaY - 10} h14 m0,0 l-4,-3 m4,3 l-4,3`, stroke: C.ink, 'stroke-width': 1, fill: 'none' }));
      }
    } else if (c.kind === 'transform') {
      const [, yb] = toXY(c.at, Math.max(0, surf(i)) + s.plate[i]);
      parts.push(svg('path', { d: `M${x},${ySurf} V${yb}`, stroke: C.ink, 'stroke-width': 1, 'stroke-dasharray': '2 2', fill: 'none' }));
    } else if (c.kind === 'collision') {
      parts.push(svg('path', { d: `M${x},${ySurf} l-5,-8 h10 z`, fill: C.ink, opacity: 0.6 }));
    } else if (c.kind === 'trench' && c.arcAt !== undefined && c.under) {
      // Melt rising from where the slab is 100 km down, and the volcano over it.
      const d = c.at + c.under * c.arcAt;
      const j = Math.max(0, Math.min(n - 1, Math.round((d / L) * (n - 1))));
      const [vx, vy] = toXY(d, Math.min(0, surf(j)));
      const trench = -s.height[Math.max(0, Math.min(n - 1, Math.round((c.at / L) * (n - 1))))] / 1000;
      const [, my] = toXY(d, MELT_DEPTH + lift(Math.max(0, trench)));
      parts.push(svg('path', { d: `M${vx},${my} C${vx - 5},${(my + vy) / 2 + 10} ${vx + 5},${(my + vy) / 2 - 10} ${vx},${vy}`, stroke: C.heat, 'stroke-width': 2.2, 'stroke-dasharray': '4 3', fill: 'none' }));
      parts.push(svg('polygon', { points: `${vx - 7},${vy + 1} ${vx},${vy - 9} ${vx + 7},${vy + 1}`, fill: C.heat }));
    }
  }

  if (!whole) {
    // Depth marks down the left edge.
    for (const z of [100, 200, 410, 660, 1000]) {
      const [, y] = toXY(0, z);
      if (y > H - 6) break;
      parts.push(svg('line', { x1: 0, y1: y, x2: W, y2: y, stroke: C.ink, 'stroke-width': 0.5, 'stroke-dasharray': '1 4', opacity: z === 660 ? 0.6 : 0.35 }));
      const t = svg('text', { x: W - 3, y: y - 2, 'text-anchor': 'end', 'font-size': 9, fill: C.soft });
      t.textContent = `${z} km`;
      parts.push(t);
    }
    parts.push(svg('line', { x1: 0, y1: seaY, x2: W, y2: seaY, stroke: C.ink, 'stroke-width': 0.4, opacity: 0.4 }));
  }
  return { parts, stretch, depth: depthShown };
}
