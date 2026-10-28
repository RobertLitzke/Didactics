// The check that ends a lesson: one run of questions, one at a time, under
// one count and one score, whatever each question shows (a photo to name, a
// sky to read, a plain question). The app turns its content into steps; this
// asks them, explains each answer, and keeps the answers for a reader who
// leaves part way.
//
// With the radio on, the lesson hands the check its talk (ctx.radio, see
// lesson.ts): the first line is typed above the questions as the other
// station opening the examination, and a last line, if there is one, under
// the score. With the radio off the same questions come plain.

import { el } from './dom';
import { quiz, type FigureContext, type FigureFactory, type Options } from './figure';
import { makeRng, type Rng } from './rng';
import { freshSeed } from './ui';

export interface CheckStep {
  /** Drawn above the question: a photo, a sky, a diagram. */
  picture?: () => Node | null;
  /** More under the picture, such as instrument readings. */
  extra?: () => Node | null;
  ask: string;
  choices: string[];
  /** The index of the right choice. */
  answer: number;
  /** What is said once it is answered, after "Right." or "Not quite.". */
  why: string;
  /** Short choices go in a row, long ones in a list. Default list. */
  row?: boolean;
}

/** What the check says for a right and a wrong answer, plain and over the radio. */
const WORDS = {
  plain: { good: 'Right.', bad: 'Not quite.' },
  radio: { good: 'Copy that.', bad: 'Negative.' },
};

/**
 * A lesson's check, as a figure. `steps` makes its questions from the block's
 * options and a random source, the same each time for the same seed, so a
 * reader coming back finds the same questions and goes on from where they were.
 */
export function check(steps: (ctx: FigureContext, options: Options | undefined, rng: Rng) => CheckStep[]): FigureFactory {
  return quiz((ctx, t, options) => {
    const kept = t.kept as { seed?: unknown; picks?: unknown } | undefined;
    const seed = typeof kept?.seed === 'number' ? kept.seed : freshSeed();
    const picks: number[] = Array.isArray(kept?.picks) ? kept.picks.filter((x): x is number => typeof x === 'number') : [];
    const all = steps(ctx, options, makeRng(seed));
    const talk = ctx.radio?.talk;
    const words = talk ? WORDS.radio : WORDS.plain;
    const lines = talk?.turns.map((x) => x.them) ?? [];
    const from = ctx.radio?.them;
    const wire = talk
      ? el('div.check-wire', {},
        el('p.check-wire-head', {}, from ? `${from.call} · ${from.place}` : 'On the radio', el('span', {}, talk.when)),
        el('p', {}, lines[0] ?? ''))
      : null;
    const count = el('p.check-count');
    const pic = el('div.check-picture');
    const body = el('div');
    const node = el('div.fig-body.check', {}, wire, count, pic, body);
    let right = 0;
    let i = 0;
    for (; i < Math.min(picks.length, all.length); i++) if (picks[i] === all[i].answer) right++;
    picks.length = i;

    const next = () => {
      if (i >= all.length) {
        count.textContent = '';
        pic.replaceChildren();
        body.replaceChildren(
          el('p.fig-readout.check-score', {}, `Check done: ${right} of ${all.length} right.`),
          talk && lines.length > 1 ? el('p.check-wire.check-wire-end', {}, lines.at(-1)!) : '',
        );
        ctx.score(right, all.length);
        t.done();
        return;
      }
      const q = all[i];
      const buttons = q.choices.map((c, k) => {
        const b = el(q.row ? 'button.btn.btn-ghost' : 'button.btn.btn-ghost.wide', { type: 'button' }, c) as HTMLButtonElement;
        b.addEventListener('click', () => {
          const good = k === q.answer;
          if (good) right++;
          picks.push(k);
          t.keep({ seed, picks: [...picks] });
          buttons.forEach((x, j) => {
            x.disabled = true;
            if (j === q.answer) x.classList.add('right');
          });
          if (!good) b.classList.add('wrong');
          body.append(
            el('div', { className: `verdict ${good ? 'good' : 'bad'}` }, el('p', {}, `${good ? words.good : words.bad} ${q.why}`)),
            el('div.actions', {}, el('span.count', {}, `${i + 1} / ${all.length}`),
              el('button.btn', { type: 'button', onclick: () => { i++; next(); } }, i === all.length - 1 ? 'Finish' : 'Next')),
          );
        });
        return b;
      });
      count.textContent = `Question ${i + 1} of ${all.length}`;
      pic.replaceChildren(q.picture?.() ?? '');
      body.replaceChildren(
        q.extra?.() ?? '',
        el('p.task', {}, q.ask),
        el(q.row ? 'div.floor-buttons' : 'div.answer-list', {}, buttons),
      );
    };
    next();
    return node;
  });
}
