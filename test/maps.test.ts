// @vitest-environment happy-dom
// Reliefs: decoding heights, finding places on the grid, shading, layers of
// rock meeting the ground, and the map chart's options.

import { describe, expect, it } from 'vitest';
import { cellSize, decodeTerrarium, encodeTerrarium, fromCell, heightAt, hillshade, makeRelief, mapOptionsProblems, maps, mercator, outcrops, paintRelief, profile, reliefProblems, toCell, unmercator, type Relief } from '../src/maps';
import { emptyProgress } from '../src/progress';
import { testContext } from '../src/figure';

/** A 41 by 41 grid at zoom 12 near 45°N, heights from a function of (col, row). */
function grid(f: (c: number, r: number) => number): Relief {
  const [x0, y0] = mercator(3, 45, 12);
  const z = new Float32Array(41 * 41);
  for (let r = 0; r < 41; r++) for (let c = 0; c < 41; c++) z[r * 41 + c] = f(c, r);
  return makeRelief({ width: 41, height: 41, zoom: 12, x0, y0, step: 1, bounds: [3, 44.9, 3.1, 45] }, z);
}

describe('heights', () => {
  it('round-trips the Terrarium encoding to a 256th of a metre', () => {
    for (const m of [-412.5, 0, 12.25, 4808]) {
      const [r, g, b] = encodeTerrarium(m);
      expect(decodeTerrarium([r, g, b, 255], 1, 1)[0]).toBeCloseTo(m, 2);
    }
  });

  it('finds places on the grid and back', () => {
    const [x, y] = mercator(-122.3, 47.6, 10);
    expect(unmercator(x, y, 10)[0]).toBeCloseTo(-122.3, 6);
    expect(unmercator(x, y, 10)[1]).toBeCloseTo(47.6, 6);
    const r = grid(() => 0);
    const [lon, lat] = fromCell(r, 10, 20);
    const [c, row] = toCell(r, lon, lat);
    expect(c).toBeCloseTo(10, 6);
    expect(row).toBeCloseTo(20, 6);
    // A zoom-12 pixel is about 27 m at 45°N.
    expect(cellSize(r)).toBeGreaterThan(26);
    expect(cellSize(r)).toBeLessThan(28.5);
  });

  it('interpolates heights and samples a profile', () => {
    const r = grid((c) => c * 10);
    expect(heightAt(r, 2.5, 7)).toBeCloseTo(25, 5);
    const p = profile(r, fromCell(r, 0, 20), fromCell(r, 40, 20), 5);
    expect(p.map((s) => Math.round(s.z))).toEqual([0, 100, 200, 300, 400]);
    expect(p[4].d).toBeCloseTo(40 * cellSize(r, 20), -1);
  });

  it('checks a meta file', () => {
    expect(reliefProblems({})).toContain('"format" should be "didactics-relief"');
    expect(reliefProblems(grid(() => 0).meta).filter((p) => !/credit|licence|source|fetched|image/.test(p))).toEqual([]);
  });
});

describe('shading', () => {
  it('lights slopes that face the sun and darkens those that face away', () => {
    // Ground rising to the east: it faces west.
    const r = grid((c) => c * 20);
    const fromWest = hillshade(r, { azimuth: 270, altitude: 30 })[20 * 41 + 20];
    const fromEast = hillshade(r, { azimuth: 90, altitude: 30 })[20 * 41 + 20];
    expect(fromWest).toBeGreaterThan(fromEast);
    // Flat ground is lit by the sun's height alone.
    expect(hillshade(grid(() => 5), { azimuth: 0, altitude: 30 })[0]).toBeCloseTo(0.5, 5);
  });

  it('paints water up to the level asked and the ground above it', () => {
    const r = grid((c) => c - 20);
    const px = paintRelief(r, { water: 0, waterColor: '#0000ff', ground: '#ff0000' });
    const at = (c: number) => Array.from(px.slice((20 * 41 + c) * 4, (20 * 41 + c) * 4 + 3));
    expect(at(5)).toEqual([0, 0, 255]);
    expect(at(35)[0]).toBeGreaterThan(200);
    expect(at(35)[2]).toBe(0);
  });
});

describe('layers of rock', () => {
  const flatLayers = { dipDirection: 90, dip: 0, through: [3.05, 44.95, 0] as [number, number, number], thickness: [10, 10] };

  it('follow the contours when flat: the higher the ground, the younger the layer', () => {
    const r = grid((c) => c * 5);
    const o = outcrops(r, flatLayers);
    expect(o[20 * 41 + 0]).toBe(0);
    expect(o[20 * 41 + 3]).toBe(1);
    expect(o[20 * 41 + 40]).toBe(20);
    // The same along a contour.
    expect(o[0 * 41 + 10]).toBe(o[40 * 41 + 10]);
  });

  it('come up older on the side they rise toward, on flat ground', () => {
    const r = grid(() => 0);
    const o = outcrops(r, { ...flatLayers, dip: 10, thickness: [20] });
    // Dipping east: older (lower) layers at the surface to the west.
    expect(o[20 * 41 + 0]).toBeLessThan(o[20 * 41 + 40]);
  });
});

describe('the map chart', () => {
  it('checks its options', () => {
    expect(mapOptionsProblems({ relief: 'maps/zion.png' })[0]).toMatch(/without an extension/);
    expect(mapOptionsProblems({ relief: 'maps/zion', labels: [{ lon: 500, lat: 0, text: 'x' }] })[0]).toMatch(/degrees/);
    expect(mapOptionsProblems({ relief: 'maps/zion', sun: { azimuth: 300, altitude: 30 }, labels: [{ lon: -113, lat: 37.2, text: 'Zion' }] })).toEqual([]);
  });

  it('draws once its relief has loaded, with the credit under it', async () => {
    const r = grid((c) => c);
    r.meta.credit = 'Somebody';
    const { map } = maps({ load: async () => r });
    const h = map(testContext(emptyProgress('metric')), undefined, { relief: 'maps/test-a', title: 'A hill', labels: [{ lon: 3.05, lat: 44.95, text: 'Top' }] });
    await h.ready;
    expect(h.node.querySelector('.map-title')!.textContent).toBe('A hill');
    expect(h.node.querySelector('.map-credit')!.textContent).toBe('Heights: Somebody');
    expect([...h.node.querySelectorAll('text')].map((t) => t.textContent)).toContain('Top');
  });

  it('says so when a relief cannot be loaded', async () => {
    const { map } = maps({ load: async () => { throw new Error('no'); } });
    const h = map(testContext(emptyProgress('metric')), undefined, { relief: 'maps/missing' });
    await h.ready;
    expect(h.node.textContent).toMatch(/could not be loaded/);
  });
});
