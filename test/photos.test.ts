// @vitest-environment happy-dom
// A photo with its credit (photos.ts): the credit line, the figure markup
// kit.css styles, and the still-photo figure a lesson's JSON names a photo in.

import { describe, expect, it } from 'vitest';
import { testContext } from '../src/figure';
import { emptyProgress } from '../src/progress';
import { credit, photoFigure, photoProblems, stillPhoto, type Photo } from '../src/photos';

const p: Photo & { about: string; file: string } = {
  id: 'cumulus-01', width: 800, height: 520, author: 'Ann', license: 'CC-BY-4.0',
  sourceUrl: 'https://commons.wikimedia.org/x', source: 'Wikimedia Commons', about: 'A cumulus over wheat', file: 'photos/cumulus-01.jpg',
};
const lib = { find: (id: string) => (id === p.id ? p : undefined), src: (x: typeof p) => `/clouds/${x.file}` };

describe('photos.ts', () => {
  it('credits author, licence and source, each linked', () => {
    const c = credit(p);
    expect(c.textContent).toBe('Photo: Ann · CC BY 4.0 · Wikimedia Commons');
    expect([...c.querySelectorAll('a')].map((a) => a.href)).toEqual(['https://commons.wikimedia.org/x', 'https://creativecommons.org/licenses/by/4.0/']);
    expect(photoProblems({ ...p, license: 'CC-BY-NC-4.0' as Photo['license'] })).toEqual(['licence CC-BY-NC-4.0 is not allowed']);
  });

  it('puts the picture over its credit, flipping only the picture', () => {
    const f = photoFigure(p, '/x.jpg', { mirrored: true, aspect: 1.5 });
    expect(f.matches('figure.photo')).toBe(true);
    const img = f.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/x.jpg');
    expect(img.alt).toBe('A cumulus over wheat');
    expect(img.className).toBe('mirrored');
    expect(img.style.aspectRatio).toMatch(/^1.5/);
    expect(f.querySelector('figcaption .credit')!.textContent).toContain('Ann');
  });

  it('is a figure a lesson names a photo in, and checks the name', () => {
    const still = stillPhoto(lib);
    expect(still.options!(undefined)).toEqual(['needs "photo", a photo id']);
    expect(still.options!({ photo: 'nope' })).toEqual(['no photo "nope"']);
    expect(still.options!({ photo: p.id, aspect: 'wide' })).toEqual(['"aspect" should be width / height']);
    expect(still.options!({ photo: p.id, aspect: 1.5 })).toEqual([]);
    const ctx = testContext(emptyProgress());
    const node = still(ctx, undefined, { photo: p.id }).node;
    expect(node.querySelector('img')!.getAttribute('src')).toBe('/clouds/photos/cumulus-01.jpg');
    expect(still(ctx, undefined, { photo: 'nope' }).node.textContent).toBe('No photo "nope".');
  });
});
