// @vitest-environment happy-dom
// A guess marked plainly right or wrong (figure.ts choices, guessFirst), and
// a live figure asked as a flash card on the review page (review.ts,
// review-view.ts), kept away from the review of every course (review-all.ts).

import { describe, expect, it } from 'vitest';
import { defineCourse } from '../src/app';
import { choices, figure, frame, guessFirst, slider, startRng, testContext, type FigureContext } from '../src/figure';
import { prose, type Lesson } from '../src/lesson';
import { emptyProgress } from '../src/progress';
import { fillFigureCards, figureNoteId, isFigureNote } from '../src/review';
import { askableHere, figuresWaiting } from '../src/review-all';
import { between, makeRng } from '../src/rng';
import { addNote, emptyCollection } from '../src/srs';

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Doubling: a number from the seed, and a guess of what twice it is. */
const doubling = figure(['look'], (_ctx, t) => {
  const f = frame(100, 50);
  const rng = startRng(t);
  const n = between(rng, 2, 9, 1);
  const s = slider('n', { min: 1, max: 10, value: n, show: String, onInput: () => {} });
  f.controls.append(s.node);
  guessFirst(t, f, {
    ask: `What is twice ${n}?`,
    options: [String(2 * n), String(2 * n + 1)],
    answer: 0,
    sliders: [s],
    after: () => t.done(),
  });
  return f.node;
}, { card: { front: 'Double a number.', back: 'Twice n is 2n.' } });

describe('marking a guess', () => {
  it('makes the pick stand out, then green or red with the right one ringed', () => {
    const c = choices(['a', 'b', 'c'], () => {});
    c.pick(2);
    c.freeze(true);
    expect(c.node.classList.contains('frozen')).toBe(true);
    expect(c.node.querySelector('.on')!.getAttribute('aria-label')).toBe('Your guess: c');
    expect(c.mark(1)).toBe(false);
    const chips = [...c.node.querySelectorAll('.chip')];
    expect(chips.map((x) => [...x.classList].filter((k) => ['right', 'wrong', 'answer'].includes(k)).join())).toEqual(['', 'answer', 'wrong']);
    expect(c.node.querySelector('.fig-verdict.wrong')!.textContent).toContain('The answer: b');
    expect(c.mark(2)).toBe(true);
    expect(c.node.querySelectorAll('.fig-verdict')).toHaveLength(1);
    expect(c.node.querySelector('.fig-verdict.right')).not.toBeNull();
  });

  it('marks a guessFirst guess as it is locked in, or when the task is done', async () => {
    for (const reveal of ['lock', 'done'] as const) {
      const ctx = testContext(emptyProgress('metric'));
      let done!: () => void;
      const fig = figure(['g'], (_c, t) => {
        const f = frame(10, 10);
        done = t.done;
        guessFirst(t, f, { ask: 'Which?', options: ['x', 'y'], answer: 1, reveal, sliders: [], after: () => {} });
        return f.node;
      });
      const node = fig(ctx, 'g').node;
      node.querySelectorAll<HTMLButtonElement>('.chip')[0].click();
      node.querySelector<HTMLButtonElement>('.btn')!.click();
      await settle();
      expect(!!node.querySelector('.fig-verdict.wrong'), reveal).toBe(reveal === 'lock');
      done();
      await settle();
      expect(node.querySelector('.fig-verdict.wrong')).not.toBeNull();
      ctx.close();
    }
  });

  it('asks a card afresh from its seed and gives its verdict', async () => {
    const verdicts: boolean[] = [];
    const ctx: FigureContext = { ...testContext(emptyProgress('metric')), memo: { restored: false, kept: 1, keep: () => {} }, card: { seed: 5, verdict: (r) => verdicts.push(r) } };
    const node = doubling(ctx, 'look').node;
    await settle();
    // The kept guess is not put back on a card.
    expect(node.querySelector('.fig-choices.frozen')).toBeNull();
    const n = between(makeRng(5), 2, 9, 1);
    expect(node.querySelector('.fig-readout')!.textContent).toBe(`What is twice ${n}?`);
    node.querySelectorAll<HTMLButtonElement>('.chip')[0].click();
    node.querySelector<HTMLButtonElement>('.btn')!.click();
    expect(verdicts).toEqual([true]);
  });
});

const lesson: Lesson = {
  id: 'a', n: 1, title: 'Twice', teaches: '', summary: [],
  parts: [{ title: 'One', blocks: [{ type: 'interactive_diagram', id: 'doubling', caption: 'Doubling', goal: 'look', task: 'Guess' }] }],
};

describe('figure cards', () => {
  it('join once their lesson is done, as notes only their course can ask', () => {
    const save = emptyProgress('metric');
    const naming = { title: 'Sums' };
    expect(Object.keys(fillFigureCards(undefined, [lesson], { doubling }, save, naming).notes)).toHaveLength(0);
    const done = { ...save, lessons: { a: { done: true, best: 0, of: 0 } } };
    const col = fillFigureCards(undefined, [lesson], { doubling }, done, naming);
    const note = col.notes[figureNoteId('a', 'doubling')];
    expect(note).toMatchObject({ front: 'Double a number.', back: 'Twice n is 2n.', drawing: true, source: { kind: 'figure', lesson: 'a', figure: 'doubling' } });
    expect(isFigureNote(note)).toBe(true);
    expect(fillFigureCards(col, [lesson], { doubling }, done, naming)).toBe(col);
    // The review of every course leaves it to the course.
    const mixed = addNote(col, 'lesson:a', { id: 'other', front: 'Q', back: 'A' });
    expect(Object.keys(askableHere(mixed).cards)).toEqual(['other/0']);
    expect(figuresWaiting({ sums: mixed })).toEqual({ sums: 1 });
    expect(Object.keys(askableHere(emptyCollection()).cards)).toHaveLength(0);
  });

  it('are worked on the review page: guess, verdict, Anki\'s buttons', async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '';
    const course = defineCourse({ id: 'sums', title: 'Sums', lessons: [lesson], figures: { doubling }, prose: (t) => prose(t, {}) });
    course.store.update((s) => ({ ...s, lessons: { ...s.lessons, a: { done: true, best: 0, of: 0 } } }));
    await settle();
    course.router.navigate('/review');
    await settle();
    const start = [...document.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent!.startsWith('Study'))!;
    expect(start.textContent).toBe('Study 1 cards');
    start.click();
    expect(document.querySelector('main .task')!.textContent).toBe('Double a number.');
    const fig = document.querySelector('main figure.fig')!;
    fig.querySelectorAll<HTMLButtonElement>('.chip')[1].click();
    fig.querySelector<HTMLButtonElement>('.fig-controls > .btn')!.click();
    expect(fig.querySelector('.fig-verdict.wrong')).not.toBeNull();
    expect(document.querySelector('.review-figure-after .verdict.bad')!.textContent).toContain('Twice n is 2n.');
    const rates = [...document.querySelectorAll<HTMLButtonElement>('.review-rates button')];
    expect(rates.map((b) => b.querySelector('.rate-name')!.textContent)).toEqual(['Again']);
    rates[0].click();
    expect(course.store.get().review!.revlog.at(-1)!.rating).toBe(1);
  });
});
