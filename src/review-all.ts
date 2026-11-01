// The review of every course on a site at once: the cards due in each
// course's save, asked in one sitting, each card in its own course's colours,
// and one Anki package of them all. It runs on the site's catalog page, which
// has none of the courses' code, so a card shows its words and its photo (by
// address, noted when the course first showed it); a card whose picture is a
// drawing says so and links to its course. Each answer is written straight
// back into that course's save, which the course reads again when next open.

import { el } from './dom';
import { escapeHtml } from './anki';
import { isFigureNote } from './review';
import { noteCard, pictureFile } from './review-view';
import {
  answer, dayCounts, mergeCollections, migrateCollection, nextCard, preview, Rating, studyQueue, totals, weave,
  type Collection, type Note,
} from './srs';

/** A course's colours, from its own tokens. */
export interface CourseTheme {
  bg: string;
  /** A raised surface: the answers' panel. */
  panel?: string;
  text: string;
  /** Its buttons. */
  accent: string;
  good?: string;
  bad?: string;
  /** Its headings' typeface, as a CSS font stack. */
  display?: string;
}

export interface SiteCourse {
  /** Short and unique: the course's folder. */
  key: string;
  title: string;
  /** Its save's localStorage key, such as "clouds.save". */
  save: string;
  /** Its page, such as "./clouds/". */
  href: string;
  /** Its icon's address. */
  icon?: string;
  theme?: CourseTheme;
}

export interface AllReviewOptions {
  courses: readonly SiteCourse[];
  /** Default localStorage. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Cards in a sitting. Default 30. */
  sitting?: number;
  /** The Anki package's name. Default "all-courses.apkg". */
  fileName?: string;
  /** Where "Back" goes, such as the catalog's front. */
  back?: { href: string; label: string };
}

/** A course's save, parsed, or null. */
function readSave(storage: Pick<Storage, 'getItem'>, key: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? 'null') as unknown;
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Each course's review cards, by course key; courses with none are left out. */
export function readCollections(courses: readonly SiteCourse[], storage: Pick<Storage, 'getItem'> = localStorage): Record<string, Collection> {
  const out: Record<string, Collection> = {};
  for (const c of courses) {
    const save = readSave(storage, c.save);
    if (save && typeof save.review === 'object' && save.review) {
      const col = migrateCollection(save.review);
      if (Object.keys(col.cards).length) out[c.key] = col;
    }
  }
  return out;
}

/**
 * A course's cards that can be asked here: all but its live figures, which
 * need the course's own code and wait on its own Review page.
 */
export function askableHere(col: Collection): Collection {
  const figures = new Set(Object.values(col.notes).filter(isFigureNote).map((n) => n.id));
  if (!figures.size) return col;
  return { ...col, cards: Object.fromEntries(Object.entries(col.cards).filter(([, c]) => !figures.has(c.note))) };
}

/** How many live-figure cards each course has ready today, which only its own Review page can ask. */
export function figuresWaiting(cols: Record<string, Collection>, now: number = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, col] of Object.entries(cols)) {
    const all = dayCounts(col, now);
    const here = dayCounts(askableHere(col), now);
    const n = all.new + all.learning + all.review - (here.new + here.learning + here.review);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** Write a course's review cards back into its save, keeping the rest of it as it is now. */
export function writeCollection(course: SiteCourse, col: Collection, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
  const save = readSave(storage, course.save);
  if (!save) return;
  try {
    storage.setItem(course.save, JSON.stringify({ ...save, review: col }));
  } catch {
    // Storage full or blocked: the answer is lost, the sitting goes on.
  }
}

const themeStyle = (t?: CourseTheme): string =>
  t ? [`--ra-bg:${t.bg}`, `--ra-panel:${t.panel ?? t.bg}`, `--ra-text:${t.text}`, `--ra-accent:${t.accent}`, t.good ? `--ra-good:${t.good}` : '', t.bad ? `--ra-bad:${t.bad}` : '', t.display ? `--ra-display:${t.display}` : ''].filter(Boolean).join(';') : '';

/** The review of every course: a page to put in the catalog. */
export function allCoursesReview(o: AllReviewOptions): HTMLElement {
  const storage = o.storage ?? localStorage;
  const SITTING = o.sitting ?? 30;
  const page = el('div.review-all');
  const byKey = new Map(o.courses.map((c) => [c.key, c]));

  const front = () => {
    const raw = readCollections(o.courses, storage);
    const cols = Object.fromEntries(Object.entries(raw).map(([k, c]) => [k, askableHere(c)]));
    const now = Date.now();
    const waiting = figuresWaiting(raw, now);
    const rows = o.courses.filter((c) => cols[c.key]).map((c) => ({ c, day: dayCounts(cols[c.key], now), all: totals(cols[c.key], now) }));
    const sum = rows.reduce((t, r) => ({ new: t.new + r.day.new, learning: t.learning + r.day.learning, review: t.review + r.day.review }), { new: 0, learning: 0, review: 0 });
    const ready = sum.new + sum.learning + sum.review;
    const next = Math.min(...rows.map((r) => r.all.next ?? Infinity));
    page.replaceChildren(
      el('h1', {}, 'Review all courses'),
      el('p.ra-lede', {}, 'Every course’s cards in one sitting: the check questions you have answered and the flash cards you have met, each on its own schedule. Each card comes in its course’s colours.'),
      rows.length
        ? el('div', {},
          el('table.ra-courses', {},
            el('thead', {}, el('tr', {}, el('th', {}, 'Course'), el('th.ra-n.ra-new', {}, 'New'), el('th.ra-n.ra-learning', {}, 'Learning'), el('th.ra-n.ra-due', {}, 'Due'))),
            el('tbody', {}, rows.map(({ c, day }) => el('tr', {},
              el('td', {}, c.icon ? el('img.ra-icon', { src: c.icon, alt: '' }) : null, el('a', { href: `${c.href}#/review` }, c.title)),
              el('td.ra-n.ra-new', {}, String(day.new)), el('td.ra-n.ra-learning', {}, String(day.learning)), el('td.ra-n.ra-due', {}, String(day.review)))))),
          ready
            ? el('button.ra-btn.ra-big', { type: 'button', onclick: () => sitting() }, `Study ${Math.min(SITTING, ready)} cards`)
            : el('p', {}, `All caught up for today.${Number.isFinite(next) ? ` The next card is due ${when(next - now)}.` : ''}`),
          Object.keys(waiting).length
            ? el('p.ra-note', {}, 'Figure cards, which you work with the figure itself, wait on each course’s own Review page: ',
              ...Object.entries(waiting).flatMap(([k, n], i) => [i ? ', ' : '', el('a', { href: `${byKey.get(k)!.href}#/review` }, `${byKey.get(k)!.title} (${n})`)]), '.')
            : '',
          anki(raw))
        : el('p', {}, 'Nothing to review yet. Answer a lesson’s check in any course and its questions come here.'),
      o.back ? el('p.ra-back', {}, el('a', { href: o.back.href }, o.back.label)) : '',
    );
  };

  /** One Anki package of every course: each course's decks under its own name, the notes' photos by address. */
  const anki = (cols: Record<string, Collection>) => {
    const status = el('p.ra-note', {}, 'In Anki, choose File › Import and keep “Import any learning progress” ticked. Photos come along; drawings come only in a course’s own download, from its Review page.');
    const button = el('button.ra-btn.ra-ghost', { type: 'button' }, 'Download all for Anki (.apkg)') as HTMLButtonElement;
    button.addEventListener('click', () => {
      button.disabled = true;
      void (async () => {
        try {
          status.textContent = 'Gathering photos…';
          const merged = mergeCollections(cols);
          const media: Record<string, { name: string; data: Uint8Array }> = {};
          for (const n of Object.values(merged.notes)) {
            if (!n.image) continue;
            try {
              const file = await pictureFile(el('img', { src: n.image }), `review-${n.guid}`);
              if (file) media[n.id] = file;
            } catch {
              // Offline, or moved: the card goes without it.
            }
          }
          const { toApkg } = await import('./anki');
          const bytes = await toApkg(merged, {
            media,
            sourceLabel: (n) => byKey.get(n.id.split(':')[0])?.title ?? '',
            html: escapeHtml,
          });
          const name = o.fileName ?? 'all-courses.apkg';
          const a = el('a', { href: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' })), download: name }) as HTMLAnchorElement;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
          status.textContent = `Saved ${name}: ${Object.keys(merged.notes).length} cards from ${Object.keys(cols).length} courses, ${Object.keys(media).length} with photos.`;
        } catch (e) {
          status.textContent = `Could not make the package: ${e instanceof Error ? e.message : String(e)}`;
        } finally {
          button.disabled = false;
        }
      })();
    });
    return el('section.ra-anki', {}, el('h2', {}, 'Anki'), button, status);
  };

  const sitting = () => {
    // Each course's own queue (its limits, its order), dealt in turn.
    const read = () => Object.fromEntries(Object.entries(readCollections(o.courses, storage)).map(([k, c]) => [k, askableHere(c)]));
    const start = read();
    const now = Date.now();
    const queues: Record<string, string[]> = {};
    for (const [k, col] of Object.entries(start)) queues[k] = studyQueue(col, now, { limit: SITTING });
    let order = Object.keys(queues).reduce<string[]>((all, k) => weave(all, queues[k].map(() => k)), []).slice(0, SITTING);
    const seen = new Set<string>();
    let right = 0;

    const show = () => {
      const cols = read();
      const t = Date.now();
      // A card missed a minute ago, in any course, comes first.
      let pick: { key: string; id: string } | undefined;
      for (const [k, col] of Object.entries(cols)) {
        const n = nextCard(col, [], t);
        const c = n && col.cards[n.id];
        if (c && c.lastReview !== undefined && c.due <= t) {
          pick = { key: k, id: n.id };
          break;
        }
      }
      while (!pick && order.length) {
        const k = order.shift()!;
        const col = cols[k];
        const n = col && nextCard(col, queues[k] ?? [], t);
        if (n) {
          queues[k] = n.rest;
          pick = { key: k, id: n.id };
        }
      }
      if (!pick) {
        // What is left: learning cards due within a few minutes.
        for (const [k, col] of Object.entries(cols)) {
          const n = nextCard(col, [], t);
          if (n) {
            pick = { key: k, id: n.id };
            break;
          }
        }
      }
      if (!pick) return finish();
      const course = byKey.get(pick.key)!;
      const col = cols[pick.key];
      const card = col.cards[pick.id];
      const note = col.notes[card.note];
      const id = pick.id;
      const firstTime = !seen.has(`${course.key}:${id}`);
      seen.add(`${course.key}:${id}`);
      const body = noteCard(note, pictures(note, course), () => preview(col, id, Date.now()), (r, took) => {
        if (firstTime && r !== Rating.Again) right++;
        const fresh = readCollections([course], storage)[course.key] ?? col;
        writeCollection(course, answer(fresh, id, r, Date.now(), { took }), storage);
        show();
      });
      const deck = (col.decks[card.deck]?.name ?? '').replace(`${course.title}::`, '');
      page.replaceChildren(
        el('div.ra-card', { style: themeStyle(course.theme) },
          el('p.ra-from', {}, course.icon ? el('img.ra-icon', { src: course.icon, alt: '' }) : null, el('strong', {}, course.title), deck ? ` · ${deck}` : ''),
          body),
        el('p.ra-actions', {}, el('button.ra-btn.ra-ghost.ra-small', { type: 'button', onclick: front }, 'Stop')),
      );
      page.scrollIntoView({ block: 'start' });
    };

    const finish = () => {
      page.replaceChildren(
        el('h1', {}, 'Sitting done'),
        el('p', {}, seen.size ? `${right} of ${seen.size} right the first time.` : 'Nothing was due.'),
        el('button.ra-btn', { type: 'button', onclick: front }, 'Back to review'),
      );
    };
    show();
  };

  front();
  return page;
}

/** A note's photo, or a line saying its picture is drawn in its course. */
function pictures(n: Note, c: SiteCourse): Node[] {
  if (n.image) return [el('img.ra-photo', { src: n.image, alt: '' })];
  if (n.drawing) return [el('p.ra-drawing', {}, 'This card has a drawing: ', el('a', { href: `${c.href}#/review` }, `see it in ${c.title}`), '.')];
  return [];
}

function when(ms: number): string {
  const h = ms / 3600000;
  if (h < 1) return 'within the hour';
  if (h < 24) return `in about ${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d === 1 ? 'tomorrow' : `in ${d} days`;
}
