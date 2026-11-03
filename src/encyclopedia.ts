// An encyclopedia shared by every course on a site: short entries on the
// ideas, people, places and things the lessons are built on, each saying what
// it is, why it mattered and what it connects to, with links to other entries,
// to the lessons that teach it (in any course) and to Wikipedia for the whole
// story. Each course is an entry too, whose page is its one-page glossary: the
// people and ideas it can't do without, and its reference tables.
//
// The entries live in one folder for the whole site, a JSON file per course
// (the course an entry belongs to most), all bundled into every course by the
// build (vite.ts encyclopediaModule):
//
//   {
//     "course": { "line": "…", "text": ["…"], "people": ["james-hutton"], "ideas": ["deep-time"],
//                 "tables": [{ "title": "…", "columns": ["…"], "rows": [["…"]] }] },
//     "entries": {
//       "james-hutton": { "kind": "person", "title": "James Hutton", "dates": "1726–1797",
//         "line": "…", "text": ["… [[deep time]] …"], "matters": "…", "see": ["charles-lyell"],
//         "learn": [{ "course": "geology", "lesson": "siccar", "for": "…" }], "wikipedia": "James_Hutton" }
//     }
//   }
//
// Lesson text links to an entry with [[words]], which finds the entry by its
// title or one of its other names, or [[words|@id]] for an entry by id. A tap
// opens a small card beside the words; the card opens the entry's page.

import { el, type Child } from './dom';
import { closeFootnote, footnoteMore, openPopover } from './footnote';
import { glossaryMore, sortKey } from './glossary';
import type { View } from './router';

export type EntryKind = 'idea' | 'person' | 'place' | 'thing' | 'course';

/** A lesson, in any course, that teaches what an entry is about. */
export interface EntryLesson {
  /** The course's folder name, such as "geology". */
  course: string;
  lesson: string;
  /** What the reader does there, in a few words. */
  for?: string;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  /** Other names, for search and for [[words]] links. */
  also?: string[];
  /** A person's years, such as "1726–1797". */
  dates?: string;
  /** One sentence: who they were in the story, or what the thing is. Shown in lists and on the card. */
  line: string;
  /** One to three short paragraphs, with lesson markup and [[entry]] links. */
  text: string[];
  /** Why it matters: what changed because of it. */
  matters?: string;
  /** Related entries, by id. */
  see?: string[];
  learn?: EntryLesson[];
  /** The article's name on en.wikipedia.org, such as "James_Hutton". */
  wikipedia?: string;
  /** The course whose file it is in. */
  home: string;
}

export interface EntryTable {
  title: string;
  note?: string;
  columns: string[];
  rows: string[][];
}

/** A course's one-page glossary, which is its entry's page. */
export interface CourseSummary {
  line: string;
  text?: string[];
  /** The people the course can't do without, by entry id, in the order to show them. */
  people?: string[];
  /** Its key ideas, by entry id. */
  ideas?: string[];
  /** Its key places and things, by entry id. */
  things?: string[];
  tables?: EntryTable[];
}

/** One course's encyclopedia file. */
export interface EntryFile {
  course?: CourseSummary;
  entries: Record<string, Omit<Entry, 'id' | 'home'>>;
}

/** What the encyclopedia knows of a course. */
export interface EncyclopediaCourse {
  title: string;
  /** Its icon, from the course's folder ("icons/icon.svg"). */
  icon?: string;
  /** Where its lessons are, if not /lesson (course.json "lessonPath"). */
  lessonPath?: string;
  /** Its lessons' titles, by id. */
  lessons: Record<string, string>;
}

/** What the build hands every course: each course's file, by path ("encyclopedia/geology.json"), and the courses. */
export interface EncyclopediaData {
  files: Record<string, EntryFile>;
  courses: Record<string, EncyclopediaCourse>;
}

/** The course a file is for: its name without folder or .json. */
export const fileCourse = (path: string) => path.split('/').at(-1)!.replace(/\.json$/, '');

/** Every entry in the files, the courses' own entries included, A to Z. */
export function readEntries(data: EncyclopediaData): Entry[] {
  const out: Entry[] = [];
  for (const [path, file] of Object.entries(data.files)) {
    const home = fileCourse(path);
    for (const [id, e] of Object.entries(file.entries ?? {})) out.push({ ...e, id, home, text: e.text ?? [] });
    const c = file.course;
    const course = data.courses[home];
    if (c && course) {
      const keys = [...(c.people ?? []), ...(c.ideas ?? []), ...(c.things ?? [])];
      out.push({ id: home, kind: 'course', title: course.title, line: c.line, text: c.text ?? [], see: keys, learn: [], home });
    }
  }
  return out.sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title), 'en', { numeric: true }));
}

/** Finds entries by id, or by title or another name. */
export interface EntryIndex {
  all: readonly Entry[];
  byId: (id: string) => Entry | undefined;
  /** The entry for [[words]]: by title or other name, ignoring case, a leading "the", and a plural s. */
  byName: (words: string) => Entry | undefined;
  /** Entries that link here, in their text or their related list. */
  linkedFrom: (id: string) => Entry[];
}

/** The [[…]] markup in text: words, and an id after |@ when there is one. Colour markup ([[words|key]]) is not a link. */
export const ENTRY_LINK = /\[\[([^\]|]+?)(?:\|@([\w-]+))?\]\]/g;

export function entryIndex(entries: readonly Entry[]): EntryIndex {
  const ids = new Map(entries.map((e) => [e.id, e]));
  const names = new Map<string, Entry>();
  for (const e of entries) for (const n of [e.title, ...(e.also ?? [])]) if (!names.has(sortKey(n))) names.set(sortKey(n), e);
  const byName = (words: string) => {
    const k = sortKey(words);
    return names.get(k) ?? (k.endsWith('s') ? names.get(k.slice(0, -1)) : undefined) ?? (k.endsWith('es') ? names.get(k.slice(0, -2)) : undefined);
  };
  let back: Map<string, Entry[]> | undefined;
  const linkedFrom = (id: string) => {
    if (!back) {
      back = new Map();
      for (const e of entries) {
        const to = new Set<string>(e.see ?? []);
        for (const t of [...e.text, e.matters ?? '']) for (const m of t.matchAll(ENTRY_LINK)) {
          const hit = m[2] ? ids.get(m[2]) : byName(m[1]);
          if (hit) to.add(hit.id);
        }
        to.delete(e.id);
        for (const t of to) back.set(t, [...(back.get(t) ?? []), e]);
      }
    }
    return back.get(id) ?? [];
  };
  return { all: entries, byId: (id) => ids.get(id), byName, linkedFrom };
}

// ---- The encyclopedia a course is using ------------------------------------

export interface EncyclopediaOptions {
  data: EncyclopediaData;
  /** This course's folder name. */
  course: string;
  /** Turns a paragraph's markup into a node (the course's prose, which renders [[links]] with entryLink). */
  prose: (text: string) => HTMLElement;
  /** Where the encyclopedia's pages are. Default "/encyclopedia". */
  path?: string;
  /** Where a lesson of this course is. Default `#/lesson/<id>`. */
  lessonHref?: (id: string) => string;
  /** Where another course's folder is, from this course's page: default `../<course>/`. */
  courseHref?: (course: string) => string;
}

export interface Encyclopedia extends EncyclopediaOptions {
  index: () => EntryIndex;
  /** An entry's page. */
  href: (id: string) => string;
  /** A lesson in any course. */
  lesson: (course: string, lesson: string) => string;
}

let current: Encyclopedia | undefined;

/** The encyclopedia the page is using, if any. */
export const activeEncyclopedia = () => current;

/**
 * Makes `o` the encyclopedia that [[links]] in lesson text open, and that the
 * glossary and technical notes point into. The entries are read the first
 * time they're needed, so course edits applied at start-up are in them.
 */
export function useEncyclopedia(o: EncyclopediaOptions): Encyclopedia {
  let index: EntryIndex | undefined;
  const path = o.path ?? '/encyclopedia';
  const lessonHref = o.lessonHref ?? ((id: string) => `#/lesson/${id}`);
  const courseHref = o.courseHref ?? ((c: string) => `../${c}/`);
  const e: Encyclopedia = {
    ...o,
    index: () => (index ??= entryIndex(readEntries(o.data))),
    href: (id) => `#${path}/${id}`,
    lesson: (course, lesson) => (course === o.course ? lessonHref(lesson) : `${courseHref(course)}#${o.data.courses[course]?.lessonPath ?? '/lesson'}/${lesson}`),
  };
  current = e;
  footnoteMore.more = (note) => {
    if (note.kind !== 'technical') return null;
    const hit = e.index().byName(note.title);
    return hit ? el('p.fn-more', {}, el('a', { href: e.href(hit.id) }, `${hit.title} in the encyclopedia ›`)) : null;
  };
  glossaryMore.href = (term) => {
    const hit = e.index().byName(term);
    return hit && e.href(hit.id);
  };
  return e;
}

const KIND_LABEL: Record<EntryKind, string> = { idea: 'Idea', person: 'Person', place: 'Place', thing: 'Thing', course: 'Course' };

/**
 * The node for [[words]] or [[words|@id]] in text: a link that opens the
 * entry's card, or the words alone if there is no such entry (or no
 * encyclopedia), which a content test catches.
 */
export function entryLink(words: string, id?: string): Node {
  const enc = current;
  const entry = enc && (id ? enc.index().byId(id) : enc.index().byName(words));
  if (!enc || !entry) return document.createTextNode(words);
  const a = el('a.ency-link', { href: enc.href(entry.id), 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, words) as HTMLAnchorElement;
  a.addEventListener('click', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    // Already on an entry's page, a link goes straight to the next entry.
    if (location.hash.startsWith(enc.href('').slice(0, -1))) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (a.classList.contains('on')) closeFootnote();
    else entryCard(a, entry, enc);
  });
  return a;
}

/** The small card a link opens: what the entry is, in a line, and the way to the whole entry. */
function entryCard(anchor: HTMLElement, e: Entry, enc: Encyclopedia): HTMLElement {
  const close = el('button.fn-close', { type: 'button', 'aria-label': 'Close' }, '×');
  const first = e.text[0] ? firstSentence(e.text[0]) : '';
  const node = el('div.fn-pop.ency-pop', { role: 'dialog', 'aria-label': e.title, tabindex: '-1' },
    el('i.fn-arrow'),
    el('div.fn-head', {}, el('p.fn-kind', {}, kindLine(e)), close),
    el('h4.fn-title', {}, e.title),
    el('div.fn-body', {}, el('p.ency-line', {}, plainText(e.line)), first ? plain(first) : null),
    el('p.fn-more', {}, el('a', { href: enc.href(e.id) }, 'Read the entry ›')),
  );
  return openPopover(anchor, node, close);
}

/** An entry's line on its own page, its links live. */
function lineNode(enc: Encyclopedia, line: string): HTMLElement {
  const p = enc.prose(line);
  p.classList.add('ency-line');
  return p;
}

const kindLine = (e: Entry) => (e.dates ? `${KIND_LABEL[e.kind]} · ${e.dates}` : KIND_LABEL[e.kind]);

/** A paragraph's first sentence. */
export function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
}

/** Markup as plain words: links and colours keep their words, bold and italic and notes go. */
export function plainText(text: string): string {
  return text
    .replace(ENTRY_LINK, '$1')
    .replace(/\[\[([^\]|]+)\|\w+\]\]/g, '$1')
    .replace(/\[\^[\w-]+\]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1');
}

const plain = (text: string) => el('p', {}, plainText(text));

// ---- The pages -------------------------------------------------------------

export interface EncyclopediaViewOptions {
  enc: Encyclopedia;
  /** Resolves a path next to the page (asset.ts), for other courses' icons and links from a downloaded copy. */
  asset?: (path: string) => string;
}

type Filter = 'all' | 'course' | 'person' | 'idea' | 'place';
const FILTERS: [Filter, string][] = [['all', 'All'], ['person', 'People'], ['idea', 'Ideas'], ['place', 'Places and things'], ['course', 'Courses']];

/** What the list keeps while the reader moves from entry to entry. */
const listState = { query: '', filter: 'all' as Filter, mine: true, scroll: 0 };

const TRAIL_KEY = 'didactics.encyclopedia-trail';
function trail(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function visit(id: string): string[] {
  const before = trail().filter((t) => t !== id);
  const now = [...before, id].slice(-6);
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(now));
  } catch {
    /* private mode: no trail */
  }
  return before.slice(-4);
}

/**
 * The view for `/encyclopedia` and `/encyclopedia/:id`. On a phone, the list
 * or one entry; from 960px wide, the list beside the open entry, which is
 * this course's own entry (its glossary) when none is chosen.
 */
export function encyclopediaView(o: EncyclopediaViewOptions): View {
  const { enc } = o;
  const asset = o.asset ?? ((p: string) => p);
  return (root, ctx) => {
    const idx = enc.index();
    const id = ctx.params.id;
    const entry = id ? idx.byId(id) : undefined;
    const shown = entry ?? idx.byId(enc.course);
    const page = el('div.page.ency', {});
    page.classList.toggle('ency-open', !!entry);
    const list = listView(enc, idx, asset, shown?.id);
    const main = el('div.ency-main', {}, shown ? entryView(enc, idx, shown, asset, !!entry) : el('p', {}, 'No entries yet.'));
    if (id && !entry) main.prepend(el('p.ency-missing', {}, 'There is no entry by that name. Here is this course’s page instead.'));
    page.append(list.node, main);
    root.append(page);
    list.restore();
    if (entry) window.scrollTo(0, 0);
    return () => {
      listState.scroll = list.scroller.scrollTop;
    };
  };
}

function courseMarks(enc: Encyclopedia, e: Entry, asset: (p: string) => string): Child {
  const keys = [...new Set([e.home, ...(e.learn ?? []).map((l) => l.course)])];
  return el('span.ency-marks', {}, keys.map((k) => {
    const c = enc.data.courses[k];
    if (!c?.icon) return null;
    const src = k === enc.course ? c.icon : asset(`${enc.courseHref?.(k) ?? `../${k}/`}${c.icon}`);
    const img = el('img.ency-mark', { src, alt: '', title: c.title, width: 16, height: 16 });
    // Offline, another course's icon may not be at hand: leave no broken image.
    img.addEventListener('error', () => img.remove());
    return img;
  }));
}

function listView(enc: Encyclopedia, idx: EntryIndex, asset: (p: string) => string, on?: string) {
  const mineOf = (e: Entry) => e.home === enc.course || (e.learn ?? []).some((l) => l.course === enc.course);
  const search = el('input.gl-search.ency-search', { type: 'search', placeholder: `Search ${idx.all.length} entries`, 'aria-label': 'Search the encyclopedia', autocomplete: 'off', value: listState.query }) as HTMLInputElement;
  const filters = el('div.ency-filters', { role: 'group', 'aria-label': 'Show' });
  const scope = el('label.ency-scope', {});
  const mineBox = el('input', { type: 'checkbox', checked: listState.mine }) as HTMLInputElement;
  scope.append(mineBox, ` Only ${enc.data.courses[enc.course]?.title ?? 'this course'}`);
  const rows = idx.all.map((e) => {
    const row = el('li', {}, el(`a.ency-row${e.id === on ? '.on' : ''}`, { href: enc.href(e.id) },
      el('span.ency-row-title', {}, e.title, e.kind === 'course' ? el('span.ency-tag', {}, 'Course') : null),
      el('span.ency-row-line', {}, plainText(e.dates ? `${e.dates}. ${e.line}` : e.line)),
      courseMarks(enc, e, asset)));
    return { e, row, hay: sortKey([e.title, ...(e.also ?? []), plainText(e.line), e.dates ?? ''].join(' ')) };
  });
  const ul = el('ul.ency-list-rows', {}, rows.map((r) => r.row));
  const none = el('p.gl-none', { hidden: true }, 'Nothing matches that.');
  const buttons = FILTERS.map(([f, label]) => {
    const b = el('button.ency-filter', { type: 'button', 'aria-pressed': String(listState.filter === f) }, label);
    b.addEventListener('click', () => {
      listState.filter = f;
      for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
      apply();
    });
    return b;
  });
  filters.append(...buttons);
  const apply = () => {
    listState.query = search.value;
    listState.mine = mineBox.checked;
    const q = sortKey(search.value);
    let n = 0;
    for (const r of rows) {
      const f = listState.filter;
      const kindOk = f === 'all' || r.e.kind === f || (f === 'place' && r.e.kind === 'thing');
      // A search looks through every course.
      const hit = kindOk && (q ? r.hay.includes(q) : !listState.mine || mineOf(r.e) || r.e.kind === 'course');
      r.row.hidden = !hit;
      if (hit) n++;
    }
    none.hidden = n > 0;
  };
  search.addEventListener('input', apply);
  mineBox.addEventListener('change', apply);
  apply();
  const scroller = el('div.ency-scroll', {}, ul, none);
  const node = el('nav.ency-list', { 'aria-label': 'Entries' },
    el('h1.ency-heading', {}, el('a', { href: enc.href('') .slice(0, -1) }, 'Encyclopedia')),
    enc.data.courses[enc.course] && idx.byId(enc.course) && on !== enc.course
      ? el('a.ency-course-link', { href: enc.href(enc.course) }, el('b', {}, enc.data.courses[enc.course].title), ' at a glance: its people, ideas and tables ›')
      : null,
    el('div.ency-tools', {}, search, filters, scope),
    scroller);
  return {
    node,
    scroller,
    restore: () => {
      scroller.scrollTop = listState.scroll;
      const lit = scroller.querySelector<HTMLElement>('.ency-row.on');
      if (lit && scroller.scrollHeight > scroller.clientHeight) {
        const top = lit.offsetTop - scroller.offsetTop;
        if (top < scroller.scrollTop || top > scroller.scrollTop + scroller.clientHeight - 40) scroller.scrollTop = top - 80;
      }
    },
  };
}

function entryView(enc: Encyclopedia, idx: EntryIndex, e: Entry, asset: (p: string) => string, chosen: boolean): HTMLElement {
  const before = chosen ? visit(e.id).map((t) => idx.byId(t)).filter((t): t is Entry => !!t) : [];
  const chip = (x: Entry) => el(`a.ency-chip.ency-${x.kind}`, { href: enc.href(x.id) }, x.title);
  const node = el('article.ency-entry', {},
    el('a.ency-back', { href: enc.href('').slice(0, -1) }, '‹ All entries'),
    before.length ? el('p.ency-trail', { 'aria-label': 'Entries you came through' }, before.map((t) => [el('a', { href: enc.href(t.id) }, t.title), ' › ']), el('span', {}, e.title)) : null,
    el('p.ency-kind', {}, kindLine(e)),
    el('h2.ency-title', {}, e.title),
    lineNode(enc, e.line),
    e.text.map((t) => enc.prose(t)),
  );
  if (e.matters) node.append(el('aside.ency-matters', {}, el('p.ency-label', {}, 'Why it matters'), enc.prose(e.matters)));
  if (e.kind === 'course') node.append(courseGlossary(enc, idx, e));

  const related = [...(e.see ?? []).map((s) => idx.byId(s)), ...idx.linkedFrom(e.id)].filter((x): x is Entry => !!x && x.id !== e.id && x.kind !== 'course');
  const seen = new Set<string>();
  const uniq = related.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  if (uniq.length && e.kind !== 'course') node.append(el('section.ency-related', {}, el('h3', {}, 'Connected'), el('p.ency-chips', {}, uniq.map(chip))));

  const learn = (e.learn ?? []).filter((l) => enc.data.courses[l.course]?.lessons[l.lesson]);
  if (learn.length) {
    const courses = [...new Set(learn.map((l) => l.course))].sort((a, b) => Number(b === enc.course) - Number(a === enc.course));
    node.append(el('section.ency-learn', {}, el('h3', {}, 'Learn more'), courses.map((c) => {
      const course = enc.data.courses[c];
      return el('div.ency-learn-course', {},
        el('p.ency-learn-head', {}, courseMarks(enc, { ...e, home: c, learn: [] }, asset), course.title),
        el('ul', {}, learn.filter((l) => l.course === c).map((l) => {
          const href = c === enc.course ? enc.lesson(c, l.lesson) : asset(enc.lesson(c, l.lesson));
          return el('li', {}, el('a', { href }, course.lessons[l.lesson]), l.for ? el('span.ency-for', {}, ` ${l.for}`) : null);
        })));
    })));
  }
  if (e.kind === 'course' && e.id !== enc.course) node.append(el('p.ency-open-course', {}, el('a', { href: asset(enc.courseHref?.(e.id) ?? `../${e.id}/`) }, `Open ${e.title} ›`)));
  if (e.wikipedia) {
    node.append(el('p.ency-wiki', {}, el('a', { href: `https://en.wikipedia.org/wiki/${e.wikipedia}`, target: '_blank', rel: 'noopener' }, `${e.wikipedia.replace(/_/g, ' ')} on Wikipedia ↗`)));
  }
  return node;
}

/** A course's page: its people, ideas and things, a line each, and its tables. */
function courseGlossary(enc: Encyclopedia, idx: EntryIndex, e: Entry): HTMLElement {
  const file = Object.entries(enc.data.files).find(([p]) => fileCourse(p) === e.id)?.[1];
  const c = file?.course;
  const group = (title: string, ids: string[] | undefined) => {
    const list = (ids ?? []).map((i) => idx.byId(i)).filter((x): x is Entry => !!x);
    if (!list.length) return null;
    return el('section.ency-gloss', {}, el('h3', {}, title), el('dl', {}, list.map((x) => [
      el('dt', {}, el('a', { href: enc.href(x.id) }, x.title), x.dates ? el('span.ency-dates', {}, ` ${x.dates}`) : null),
      el('dd', {}, plainText(x.line)),
    ])));
  };
  const tables = (c?.tables ?? []).map((t) => el('section.ency-gloss', {}, el('h3', {}, t.title),
    el('div.ency-table-wrap', {}, el('table.ency-table', {},
      el('thead', {}, el('tr', {}, t.columns.map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, t.rows.map((r) => el('tr', {}, r.map((cell, i) => (i === 0 ? el('th', { scope: 'row' }, enc.prose(cell)) : el('td', {}, enc.prose(cell))))))))),
    t.note ? el('p.ency-table-note', {}, t.note) : null));
  return el('div.ency-glossary', {}, group('People', c?.people), group('Ideas', c?.ideas), group('Places and things', c?.things), tables);
}

// ---- Checks ----------------------------------------------------------------

/** Most words an entry's text may run to, and its "why it matters". */
export const ENTRY_WORDS = 220;
export const MATTERS_WORDS = 90;

const words = (t: string) => plainText(t).split(/\s+/).filter(Boolean).length;
const KINDS = new Set<EntryKind>(['idea', 'person', 'place', 'thing']);

/** Everything wrong with the files: unknown links, lessons or courses, missing fields, entries that run long. */
export function encyclopediaProblems(data: EncyclopediaData): string[] {
  const out: string[] = [];
  const seenIds = new Map<string, string>();
  for (const [path, file] of Object.entries(data.files)) {
    const home = fileCourse(path);
    if (!data.courses[home]) out.push(`${path}: there is no course "${home}"`);
    for (const id of Object.keys(file.entries ?? {})) {
      if (seenIds.has(id)) out.push(`${path}: entry ${id} is also in ${seenIds.get(id)}`);
      seenIds.set(id, path);
      if (data.courses[id]) out.push(`${path}: entry ${id} has a course's name`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) out.push(`${path}: entry id "${id}" should be lowercase words joined by hyphens`);
    }
  }
  const entries = readEntries(data);
  const idx = entryIndex(entries);
  const names = new Map<string, string>();
  const link = (where: string, text: string) => {
    for (const m of text.matchAll(ENTRY_LINK)) {
      const hit = m[2] ? idx.byId(m[2]) : idx.byName(m[1]);
      if (!hit) out.push(`${where}: [[${m[1]}${m[2] ? `|@${m[2]}` : ''}]] names no entry`);
    }
  };
  for (const e of entries) {
    const w = `entry ${e.id}`;
    for (const n of [e.title, ...(e.also ?? [])]) {
      const k = sortKey(n);
      if (names.has(k) && names.get(k) !== e.id) out.push(`${w}: the name "${n}" is also ${names.get(k)}'s`);
      names.set(k, e.id);
    }
    if (e.kind === 'course') {
      if (!e.line?.trim()) out.push(`${w}: the course needs a line`);
    } else {
      if (!KINDS.has(e.kind)) out.push(`${w}: kind "${String(e.kind)}" is not idea, person, place or thing`);
      if (!e.title?.trim() || !e.line?.trim() || !e.text.length) out.push(`${w}: needs a title, a line and text`);
      if (e.kind === 'person' && !e.dates) out.push(`${w}: a person needs dates`);
      if (e.text.reduce((n, t) => n + words(t), 0) > ENTRY_WORDS) out.push(`${w}: text runs past ${ENTRY_WORDS} words`);
      if (e.matters && words(e.matters) > MATTERS_WORDS) out.push(`${w}: "why it matters" runs past ${MATTERS_WORDS} words`);
      if (e.wikipedia !== undefined && !/^[^\s/?#]+$/.test(e.wikipedia)) out.push(`${w}: wikipedia should be the article's name, like James_Hutton`);
    }
    for (const t of [...e.text, e.matters ?? '', e.line]) link(w, t);
    for (const s of e.see ?? []) if (!idx.byId(s)) out.push(`${w}: see "${s}" is no entry`);
    for (const l of e.learn ?? []) {
      const c = data.courses[l.course];
      if (!c) out.push(`${w}: learn names no course "${l.course}"`);
      else if (!c.lessons[l.lesson]) out.push(`${w}: ${l.course} has no lesson "${l.lesson}"`);
    }
  }
  for (const [path, file] of Object.entries(data.files)) {
    for (const t of file.course?.tables ?? []) {
      for (const r of t.rows) if (r.length !== t.columns.length) out.push(`${path}: a row of "${t.title}" has ${r.length} cells for ${t.columns.length} columns`);
      for (const r of t.rows) for (const cell of r) link(`${path} table "${t.title}"`, cell);
    }
  }
  return out;
}

/** [[links]] in a lesson's texts that name no entry. */
export function entryLinkProblems(label: string, texts: Iterable<string>, idx: EntryIndex): string[] {
  const out: string[] = [];
  for (const t of texts) for (const m of t.matchAll(ENTRY_LINK)) {
    const hit = m[2] ? idx.byId(m[2]) : idx.byName(m[1]);
    if (!hit) out.push(`${label}: [[${m[1]}${m[2] ? `|@${m[2]}` : ''}]] names no entry`);
  }
  return out;
}
