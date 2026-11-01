// What a course keeps for review (srs.ts holds the scheduling): every
// question of a lesson's check the reader has answered, and every card of
// the course's quiz deck they have met, as notes and cards in Anki's shape,
// kept in the save under `review`.
//
// A check question answered in a lesson becomes a note in that lesson's deck
// ("Clouds::Lesson 03: Fog"), and the answer is its first review: right is
// Good, wrong is Again. The note keeps the question's words, and where it
// came from (the lesson, the block, the check's seed and the question's
// place), so the review page can make the same question again with its
// picture. Lessons finished before this was kept add their check's questions
// as new cards, met a few a day. The quiz deck's cards join as new cards, and
// cards from the old Leitner quiz keep their place.

import { checkSteps, type CheckStep } from './check';
import { testContext, type AnsweredQuestion, type FigureFactory, type Options } from './figure';
import type { Lesson } from './lesson';
import { passed, type Progress } from './progress';
import type { Card as QuizCard } from './quiz';
import { makeRng } from './rng';
import {
  addNote, answer, cardId, configOf, doneToday, emptyCollection, ensureDeck, fromLeitner, hashString, Rating, totals,
  type Collection, type Note, type NoteInput,
} from './srs';

/** Where a check question came from: enough to ask it again. */
export interface CheckSource {
  kind: 'check';
  lesson: string;
  /** The block, as "part.block". */
  at: string;
  figure: string;
  seed: number;
  index: number;
}

/** A card of the course's quiz deck. */
export interface DeckSource {
  kind: 'deck';
  card: string;
}

/** A live figure asked as a flash card (figure.ts FigureCard). */
export interface FigureSource {
  kind: 'figure';
  lesson: string;
  /** The block, as "part.block". */
  at: string;
  figure: string;
}

export type ReviewSource = CheckSource | DeckSource | FigureSource;

export const sourceOf = (n: Note): ReviewSource | undefined => {
  const s = n.source as Partial<ReviewSource> | undefined;
  if (s?.kind === 'check' && typeof s.lesson === 'string') return s as CheckSource;
  if (s?.kind === 'figure' && typeof s.lesson === 'string' && typeof s.figure === 'string') return s as FigureSource;
  if (s?.kind === 'deck' && typeof s.card === 'string') return s as DeckSource;
  return undefined;
};

/** How decks are named: the course's title, then the lesson or "Quiz", as Anki's "Parent::Child". */
export interface DeckNaming {
  title: string;
  /** What a lesson is called. Default "Lesson". */
  noun?: string;
}

export const QUIZ_DECK = 'quiz';
export const lessonDeck = (lesson: string) => `lesson:${lesson}`;

/** A lesson's deck name, numbered so Anki lists them in order: "Clouds::Lesson 03: Fog". */
export function lessonDeckName(l: Lesson, o: DeckNaming): string {
  const code = l.code ?? String(l.n);
  return `${o.title}::${o.noun ?? 'Lesson'} ${/^\d+$/.test(code) ? code.padStart(2, '0') : code}: ${l.title}`;
}

/** A check question's note id: by lesson and its key, or its words and right answer. */
export function checkNoteId(lesson: string, q: { key?: string; ask: string; choices: string[]; answer: number }): string {
  return `check:${lesson}:${q.key ?? hashString(`${q.ask}\n${q.choices[q.answer]}`)}`;
}

function checkNote(l: Lesson, at: string, figure: string, q: AnsweredQuestion | (CheckStep & { index: number; seed: number })): NoteInput {
  const source: CheckSource = { kind: 'check', lesson: l.id, at, figure, seed: q.seed, index: q.index };
  return {
    id: checkNoteId(l.id, q),
    front: q.ask,
    choices: q.choices,
    answer: q.answer,
    extra: q.why,
    ...('image' in q && q.image !== undefined ? { image: q.image } : {}),
    ...('drawing' in q && q.drawing ? { drawing: true } : {}),
    tags: [`lesson:${l.code ?? l.n}`, 'check'],
    source: { ...source },
  };
}

/**
 * A check question answered in a lesson: added for review if it is new,
 * with the answer as its first review. A question met before is left as it
 * is: the review page schedules it, not the lesson.
 */
export function recordAnswer(col: Collection | undefined, l: Lesson, at: string, figure: string, q: AnsweredQuestion, naming: DeckNaming, now: number = Date.now()): Collection {
  let c = col ?? emptyCollection(now);
  const input = checkNote(l, at, figure, q);
  if (c.notes[input.id]) return c;
  const deck = lessonDeck(l.id);
  c = ensureDeck(c, deck, lessonDeckName(l, naming), now);
  c = addNote(c, deck, input, now);
  return answer(c, cardId(input.id), q.picked === q.answer ? Rating.Good : Rating.Again, now);
}

/** A lesson's check blocks, with where each is. */
export function checkBlocks(l: Lesson, figures: Readonly<Record<string, FigureFactory>>): { at: string; figure: string; options?: Record<string, unknown> }[] {
  const out: { at: string; figure: string; options?: Record<string, unknown> }[] = [];
  l.parts.forEach((p, i) => p.blocks.forEach((b, j) => {
    if (b.type === 'quiz' && checkSteps(figures[b.id])) out.push({ at: `${i}.${j}`, figure: b.id, options: b.options });
  }));
  return out;
}

/** A seed for a lesson's check made outside it, the same each time. */
export const fillSeed = (lesson: string) => parseInt(hashString(`fill:${lesson}`).slice(0, 6), 36);

/**
 * Lessons finished before review was kept: their checks' questions join as
 * new cards, unless the lesson has some already. Pass the save the steps
 * are made against (units, say).
 */
export function fillFromLessons(col: Collection | undefined, lessons: readonly Lesson[], figures: Readonly<Record<string, FigureFactory>>, save: Progress, naming: DeckNaming, now: number = Date.now()): Collection {
  let c = col ?? emptyCollection(now);
  const has = new Set(Object.values(c.notes).map((n) => sourceOf(n)).filter((s): s is CheckSource => s?.kind === 'check').map((s) => s.lesson));
  for (const l of lessons) {
    if (!save.lessons[l.id]?.done || has.has(l.id)) continue;
    for (const b of checkBlocks(l, figures)) {
      const seed = fillSeed(l.id);
      let steps: CheckStep[];
      const ctx = testContext(save);
      try {
        steps = checkSteps(figures[b.figure])!(ctx, b.options, makeRng(seed));
      } catch {
        continue;
      } finally {
        ctx.close();
      }
      const deck = lessonDeck(l.id);
      c = ensureDeck(c, deck, lessonDeckName(l, naming), now);
      steps.forEach((s, index) => {
        c = addNote(c, deck, checkNote(l, b.at, b.figure, { ...s, index, seed }), now);
      });
    }
  }
  return c;
}

/** Whether a note is a live figure, which only its own course can ask. */
export const isFigureNote = (n: Note): boolean => sourceOf(n)?.kind === 'figure';

/** A figure card's note id. */
export const figureNoteId = (lesson: string, figure: string) => `figure:${lesson}:${figure}`;

/** A lesson's figures that can be flash cards, with where each is (the first block, when one is used twice). */
export function figureCardBlocks(l: Lesson, figures: Readonly<Record<string, FigureFactory>>): { at: string; figure: string; options?: Options }[] {
  const out: { at: string; figure: string; options?: Options }[] = [];
  l.parts.forEach((p, i) => p.blocks.forEach((b, j) => {
    if (b.type === 'interactive_diagram' && figures[b.id]?.card && !out.some((x) => x.figure === b.id)) out.push({ at: `${i}.${j}`, figure: b.id, options: b.options });
  }));
  return out;
}

/**
 * Each finished lesson's figures that can be flash cards join as new cards,
 * met a few a day like any new card; a card already in is given its
 * figure's current words.
 */
export function fillFigureCards(col: Collection | undefined, lessons: readonly Lesson[], figures: Readonly<Record<string, FigureFactory>>, save: Progress, naming: DeckNaming, now: number = Date.now()): Collection {
  let c = col ?? emptyCollection(now);
  for (const l of lessons) {
    if (!save.lessons[l.id]?.done) continue;
    for (const b of figureCardBlocks(l, figures)) {
      const card = figures[b.figure].card!;
      const deck = lessonDeck(l.id);
      const id = figureNoteId(l.id, b.figure);
      const old = c.notes[id];
      if (old && old.front === card.front && old.back === card.back) continue;
      c = ensureDeck(c, deck, lessonDeckName(l, naming), now);
      c = addNote(c, deck, {
        id,
        front: card.front,
        back: card.back,
        image: '',
        drawing: true,
        tags: [`lesson:${l.code ?? l.n}`, 'figure'],
        source: { kind: 'figure', lesson: l.id, at: b.at, figure: b.figure } satisfies FigureSource,
      }, now);
    }
  }
  return c;
}

/** Where a figure card's figure is now, with its block's options; undefined when the lesson no longer has it. */
export function figureFor(note: Note, lessons: readonly Lesson[], figures: Readonly<Record<string, FigureFactory>>): { factory: FigureFactory; options?: Options } | undefined {
  const s = sourceOf(note);
  if (s?.kind !== 'figure') return undefined;
  const l = lessons.find((x) => x.id === s.lesson);
  const factory = figures[s.figure];
  if (!l || !factory?.card) return undefined;
  const blocks = l.parts.flatMap((p) => p.blocks);
  const b = blocks.find((x) => x.type === 'interactive_diagram' && x.id === s.figure);
  if (!b || b.type !== 'interactive_diagram') return undefined;
  return { factory, options: b.options };
}

/**
 * What is wrong with the course's figure cards: each is built as a flash card
 * from a few seeds, as the review page would, and must build without
 * throwing. For a course's content test (a DOM is needed).
 */
export function figureCardProblems(lessons: readonly Lesson[], figures: Readonly<Record<string, FigureFactory>>, save: Progress, seeds: readonly number[] = [1, 2, 3]): string[] {
  const out: string[] = [];
  for (const l of lessons) {
    for (const b of figureCardBlocks(l, figures)) {
      const f = figures[b.figure];
      for (const seed of seeds) {
        const ctx = { ...testContext(save), card: { seed, verdict: () => {} } };
        try {
          f(ctx, f.card!.goal ?? f.goals?.[0], b.options);
        } catch (e) {
          out.push(`${l.id}: ${b.figure} as a flash card (seed ${seed}): ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          ctx.close();
        }
      }
    }
  }
  return out;
}

/** The note for a card of the course's quiz deck. */
export function deckNote(card: QuizCard): NoteInput {
  return {
    id: `deck:${card.id}`,
    front: card.question,
    choices: card.options,
    answer: 0,
    extra: card.why,
    tags: ['quiz', card.id.split(':')[0]],
    source: { kind: 'deck', card: card.id } satisfies DeckSource,
  };
}

/**
 * The quiz deck in the collection: cards met in the old Leitner quiz join
 * with their schedules; cards already in are given the deck's current words;
 * and new cards are added for today, as many as the day's new-card limit
 * leaves room for, in `order` (shuffled by the caller).
 */
export function syncDeck(col: Collection | undefined, deck: readonly QuizCard[], save: Progress, naming: DeckNaming, now: number = Date.now(), order: readonly QuizCard[] = deck): Collection {
  let c = col ?? emptyCollection(now);
  if (!deck.length) return c;
  c = ensureDeck(c, QUIZ_DECK, `${naming.title}::Quiz`, now);
  const open = (q: QuizCard) => !q.after || passed(save, q.after);
  for (const q of deck) {
    const id = `deck:${q.id}`;
    if (c.notes[id]) {
      c = addNote(c, QUIZ_DECK, deckNote(q), now);
      continue;
    }
    const old = save.quiz[q.id];
    if (old && open(q)) {
      c = addNote(c, QUIZ_DECK, deckNote(q), now);
      c = { ...c, cards: { ...c.cards, [cardId(id)]: fromLeitner(id, QUIZ_DECK, old.box, old.due, now) } };
    }
  }
  // Room for new cards today, after those already waiting.
  const room = configOf(c).newPerDay - doneToday(c, now).new - totals(c, now).new;
  let added = 0;
  for (const q of order) {
    if (added >= room) break;
    if (c.notes[`deck:${q.id}`] || !open(q)) continue;
    c = addNote(c, QUIZ_DECK, deckNote(q), now);
    added++;
  }
  return c;
}

/**
 * The check question a note came from, made again: the same lesson, block
 * and seed give the same question, with its picture. Undefined when the
 * lesson has changed so it no longer makes it.
 */
export function stepFor(note: Note, lessons: readonly Lesson[], figures: Readonly<Record<string, FigureFactory>>, save: Progress): CheckStep | undefined {
  const s = sourceOf(note);
  if (s?.kind !== 'check') return undefined;
  const l = lessons.find((x) => x.id === s.lesson);
  if (!l) return undefined;
  const blocks = checkBlocks(l, figures);
  const b = blocks.find((x) => x.at === s.at && x.figure === s.figure) ?? blocks.find((x) => x.figure === s.figure);
  if (!b) return undefined;
  const ctx = testContext(save);
  try {
    const steps = checkSteps(figures[b.figure])!(ctx, b.options, makeRng(s.seed));
    const same = (q: CheckStep) => checkNoteId(l.id, q) === note.id;
    const at = steps[s.index];
    return at && same(at) ? at : steps.find(same);
  } catch {
    return undefined;
  } finally {
    ctx.close();
  }
}
