// The review page: every check question the reader has answered and every
// quiz card met, asked again on Anki's schedule (srs.ts). It opens on the
// day's three counts (new, learning, due), the decks, and a button to study;
// a sitting asks one card at a time, and after the answer offers Anki's
// buttons, each with when the card would come back. A missed card comes back
// within the sitting. The whole collection, schedules and all, downloads as
// an Anki package (anki.ts).

import { imageOf } from './check';
import { el } from './dom';
import type { FigureFactory } from './figure';
import type { Lesson } from './lesson';
import type { Progress } from './progress';
import type { Card as QuizCard } from './quiz';
import { makeRng, shuffle } from './rng';
import type { View } from './router';
import {
  answer, configOf, dayCounts, emptyCollection, formatGap, nextCard, preview, Rating, RATING_NAMES, reviewAhead, studyQueue, totals,
  type Collection, type Note, type Rating as RatingT, type SchedulerConfig,
} from './srs';
import { fillFromLessons, lessonDeck, QUIZ_DECK, sourceOf, stepFor, syncDeck, type DeckNaming } from './review';
import type { Store } from './store';
import { freshSeed } from './ui';

export interface ReviewViewOptions<C extends QuizCard, S extends Progress> extends DeckNaming {
  store: Store<S>;
  lessons: readonly Lesson[];
  figures: Readonly<Record<string, FigureFactory>>;
  /** The course's own quiz deck, met a few new cards a day. */
  deck?: readonly C[];
  /** A deck card's picture. */
  media?: (card: C) => Node | null;
  /** The paragraph under the heading. */
  blurb?: string;
  /** Cards in one sitting. Default 20. */
  sitting?: number;
  /** The Anki package's file name. Default "<title>.apkg". */
  fileName?: string;
  /** A note's words as HTML in the Anki package, such as the course's prose without its colours. */
  html?: (text: string) => string;
  home?: string;
  /** The review of every course on the site, on the site's catalog page. */
  allHref?: string;
}

const COUNT_CLASS = { new: 'count-new', learning: 'count-learning', review: 'count-due' } as const;

/** What's in a note's picture, as a file for Anki: a photo, a drawing, or a canvas. */
export async function pictureFile(node: Node, base: string): Promise<{ name: string; data: Uint8Array } | null> {
  if (!(node instanceof Element)) return null;
  const img = node instanceof HTMLImageElement ? node : node.querySelector('img');
  if (img) {
    const src = img.currentSrc || img.src;
    if (!src) return null;
    const res = await fetch(src);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /svg/.test(type) ? 'svg' : /jpe?g/.test(type) ? 'jpg' : (src.split('?')[0].split('.').pop() ?? 'jpg').slice(0, 4);
    return { name: `${base}.${ext}`, data: new Uint8Array(await res.arrayBuffer()) };
  }
  const svgs = node instanceof SVGSVGElement ? [node] : [...node.querySelectorAll('svg')].filter((s) => !s.parentElement?.closest('svg'));
  if (svgs.length) {
    const box = (s: SVGSVGElement) => {
      const v = s.viewBox?.baseVal;
      return v && v.width ? { w: v.width, h: v.height } : { w: Number(s.getAttribute('width')) || 400, h: Number(s.getAttribute('height')) || 200 };
    };
    // Several drawings side by side (a sky over the hours) become one, at one height, each with its caption under it.
    const H = Math.max(...svgs.map((s) => box(s).h));
    const captions = svgs.map((s) => s.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ?? '');
    const below = captions.some(Boolean) ? 26 : 0;
    const gap = svgs.length > 1 ? 8 : 0;
    let x = 0;
    const parts = svgs.map((s, i) => {
      const b = box(s);
      const w = (b.w * H) / b.h;
      const copy = s.cloneNode(true) as SVGSVGElement;
      copy.setAttribute('x', String(x));
      copy.setAttribute('y', '0');
      copy.setAttribute('width', String(w));
      copy.setAttribute('height', String(H));
      if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${b.w} ${b.h}`);
      const caption = captions[i] ? `<text x="${x + w / 2}" y="${H + 19}" text-anchor="middle" font-size="16" fill="#444">${escapeXml(captions[i])}</text>` : '';
      x += w + gap;
      return new XMLSerializer().serializeToString(copy) + caption;
    });
    const width = x - gap;
    const text = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${H + below}" width="${Math.round(width)}" height="${Math.round(H + below)}" font-family="sans-serif">${parts.join('')}</svg>`;
    return { name: `${base}.svg`, data: new TextEncoder().encode(text) };
  }
  const canvas = node instanceof HTMLCanvasElement ? node : node.querySelector('canvas');
  if (canvas && canvas.width) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    return blob ? { name: `${base}.png`, data: new Uint8Array(await blob.arrayBuffer()) } : null;
  }
  return null;
}

const escapeXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function reviewView<C extends QuizCard, S extends Progress>(o: ReviewViewOptions<C, S>): View {
  const SITTING = o.sitting ?? 20;
  const byId = new Map((o.deck ?? []).map((c) => [c.id, c]));
  const col = (): Collection => o.store.get().review ?? emptyCollection();
  const setCol = (change: (c: Collection) => Collection) => o.store.update((s) => ({ ...s, review: change(s.review ?? emptyCollection()) }));
  const deckName = (c: Collection, id: string) => (c.decks[id]?.name ?? id).replace(`${o.title}::`, '');

  /** What goes above a note's question: its photo or drawing, and any readings under it. */
  const pictureOf = (n: Note): Node[] => {
    const s = sourceOf(n);
    if (s?.kind === 'deck') {
      const card = byId.get(s.card);
      const m = card && o.media?.(card);
      return m ? [m] : [];
    }
    const step = stepFor(n, o.lessons, o.figures, o.store.get());
    return [step?.picture?.(), step?.extra?.()].filter((x): x is Node => !!x);
  };

  return (root) => {
    const page = el('div.page.quiz.review');
    root.append(page);

    // New lessons' questions and today's new quiz cards join first.
    setCol((c) => {
      let next = fillFromLessons(c, o.lessons, o.figures, o.store.get(), o, Date.now());
      if (o.deck?.length) next = syncDeck(next, o.deck, o.store.get(), o, Date.now(), shuffle(o.deck, makeRng(freshSeed())));
      return next;
    });
    // Each card's photo address, once, so the review of all courses can show it.
    const unseen = Object.values(col().notes).filter((n) => n.image === undefined);
    if (unseen.length) {
      const found = unseen.map((n) => {
        try {
          const pics = pictureOf(n);
          const got = pics.map(imageOf);
          const photo = got.find((g) => g.image);
          return { ...n, image: photo?.image ?? '', ...(!photo && got.some((g) => g.drawing) ? { drawing: true as const } : {}) };
        } catch {
          return { ...n, image: '' };
        }
      });
      setCol((c) => ({ ...c, notes: { ...c.notes, ...Object.fromEntries(found.filter((n) => c.notes[n.id]).map((n) => [n.id, n])) } }));
    }

    const front = () => {
      const c = col();
      const now = Date.now();
      const day = dayCounts(c, now);
      const all = totals(c, now);
      const ready = day.new + day.learning + day.review;
      const cfg = configOf(c);
      const decks = Object.values(c.decks)
        .filter((d) => Object.values(c.cards).some((x) => x.deck === d.id))
        .sort((a, b) => (a.id === QUIZ_DECK ? -1 : b.id === QUIZ_DECK ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true })));
      const counts = (n: { new: number; learning: number; review: number }) => el('span.review-counts', {},
        el('span', { className: COUNT_CLASS.new, title: 'New' }, String(n.new)),
        el('span', { className: COUNT_CLASS.learning, title: 'Learning' }, String(n.learning)),
        el('span', { className: COUNT_CLASS.review, title: 'To review' }, String(n.review)));
      const empty = !Object.keys(c.cards).length;
      page.replaceChildren(
        el('h1', {}, 'Review'),
        el('p.muted', {}, o.blurb ?? 'Every check question you answer in a lesson comes back here, on a schedule: soon if you missed it, then after longer and longer gaps as you keep getting it right.'),
        empty
          ? el('p.quiz-empty', {}, 'Nothing to review yet. Answer a lesson’s check and its questions come here.')
          : el('div', {},
            el('div.quiz-tally', {},
              stat(day.new, 'new today', COUNT_CLASS.new),
              stat(day.learning, 'learning', COUNT_CLASS.learning),
              stat(day.review, 'to review', COUNT_CLASS.review),
              stat(all.review, `known${all.mature ? `, ${all.mature} well` : ''}`)),
            ready
              ? el('button.btn.btn-big', { type: 'button', onclick: () => sitting(studyQueue(c, now, { limit: SITTING })) }, `Study ${Math.min(SITTING, ready)} cards`)
              : el('div', {},
                el('p', {}, `All caught up for today.${all.next ? ` The next card is due ${when(all.next - now)}.` : ''}`),
                all.review + all.learning ? el('button.btn.btn-ghost', { type: 'button', onclick: () => sitting(reviewAhead(c, now, 10), true) }, 'Study ahead: the 10 nearest to slipping') : null),
            decks.length > 1 ? el('div.review-decks', {},
              el('h2', {}, 'Decks'),
              ...decks.map((d) => {
                const n = dayCounts(c, now, [d.id]);
                const any = n.new + n.learning + n.review;
                return el('div.review-deck', {},
                  el('span.review-deck-name', {}, deckName(c, d.id)),
                  counts(n),
                  el('button.btn.btn-ghost.btn-small', { type: 'button', disabled: !any, onclick: () => sitting(studyQueue(col(), Date.now(), { limit: SITTING, decks: [d.id] }), false, [d.id]) }, 'Study'));
              })) : null),
        o.allHref ? el('p', {}, el('a', { href: o.allHref }, 'Review every course together'), ': all your courses’ cards in one sitting, and one Anki download.') : '',
        options(cfg),
        anki(c, empty),
      );
    };

    /** New cards a day, and which scheduler. */
    const options = (cfg: SchedulerConfig) => {
      const perDay = el('input', { type: 'number', min: '0', max: '200', value: String(cfg.newPerDay), className: 'review-number' }) as HTMLInputElement;
      perDay.addEventListener('change', () => {
        const n = Math.max(0, Math.min(200, Math.round(Number(perDay.value) || 0)));
        setCol((c) => ({ ...c, config: { ...c.config, newPerDay: n } }));
        front();
      });
      const sched = el('select', {}, el('option', { value: 'fsrs', selected: cfg.scheduler === 'fsrs' }, 'FSRS (Anki’s newer scheduler)'), el('option', { value: 'sm2', selected: cfg.scheduler === 'sm2' }, 'SM-2 (Anki’s classic scheduler)')) as HTMLSelectElement;
      sched.addEventListener('change', () => setCol((c) => ({ ...c, config: { ...c.config, scheduler: sched.value as SchedulerConfig['scheduler'] } })));
      return el('details.review-options', {},
        el('summary', {}, 'Options'),
        el('label', {}, 'New cards a day ', perDay),
        el('label', {}, 'Scheduler ', sched),
        el('p.muted', {}, 'FSRS models how well you know each card and spaces it to keep the chance of recall near 90%. SM-2 grows each gap by a fixed ease. Changing keeps every card’s history.'));
    };

    /** The Anki package: every card with its schedule and history. */
    const anki = (c: Collection, empty: boolean) => {
      const status = el('p.muted', {}, 'In Anki, choose File › Import and keep “Import any learning progress” ticked, so each card keeps its schedule. Importing a later download updates the same cards.');
      const button = el('button.btn.btn-ghost', { type: 'button', disabled: empty }, 'Download for Anki (.apkg)') as HTMLButtonElement;
      button.addEventListener('click', () => {
        button.disabled = true;
        void exportApkg(c, (t) => (status.textContent = t)).finally(() => (button.disabled = false));
      });
      return el('section.review-anki', {}, el('h2', {}, 'Anki'), button, status);
    };

    const exportApkg = async (c: Collection, say: (t: string) => void) => {
      try {
        say('Getting ready…');
        const { toApkg } = await import('./anki');
        // Each picture is drawn off screen, then kept as a file.
        const media: Record<string, { name: string; data: Uint8Array }> = {};
        const notes = Object.values(c.notes);
        const stage = el('div', { style: 'position:fixed;left:-10000px;top:0;width:640px;' });
        document.body.append(stage);
        try {
          let k = 0;
          for (const n of notes) {
            k++;
            if (k % 5 === 0) say(`Gathering pictures: ${k} of ${notes.length}…`);
            try {
              const pic = pictureOf(n)[0];
              if (!pic) continue;
              stage.replaceChildren(pic);
              await frames();
              const file = await pictureFile(pic, `${o.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n.guid}`);
              if (file) media[n.id] = file;
            } catch {
              // A picture that cannot be kept leaves its card with words only.
            }
          }
        } finally {
          stage.remove();
        }
        say('Writing the package…');
        const lessonOf = new Map(o.lessons.map((l) => [lessonDeck(l.id), l]));
        const bytes = await toApkg(c, {
          media,
          html: o.html,
          sourceLabel: (n) => {
            const s = sourceOf(n);
            const card = c.cards[`${n.id}/0`];
            const l = card && lessonOf.get(card.deck);
            return s?.kind === 'check' && l ? `${o.title}, ${o.noun ?? 'Lesson'} ${l.code ?? l.n}: ${l.title}` : `${o.title}, quiz`;
          },
        });
        const name = o.fileName ?? `${o.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.apkg`;
        const a = el('a', { href: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' })), download: name }) as HTMLAnchorElement;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        say(`Saved ${name}: ${notes.length} cards, ${Object.keys(media).length} with pictures. In Anki, choose File › Import and keep “Import any learning progress” ticked.`);
      } catch (e) {
        say(`Could not make the package: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    const sitting = (first: string[], ahead = false, decks?: string[]) => {
      let queue = first.slice();
      let right = 0;
      const seen = new Set<string>();
      const show = () => {
        const now = Date.now();
        const n = ahead ? (queue.length ? { id: queue[0], rest: queue.slice(1) } : undefined) : nextCard(col(), queue, now, decks);
        if (!n) return finish(seen.size, right);
        queue = n.rest;
        const c = col();
        const card = c.cards[n.id];
        const note = card && c.notes[card.note];
        if (!note) return show();
        const firstTime = !seen.has(n.id);
        seen.add(n.id);
        const body = noteCard(note, pictureOf(note), () => preview(col(), n.id, Date.now()), (r, took) => {
          if (firstTime && r !== Rating.Again) right++;
          setCol((x) => answer(x, n.id, r, Date.now(), { took }));
          show();
        });
        const left = ahead ? queue.length + 1 : dayCounts(col(), now, decks);
        page.replaceChildren(
          el('p.eyebrow', {}, `${deckName(c, card.deck)} · `, typeof left === 'number' ? `${left} left` : el('span.review-counts', {},
            el('span', { className: COUNT_CLASS.new }, String(left.new)),
            el('span', { className: COUNT_CLASS.learning }, String(left.learning)),
            el('span', { className: COUNT_CLASS.review }, String(left.review)))),
          body,
          el('div.actions', {}, el('button.btn.btn-ghost.btn-small', { type: 'button', onclick: front }, 'Stop')),
        );
        page.scrollIntoView({ block: 'start' });
      };
      const finish = (n: number, good: number) => {
        const now = Date.now();
        const day = dayCounts(col(), now);
        page.replaceChildren(
          el('h1', {}, 'Sitting done'),
          el('p', {}, n ? `${good} of ${n} right the first time.` : 'Nothing was due.'),
          day.new + day.learning + day.review
            ? el('p.muted', {}, `${day.new + day.learning + day.review} more for today.`)
            : el('p.muted', {}, 'That’s everything for today.'),
          el('div.actions', {}, el('button.btn', { type: 'button', onclick: front }, 'Back to review'), el('a.btn.btn-ghost', { href: `#${o.home ?? '/home'}` }, 'Home')),
        );
      };
      show();
    };

    front();
  };
}

/**
 * One card being asked: its pictures, its question, the choices (or Show
 * answer), then what was right and Anki's buttons, each labelled with when
 * the card would come back. `onRate` gets the button and how long the
 * answer took. Used by the review page and the review of all courses.
 */
export function noteCard(note: Note, pictures: readonly Node[], gaps: () => Record<RatingT, number>, onRate: (r: RatingT, took: number) => void): HTMLElement {
  const started = Date.now();
  const body = el('div.quiz-card');
  const after = el('div');
  const grade = (picked: 'right' | 'wrong' | 'shown') => {
    const took = Date.now() - started;
    const g = gaps();
    const buttons = (picked === 'wrong' ? [Rating.Again] : [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]).map((r) =>
      el(`button.btn${r === Rating.Good || picked === 'wrong' ? '' : '.btn-ghost'}.rate.rate-${r}`, { type: 'button', onclick: () => onRate(r, took) },
        el('span.rate-name', {}, RATING_NAMES[r]), el('span.rate-gap', {}, formatGap(g[r]))));
    after.append(el('div.review-rates', {}, ...buttons));
    (buttons.find((b) => b.classList.contains('rate-3')) ?? buttons[0]).focus();
  };
  body.append(...pictures.map((p) => el('div.check-picture', {}, p)), el('p.task', {}, note.front));
  if (note.model === 'choice' && note.choices) {
    const order = shuffle(note.choices.map((_, i) => i), makeRng(freshSeed()));
    const buttons = order.map((i) => {
      const b = el('button.btn.btn-ghost.wide', { type: 'button' }, note.choices![i]) as HTMLButtonElement;
      b.addEventListener('click', () => {
        const good = i === note.answer;
        buttons.forEach((x, k) => {
          x.disabled = true;
          if (order[k] === note.answer) x.classList.add('right');
        });
        if (!good) b.classList.add('wrong');
        after.append(el('div', { className: `verdict ${good ? 'good' : 'bad'}` }, el('p', {}, `${good ? 'Right.' : 'Not quite.'} ${note.extra ?? ''}`)));
        grade(good ? 'right' : 'wrong');
      });
      return b;
    });
    body.append(el('div.answer-list', {}, buttons));
  } else {
    const reveal = el('button.btn', { type: 'button' }, 'Show answer') as HTMLButtonElement;
    reveal.addEventListener('click', () => {
      reveal.remove();
      after.append(el('div.verdict', {}, el('p', {}, el('strong', {}, note.back)), note.extra ? el('p', {}, note.extra) : null));
      grade('shown');
    });
    after.append(reveal);
  }
  body.append(after);
  return body;
}

function when(ms: number): string {
  const h = ms / 3600000;
  if (h < 1) return 'within the hour';
  if (h < 24) return `in about ${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d === 1 ? 'tomorrow' : `in ${d} days`;
}

function stat(n: number, label: string, cls?: string): HTMLElement {
  return el('div.stat', { className: cls ? `stat ${cls}` : 'stat' }, el('strong', {}, String(n)), el('span', {}, label));
}
