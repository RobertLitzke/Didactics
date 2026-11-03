// A course's own flash cards: the deck's shape, and a hand-written card as a
// JSON file holds it. The cards are met on the review page (review.ts,
// review-view.ts) on Anki's schedule; the Leitner quiz page that showed them
// before 0.12 is gone, and progress.ts carries its boxes over.

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
