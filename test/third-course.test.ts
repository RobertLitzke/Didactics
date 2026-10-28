// @vitest-environment happy-dom
// Gaps found moving a third course (Circuitry) onto Didactics: the overflow
// strip and SVGs, a reference page, figures outside a lesson, Settings with
// no photos, the lesson count, fixed units, an empty quiz.

import { describe, expect, it } from 'vitest';
import { readCourse, upgradeReference } from '../src/course';
import { el, svg } from '../src/dom';
import { figure, frame, quiz, slider, standaloneFigure, testContext } from '../src/figure';
import { lessonView, prose, type Lesson } from '../src/lesson';
import { watchOverflow } from '../src/overflow';
import { emptyProgress, migrateProgress, type Progress } from '../src/progress';
import { quizView } from '../src/quiz-view';
import { referenceProblems, referenceShapeProblems, referenceView, type RefSection } from '../src/reference';
import { settingsView } from '../src/settings';
import { createStore } from '../src/store';

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;

const store = (key: string) => createStore({ key, empty: () => emptyProgress('metric', { radio: false }), migrate: (r) => migrateProgress(r, emptyProgress('metric', { radio: false })) });
const nav = { params: {}, navigate: () => {}, replace: () => {} };

const push = figure(['far'], (ctx, t) => {
  const f = frame(200, 100, 2);
  f.readout.textContent = 'Not pushed.';
  f.controls.append(slider('Push', 0, 10, 1, 0, String, (v) => { if (v >= 8) { ctx.score(1, 1); t.done(); } }).node);
  return f.node;
});

describe('the overflow strip', () => {
  it('measures an svg, not the shapes it clips', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = document.getElementById('app')!;
    const s = svg('svg', { viewBox: '0 0 10 10' }, svg('rect', { width: 5000, height: 5 }));
    app.append(s);
    const wide = (node: Element, right: number) => (node.getBoundingClientRect = () => ({ width: right, right, left: 0, top: 0, bottom: 0, height: 1, x: 0, y: 0, toJSON() {} }));
    wide(s, 100);
    wide(s.firstElementChild!, 9000);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 400 });
    const timers: (() => void)[] = [];
    const real = window.setInterval;
    window.setInterval = ((fn: () => void) => (timers.push(fn), 0)) as typeof window.setInterval;
    watchOverflow();
    window.setInterval = real;
    timers[0]();
    expect((document.querySelector('.overflow-alarm') as HTMLElement).hidden).toBe(true);
    wide(s, 900);
    timers[0]();
    expect(document.querySelector('.overflow-alarm')!.textContent).toContain('<svg>');
  });
});

describe('a figure outside a lesson', () => {
  it('captions it, runs its task, and closes', async () => {
    const fig = standaloneFigure(push, { caption: 'A block', save: emptyProgress(), goal: 'far' });
    expect(fig.node.matches('figure.fig')).toBe(true);
    expect(fig.node.querySelector('.fig-text')!.firstElementChild!.textContent).toBe('A block');
    const input = fig.node.querySelector('input') as HTMLInputElement;
    input.value = '9';
    input.dispatchEvent(new Event('input'));
    await fig.done;
    await new Promise((r) => setTimeout(r));
    expect(fig.node.classList.contains('done')).toBe(true);
    fig.close();
  });

  it('gives a still its own text box, and a test context collects scores', () => {
    const still = Object.assign(() => ({ node: el('div.still') }), {});
    const fig = standaloneFigure(still, { caption: 'Just a picture', save: emptyProgress() });
    expect(fig.node.lastElementChild!.matches('.fig-text')).toBe(true);
    const ctx = testContext(emptyProgress());
    const q = quiz((c, t) => el('button', { onclick: () => { c.score(2, 3); t.done(); } }));
    (q(ctx).node as HTMLButtonElement).click();
    expect(ctx.scores).toEqual([[2, 3]]);
    ctx.close();
    expect(ctx.closed.aborted).toBe(true);
  });
});

describe('the reference page', () => {
  type Symbols = { type: 'symbols'; items: { name: string }[] };
  const sections: RefSection<import('../src/reference').RefBlock | Symbols>[] = [
    { id: 'ohm', title: "Ohm's law", summary: 'V, I and R', lesson: 'flow', blocks: [
      { type: 'text', text: 'A **rule**.' },
      { type: 'table', columns: ['To find', 'Formula'], rows: [['Voltage', 'V = I × R']] },
      { type: 'terms', items: [{ term: 'Energy', means: 'Wh' }] },
      { type: 'steps', items: ['Measure', 'Divide'] },
      { type: 'interactive_diagram', id: 'push', caption: 'Push it' },
      { type: 'diagram', id: 'later', caption: 'Not drawn yet' },
      { type: 'symbols', items: [{ name: 'Resistor' }] },
    ] },
    { id: 'pedals', title: 'Pedals', summary: 'Effects', lesson: 'fuzz', blocks: [] },
  ];
  const lessons = [{ id: 'flow', n: 1, title: 'What flows' }, { id: 'fuzz', n: 11, title: 'Fuzz' }];

  it('draws shared blocks, the course’s own, and sections still to come', () => {
    const root = el('div');
    const close = referenceView({
      sections, lessons, store: store('ref'), figures: { push }, prose: (t) => prose(t, { ink: '#000' }),
      blocks: { symbols: (b) => el('ul.symbols', {}, b.items.map((s) => el('li', {}, s.name))) },
    })(root, nav);
    expect(root.querySelector('.ref-table td')!.textContent).toBe('Voltage');
    expect(root.querySelector('.ref-section b')!.textContent).toBe('rule');
    expect(root.querySelector('[data-figure=push] .fig-lead')!.textContent).toBe('Push it');
    expect(root.querySelector('[data-figure=later] .fig-placeholder')).not.toBeNull();
    expect(root.querySelector('.symbols li')!.textContent).toBe('Resistor');
    expect(root.querySelector('.from-lesson a')!.getAttribute('href')).toBe('#/lesson/flow');
    expect(root.querySelector('#ref-pedals')!.textContent).toContain('Comes with lesson 11, “Fuzz”.');
    expect([...root.querySelectorAll('.contents li')].map((l) => l.className)).toEqual(['', 'soon']);
    if (typeof close === 'function') close();
  });

  it('finds what is wrong with a reference file', () => {
    expect(referenceProblems(sections, { figures: { push }, lessons, blocks: ['symbols'], allowPlaceholders: true })).toEqual([]);
    const bad: RefSection<{ type: string }>[] = [
      { id: 'a', title: 'A', summary: '', lesson: 'nope', blocks: [{ type: 'pictures' }, { type: 'glossary' }, { type: 'diagram', id: 'push', caption: '' } as { type: string }] },
      { id: 'a', title: 'A again', summary: '', blocks: [] },
    ];
    expect(referenceProblems(bad, { figures: { push }, lessons })).toEqual([
      'reference "a": no lesson "nope"',
      'reference "a": no renderer for "pictures" blocks',
      'reference "a": a glossary block, but the page is given no glossary',
      'reference "a": push should have "type": "interactive_diagram", not "diagram"',
      'reference "a": another section has this id',
    ]);
    expect(referenceShapeProblems({ sections: [{ id: 'x', title: 'X', summary: 's', blocks: [{ type: 'table', columns: ['a', 'b'], rows: [['1']] }, {}] }] }, 'ref.json')).toEqual([
      'ref.json, section "x", block 1: every row should have one entry per column',
      'ref.json, section "x", block 2: a block needs a "type"',
    ]);
  });

  it('upgrades the old kind/figure shape, and the course file checks it', () => {
    const old = { sections: [{ id: 's', title: 'S', summary: 'x', lesson: 'flow', blocks: [{ kind: 'figure', figure: 'loop', caption: 'c' }, { kind: 'symbols', items: [] }, { kind: 'text', text: 't' }] }] };
    expect(upgradeReference(old).sections[0].blocks).toEqual([{ type: 'interactive_diagram', id: 'loop', caption: 'c' }, { type: 'symbols', items: [] }, { type: 'text', text: 't' }]);
    expect((upgradeReference(old, () => 'diagram').sections[0].blocks[0] as unknown as { type: string }).type).toBe('diagram');
    const course = (files: Record<string, unknown>) => ({ format: 'didactics-course', version: 1, files });
    expect(readCourse(course({ 'src/data/reference.json': upgradeReference(old) })).problems).toEqual([]);
    expect(readCourse(course({ 'src/data/reference.json': old })).problems).toHaveLength(3);
  });
});

describe('Settings in a course with no photos', () => {
  it('says nothing of photos about the one-file copy, and takes its own words', () => {
    const s = store('settings');
    const words = (o: Parameters<typeof settingsView<Progress>>[0]) => {
      const root = el('div');
      settingsView(o)(root, nav);
      return [...root.querySelectorAll('h2')].find((h) => h.textContent === 'The app as one file')!.nextElementSibling!.textContent!;
    };
    const base = { store: s, empty: () => emptyProgress('metric', { radio: false }), appName: 'Circuitry', saveFile: 'c.json' };
    expect(words({ ...base, oneFile: { href: 'c.html', name: 'c.html' } })).not.toMatch(/photo/);
    expect(words({ ...base, oneFile: { href: 'c.html', name: 'c.html' }, offline: { folder: 'photos/', total: 3, noun: 'photos' } })).toContain('Everything but the photos');
    expect(words({ ...base, oneFile: { href: 'c.html', name: 'c.html', text: 'Our words.' } })).toBe('Our words.');
  });
});

describe('the lesson count', () => {
  const lesson = (id: string, n: number, written = true): Lesson => ({
    id, n, title: id, teaches: '', learned: [], next: '', journal: [], coming: !written || undefined,
    parts: written ? [{ title: 'One', blocks: [{ type: 'text', text: 'Hi.' }] }] : [],
  });
  const eyebrow = (lessons: Lesson[], of?: (l: Lesson) => number) => {
    const root = el('div');
    lessonView({ lessons, figures: {}, store: store('count'), prose: (t) => prose(t, { ink: '#000' }), of })(root, { ...nav, params: { id: 'b' } });
    return root.querySelector('.article-intro .eyebrow')!.textContent;
  };

  it('counts only written lessons, or what the course says', () => {
    const lessons = [lesson('a', 1), lesson('b', 2), lesson('c', 3, false), lesson('d', 4, false)];
    expect(eyebrow(lessons)).toBe('Lesson 2 of 2');
    expect(eyebrow(lessons, () => 10)).toBe('Lesson 2 of 10');
  });
});

describe('a course with one unit system', () => {
  it('keeps its units whatever was stored, and Settings offers no switch', () => {
    const empty = emptyProgress('metric', { radio: false, fixedUnits: true });
    expect(migrateProgress({ units: 'imperial', name: 'Rob' }, empty)).toMatchObject({ units: 'metric', name: 'Rob', fixedUnits: true });
    expect(migrateProgress({ units: 'imperial' }, emptyProgress('metric', { radio: false })).units).toBe('imperial');
    const s = createStore({ key: 'fixed', empty: () => empty, migrate: (r) => migrateProgress(r, empty) });
    const root = el('div');
    settingsView({ store: s, empty: () => empty, appName: 'C', saveFile: 'c.json', units: { label: 'Units', imperial: 'ft', metric: 'm' } })(root, nav);
    expect(root.textContent).not.toContain('Units');
  });
});

describe('an empty quiz', () => {
  it('says the course’s words instead of an empty tally', () => {
    const root = el('div');
    quizView({ deck: [], store: store('quiz'), blurb: 'Cards.', empty: 'Flash cards arrive with the first written lesson.' })(root, nav);
    expect(root.querySelector('.quiz-empty')!.textContent).toBe('Flash cards arrive with the first written lesson.');
    expect(root.querySelector('.quiz-tally')).toBeNull();
    const locked = el('div');
    quizView({ deck: [{ id: 'c', question: '?', options: ['a', 'b'], why: '', after: 'l1' }], store: store('quiz2'), blurb: 'Cards.' })(locked, nav);
    expect(locked.querySelector('.quiz-empty')!.textContent).toContain('each lesson adds its cards');
  });
});
