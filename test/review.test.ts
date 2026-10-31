// @vitest-environment happy-dom
// What a course keeps for review (review.ts) and the review page (review-view.ts),
// through defineCourse: a check answered in a lesson comes back on the page.

import { describe, expect, it } from 'vitest';
import { defineCourse } from '../src/app';
import { check } from '../src/check';
import { el } from '../src/dom';
import { prose, type Lesson } from '../src/lesson';
import { emptyProgress } from '../src/progress';
import { checkNoteId, fillFromLessons, lessonDeckName, recordAnswer, stepFor, syncDeck } from '../src/review';
import { shuffle } from '../src/rng';
import { dayAfter, emptyCollection } from '../src/srs';

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;
const settle = () => new Promise((r) => setTimeout(r, 0));

interface Q { ask: string; choices: string[]; answer: number; why: string; photo?: string }
const quizCheck = check((_ctx, options, rng) => ((options?.items ?? []) as Q[]).map((q) => {
  const order = shuffle(q.choices.map((_, k) => k), rng);
  return {
    ask: q.ask, choices: order.map((k) => q.choices[k]), answer: order.indexOf(q.answer), why: q.why,
    ...(q.photo ? { key: q.photo, picture: () => el('div.pic', {}, `photo ${q.photo}`) } : {}),
  };
}));
const items: Q[] = [
  { ask: 'Which cloud rains all day?', choices: ['Nimbostratus', 'Cirrus', 'Cumulus'], answer: 0, why: 'It is thick and low.' },
  { ask: 'What cloud is this?', choices: ['Cirrus', 'Stratus'], answer: 0, why: 'Wispy.', photo: 'p1' },
  { ask: 'What cloud is this?', choices: ['Cirrus', 'Stratus'], answer: 1, why: 'Flat.', photo: 'p2' },
];
const lesson = (id: string, n: number): Lesson => ({
  id, n, title: `About ${id}`, teaches: '', learned: [], next: '', journal: [],
  parts: [{ title: 'Check', blocks: [{ type: 'text', text: 'Now.' }, { type: 'quiz', id: 'check', caption: 'Check', task: 'Answer', options: { items } }] }],
});
const figures = { check: quizCheck };
const naming = { title: 'Skies' };

describe('review.ts', () => {
  it('keeps an answered question with its answer as the first review', () => {
    const l = lesson('a', 1);
    const q = { ask: 'Q?', choices: ['x', 'y'], answer: 1, why: 'Because.', picked: 0, index: 0, seed: 7 };
    const col = recordAnswer(undefined, l, '0.1', 'check', q, naming);
    const id = checkNoteId('a', q);
    expect(col.notes[id]).toMatchObject({ front: 'Q?', back: 'y', choices: ['x', 'y'], answer: 1, extra: 'Because.', source: { kind: 'check', lesson: 'a', at: '0.1', seed: 7, index: 0 } });
    expect(col.decks['lesson:a'].name).toBe('Skies::Lesson 01: About a');
    expect(col.cards[`${id}/0`]).toMatchObject({ type: 'learning', reps: 1 });
    expect(col.revlog[0].rating).toBe(1);
    // Answered again (the lesson taken again): left to the review page.
    expect(recordAnswer(col, l, '0.1', 'check', { ...q, picked: 1 }, naming)).toBe(col);
    expect(lessonDeckName({ ...l, code: 'P2' }, { title: 'Skies', noun: 'Shift' })).toBe('Skies::Shift P2: About a');
  });

  it('tells two questions with the same words apart by their key', () => {
    const base = { ask: 'What cloud is this?', choices: ['Cirrus', 'Stratus'], answer: 0 };
    expect(checkNoteId('a', { ...base, key: 'p1' })).not.toBe(checkNoteId('a', { ...base, key: 'p2' }));
  });

  it('adds the checks of lessons finished before as new cards, once', () => {
    const save = emptyProgress('metric', { radio: false });
    save.lessons.a = { done: true, best: 3, of: 3 };
    const lessons = [lesson('a', 1), lesson('b', 2)];
    const col = fillFromLessons(undefined, lessons, figures, save, naming);
    expect(Object.keys(col.notes)).toHaveLength(3);
    expect(Object.values(col.cards).every((c) => c.type === 'new' && c.deck === 'lesson:a')).toBe(true);
    expect(fillFromLessons(col, lessons, figures, save, naming)).toBe(col);
    // Each made again with its picture.
    const photo = Object.values(col.notes).find((n) => n.id.endsWith(':p2'))!;
    const step = stepFor(photo, lessons, figures, save)!;
    expect(step.ask).toBe('What cloud is this?');
    expect((step.picture!() as HTMLElement).textContent).toBe('photo p2');
  });

  it('brings the quiz deck in a few new cards a day, keeping old Leitner places', () => {
    const save = emptyProgress('metric', { radio: false });
    const now = Date.now();
    save.quiz['c1'] = { box: 3, due: now + 2 * 86400_000 };
    const deck = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, question: `Q${i}`, options: ['a', 'b'], why: 'w' }));
    let col = syncDeck(emptyCollection(now, { newPerDay: 5 }), deck, save, naming, now);
    expect(col.cards['deck:c1/0']).toMatchObject({ type: 'review', interval: 7 });
    expect(Object.values(col.cards).filter((c) => c.type === 'new')).toHaveLength(5);
    col = syncDeck(col, deck, save, naming, now + 1000);
    expect(Object.values(col.cards).filter((c) => c.type === 'new')).toHaveLength(5);
    // Tomorrow, five more join only once today's are met.
    expect(Object.values(syncDeck(col, deck, save, naming, dayAfter(now, 1) + 1000).cards).filter((c) => c.type === 'new')).toHaveLength(5);
  });
});

describe('the review page', () => {
  it('asks again what a lesson\'s check asked, and grades it on Anki\'s buttons', async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '';
    const course = defineCourse({ id: 'skies', title: 'Skies', lessons: [lesson('a', 1)], figures, prose: (t) => prose(t, {}), menu: ['/home', '/quiz', '/settings'] });
    await settle();
    expect([...document.querySelectorAll('.navmenu nav a')].map((o) => o.textContent)).toEqual(['Home', 'Review', 'Settings']);

    course.router.navigate('/lesson/a');
    await settle();
    // Answer the check: the first choice each time.
    for (let i = 0; i < items.length; i++) {
      const choice = document.querySelector<HTMLButtonElement>('.check .answer-list button:not([disabled])')!;
      choice.click();
      document.querySelector<HTMLButtonElement>('.check .actions .btn')!.click();
    }
    const col = course.store.get().review!;
    expect(Object.keys(col.notes)).toHaveLength(3);
    expect(col.revlog).toHaveLength(3);

    // A missed one is due within the minute; pretend the minute has passed.
    course.store.update((s) => ({ ...s, review: { ...s.review!, cards: Object.fromEntries(Object.entries(s.review!.cards).map(([k, c]) => [k, { ...c, due: Date.now() - 1 }])) } }));
    course.router.navigate('/review');
    await settle();
    expect(document.querySelector('main h1')!.textContent).toBe('Review');
    const start = [...document.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent!.startsWith('Study'))!;
    expect(start.textContent).toBe('Study 3 cards');
    start.click();
    const asked = document.querySelector('main .task')!.textContent;
    expect(items.map((q) => q.ask)).toContain(asked);
    const note = Object.values(course.store.get().review!.notes).find((n) => n.front === asked)!;
    const right = [...document.querySelectorAll<HTMLButtonElement>('main .answer-list button')].find((b) => b.textContent === note.back)!;
    right.click();
    const rates = [...document.querySelectorAll<HTMLButtonElement>('.review-rates button')];
    expect(rates.map((b) => b.querySelector('.rate-name')!.textContent)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    const before = course.store.get().review!.revlog.length;
    rates[2].click();
    expect(course.store.get().review!.revlog).toHaveLength(before + 1);
    expect(course.store.get().review!.revlog.at(-1)!.rating).toBe(3);
    // The Anki download is offered.
    document.querySelector<HTMLButtonElement>('.actions .btn')!.click();
    expect(document.querySelector('.review-anki button')!.textContent).toContain('.apkg');
  });
});
