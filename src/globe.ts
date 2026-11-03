// A globe to draw on: any round body (the Earth, the Moon, a planet) seen from
// any side, turned by dragging, lit by a sun, and cut open to show what is
// inside. The course brings what goes on it (coastlines, plates carried back
// through time, maria, a relief to paint); this module only knows spheres.
//
// Everything on the globe is a unit vector in the body's own frame: x through
// longitude 0 on the equator, y through 90° E, z through the north pole
// (`xyz`, `lonLat`). A view (`globeView`) turns those into canvas pixels:
// orthographic, as the body looks from far away, centred on a point of the
// body, north up unless rolled. Shapes are clipped at the edge of the disc
// (the limb), so a continent half round the back is drawn as far as the limb
// and closed along it.
//
//   const view = globeView({ cx: 200, cy: 150, r: 120, lon: -30, lat: 20 });
//   const g = new GlobePainter(ctx, view);
//   g.disc('#9cc3d8');
//   g.rings(continents, { fill: '#e2cf9b', stroke: '#2b2622' });
//   g.night(sunDirection);
//   g.cutOpen(octant(-75, 0), [{ r: 1, fill: '#ecc4aa' }, { r: 0.55, fill: '#e08a3c' }]);
//
// `dragGlobe` turns a canvas into a globe the reader can spin, and can carry
// handles (points on the globe the reader moves, such as the two ends of a
// section line).

export type V3 = [number, number, number];
/** Longitude and latitude, degrees. */
export type LL = [number, number];
/** A rotation as a unit quaternion [w, x, y, z]. */
export type Q = [number, number, number, number];
/** A point on the canvas. */
export type XY = [number, number];

/** The Earth's mean radius, km. */
export const EARTH_KM = 6371;

const RAD = Math.PI / 180;

// ---- Vectors and rotations ---------------------------------------------------------

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export function unit(a: V3): V3 {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** The unit vector of a place. */
export const xyz = (lon: number, lat: number): V3 => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
/** The place of a unit vector, longitude in −180..180. */
export const lonLat = (v: V3): LL => [Math.atan2(v[1], v[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD];

/** The angle between two unit vectors, radians. */
export const angle = (a: V3, b: V3) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
/** The distance between two places on a sphere of radius `radius` (default the Earth's, km). */
export const distance = (a: V3, b: V3, radius = EARTH_KM) => angle(a, b) * radius;

/** The point `k` of the way along the great circle from `a` to `b`. */
export function slerp(a: V3, b: V3, k: number): V3 {
  const w = angle(a, b);
  if (w < 1e-9) return a;
  const s = Math.sin(w);
  return unit(add(scale(a, Math.sin((1 - k) * w) / s), scale(b, Math.sin(k * w) / s)));
}

/** `n` + 1 points along the great circle from `a` to `b`, both ends included. */
export const arc = (a: V3, b: V3, n = 64): V3[] => Array.from({ length: n + 1 }, (_, i) => slerp(a, b, i / n));

/** The rotation by `deg` degrees about `axis` (right-handed: counterclockwise looking down the axis). */
export function about(axis: V3, deg: number): Q {
  const [x, y, z] = unit(axis);
  const h = (deg * RAD) / 2;
  const s = Math.sin(h);
  return [Math.cos(h), x * s, y * s, z * s];
}

/** A rotation about an Euler pole given as a place, the way plate motions are written. */
export const eulerPole = (lon: number, lat: number, deg: number): Q => about(xyz(lon, lat), deg);

/** `v` turned by the rotation `q`. */
export function rotate([w, x, y, z]: Q, [vx, vy, vz]: V3): V3 {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

/** The rotation `a` after `b`. */
export const compose = ([aw, ax, ay, az]: Q, [bw, bx, by, bz]: Q): Q => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];

/** A circle on the sphere: every point `radiusDeg` from `centre`, as a closed ring of `n` points. */
export function circle(centre: V3, radiusDeg: number, n = 96): V3[] {
  const c = unit(centre);
  const helper: V3 = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit(cross(c, helper));
  const v = cross(c, u);
  const cr = Math.cos(radiusDeg * RAD);
  const sr = Math.sin(radiusDeg * RAD);
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return unit(add(scale(c, cr), add(scale(u, sr * Math.cos(t)), scale(v, sr * Math.sin(t)))));
  });
}

/** A line of latitude, as a closed ring. */
export const parallel = (lat: number, n = 120): V3[] => Array.from({ length: n }, (_, i) => xyz(-180 + (360 * i) / n, lat));
/** A meridian from pole to pole. */
export const meridian = (lon: number, n = 60): V3[] => Array.from({ length: n + 1 }, (_, i) => xyz(lon, -90 + (180 * i) / n));

/** Whether `p` lies inside the closed ring `ring` on the sphere (a ring smaller than a hemisphere), by winding round it as seen from `p`. */
export function contains(ring: readonly V3[], p: V3): boolean {
  let turn = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    // The signed angle at p between the great circles to a and to b.
    const na = cross(p, a);
    const nb = cross(p, b);
    turn += Math.atan2(dot(cross(na, nb), p), dot(na, nb));
  }
  return Math.abs(turn) > Math.PI;
}

// ---- Views ---------------------------------------------------------------------------

/** Where the globe sits on the canvas and which side of it faces us. */
export interface ViewSpec {
  cx: number;
  cy: number;
  /** The body's radius in canvas units. Larger than the canvas zooms in to a region, seen from straight above. */
  r: number;
  /** The place at the middle of the disc. */
  lon: number;
  lat: number;
  /** Turns the picture about its middle, degrees counterclockwise; 0 keeps north up. */
  roll?: number;
}

/** A view as three axes in the body's frame: what points right, up, and out of the screen toward us. */
export interface GlobeView {
  cx: number;
  cy: number;
  r: number;
  right: V3;
  up: V3;
  toward: V3;
}

/** The view from a place, north up (or rolled). */
export function globeView(s: ViewSpec): GlobeView {
  const toward = xyz(s.lon, s.lat);
  const east: V3 = [-Math.sin(s.lon * RAD), Math.cos(s.lon * RAD), 0];
  const north = cross(toward, east);
  const t = (s.roll ?? 0) * RAD;
  const right = add(scale(east, Math.cos(t)), scale(north, Math.sin(t)));
  const up = add(scale(north, Math.cos(t)), scale(east, -Math.sin(t)));
  return { cx: s.cx, cy: s.cy, r: s.r, right, up, toward };
}

/**
 * A view given by its axes directly, for a body seen from a place that is not
 * fixed to it: the Moon from the Earth, the Earth from beside its orbit.
 * `toward` points from the body to the viewer and `up` is made square to it.
 */
export function viewFrom(cx: number, cy: number, r: number, toward: V3, up: V3): GlobeView {
  const t = unit(toward);
  const right = unit(cross(up, t));
  return { cx, cy, r, right, up: cross(t, right), toward: t };
}

/** A point of the body in the view's frame: [right, up, toward]; toward > 0 is on the near side. */
export const inView = (v: GlobeView, p: V3): V3 => [dot(p, v.right), dot(p, v.up), dot(p, v.toward)];

/** A point of the body (a unit vector, or longer for a point above the surface) on the canvas, and whether it faces us. */
export function project(v: GlobeView, p: V3): { x: number; y: number; front: boolean } {
  const [a, b, c] = inView(v, p);
  return { x: v.cx + v.r * a, y: v.cy - v.r * b, front: c >= 0 };
}

/** The point of the body under a canvas position, or null off the disc. */
export function unproject(v: GlobeView, x: number, y: number): V3 | null {
  const a = (x - v.cx) / v.r;
  const b = -(y - v.cy) / v.r;
  const q = a * a + b * b;
  if (q > 1) return null;
  const c = Math.sqrt(1 - q);
  return unit(add(add(scale(v.right, a), scale(v.up, b)), scale(v.toward, c)));
}

/** The canvas point on the limb at angle `t` (radians, counterclockwise from the right). */
const limbAt = (v: GlobeView, t: number): XY => [v.cx + v.r * Math.cos(t), v.cy - v.r * Math.sin(t)];

/** The wrapped difference b − a of two angles, in −π..π. */
function turnBetween(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Where the chord from a to b (both in view frame) crosses the limb plane, pushed out to the sphere. */
function horizon(a: V3, b: V3): V3 {
  const t = a[2] / (a[2] - b[2]);
  const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
  const n = Math.hypot(p[0], p[1]) || 1;
  return [p[0] / n, p[1] / n, 0];
}

/**
 * A closed ring on the body as a canvas polygon, cut at the limb: the part on
 * the near side, closed along the limb the way the hidden part runs. Null when
 * it is all round the back; the whole disc when the ring is round the back but
 * encloses the near side's middle (`holdsMiddle`, which only the caller can
 * know; `circle` rings can say, see `capPolygon`).
 */
export function clipRing(v: GlobeView, ring: readonly V3[], holdsMiddle = false, inside?: (p: V3) => boolean): XY[] | null {
  const n = ring.length;
  if (n < 3) return null;
  const pts = ring.map((p) => inView(v, p));
  const start = pts.findIndex((p) => p[2] >= 0);
  const toXY = (p: V3): XY => [v.cx + v.r * p[0], v.cy - v.r * p[1]];
  if (start < 0) {
    if (!holdsMiddle) return null;
    return Array.from({ length: 96 }, (_, i) => limbAt(v, (2 * Math.PI * i) / 96));
  }
  const out: XY[] = [];
  let leftAt = 0;
  let last = 0;
  let sweep = 0;
  for (let k = 0; k < n; k++) {
    const a = pts[(start + k) % n];
    const b = pts[(start + k + 1) % n];
    const aIn = a[2] >= 0;
    const bIn = b[2] >= 0;
    if (aIn) out.push(toXY(a));
    if (aIn && !bIn) {
      const h = horizon(a, b);
      out.push(toXY(h));
      leftAt = Math.atan2(h[1], h[0]);
      last = leftAt;
      sweep = 0;
      const tb = Math.atan2(b[1], b[0]);
      sweep += turnBetween(last, tb);
      last = tb;
    } else if (!aIn && !bIn) {
      const tb = Math.atan2(b[1], b[0]);
      sweep += turnBetween(last, tb);
      last = tb;
    } else if (!aIn && bIn) {
      const h = horizon(a, b);
      const th = Math.atan2(h[1], h[0]);
      sweep += turnBetween(last, th);
      if (inside) {
        // Which way round the limb lies inside the shape: test the middle of the short way.
        const short = turnBetween(leftAt, th);
        const m = leftAt + short / 2;
        const mid = add(scale(v.right, Math.cos(m)), scale(v.up, Math.sin(m)));
        sweep = inside(mid) ? short : short - Math.sign(short || 1) * 2 * Math.PI;
      }
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (4 * RAD)));
      for (let i = 1; i < steps; i++) out.push(limbAt(v, leftAt + (sweep * i) / steps));
      out.push(toXY(h));
    }
  }
  return out;
}

/** A circle on the body (every point within `radiusDeg` of `centre`) as a canvas polygon, whole disc included. */
export function capPolygon(v: GlobeView, centre: V3, radiusDeg: number): XY[] | null {
  // The near side's middle is inside the cap when it is within radius of the centre.
  const c = unit(centre);
  const holds = angle(c, v.toward) < radiusDeg * RAD;
  const cos = Math.cos(radiusDeg * RAD);
  return clipRing(v, circle(c, radiusDeg, 144), holds, (p) => dot(p, c) > cos);
}

/** An open line on the body as canvas polylines: the runs on the near side, each ended at the limb. */
export function clipLine(v: GlobeView, line: readonly V3[]): XY[][] {
  const out: XY[][] = [];
  let run: XY[] = [];
  const toXY = (p: V3): XY => [v.cx + v.r * p[0], v.cy - v.r * p[1]];
  const pts = line.map((p) => inView(v, p));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    if (a[2] >= 0) run.push(toXY(a));
    const b = pts[i + 1];
    if (!b) break;
    if (a[2] >= 0 && b[2] < 0) {
      run.push(toXY(horizon(a, b)));
      out.push(run);
      run = [];
    } else if (a[2] < 0 && b[2] >= 0) {
      run.push(toXY(horizon(a, b)));
    }
  }
  if (run.length > 1) out.push(run);
  return out.filter((r) => r.length > 1);
}

// ---- Painting ------------------------------------------------------------------------

export interface PathStyle {
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
  alpha?: number;
}

/** A cut-open body: the corner taken out is the octant between three square axes of the body's frame. */
export interface Octant {
  a: V3;
  b: V3;
  c: V3;
}

/** The octant between two meridians 90° apart (starting at `lon`) and a pole: the corner a textbook cuts out of the Earth. */
export function octant(lon: number, north = true): Octant {
  return { a: xyz(lon, 0), b: xyz(lon + 90, 0), c: [0, 0, north ? 1 : -1] };
}

/** One shell of a body's inside, from the centre out to `r` (1 = the surface). */
export interface Shell {
  r: number;
  fill: string;
  /** A name to write on the cut face. */
  name?: string;
}

/** Draws on a canvas through a view. Every method draws at once, in the order called: paint back to front. */
export class GlobePainter {
  constructor(readonly ctx: CanvasRenderingContext2D, readonly view: GlobeView) {}

  private path(pts: readonly XY[], close: boolean): void {
    const c = this.ctx;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (close) c.closePath();
  }

  private paint(s: PathStyle): void {
    const c = this.ctx;
    c.save();
    if (s.alpha !== undefined) c.globalAlpha = s.alpha;
    if (s.fill) {
      c.fillStyle = s.fill;
      c.fill('evenodd');
    }
    if (s.stroke) {
      c.strokeStyle = s.stroke;
      c.lineWidth = s.width ?? 1;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.setLineDash(s.dash ?? []);
      c.stroke();
    }
    c.restore();
  }

  /** The disc of the body. */
  disc(fill: string, outline?: PathStyle): void {
    const { cx, cy, r } = this.view;
    const c = this.ctx;
    c.beginPath();
    c.arc(cx, cy, r, 0, 2 * Math.PI);
    c.fillStyle = fill;
    c.fill();
    if (outline?.stroke) this.limb(outline);
  }

  /** The outline of the disc. */
  limb(s: PathStyle = { stroke: '#2b2622', width: 1 }): void {
    const { cx, cy, r } = this.view;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    this.paint({ ...s, fill: undefined });
  }

  /** Closed shapes on the body (continents, maria), clipped at the limb. */
  rings(rings: readonly (readonly V3[])[], s: PathStyle): void {
    for (const ring of rings) {
      const pts = clipRing(this.view, ring);
      if (!pts || pts.length < 3) continue;
      this.path(pts, true);
      this.paint(s);
    }
  }

  /** Circles on the body, each `radiusDeg` round its centre. */
  caps(caps: readonly { centre: V3; radiusDeg: number }[], s: PathStyle): void {
    for (const cap of caps) {
      const pts = capPolygon(this.view, cap.centre, cap.radiusDeg);
      if (!pts) continue;
      this.path(pts, true);
      this.paint(s);
    }
  }

  /** Open lines on the body (boundaries, graticule, a section line). */
  lines(lines: readonly (readonly V3[])[], s: PathStyle): void {
    for (const line of lines) {
      for (const run of clipLine(this.view, line)) {
        this.path(run, false);
        this.paint({ ...s, fill: undefined });
      }
    }
  }

  /** Lines of latitude and longitude every `step` degrees. */
  graticule(step = 30, s: PathStyle = { stroke: 'rgba(0,0,0,0.14)', width: 0.7 }): void {
    const lines: V3[][] = [];
    for (let lat = -90 + step; lat < 90; lat += step) {
      const ring = parallel(lat);
      lines.push([...ring, ring[0]]);
    }
    for (let lon = -180; lon < 180; lon += step) lines.push(meridian(lon));
    this.lines(lines, s);
  }

  /**
   * Darkness over the side turned from the sun (`sun`, a direction in the
   * body's frame): the night, and `bands` lighter steps of twilight toward the
   * day, so the edge reads as the soft line it is but stays drawn in flat
   * tones like the rest.
   */
  night(sun: V3, s: { fill?: string; alpha?: number; bands?: number; twilightDeg?: number } = {}): void {
    const anti = scale(unit(sun), -1);
    const bands = s.bands ?? 3;
    const width = s.twilightDeg ?? 8;
    const alpha = s.alpha ?? 0.62;
    for (let i = 0; i < bands; i++) {
      // From the widest, faintest band to the core of the night.
      const radius = 90 + width / 2 - (width * i) / Math.max(1, bands - 1);
      const pts = capPolygon(this.view, anti, Math.min(179.5, radius));
      if (!pts) continue;
      this.path(pts, true);
      // Each band adds to the ones under it, so the core of the night reaches `alpha`.
      this.paint({ fill: s.fill ?? '#141a2e', alpha: 1 - (1 - alpha) ** (1 / bands) });
    }
  }

  /**
   * Paints the near side pixel by pixel from `colour(p)` for each point of the
   * body (null leaves the pixel alone): for a relief or a photograph wrapped
   * on the body. `step` > 1 paints blocks, for speed while dragging. Pixels
   * are in the canvas's own units; `pixelRatio` is how many canvas pixels
   * there are per drawing unit (the frame's scale).
   */
  raster(colour: (p: V3) => readonly [number, number, number] | null, o: { step?: number; pixelRatio?: number; shade?: number } = {}): void {
    const c = this.ctx;
    const k = o.pixelRatio ?? 1;
    const step = Math.max(1, Math.round(o.step ?? 1));
    const { cx, cy, r } = this.view;
    const x0 = Math.max(0, Math.floor((cx - r) * k));
    const y0 = Math.max(0, Math.floor((cy - r) * k));
    const x1 = Math.min(c.canvas.width, Math.ceil((cx + r) * k));
    const y1 = Math.min(c.canvas.height, Math.ceil((cy + r) * k));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const img = c.getImageData(x0, y0, w, h);
    const d = img.data;
    const shade = o.shade ?? 0.18;
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const x = (x0 + px + step / 2) / k;
        const y = (y0 + py + step / 2) / k;
        const p = unproject(this.view, x, y);
        if (!p) continue;
        const col = colour(p);
        if (!col) continue;
        // A little darker toward the limb, so the ball reads as round.
        const lit = 1 - shade * (1 - dot(p, this.view.toward));
        for (let j = 0; j < step && py + j < h; j++) {
          for (let i = 0; i < step && px + i < w; i++) {
            const o4 = ((py + j) * w + px + i) * 4;
            d[o4] = col[0] * lit;
            d[o4 + 1] = col[1] * lit;
            d[o4 + 2] = col[2] * lit;
            d[o4 + 3] = 255;
          }
        }
      }
    }
    c.putImageData(img, x0, y0);
  }

  /** A dot at a place, if it faces us; says whether it was drawn. */
  dot(p: V3, radius: number, s: PathStyle): boolean {
    const q = project(this.view, p);
    if (!q.front) return false;
    this.ctx.beginPath();
    this.ctx.arc(q.x, q.y, radius, 0, 2 * Math.PI);
    this.paint(s);
    return true;
  }

  /** Words at a place, if it faces us. */
  label(p: V3, text: string, s: { fill?: string; font?: string; align?: CanvasTextAlign; dx?: number; dy?: number; halo?: string } = {}): boolean {
    const q = project(this.view, p);
    if (!q.front) return false;
    const c = this.ctx;
    c.save();
    c.font = s.font ?? '600 11px system-ui, sans-serif';
    c.textAlign = s.align ?? 'left';
    c.textBaseline = 'middle';
    const x = q.x + (s.dx ?? 6);
    const y = q.y + (s.dy ?? 0);
    if (s.halo) {
      c.strokeStyle = s.halo;
      c.lineWidth = 3;
      c.lineJoin = 'round';
      c.strokeText(text, x, y);
    }
    c.fillStyle = s.fill ?? '#2b2622';
    c.fillText(text, x, y);
    c.restore();
    return true;
  }

  /** An arrow along the body from `a` toward `b` (a short great-circle step), as plate motions are drawn. */
  arrow(a: V3, b: V3, s: PathStyle & { head?: number }): void {
    const runs = clipLine(this.view, arc(a, b, 8));
    if (runs.length !== 1 || runs[0].length < 9) return;
    const run = runs[0];
    this.path(run, false);
    this.paint({ ...s, fill: undefined });
    const [x1, y1] = run[run.length - 1];
    const [x0, y0] = run[run.length - 3];
    const t = Math.atan2(y1 - y0, x1 - x0);
    const h = s.head ?? 5;
    this.path([[x1, y1], [x1 - h * Math.cos(t - 0.5), y1 - h * Math.sin(t - 0.5)], [x1 - h * Math.cos(t + 0.5), y1 - h * Math.sin(t + 0.5)]], true);
    this.paint({ fill: s.stroke, alpha: s.alpha });
  }

  /**
   * The body cut open: the corner `cut` taken out, and its three flat faces
   * drawn in the shells, outermost first. Call it after the surface is
   * painted. Only the part of the cut that faces us shows; turned away, the
   * body looks whole. A face that the sun (`sun`) falls on is drawn a shade
   * lighter than one in its own shadow.
   */
  cutOpen(cut: Octant, shells: readonly Shell[], o: { sun?: V3; ink?: string; hole?: string; labels?: boolean; font?: string } = {}): void {
    const v = this.view;
    const c = this.ctx;
    const corner = [cut.a, cut.b, cut.c].map(unit) as [V3, V3, V3];
    const [A, B, C] = corner;
    // The bit of surface that is gone: the spherical triangle between the three axes.
    const tri = [...arc(A, B, 24).slice(0, -1), ...arc(B, C, 24).slice(0, -1), ...arc(C, A, 24).slice(0, -1)];
    const hole = clipRing(v, tri);
    if (!hole) return;
    c.save();
    this.path(hole, true);
    c.clip();
    c.fillStyle = o.hole ?? '#2b2622';
    c.fill();
    // Each face is the quarter disc square to one axis, spanned by the other two.
    const faces: { normal: V3; u: V3; w: V3 }[] = [
      { normal: A, u: B, w: C },
      { normal: B, u: C, w: A },
      { normal: C, u: A, w: B },
    ];
    const visible = faces
      .filter((f) => dot(f.normal, v.toward) > 1e-3)
      .sort((p, q) => dot(add(p.u, p.w), v.toward) - dot(add(q.u, q.w), v.toward));
    const sorted = [...shells].sort((p, q) => q.r - p.r);
    const toXY = (p: V3): XY => {
      const q = project(v, p);
      return [q.x, q.y];
    };
    for (const f of visible) {
      // Light falls on the face from inside the cut when the sun is on the cut's side of it.
      const lit = o.sun ? dot(unit(o.sun), f.normal) > 0 : true;
      for (const s of sorted) {
        const pts: XY[] = [toXY([0, 0, 0])];
        for (let i = 0; i <= 24; i++) {
          const t = (Math.PI / 2) * (i / 24);
          pts.push(toXY(scale(add(scale(f.u, Math.cos(t)), scale(f.w, Math.sin(t))), s.r)));
        }
        this.path(pts, true);
        c.fillStyle = s.fill;
        c.fill();
        if (!lit) {
          c.fillStyle = 'rgba(20, 20, 40, 0.18)';
          c.fill();
        }
        if (o.ink) {
          c.strokeStyle = o.ink;
          c.lineWidth = 0.6;
          c.stroke();
        }
      }
    }
    c.restore();
    if (o.ink) {
      this.path(hole, true);
      this.paint({ stroke: o.ink, width: 1 });
    }
    if (o.labels && visible.length) {
      // Names on the face most square to us, halfway through each shell.
      const f = [...visible].sort((p, q) => dot(q.normal, v.toward) - dot(p.normal, v.toward))[0];
      const mid = unit(add(f.u, f.w));
      c.save();
      c.font = o.font ?? '600 10px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        if (!s.name) continue;
        const inner = sorted[i + 1]?.r ?? 0;
        const [x, y] = toXY(scale(mid, (s.r + inner) / 2));
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(255,255,255,0.7)';
        c.strokeText(s.name, x, y);
        c.fillStyle = o.ink ?? '#2b2622';
        c.fillText(s.name, x, y);
      }
      c.restore();
    }
  }
}

// ---- The reader's hand ------------------------------------------------------------------

export interface DragGlobe {
  /** Stop listening. */
  stop: () => void;
}

export interface DragGlobeOptions {
  /** The view now (it changes as the reader drags). */
  view: () => GlobeView;
  /** Turn the globe: the new middle, as a place. */
  turn?: (lon: number, lat: number) => void;
  /** The middle now, as a place, for `turn`. */
  middle?: () => LL;
  /** Points the reader can pick up and move, and what to do when one moves. */
  handles?: { at: () => readonly V3[]; move: (i: number, p: V3) => void; reach?: number };
  /** Called on every change, with whether the hand is still down (draw cheaply while it is). */
  changed: (dragging: boolean) => void;
  /** The canvas is this many canvas pixels per drawing unit (see canvasFrame's scale); default from its size on screen. */
  units?: () => number;
}

/** Lets the reader spin a globe drawn on `canvas` by dragging it, and move its handles. */
export function dragGlobe(canvas: HTMLCanvasElement, o: DragGlobeOptions): DragGlobe {
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  let mode: 'none' | 'turn' | number = 'none';
  let last: XY = [0, 0];
  const at = (e: PointerEvent): XY => {
    const box = canvas.getBoundingClientRect();
    const w = o.units ? canvas.width / o.units() : canvas.width;
    const h = o.units ? canvas.height / o.units() : canvas.height;
    return [((e.clientX - box.left) / box.width) * w, ((e.clientY - box.top) / box.height) * h];
  };
  const down = (e: PointerEvent) => {
    const p = at(e);
    const v = o.view();
    const reach = o.handles?.reach ?? 16;
    const hs = o.handles?.at() ?? [];
    let best = -1;
    let bestD = reach;
    hs.forEach((h, i) => {
      const q = project(v, h);
      const d = Math.hypot(q.x - p[0], q.y - p[1]);
      if (q.front && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) mode = best;
    else if (o.turn && unproject(v, p[0], p[1])) mode = 'turn';
    else return;
    last = p;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    if (mode === 'none') return;
    const p = at(e);
    const v = o.view();
    if (mode === 'turn') {
      const [lon, lat] = o.middle!();
      const k = 1 / (RAD * v.r);
      o.turn!(lon - (p[0] - last[0]) * k, Math.max(-89, Math.min(89, lat + (p[1] - last[1]) * k)));
    } else {
      const q = unproject(v, p[0], p[1]);
      if (q) o.handles!.move(mode, q);
    }
    last = p;
    o.changed(true);
  };
  const up = () => {
    if (mode === 'none') return;
    mode = 'none';
    canvas.style.cursor = 'grab';
    o.changed(false);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  return {
    stop: () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    },
  };
}
