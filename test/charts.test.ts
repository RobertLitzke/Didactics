// @vitest-environment happy-dom
// Charts drawn from a lesson's JSON alone: each draws from its options, says
// what is wrong with options it cannot draw, and needs no course code.

import { describe, expect, it } from 'vitest';
import { charts, CHART_IDS, wrap } from '../src/charts';
import { exportCourse } from '../src/course';
import { standaloneFigure } from '../src/figure';
import { galleryPage } from '../src/gallery';
import { lessonProblems, type Lesson } from '../src/lesson';
import { emptyProgress } from '../src/progress';

const save = emptyProgress('metric');
const CHARTS = charts({ palette: { warm: '#e88a6a', dew: '#0e7a8f' } });

const scale = {
  title: 'Days a year with thunder',
  unit: 'days',
  items: [
    { label: 'Fort Myers, Florida', value: 90, color: 'warm' },
    { label: 'Seattle, Washington', value: 6, color: 'dew', bold: true },
  ],
};
const timeline = {
  title: 'Eastern Washington',
  events: [
    { at: 1931, label: 'You start at Harrow' },
    { at: 1880, to: 1900, label: 'Wheat comes to the Palouse, field by field' },
    { at: 1946, label: 'Dry ice seeds a cloud', when: 'Nov 1946', color: 'dew' },
  ],
  note: 'Years are rounded.',
};
const tree = {
  root: {
    label: 'Clouds',
    children: [
      { label: 'Heaps', note: 'rising air', children: [{ label: 'Cumulus' }, { label: 'Cumulonimbus' }] },
      { label: 'Layers', children: [{ label: 'Stratus' }] },
    ],
  },
};
const plate = {
  image: 'photos/cb.jpg',
  width: 1200,
  height: 800,
  alt: 'A thunderstorm',
  credit: 'NOAA',
  labels: [
    { x: 0.5, y: 0.1, text: 'Anvil' },
    { x: 0.2, y: 0.8, text: 'Rain shaft' },
    { x: 0.7, y: 0.9, text: 'Gust front' },
  ],
};
const OPTIONS = { scale, timeline, tree, plate } as const;

const lesson = (blocks: Lesson['parts'][number]['blocks']): Lesson => ({ id: 'l', n: 1, title: 'L', teaches: '', learned: [], next: '', journal: [], parts: [{ title: 'One', blocks }] });

describe('charts', () => {
  it('draws each chart from its options, with every word in the drawing', () => {
    for (const id of CHART_IDS) {
      const fig = standaloneFigure(CHARTS[id], { caption: id, save, options: OPTIONS[id] });
      const svg = fig.node.querySelector('svg.fig-svg')!;
      expect(svg, id).not.toBeNull();
      const vb = svg.getAttribute('viewBox')!.split(' ').map(Number);
      expect(vb[2]).toBe(400);
      expect(vb[3]).toBeGreaterThan(40);
      // The caption is the figure's one text box.
      expect(fig.node.querySelectorAll('.fig-text')).toHaveLength(1);
    }
    const text = (id: keyof typeof OPTIONS) => standaloneFigure(CHARTS[id], { caption: '', save, options: OPTIONS[id] }).node.querySelector('svg')!.textContent!;
    expect(text('scale')).toContain('90 days');
    expect(text('scale')).toContain('Seattle, Washington');
    expect(text('timeline')).toContain('Nov 1946');
    expect(text('timeline')).toContain('1931');
    expect(text('tree')).toContain('Cumulonimbus');
    expect(text('plate')).toContain('Gust front');
  });

  it('puts timeline events in order of time, whatever order the file lists them', () => {
    const svg = standaloneFigure(CHARTS.timeline, { caption: '', save, options: timeline }).node.querySelector('svg')!;
    const whens = [...svg.querySelectorAll('text')].map((t) => t.textContent).filter((t) => /^(1880–1900|1931|Nov 1946)$/.test(t!));
    expect(whens).toEqual(['1880–1900', '1931', 'Nov 1946']);
  });

  it('shows lengths in the reader\'s units, and draws a log axis', () => {
    const o = { quantity: 'length', log: true, items: [{ label: 'Droplet', value: 0.00001 }, { label: 'Raindrop', value: 0.002 }] };
    const metric = standaloneFigure(CHARTS.scale, { caption: '', save, options: o }).node.textContent!;
    const imperial = standaloneFigure(CHARTS.scale, { caption: '', save: emptyProgress('imperial'), options: o }).node.textContent!;
    expect(metric).toContain('2 mm');
    expect(metric).toContain('10 µm');
    expect(imperial).toContain('0.079 in');
    expect(CHARTS.scale.options!(o)).toEqual([]);
  });

  it('takes palette names and CSS colours, and refuses others', () => {
    expect(CHARTS.scale.options!({ items: [{ label: 'a', value: 1, color: 'warm' }, { label: 'b', value: 2, color: '#123' }, { label: 'c', value: 3, color: 'rose' }] })).toEqual([]);
    expect(CHARTS.scale.options!({ items: [{ label: 'a', value: 1, color: 'mauve' }] })[0]).toContain('"color"');
  });

  it('says what is wrong with options it cannot draw', () => {
    expect(CHARTS.scale.options!(undefined)).toEqual(['needs "options" to draw from']);
    expect(CHARTS.scale.options!({ items: [{ label: 'a', value: '3' }] })).toEqual(['item 1: "value" should be a number']);
    expect(CHARTS.timeline.options!({ events: [{ at: 1931, to: 1920, label: 'x' }] })[0]).toContain('"to"');
    expect(CHARTS.tree.options!({ root: { label: 'a', children: [{ note: 'b' }] } })).toEqual(['a > 1: "label" should be text']);
    expect(CHARTS.plate.options!({ ...plate, labels: [{ x: 2, y: 0, text: 'x' }] })[0]).toContain('"x" should be from 0 to 1');
    const wide = { layout: 'down', root: { label: 'r', children: Array.from({ length: 7 }, (_, i) => ({ label: `c${i}` })) } };
    expect(CHARTS.tree.options!(wide)[0]).toContain('too many to draw downward');
    // A lesson's content test catches them, with no code in the course.
    expect(lessonProblems([lesson([{ type: 'diagram', id: 'tree', caption: 'x', options: wide }])], CHARTS)).toHaveLength(1);
    expect(lessonProblems([lesson(CHART_IDS.map((id) => ({ type: 'diagram' as const, id, caption: id, options: OPTIONS[id] })))], CHARTS)).toEqual([]);
  });

  it('draws a tree downward when asked', () => {
    const fig = standaloneFigure(CHARTS.tree, { caption: '', save, options: { ...tree, layout: 'down' } });
    expect(fig.node.querySelector('svg')!.textContent).toContain('Stratus');
    expect(CHARTS.tree.options!({ ...tree, layout: 'down' })).toEqual([]);
  });

  it('fetches a plate\'s image through the course\'s asset resolver', () => {
    const own = charts({ asset: (p) => `https://example.org/${p}` });
    const img = standaloneFigure(own.plate, { caption: '', save, options: plate }).node.querySelector('image')!;
    expect(img.getAttribute('href')).toBe('https://example.org/photos/cb.jpg');
  });

  it('shows every block that uses a chart in the gallery, but one per course figure', () => {
    const lessons = [lesson([
      { type: 'diagram', id: 'scale', caption: 'first', options: scale },
      { type: 'diagram', id: 'scale', caption: 'second', options: { items: [{ label: 'x', value: 1 }] } },
    ])];
    const g = galleryPage({ figures: { scale: CHARTS.scale }, lessons, save, only: null });
    expect(g.figures).toHaveLength(2);
    expect(g.node.textContent).toContain('scale: second');
  });

  it('keeps its words in the course file, which says they are there to edit', () => {
    const file = exportCourse('T', { 'src/data/l.json': lesson([{ type: 'diagram', id: 'timeline', caption: 'x', options: timeline }]) });
    expect(JSON.stringify(file.files)).toContain('Dry ice seeds a cloud');
    expect(file._howTo).toContain('"timeline", "tree", "scale" or "plate"');
  });

  it('wraps words to a width', () => {
    expect(wrap('one two three four five six', 80, 'normal')).toEqual(['one two three', 'four five six']);
    expect(wrap('', 60)).toEqual(['']);
  });
});
