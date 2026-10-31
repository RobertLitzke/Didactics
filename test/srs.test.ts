import { describe, expect, it } from 'vitest';
import {
  addNote, answer, bury, dayAfter, dayCounts, dayStart, DAY, emptyCollection, ensureDeck, forget, formatGap, fromLeitner,
  fsrs, fuzzRange, migrateCollection, MINUTE, nextCard, preview, Rating, removeNote, reviewAhead, sm2, studyQueue, suspend, totals, weave,
  type Collection,
} from '../src/srs';

// Noon on a Tuesday, local time: well clear of the 4 am rollover.
const T0 = new Date(2026, 9, 27, 12, 0, 0).getTime();

function withNotes(n: number, config: Collection['config'] = {}): Collection {
  let col = ensureDeck(emptyCollection(T0, config), 'd', 'Course::Deck', T0);
  for (let i = 0; i < n; i++) col = addNote(col, 'd', { id: `n${i}`, front: `Q${i}`, choices: ['right', 'wrong'], answer: 0, extra: 'because' }, T0 + i);
  return col;
}

describe('notes and cards', () => {
  it('adds a note with one new card, and keeps it as it is on adding it again', () => {
    const col = withNotes(1);
    expect(col.notes.n0).toMatchObject({ model: 'choice', front: 'Q0', back: 'right', choices: ['right', 'wrong'], answer: 0, extra: 'because' });
    expect(col.notes.n0.guid).toHaveLength(10);
    expect(col.cards['n0/0']).toMatchObject({ type: 'new', queue: 'new', deck: 'd', reps: 0 });
    const again = addNote(col, 'd', { id: 'n0', front: 'Q0', choices: ['right', 'wrong'], answer: 0, extra: 'because' }, T0 + 99);
    expect(again).toBe(col);
  });

  it('updates the words of a note without touching its card', () => {
    let col = answer(withNotes(1), 'n0/0', Rating.Good, T0);
    const card = col.cards['n0/0'];
    col = addNote(col, 'd', { id: 'n0', front: 'Q0 edited', choices: ['right', 'wrong'], answer: 0 }, T0 + 5);
    expect(col.notes.n0.front).toBe('Q0 edited');
    expect(col.cards['n0/0']).toBe(card);
  });

  it('removes a note with its cards and log', () => {
    let col = answer(withNotes(2), 'n0/0', Rating.Good, T0);
    col = removeNote(col, 'n0');
    expect(col.notes.n0).toBeUndefined();
    expect(col.cards['n0/0']).toBeUndefined();
    expect(col.revlog).toHaveLength(0);
    expect(col.cards['n1/0']).toBeDefined();
  });

  it('never changes the collection it was given', () => {
    const col = withNotes(2);
    const before = JSON.stringify(col);
    answer(col, 'n0/0', Rating.Again, T0);
    suspend(col, 'n1/0', true, T0);
    removeNote(col, 'n1');
    expect(JSON.stringify(col)).toBe(before);
  });
});

describe('days', () => {
  it('starts a day at the rollover hour', () => {
    expect(new Date(dayStart(T0)).getHours()).toBe(4);
    const early = new Date(2026, 9, 27, 2, 0).getTime();
    expect(new Date(dayStart(early)).getDate()).toBe(26);
    expect(dayAfter(T0, 3) - dayStart(T0)).toBeCloseTo(3 * DAY, -5);
  });
});

describe('SM-2', () => {
  const s = sm2({ fuzz: false });
  const at = (col: Collection) => col.cards['n0/0'];

  it('walks a new card through the learning steps to review', () => {
    let col = withNotes(1, { scheduler: 'sm2', fuzz: false });
    col = answer(col, 'n0/0', Rating.Good, T0, { scheduler: s });
    expect(at(col)).toMatchObject({ type: 'learning', step: 1, due: T0 + 10 * MINUTE, ease: 2.5, reps: 1 });
    col = answer(col, 'n0/0', Rating.Good, T0 + 10 * MINUTE, { scheduler: s });
    expect(at(col)).toMatchObject({ type: 'review', queue: 'review', interval: 1, due: dayAfter(T0, 1) });
  });

  it('gives Again, Hard and Easy their delays on a new card', () => {
    const col = withNotes(1);
    const p = preview(col, 'n0/0', T0, s);
    expect(p[Rating.Again]).toBe(MINUTE);
    expect(p[Rating.Hard]).toBe(5.5 * MINUTE);
    expect(p[Rating.Good]).toBe(10 * MINUTE);
    expect(p[Rating.Easy]).toBe(dayAfter(T0, 4) - T0);
  });

  it('grows a review card by its ease, and lapses it to relearning', () => {
    let col = withNotes(1);
    col = answer(col, 'n0/0', Rating.Easy, T0, { scheduler: s });
    expect(at(col).interval).toBe(4);
    const day4 = dayAfter(T0, 4) + 8 * 3600_000;
    const p = preview(col, 'n0/0', day4, s);
    expect(p[Rating.Hard]).toBeLessThan(p[Rating.Good]);
    expect(p[Rating.Good]).toBeLessThan(p[Rating.Easy]);
    col = answer(col, 'n0/0', Rating.Good, day4, { scheduler: s });
    expect(at(col).interval).toBe(10);
    col = answer(col, 'n0/0', Rating.Again, dayAfter(day4, 10) + 3600_000, { scheduler: s });
    expect(at(col)).toMatchObject({ type: 'relearning', queue: 'learning', lapses: 1, interval: 1 });
    expect(at(col).ease).toBeCloseTo(2.3);
    col = answer(col, 'n0/0', Rating.Good, dayAfter(day4, 10) + 2 * 3600_000, { scheduler: s });
    expect(at(col)).toMatchObject({ type: 'review', interval: 1 });
  });

  it('logs every answer as Anki does', () => {
    let col = withNotes(1);
    col = answer(col, 'n0/0', Rating.Good, T0, { scheduler: s, took: 4200 });
    col = answer(col, 'n0/0', Rating.Good, T0, { scheduler: s });
    expect(col.revlog).toHaveLength(2);
    expect(col.revlog[0]).toMatchObject({ id: T0, card: 'n0/0', rating: 3, type: 'new', took: 4200 });
    expect(col.revlog[1].id).toBe(T0 + 1);
    expect(col.revlog[1]).toMatchObject({ type: 'learning', interval: 1 });
  });

  it('tags a card that keeps lapsing as a leech', () => {
    let col = withNotes(1, { leech: 2, relearnSteps: [] });
    let t = T0;
    col = answer(col, 'n0/0', Rating.Easy, t, { scheduler: s });
    for (let i = 0; i < 2; i++) {
      t = col.cards['n0/0'].due + 3600_000;
      col = answer(col, 'n0/0', Rating.Again, t, { scheduler: sm2({ relearnSteps: [] }) });
    }
    expect(col.notes.n0.tags).toContain('leech');
  });

  it('fuzzes an interval within Anki\'s range, the same for the same answer', () => {
    expect(fuzzRange(2)).toEqual([2, 2]);
    const [lo, hi] = fuzzRange(30);
    expect(lo).toBeLessThan(30);
    expect(hi).toBeGreaterThan(30);
    const fz = sm2();
    const col = answer(withNotes(1), 'n0/0', Rating.Easy, T0, { scheduler: fz });
    const later = dayAfter(T0, 4) + 3600_000;
    expect(preview(col, 'n0/0', later, fz)).toEqual(preview(col, 'n0/0', later, fz));
  });
});

describe('FSRS', () => {
  const f = fsrs({ fuzz: false });
  it('learns, graduates, and keeps a memory', () => {
    let col = withNotes(1);
    col = answer(col, 'n0/0', Rating.Good, T0, { scheduler: f });
    const c1 = col.cards['n0/0'];
    expect(c1.type).toBe('learning');
    expect(c1.due - T0).toBe(10 * MINUTE);
    expect(c1.stability).toBeGreaterThan(0);
    expect(c1.difficulty).toBeGreaterThan(0);
    col = answer(col, 'n0/0', Rating.Good, T0 + 10 * MINUTE, { scheduler: f });
    const c2 = col.cards['n0/0'];
    expect(c2.type).toBe('review');
    expect(c2.interval).toBeGreaterThanOrEqual(1);
    expect(c2.due).toBe(dayAfter(T0, c2.interval));
  });

  it('spaces Again < Hard < Good < Easy on a review card', () => {
    let col = withNotes(1);
    col = answer(col, 'n0/0', Rating.Easy, T0, { scheduler: f });
    const t = col.cards['n0/0'].due + 3600_000;
    const p = preview(col, 'n0/0', t, f);
    expect(p[1]).toBeLessThan(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
    col = answer(col, 'n0/0', Rating.Again, t, { scheduler: f });
    expect(col.cards['n0/0']).toMatchObject({ type: 'relearning', lapses: 1 });
  });

  it('is the default scheduler', () => {
    const col = answer(withNotes(1), 'n0/0', Rating.Good, T0);
    expect(col.cards['n0/0'].stability).toBeDefined();
  });
});

describe('studying', () => {
  it('deals new cards up to the day\'s limit', () => {
    const col = withNotes(30);
    expect(dayCounts(col, T0)).toEqual({ new: 20, learning: 0, review: 0 });
    expect(studyQueue(col, T0)).toHaveLength(20);
    expect(studyQueue(col, T0, { limit: 5 })).toHaveLength(5);
  });

  it('counts the new cards met today against the limit', () => {
    let col = withNotes(30, { newPerDay: 3 });
    col = answer(col, 'n0/0', Rating.Good, T0);
    expect(dayCounts(col, T0 + 1).new).toBe(2);
    expect(dayCounts(col, T0 + 1).learning).toBe(1);
    expect(dayCounts(col, dayAfter(T0, 1) + 1).new).toBe(3);
  });

  it('puts due learning cards first, and weaves new ones through the reviews', () => {
    let col = withNotes(10, { fuzz: false });
    for (let i = 0; i < 6; i++) col = answer(col, `n${i}/0`, Rating.Easy, T0);
    col = answer(col, 'n9/0', Rating.Again, T0);
    const later = dayAfter(T0, 30) + 3600_000;
    col = answer(col, 'n9/0', Rating.Again, later - MINUTE);
    const q = studyQueue(col, later, { limit: 8, newShare: 0.3 });
    expect(q[0]).toBe('n9/0');
    expect(q.slice(1).filter((id) => col.cards[id].type === 'new')).toHaveLength(2);
    expect(col.cards[q[1]].type).toBe('review');
    expect(weave<number | string>([1, 2, 3, 4], ['a', 'b'])).toEqual([1, 2, 'a', 3, 'b', 4]);
  });

  it('brings a card answered Again back in the same sitting', () => {
    let col = withNotes(3);
    let queue = studyQueue(col, T0);
    let t = T0;
    const shown: string[] = [];
    for (let k = 0; k < 10; k++) {
      const n = nextCard(col, queue, t);
      if (!n) break;
      shown.push(n.id);
      queue = n.rest;
      col = answer(col, n.id, n.id === 'n0/0' && !shown.slice(0, -1).includes('n0/0') ? Rating.Again : Rating.Good, t);
      t += 2 * MINUTE;
    }
    expect(shown.filter((x) => x === 'n0/0').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps suspended and buried cards out, and buried ones only until tomorrow', () => {
    let col = withNotes(3);
    col = suspend(col, 'n0/0', true, T0);
    col = bury(col, 'n1/0', T0);
    expect(studyQueue(col, T0)).toEqual(['n2/0']);
    expect(studyQueue(col, dayAfter(T0, 1) + 1)).toContain('n1/0');
    col = suspend(col, 'n0/0', false, T0);
    expect(studyQueue(col, T0)).toContain('n0/0');
    expect(totals(col, T0).new).toBe(3);
  });

  it('offers cards not yet due, weakest first, to study ahead', () => {
    let col = withNotes(2, { fuzz: false });
    col = answer(col, 'n0/0', Rating.Easy, T0);
    col = answer(col, 'n1/0', Rating.Good, T0);
    col = answer(col, 'n1/0', Rating.Good, T0 + 10 * MINUTE);
    expect(studyQueue(col, T0 + 20 * MINUTE)).toEqual([]);
    expect(reviewAhead(col, T0 + 20 * MINUTE)).toEqual(['n1/0', 'n0/0']);
  });

  it('forgets a card back to new', () => {
    let col = answer(withNotes(1), 'n0/0', Rating.Easy, T0);
    col = forget(col, 'n0/0', T0);
    expect(col.cards['n0/0']).toMatchObject({ type: 'new', queue: 'new', reps: 0 });
    expect(col.revlog).toHaveLength(1);
  });

  it('filters by deck and the decks inside it', () => {
    let col = withNotes(1);
    col = ensureDeck(col, 'e', 'Course::Deck::Inner', T0);
    col = addNote(col, 'e', { id: 'x', front: 'X', back: 'Y' }, T0);
    col = ensureDeck(col, 'f', 'Other', T0);
    col = addNote(col, 'f', { id: 'y', front: 'X', back: 'Y' }, T0);
    expect(studyQueue(col, T0, { decks: ['d'] }).sort()).toEqual(['n0/0', 'x/0']);
    expect(studyQueue(col, T0, { decks: ['e'] })).toEqual(['x/0']);
  });

  it('labels gaps as Anki\'s buttons do', () => {
    expect(formatGap(30_000)).toBe('<1m');
    expect(formatGap(10 * MINUTE)).toBe('10m');
    expect(formatGap(3 * 3600_000)).toBe('3h');
    expect(formatGap(4 * DAY)).toBe('4d');
    expect(formatGap(60 * DAY)).toBe('2mo');
    expect(formatGap(548 * DAY)).toBe('1.5y');
  });
});

describe('repair', () => {
  it('keeps a good collection as it is', () => {
    let col = withNotes(3);
    col = answer(col, 'n0/0', Rating.Good, T0);
    col = suspend(col, 'n2/0', true, T0);
    expect(migrateCollection(JSON.parse(JSON.stringify(col)), T0)).toEqual(col);
  });

  it('drops what cannot be read', () => {
    const col = migrateCollection({ notes: { a: { front: 'A', back: 'B' }, b: 7 }, cards: { 'a/0': { note: 'a', type: 'bogus', due: 'x' }, 'z/0': { note: 'z' } }, revlog: [{ card: 'a/0', rating: 9 }, { card: 'a/0', rating: 3, id: 5 }] }, T0);
    expect(Object.keys(col.notes)).toEqual(['a']);
    expect(col.cards['a/0']).toMatchObject({ type: 'new', queue: 'new', due: T0, deck: 'default' });
    expect(col.cards['z/0']).toBeUndefined();
    expect(col.revlog).toHaveLength(1);
    expect(migrateCollection(null, T0)).toEqual(emptyCollection(T0));
  });

  it('turns a Leitner box into a card', () => {
    expect(fromLeitner('n', 'd', 0, T0, T0)).toMatchObject({ type: 'learning', queue: 'learning', due: T0 });
    expect(fromLeitner('n', 'd', 3, T0 + 7 * DAY, T0)).toMatchObject({ type: 'review', interval: 7, due: T0 + 7 * DAY, lastReview: T0 });
  });
});
