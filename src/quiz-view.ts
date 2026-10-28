// The quiz page: flash cards outside the lessons, scheduled by spaced
// repetition (quiz.ts). A sitting is a handful of cards; one missed comes back
// again before the sitting ends.

import { el } from './dom';
import { passed, type Progress } from './progress';
import { deal, GAPS_DAYS, review, tally, type Card } from './quiz';
import { makeRng, shuffle } from './rng';
import type { View } from './router';
import type { Store } from './store';
import { freshSeed } from './ui';

/** A missed card comes back after this many others. */
const AGAIN_AFTER = 4;

function when(ms: number): string {
  const h = ms / 3600000;
  if (h < 1) return 'within the hour';
  if (h < 24) return `in about ${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d === 1 ? 'tomorrow' : `in ${d} days`;
}

export interface QuizViewOptions<C extends Card, S extends Progress> {
  /** The whole deck; built once, so wrong answers stay the same each time a card comes up. */
  deck: readonly C[];
  store: Store<S>;
  /** The paragraph under the heading, on what the cards are about. */
  blurb: string;
  /** A picture to show above a card's question, if it has one. */
  media?: (card: C) => Node | null;
  /**
   * What the page says when the reader has no cards at all: the deck is empty,
   * or every card waits on a lesson not yet passed. A course whose lessons are
   * not written yet might say "Flash cards arrive with the first written lesson."
   */
  empty?: string;
  /** Cards in a sitting, and how many of them may be new. */
  sitting?: number;
  fresh?: number;
  home?: string;
}

/** The quiz page: a tally of the deck, then sittings of cards. */
export function quizView<C extends Card, S extends Progress>(o: QuizViewOptions<C, S>): View {
  // Cards for a lesson not yet reached stay out of the deck until it is passed.
  const deckFor = (save: S) => o.deck.filter((c) => !c.after || passed(save, c.after));
  const SITTING = o.sitting ?? 15;
  const FRESH = o.fresh ?? 8;
  const getSave = o.store.get;
  const updateSave = o.store.update;
  return (root) => {
    const page = el('div.page.quiz');
    root.append(page);

    const front = () => {
      const save = getSave();
      const now = Date.now();
      const deck = deckFor(save);
      if (!deck.length) {
        page.replaceChildren(
          el('h1', {}, 'Quiz'),
          el('p.muted', {}, o.blurb),
          el('p.quiz-empty', {}, o.empty ?? (o.deck.length ? 'No cards yet: each lesson adds its cards to the deck once it is done.' : 'No cards yet.')),
        );
        return;
      }
      const t = tally(deck, save.quiz, now);
      const ready = Math.min(SITTING, t.due + Math.min(FRESH, t.fresh));
      const next = Object.values(save.quiz).reduce((m, s) => Math.min(m, s.due), Infinity);
      page.replaceChildren(
        el('h1', {}, 'Quiz'),
        el('p.muted', {}, o.blurb),
        el('div.quiz-tally', {},
          stat(t.due, 'due now'),
          stat(t.fresh, 'new'),
          stat(t.learning, 'learning'),
          stat(t.known, 'known'),
        ),
        ready
          ? el('button.btn.btn-big', { type: 'button', onclick: () => sitting(deal(deck, save.quiz, now, SITTING, FRESH, makeRng(freshSeed()))) }, `Start: ${ready} cards`)
          : el('p', {}, `All caught up. The next card is due ${when(next - now)}.`),
      );
    };

    const sitting = (cards: C[]) => {
      const queue = cards.slice();
      const missed = new Set<string>();
      let done = 0;
      const total = cards.length;
      const show = () => {
        const card = queue.shift();
        if (!card) return finish(total, total - missed.size);
        const rng = makeRng(freshSeed());
        const options = shuffle(card.options, rng);
        const body = el('div.quiz-card');
        const buttons = options.map((o) => {
          const b = el('button.btn.btn-ghost.wide', { type: 'button' }, o) as HTMLButtonElement;
          b.addEventListener('click', () => {
            const right = o === card.options[0];
            buttons.forEach((x, i) => {
              x.disabled = true;
              if (options[i] === card.options[0]) x.classList.add('right');
            });
            if (!right) b.classList.add('wrong');
            // A card missed once in a sitting is scored as missed, even when it
            // is got right on its second showing, and it goes back to box 0.
            const firstTime = !missed.has(card.id);
            if (!right) {
              missed.add(card.id);
              queue.splice(Math.min(AGAIN_AFTER, queue.length), 0, card);
            } else done++;
            updateSave((s) => ({ ...s, quiz: { ...s.quiz, [card.id]: review(right && firstTime ? s.quiz[card.id] : { box: 0, due: 0 }, right, Date.now()) } }));
            const box = getSave().quiz[card.id].box;
            const gap = GAPS_DAYS[box];
            body.append(
              el('div.verdict', { className: `verdict ${right ? 'good' : 'bad'}` },
                el('p', {}, card.why),
                el('p.muted', {}, right ? (gap ? `Next time: in ${gap} day${gap === 1 ? '' : 's'}.` : '') : 'It will come back in a few cards.'),
              ),
              el('div.actions', {}, el('span.count', {}, `${done} / ${total}`), el('button.btn', { type: 'button', onclick: show }, queue.length ? 'Next' : 'Finish')),
            );
          });
          return b;
        });
        const picture = o.media?.(card);
        if (picture) body.append(picture);
        body.append(
          el('p.task', {}, card.question),
          el('div.answer-list', {}, buttons),
        );
        page.replaceChildren(el('p.eyebrow', {}, `Card ${done + 1} of ${total}`), body);
        page.scrollIntoView({ block: 'start' });
      };
      show();
    };

    const finish = (total: number, right: number) => {
      page.replaceChildren(
        el('h1', {}, 'Sitting done'),
        el('p', {}, `${right} of ${total} right the first time.`),
        el('div.actions', {}, el('button.btn', { type: 'button', onclick: front }, 'Back to the quiz'), el('a.btn.btn-ghost', { href: `#${o.home ?? '/home'}` }, 'Home')),
      );
    };

    front();
  };
}

function stat(n: number, label: string): HTMLElement {
  return el('div.stat', {}, el('strong', {}, String(n)), el('span', {}, label));
}
