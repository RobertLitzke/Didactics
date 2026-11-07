// @vitest-environment happy-dom
// Live charts set up from a lesson's JSON alone: each builds from its
// options, refuses options it cannot use, keeps its goals, and does what a
// reader would do with it.

import { describe, expect, it } from 'vitest';
import { checkSteps } from '../src/check';
import { standaloneFigure, testContext, type FigureContext } from '../src/figure';
import { lessonProblems, type Lesson } from '../src/lesson';
import { liveCharts, LIVE_CHART_IDS } from '../src/live-charts';
import { liveMapOptionsProblems, makeRelief, maps, mercator, type Relief } from '../src/maps';
import { emptyProgress } from '../src/progress';
import { makeRng } from '../src/rng';

const save = emptyProgress('metric');
const PHOTOS = [
  { id: 'oak-leaf', width: 800, height: 600, author: 'A', license: 'CC0' as const, kind: 'photo' as const, sourceUrl: 'https://example.org/a', source: 'Wikimedia Commons', about: 'An oak leaf' },
  { id: 'maple-leaf', width: 800, height: 600, author: 'B', license: 'CC0' as const, kind: 'photo' as const, sourceUrl: 'https://example.org/b', source: 'Wikimedia Commons', about: 'A maple leaf' },
  { id: 'alder-leaf', width: 800, height: 600, author: 'C', license: 'CC0' as const, kind: 'photo' as const, sourceUrl: 'https://example.org/c', source: 'Wikimedia Commons', about: 'An alder leaf' },
];
const photos = { find: (id: string) => PHOTOS.find((p) => p.id === id), src: (p: { id: string }) => `photos/${p.id}.webp` };
const LIVE = liveCharts({ palette: { leaf: '#3f7d4a' }, photos });

const OPTIONS = {
  hotspots: { photo: 'oak-leaf', spots: [{ x: 0.2, y: 0.3, name: 'Lobe', text: 'A rounded bulge.' }, { x: 0.6, y: 0.8, name: 'Stalk' }, { x: 0.5, y: 0.5, name: 'Midrib' }] },
  compare: { frames: [{ image: 'a.jpg', width: 400, height: 300, label: '1900', text: 'Ice to the lake.' }, { image: 'b.jpg', width: 400, height: 300, label: '2000', credit: 'USGS' }] },
  'timeline-live': { title: 'Glaciers', events: [{ at: 1850, label: 'Ice at its furthest' }, { at: 1910, label: 'Retreat measured', text: 'Stakes in the ice.' }, { at: 2000, label: 'Lake left behind', color: 'leaf' }] },
  'scale-guess': { unit: 'm', items: [{ label: 'Person', value: 2 }, { label: 'Redwood', value: 115 }], guess: { item: 1, ask: 'How tall is the tallest redwood?', options: [30, 115, 400] } },
  groups: { ask: 'Which family?', groups: [{ name: 'Oaks' }, { name: 'Maples', color: 'leaf' }], items: [{ name: 'Garry oak', group: 'Oaks', photo: 'oak-leaf' }, { name: 'Bigleaf maple', group: 1, why: 'Paired seeds.', clue: 'Seeds in winged pairs.' }, { name: 'Vine maple', group: 'Maples' }] },
  'id-key': {
    root: { ask: 'Leaves?', choices: [
      { text: 'Lobed', then: { choices: [{ text: 'Lobes rounded', name: 'Oak' }, { text: 'Lobes pointed', name: 'Maple', about: 'Leaves in pairs.' }] } },
      { text: 'Not lobed', name: 'Alder' },
    ] },
    specimens: [{ name: 'Maple', photo: 'maple-leaf' }, { name: 'Alder' }],
  },
  'id-drill': { items: [{ name: 'Oak', photo: 'oak-leaf' }, { name: 'Maple', photo: 'maple-leaf', why: 'Pointed lobes.' }, { name: 'Alder', photo: 'alder-leaf', more: [{ image: 'alder-2.jpg', width: 3, height: 2 }] }] },
  'clue-board': {
    ideas: [{ name: 'A tree' }, { name: 'A seaweed' }, { name: 'A fungus', text: 'Tubes, no wood.' }],
    clues: [{ name: 'No wood', text: 'Tubes, not wood cells.', rules: ['A tree'] }, { name: 'On land', rules: [1] }],
  },
  loop: { title: 'Rock cycle', stages: [{ name: 'Sediment', how: 'buried' }, { name: 'Rock', note: 'lesson 2', how: 'melted', text: 'Hard.' }, { name: 'Magma', how: 'cooled and worn away', color: 'leaf' }] },
  regroup: {
    follow: 'Fungi',
    views: [
      { label: 'By looks', root: { label: '', children: [{ label: 'Plants', children: [{ label: 'Moss' }, { label: 'Fungi' }] }, { label: 'Animals', children: [{ label: 'Horse' }] }] }, text: 'Fungi stand still.' },
      { label: 'By genes', root: { label: '', children: [{ label: 'Moss', color: 'leaf' }, { label: '', children: [{ label: 'Fungi' }, { label: 'Horse' }] }] }, text: 'Fungi sit with animals.' },
    ],
  },
} as const;

const MULTI = {
  features: [{ name: 'Leaves', values: ['lobed', 'toothed'] }, { name: 'Seeds', values: ['acorn', 'wing', 'cone'] }],
  taxa: [
    { name: 'Oak', traits: { Leaves: 'lobed', Seeds: 'acorn' }, about: 'Acorns.' },
    { name: 'Maple', traits: { Leaves: 'lobed', Seeds: 'wing' }, photo: 'maple-leaf' },
    { name: 'Alder', traits: { Leaves: 'toothed', Seeds: 'cone' } },
    { name: 'Birch', traits: { Leaves: 'toothed', Seeds: ['cone', 'wing'] } },
  ],
};

const GOALS: Record<string, string> = { hotspots: 'explore', compare: 'seen', 'timeline-live': 'end', 'scale-guess': 'guess', groups: 'sorted', 'id-key': 'keyed', 'clue-board': 'clues', loop: 'round', regroup: 'switched' };

const lesson = (blocks: Lesson['parts'][number]['blocks']): Lesson => ({ id: 'l', n: 1, title: 'L', teaches: '', summary: [], parts: [{ title: 'One', blocks }] });
const build = (id: keyof typeof LIVE, goal?: string, options: object = OPTIONS[id as keyof typeof OPTIONS], ctx: FigureContext = testContext(save)) => LIVE[id](ctx, goal, options as Record<string, unknown>);
const click = (n: Element) => n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settled = async (p?: Promise<void>) => {
  let done = false;
  void p?.then(() => (done = true));
  await tick();
  return done;
};

describe('live charts', () => {
  it('builds each from its options, which a lesson can use with their goals', () => {
    const blocks = LIVE_CHART_IDS.map((id) => (id === 'id-drill'
      ? { type: 'quiz' as const, id, caption: id, options: OPTIONS[id] }
      : { type: 'interactive_diagram' as const, id, caption: id, goal: GOALS[id], task: 'Do it', options: OPTIONS[id] as unknown as Record<string, unknown> }));
    expect(lessonProblems([lesson(blocks)], LIVE)).toEqual([]);
    for (const id of LIVE_CHART_IDS) {
      const f = standaloneFigure(LIVE[id], { caption: id, save, options: OPTIONS[id] as unknown as Record<string, unknown> });
      expect(f.node.querySelector('.fig-readout')?.textContent ?? '', id).not.toMatch(/should|needs/);
      expect(LIVE[id].each).toBe(true);
    }
  });

  it('says what is wrong with options it cannot use', () => {
    expect(LIVE.hotspots.options!({ photo: 'nope', spots: [] }).join(' ')).toMatch(/no photo "nope".*spots/);
    expect(LIVE.hotspots.options!({ image: 'a.jpg', width: 2, height: 1, spots: [{ x: 2, y: 0, name: 'X' }] })[0]).toMatch(/"x" should be from 0 to 1/);
    expect(liveCharts().hotspots.options!({ photo: 'oak-leaf', spots: [{ x: 0, y: 0, name: 'A' }] })[0]).toMatch(/liveCharts\(\{ photos \}\)/);
    expect(LIVE.compare.options!({ frames: [{ image: 'a.jpg', width: 1, height: 1, label: 'A' }] })[0]).toMatch(/two or more/);
    expect(LIVE.compare.options!({ ...OPTIONS.compare, guess: { ask: 'Q', options: ['a', 'b'], answer: 3 } })[0]).toMatch(/answer/);
    expect(LIVE['scale-guess'].options!({ ...OPTIONS['scale-guess'], guess: { item: 1, ask: 'Q', options: [1, 2] } })[0]).toMatch(/own value/);
    expect(LIVE.groups.options!({ ...OPTIONS.groups, items: [{ name: 'X', group: 'Birches' }] })[0]).toMatch(/one of the groups/);
    expect(LIVE['id-key'].options!({ root: { choices: [{ text: 'A', name: 'X' }, { text: 'B' }] } })[0]).toMatch(/"then".*"name"/);
    expect(LIVE['id-key'].options!({ ...OPTIONS['id-key'], specimens: [{ name: 'Birch' }] })[0]).toMatch(/the key ends at/);
    expect(LIVE['id-drill'].options!({ items: [{ name: 'Oak', photo: 'oak-leaf' }, { name: 'Oak', photo: 'oak-leaf' }] })[0]).toMatch(/named twice/);
    // Shown in place of the drawing, and the lesson is not held up.
    const h = build('hotspots', 'find', { spots: [] });
    expect(h.node.textContent).toMatch(/needs a "photo"/);
  });

  it('hotspots: explore names each spot and is done once all are tapped', async () => {
    const h = build('hotspots', 'explore');
    const spots = [...h.node.querySelectorAll('.fig-tap')];
    expect(spots).toHaveLength(3);
    expect(h.node.querySelector('image')!.getAttribute('href')).toBe('photos/oak-leaf.webp');
    expect(h.node.querySelector('.credit')!.textContent).toMatch(/A/);
    click(spots[0]);
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('Lobe. A rounded bulge. (2 more to tap.)');
    expect([...h.node.querySelectorAll('text')].map((t) => t.textContent)).toContain('Lobe');
    expect(await settled(h.done)).toBe(false);
    click(spots[1]);
    click(spots[2]);
    expect(await settled(h.done)).toBe(true);
  });

  it('hotspots: find asks for one part at a time and marks a wrong tap', async () => {
    const ctx = testContext(save);
    const h = build('hotspots', 'find', undefined, ctx);
    const readout = h.node.querySelector('.fig-readout')!;
    const names = ['Lobe', 'Stalk', 'Midrib'];
    const spots = [...h.node.querySelectorAll('.fig-tap')];
    expect(spots[0].getAttribute('aria-label')).toBe('Spot 1');
    for (let k = 0; k < 3; k++) {
      const want = names.indexOf(readout.textContent!.match(/(?:Find|find): (\w+)/)![1]);
      const wrong = (want + 1) % 3;
      if (k === 0) {
        click(spots[wrong]);
        expect(readout.textContent).toMatch(new RegExp(`That is the ${names[wrong]}`));
      }
      click(spots[want]);
      expect(readout.textContent).toMatch(new RegExp(`Yes, the ${names[want]}`));
    }
    expect(readout.textContent).toMatch(/All 3 found, with 1 wrong tap/);
    expect(await settled(h.done)).toBe(true);
  });

  it('compare: wipes between two pictures, done once both ends are seen', async () => {
    const h = build('compare', 'seen');
    const input = h.node.querySelector('input')!;
    expect(h.node.querySelectorAll('image')).toHaveLength(2);
    const move = (v: number) => {
      input.value = String(v);
      input.dispatchEvent(new Event('input'));
    };
    move(100);
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('1900. Ice to the lake.');
    expect(await settled(h.done)).toBe(false);
    move(0);
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('2000.');
    expect(await settled(h.done)).toBe(true);
    expect(h.node.querySelector('.credit')!.textContent).toBe('USGS');
  });

  it('compare: steps through three or more, and a guess locks the slider first', async () => {
    const frames = ['1850', '1950', '2050'].map((label) => ({ image: `${label}.jpg`, width: 4, height: 3, label }));
    const h = build('compare', 'seen', { frames, guess: { ask: 'Gone by 2050?', options: ['Yes', 'No'], answer: 0 } });
    const input = h.node.querySelector('input')!;
    expect(input.disabled).toBe(true);
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('Gone by 2050?');
    click(h.node.querySelectorAll('.chip')[0]);
    click(h.node.querySelector('.fig-choices + .btn')!);
    expect(input.disabled).toBe(false);
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    expect(h.node.querySelector('image')!.getAttribute('href')).toBe('2050.jpg');
    expect(await settled(h.done)).toBe(true);
    await tick();
    expect(h.node.querySelector('.chip.right')).not.toBeNull();
  });

  it('timeline-live: plays through time, the latest event told', async () => {
    const h = build('timeline-live', 'end');
    const input = h.node.querySelector('input')!;
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('1850: Ice at its furthest.');
    input.value = '1950';
    input.dispatchEvent(new Event('input'));
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('1910: Retreat measured. Stakes in the ice.');
    expect(h.node.querySelector('.fig-play')).not.toBeNull();
    expect(await settled(h.done)).toBe(false);
    input.value = '2000';
    input.dispatchEvent(new Event('input'));
    expect(await settled(h.done)).toBe(true);
  });

  it('timeline-live: order puts each event on the line as it is tapped in turn', async () => {
    const h = build('timeline-live', 'order');
    const chip = (label: string) => [...h.node.querySelectorAll('.chip')].find((c) => c.textContent === label)!;
    click(chip('Lake left behind'));
    expect(h.node.querySelector('.fig-readout')!.textContent).toMatch(/Not yet/);
    for (const l of ['Ice at its furthest', 'Retreat measured', 'Lake left behind']) click(chip(l));
    expect(h.node.querySelector('.fig-readout')!.textContent).toMatch(/All in order, with 1 wrong tap/);
    expect(h.node.querySelectorAll('.chip.right')).toHaveLength(3);
    expect(await settled(h.done)).toBe(true);
  });

  it('scale-guess: hides one bar until the guess is in, then marks it', async () => {
    const h = build('scale-guess', 'guess');
    const words = () => [...h.node.querySelectorAll('text')].map((t) => t.textContent);
    expect(words()).toContain('?');
    expect(words()).not.toContain('115 m');
    const chips = [...h.node.querySelectorAll('.chip')];
    expect(chips.map((c) => c.textContent)).toEqual(['30 m', '115 m', '400 m']);
    click(chips[0]);
    click(h.node.querySelector('.fig-choices + .btn')!);
    expect(words()).toContain('115 m');
    expect(h.node.querySelector('.chip.wrong')).not.toBeNull();
    expect(await settled(h.done)).toBe(true);
  });

  it('groups: files each thing in its right group, ticked or crossed', async () => {
    const h = build('groups', 'sorted');
    const buttons = [...h.node.querySelectorAll('.fig-row .chip')];
    // The photo on top is credited while it shows.
    const first = h.node.querySelector('svg text')!.textContent;
    expect(!!h.node.querySelector('.fig-credits .credit')).toBe(first === 'Garry oak');
    expect(buttons.map((b) => b.textContent)).toEqual(['Oaks', 'Maples']);
    for (let k = 0; k < 3; k++) click(buttons[0]);
    const words = [...h.node.querySelectorAll('text')].map((t) => t.textContent);
    expect(words).toContain('✓ Garry oak');
    expect(words).toContain('✗ Bigleaf maple');
    expect(words.some((w) => /All 3 sorted: 1 right/.test(w ?? ''))).toBe(true);
    expect(h.node.querySelector('.fig-credits .credit')).toBeNull();
    expect(await settled(h.done)).toBe(true);
  });

  it('id-key: keys out each specimen, and says when a walk ends at the wrong name', async () => {
    const h = build('id-key', 'keyed');
    const choose = (text: string) => click([...h.node.querySelectorAll('.answer-list .btn')].find((b) => b.textContent === text)!);
    const readout = () => h.node.querySelector('.fig-readout')!.textContent;
    expect(readout()).toMatch(/Leaves\? \(1 of 2/);
    choose('Lobed');
    choose('Lobes rounded');
    expect(readout()).toMatch(/leads to Oak, which is not this one/);
    click([...h.node.querySelectorAll('.btn')].find((b) => b.textContent === 'Back')!);
    choose('Lobes pointed');
    expect(readout()).toMatch(/Keyed out: Maple\.Leaves in pairs\./);
    click([...h.node.querySelectorAll('.btn')].find((b) => b.textContent === 'Next one')!);
    choose('Not lobed');
    expect(readout()).toMatch(/Keyed out: Alder/);
    expect(await settled(h.done)).toBe(true);
  });

  it('id-drill: asks each picture with names from the other items, and can be asked again', () => {
    const steps = checkSteps(LIVE['id-drill'])!;
    const make = (seed: number) => steps(testContext(save), OPTIONS['id-drill'] as unknown as Record<string, unknown>, makeRng(seed));
    const qs = make(7);
    expect(qs).toHaveLength(3);
    for (const q of qs) {
      expect(q.choices).toHaveLength(3);
      expect(new Set(q.choices).size).toBe(3);
      expect(['Oak', 'Maple', 'Alder']).toContain(q.choices[q.answer]);
      expect(q.key).toBeTruthy();
    }
    expect(make(7).map((q) => [q.key, q.choices])).toEqual(qs.map((q) => [q.key, q.choices]));
    const maple = qs.find((q) => q.choices[q.answer] === 'Maple')!;
    expect(maple.why).toBe('Pointed lobes.');
    expect((maple.picture!() as HTMLElement).querySelector('img')!.getAttribute('src')).toBe('photos/maple-leaf.webp');
  });

  it('id-drill: hands each answer on for review', () => {
    const answered: unknown[] = [];
    const ctx = { ...testContext(save), answered: (q: unknown) => void answered.push(q) };
    const h = LIVE['id-drill'](ctx, undefined, OPTIONS['id-drill'] as unknown as Record<string, unknown>);
    click(h.node.querySelector('.check .btn')!);
    expect(answered).toHaveLength(1);
    expect((answered[0] as { image: string }).image).toMatch(/photos\/|alder-2/);
  });
});

/** A 41 by 41 grid near 45°N, rising to the east. */
function grid(): Relief {
  const [x0, y0] = mercator(3, 45, 12);
  const z = new Float32Array(41 * 41);
  for (let r = 0; r < 41; r++) for (let c = 0; c < 41; c++) z[r * 41 + c] = c * 3;
  return makeRelief({ width: 41, height: 41, zoom: 12, x0, y0, step: 1, bounds: [3, 44.9, 3.1, 45] }, z);
}

describe('map-live', () => {
  const live = maps({ load: async () => grid() })['map-live'];

  it('wants spots, a flood or stages, and not a flood with stages', () => {
    expect(liveMapOptionsProblems({ relief: 'maps/x' })[0]).toMatch(/needs "spots", "flood" or "stages"/);
    expect(liveMapOptionsProblems({ relief: 'maps/x', flood: { from: 0, to: 10 }, stages: [{ label: 'a' }, { label: 'b' }] })).toContainEqual(expect.stringMatching(/not both/));
    expect(liveMapOptionsProblems({ relief: 'maps/x', flood: { from: 10, to: 0 } })[0]).toMatch(/"to" above "from"/);
    expect(liveMapOptionsProblems({ relief: 'maps/x', stages: [{ label: 'a', lines: [{ points: [[3, 45]] }] }, { label: 'b' }] })[0]).toMatch(/stage 1: line 1/);
  });

  it('taps places, and is done once each is seen', async () => {
    const h = live(testContext(save), 'explore', { relief: 'maps/live-a', spots: [{ lon: 3.02, lat: 44.95, name: 'Low end', text: 'Flat.' }, { lon: 3.08, lat: 44.95, name: 'High end' }] });
    await h.ready;
    const spots = [...h.node.querySelectorAll('.fig-tap')];
    expect(spots).toHaveLength(2);
    click(spots[0]);
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('Low end. Flat. (1 more to tap.)');
    click(spots[1]);
    expect(await settled(h.done)).toBe(true);
  });

  it('raises the water, and plays through stages', async () => {
    const flood = live(testContext(save), 'end', { relief: 'maps/live-b', flood: { from: 0, to: 100, label: 'Sea level' } });
    await flood.ready;
    const input = flood.node.querySelector('input')!;
    input.value = '100';
    input.dispatchEvent(new Event('input'));
    expect(flood.node.querySelector('.fig-readout')!.textContent).toBe('Sea level: 100 m.');
    expect(await settled(flood.done)).toBe(true);

    const stages = live(testContext(save), 'end', { relief: 'maps/live-c', stages: [{ label: 'Ice', labels: [{ lon: 3.05, lat: 44.95, text: 'Ice edge' }] }, { label: 'Lake', text: 'Meltwater.' }] });
    await stages.ready;
    expect([...stages.node.querySelectorAll('text')].map((t) => t.textContent)).toContain('Ice edge');
    const s = stages.node.querySelector('input')!;
    s.value = '1';
    s.dispatchEvent(new Event('input'));
    expect(stages.node.querySelector('.fig-readout')!.textContent).toBe('Lake. Meltwater.');
    expect([...stages.node.querySelectorAll('text')].map((t) => t.textContent)).not.toContain('Ice edge');
    expect(await settled(stages.done)).toBe(true);
  });
});

describe('live charts that reason', () => {
  it('clue board: one button shows the clues in turn, crossing out ideas, done once all are shown', async () => {
    const h = build('clue-board', 'clues');
    const readout = h.node.querySelector('.fig-readout')!;
    const next = () => [...h.node.querySelectorAll('button')].find((b) => /^(Show clue|Start the clues)/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(next().textContent).toBe('Show clue 1: No wood');
    expect(readout.textContent).toMatch(/2 clues one at a time/);
    expect(h.node.textContent).toMatch(/0 of 2 shown/);
    click(next());
    expect(h.node.textContent).toMatch(/out: clue 1/);
    expect(readout.textContent).toBe('Clue 1, No wood: rules out A tree. 2 ideas still fit. 1 more clue to show.');
    expect(next().textContent).toBe('Show clue 2: On land');
    expect(await settled(h.done)).toBe(false);
    click(next());
    expect(readout.textContent).toBe('Only A fungus still fits.');
    expect(await settled(h.done)).toBe(true);
    expect(next().textContent).toBe('Start the clues again');
    click(next());
    expect(h.node.textContent).toMatch(/0 of 2 shown/);
  });

  it('clue board: a guess comes first, the clue button waits for it, and the clues must leave one idea for it', () => {
    const h = build('clue-board', 'clues', { ...OPTIONS['clue-board'], guess: 'Which is it?' });
    const next = [...h.node.querySelectorAll('button')].find((b) => b.textContent === 'Show clue 1: No wood') as HTMLButtonElement;
    expect(next.style.display).toBe('none');
    expect(h.node.querySelector('.fig-readout')!.textContent).toBe('Step 1. Which is it? Tap the idea you think survives, then Lock it in.');
    click([...h.node.querySelectorAll('button')].find((b) => b.textContent === 'A fungus')!);
    click([...h.node.querySelectorAll('button')].find((b) => b.textContent === 'Lock it in')!);
    expect(next.style.display).toBe('');
    expect(h.node.textContent).toMatch(/your guess/);
    expect(LIVE['clue-board'].options!({ ...OPTIONS['clue-board'], clues: [OPTIONS['clue-board'].clues[0]], guess: 'Which?' })[0]).toMatch(/leave one idea standing; they leave 2/);
    expect(LIVE['clue-board'].options!({ ...OPTIONS['clue-board'], clues: [{ name: 'X', rules: ['A whale'] }] })[0]).toMatch(/not one of the ideas/);
  });

  it('loop: tapping or Next goes round, done once every stage is seen', async () => {
    const h = build('loop', 'round');
    const readout = h.node.querySelector('.fig-readout')!;
    const next = [...h.node.querySelectorAll('button')].find((b) => b.textContent === 'Next')!;
    click(h.node.querySelectorAll('.fig-tap')[1]);
    expect(readout.textContent).toBe('2. Rock. Hard. Then melted, it becomes magma.');
    click(next);
    expect(readout.textContent).toMatch(/^3\. Magma\..*becomes sediment/);
    expect(await settled(h.done)).toBe(false);
    click(next);
    expect(await settled(h.done)).toBe(true);
    expect(LIVE.loop.options!({ stages: [{ name: 'A' }, { name: 'B' }] })[0]).toMatch(/three or more/);
  });

  it('loop: "next" builds the loop arrow by arrow, marking a wrong pick', async () => {
    const h = build('loop', 'next');
    const readout = h.node.querySelector('.fig-readout')!;
    const pick = (name: string) => click([...h.node.querySelectorAll('button.chip')].find((b) => b.textContent === name)!);
    expect(h.node.querySelector('.fig-ask')!.textContent).toBe('What does sediment become?');
    pick('Magma');
    expect(readout.textContent).toMatch(/Not magma/);
    pick('Rock');
    expect(readout.textContent).toMatch(/Buried, sediment becomes rock/);
    pick('Magma');
    pick('Sediment');
    expect(readout.textContent).toMatch(/loop is closed, with 1 wrong pick/);
    expect(await settled(h.done)).toBe(true);
  });

  it('regroup: switches trees, keeps a followed leaf bold with its kin, done at the last view', async () => {
    const h = build('regroup', 'switched');
    const readout = h.node.querySelector('.fig-readout')!;
    const bold = () => [...h.node.querySelectorAll('text')].filter((t) => t.classList.contains('bold')).map((t) => t.textContent);
    expect(readout.textContent).toBe('By looks. Fungi stand still.');
    expect(bold()).toEqual(expect.arrayContaining(['Moss', 'Fungi']));
    expect(bold()).not.toContain('Horse');
    click([...h.node.querySelectorAll('button.chip')][1]);
    expect(readout.textContent).toBe('By genes. Fungi sit with animals.');
    expect(bold()).toEqual(expect.arrayContaining(['Fungi', 'Horse']));
    expect(bold()).not.toContain('Moss');
    expect(await settled(h.done)).toBe(true);
    expect(LIVE.regroup.options!({ views: [OPTIONS.regroup.views[0], { label: 'X', root: { label: '', children: [{ label: 'Moss' }, { label: 'Oak' }] } }] })[0]).toMatch(/same leaves/);
  });

  it('id-key entered anywhere: ticks narrow the candidates in any order', async () => {
    const h = build('id-key', 'keyed', MULTI);
    const readout = h.node.querySelector('.fig-readout')!;
    const tickOn = (v: string) => click([...h.node.querySelectorAll('button.chip')].find((b) => b.textContent === v)!);
    expect(readout.textContent).toMatch(/4 of 4 fit/);
    tickOn('wing');
    expect(readout.textContent).toMatch(/2 of 4 fit/);
    tickOn('toothed');
    expect(readout.textContent).toBe('Only Birch fits.');
    expect(await settled(h.done)).toBe(true);
    tickOn('lobed');
    expect(readout.textContent).toBe('Only Maple fits.');
    expect(LIVE['id-key'].options!({ ...MULTI, taxa: [{ name: 'X', traits: { Bark: 'grey' } }, MULTI.taxa[0]] })[0]).toMatch(/"Bark" is not one of the features/);
    expect(LIVE['id-key'].options!({ ...MULTI, root: OPTIONS['id-key'].root })[0]).toMatch(/both "root" and "features"/);
  });

  it('id-key entered anywhere: with specimens, each must narrow to its own name', async () => {
    const h = build('id-key', 'keyed', { ...MULTI, specimens: [{ name: 'Oak' }, { name: 'Alder', hint: 'by the creek' }] });
    const readout = h.node.querySelector('.fig-readout')!;
    const tickOn = (v: string) => click([...h.node.querySelectorAll('button.chip')].find((b) => b.textContent === v)!);
    tickOn('toothed');
    expect(readout.textContent).toMatch(/rules out the right one/);
    tickOn('lobed');
    tickOn('acorn');
    expect(readout.textContent).toBe('✓Keyed out: Oak. Acorns.');
    click([...h.node.querySelectorAll('button')].find((b) => b.textContent === 'Next one')!);
    expect(readout.textContent).toMatch(/2 of 2: by the creek/);
    tickOn('cone');
    tickOn('toothed');
    expect(readout.textContent).toMatch(/2 still fit/);
    expect(await settled(h.done)).toBe(false);
  });
});
