// @vitest-environment happy-dom
// The globe: places and vectors, the view, shapes cut at the limb, and the
// cut-away section built from a relief and the plate boundaries.

import { describe, expect, it } from 'vitest';
import { angle, capPolygon, circle, clipLine, clipRing, contains, eulerPole, globeView, lonLat, project, rotate, unproject, viewFrom, xyz } from '../src/globe';
import { ageFromDepth, oceanPlate, section, drawSection } from '../src/cutaway';
import { makeRelief, mercator } from '../src/maps';

const near = (a: number[], b: number[], d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));

describe('places and rotations', () => {
  it('turns a place into a vector and back', () => {
    for (const [lon, lat] of [[0, 0], [-122.3, 47.6], [151.2, -33.9], [179.9, 10]]) near(lonLat(xyz(lon, lat)), [lon, lat]);
  });

  it('rotates about an Euler pole the way plates turn', () => {
    // A quarter turn about the north pole carries 0° E to 90° E.
    near(lonLat(rotate(eulerPole(0, 90, 90), xyz(0, 0))), [90, 0]);
  });

  it('knows what is inside a ring', () => {
    const ring = circle(xyz(10, 20), 5);
    expect(contains(ring, xyz(10, 20))).toBe(true);
    expect(contains(ring, xyz(30, 20))).toBe(false);
  });
});

describe('the view', () => {
  const v = globeView({ cx: 100, cy: 100, r: 80, lon: -30, lat: 20 });

  it('puts the chosen place in the middle with north up and east to the right', () => {
    const mid = project(v, xyz(-30, 20));
    near([mid.x, mid.y], [100, 100]);
    expect(project(v, xyz(-30, 30)).y).toBeLessThan(100);
    expect(project(v, xyz(-20, 20)).x).toBeGreaterThan(100);
    expect(project(v, xyz(150, -20)).front).toBe(false);
  });

  it('finds the place under a point of the disc, and nothing off it', () => {
    const p = xyz(-10, 35);
    const q = project(v, p);
    near(unproject(v, q.x, q.y)!, p);
    expect(unproject(v, 100, 19)).toBeNull();
  });

  it('builds a view from a direction, with up kept up', () => {
    const w = viewFrom(0, 0, 1, [1, 0, 0], [0, 0, 1]);
    near(w.right, [0, 1, 0]);
    near(w.up, [0, 0, 1]);
  });
});

describe('cutting at the limb', () => {
  const v = globeView({ cx: 0, cy: 0, r: 1, lon: 0, lat: 0 });
  const inDisc = (p: [number, number]) => Math.hypot(p[0], p[1]) <= 1 + 1e-9;

  it('keeps a ring on the near side whole and drops one round the back', () => {
    expect(clipRing(v, circle(xyz(0, 0), 20))!.length).toBe(96);
    expect(clipRing(v, circle(xyz(180, 0), 20))).toBeNull();
  });

  it('closes a ring that runs round the back along the limb', () => {
    const pts = clipRing(v, circle(xyz(90, 0), 30))!;
    expect(pts.every(inDisc)).toBe(true);
    // Its limb part is on the right, where 90° E sits.
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(1, 2);
    expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThan(0.4);
  });

  it('fills the whole disc for a hemisphere that faces us, and half for one side-on', () => {
    const full = capPolygon(v, xyz(0, 0), 95)!;
    expect(Math.min(...full.map((p) => p[0]))).toBeLessThan(-0.99);
    const half = capPolygon(v, xyz(90, 0), 90)!;
    expect(Math.min(...half.map((p) => p[0]))).toBeGreaterThan(-0.02);
    expect(Math.max(...half.map((p) => p[1]))).toBeCloseTo(1, 2);
  });

  it('splits a line where it goes round the back', () => {
    const line = Array.from({ length: 361 }, (_, i) => xyz(-180 + i, 0));
    const runs = clipLine(v, line);
    expect(runs.length).toBe(1);
    expect(runs[0][0][0]).toBeCloseTo(-1, 3);
    expect(runs[0][runs[0].length - 1][0]).toBeCloseTo(1, 3);
  });
});

describe('the cutaway', () => {
  it('reads age from depth and thickness from age', () => {
    expect(ageFromDepth(2500)).toBe(0);
    expect(ageFromDepth(4000)).toBeGreaterThan(10);
    expect(ageFromDepth(5500)).toBeGreaterThan(60);
    expect(oceanPlate(0)).toBe(0);
    expect(oceanPlate(80)).toBeGreaterThan(90);
    expect(oceanPlate(150)).toBe(100);
  });

  // Deep old sea floor west of 0°, a trench along 0°, then land rising east of it.
  function world() {
    const zoom = 3;
    const [x0, y0] = mercator(-30, 30, zoom);
    const [x1, y1] = mercator(30, -30, zoom);
    const w = Math.round(x1 - x0);
    const h = Math.round(y1 - y0);
    const z = new Float32Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const lon = -30 + (60 * c) / w;
      z[r * w + c] = lon < -1 ? -5400 : lon < 1 ? -7500 : lon < 3 ? -2000 : 800;
    }
    return makeRelief({ width: w, height: h, zoom, x0, y0, step: 1, bounds: [-30, -30, 30, 30] }, z);
  }

  it('sends the slab down under the higher side, with volcanoes over 100 km', () => {
    const s = section(xyz(-15, 0), xyz(15, 0), { relief: world(), boundaries: { trench: [[[0, -20], [0, 20]]] }, dipAt: () => 40 });
    expect(s.crossings).toHaveLength(1);
    const c = s.crossings[0];
    expect(c.at).toBeCloseTo(s.length / 2, -1);
    expect(c.under).toBe(1);
    expect(c.seenDip).toBeCloseTo(40, 3);
    expect(c.arcAt).toBeGreaterThan(80);
    expect(c.arcAt).toBeLessThan(250);
    expect(s.land[0]).toBe(false);
    expect(s.land[s.land.length - 1]).toBe(true);
    const { parts } = drawSection(s, { width: 400, height: 200, colours: { paper: '#fff', ink: '#000', soft: '#666', sea: '#9cf', mantle: '#ecc4aa', lid: '#789', oceanCrust: '#333', landCrust: '#cb7', outerCore: '#e93', innerCore: '#fc6', heat: '#c43' } });
    expect(parts.length).toBeGreaterThan(5);
  });

  it('shows a slanting cut a shallower slab', () => {
    const s = section(xyz(-15, -10), xyz(15, 10), { relief: world(), boundaries: { trench: [[[0, -20], [0, 20]]] }, dipAt: () => 40 });
    expect(s.crossings[0].seenDip!).toBeLessThan(40);
    expect(angle(s.from, s.to)).toBeGreaterThan(0);
  });
});

describe('caps near the line of sight', () => {
  it('darkens the correct half when the edge of night runs through the middle', () => {
    const v = globeView({ cx: 0, cy: 0, r: 1, lon: 0, lat: 0 });
    for (const r of [86, 90, 94]) {
      // Night centred on the left (west) limb: the polygon must lie on the left.
      const pts = capPolygon(v, xyz(-90, 0), r)!;
      const meanX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      expect(meanX).toBeLessThan(0);
      expect(Math.max(...pts.map((p) => p[0]))).toBeLessThan(0.1);
    }
  });
});
