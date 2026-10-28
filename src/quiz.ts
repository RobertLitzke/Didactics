// The quiz: plain flash cards, outside the lessons, scheduled by spaced
// repetition (Leitner boxes). A card answered right comes back after longer
// and longer gaps; a card answered wrong starts over and comes back in the
// same sitting. The app builds the deck; quiz-view.ts shows it.

import { shuffle, type Rng } from './rng';

export interface Card {
  id: string;
  question: string;
  /** The right answer is options[0]; the view shuffles them. */
  options: string[];
  why: string;
  /** A lesson to pass (or skip) before the card is dealt, for lessons off the main path. */
  after?: string;
}

/** A hand-written card as a JSON file holds it, with the right answer at `answer`. */
export interface Concept {
  id: string;
  question: string;
  options: string[];
  answer: number;
  why: string;
  after?: string;
}

/** A hand-written card as a deck card, under `prefix:id`. */
export function conceptCard(c: Concept, prefix = 'idea'): Card {
  return { id: `${prefix}:${c.id}`, question: c.question, options: [c.options[c.answer], ...c.options.filter((_, i) => i !== c.answer)], why: c.why, ...(c.after ? { after: c.after } : {}) };
}

// ---- Scheduling ------------------------------------------------------------------

/** Where a card stands: its box (0 = being learned) and when it is next due, in ms. */
export interface CardState {
  box: number;
  due: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** The gap after a right answer, by the box the card moves into. */
export const GAPS_DAYS = [0, 1, 3, 7, 16, 35, 80];

/** The card's next state after an answer. */
export function review(prev: CardState | undefined, right: boolean, now: number): CardState {
  if (!right) return { box: 0, due: now };
  const box = Math.min((prev?.box ?? 0) + 1, GAPS_DAYS.length - 1);
  return { box, due: now + GAPS_DAYS[box] * DAY };
}

/**
 * A sitting: the cards due now, most overdue first, then up to `fresh` new
 * ones, `size` in all. New cards are dealt in a shuffled order so the kinds
 * are mixed, but with the photos and the plain facts ahead of the ideas.
 */
export function deal<C extends Card>(deck: readonly C[], states: Readonly<Record<string, CardState>>, now: number, size: number, fresh: number, rng: Rng): C[] {
  const due = deck.filter((c) => states[c.id] && states[c.id].due <= now).sort((a, b) => states[a.id].due - states[b.id].due);
  const unseen = shuffle(deck.filter((c) => !states[c.id]), rng);
  const out = due.slice(0, size);
  for (const c of unseen) {
    if (out.length >= size || fresh <= 0) break;
    out.push(c);
    fresh--;
  }
  return shuffle(out, rng);
}

export interface Tally {
  due: number;
  fresh: number;
  learning: number;
  known: number;
}

/** Counts for the quiz page: due now, never seen, still being learned (box 1-2), and known (box 3 and up). */
export function tally(deck: readonly Card[], states: Readonly<Record<string, CardState>>, now: number): Tally {
  const t: Tally = { due: 0, fresh: 0, learning: 0, known: 0 };
  for (const c of deck) {
    const s = states[c.id];
    if (!s) t.fresh++;
    else {
      if (s.due <= now) t.due++;
      if (s.box >= 3) t.known++;
      else t.learning++;
    }
  }
  return t;
}
