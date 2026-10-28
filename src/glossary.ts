// A glossary: every term the lessons use, A to Z, with a search box. Its
// entries come from two places: the technical footnotes in the lessons
// (glossaryFromLessons), and a hand-written list of the core terms the text
// itself introduces, kept by the app in a JSON file of its own:
//
//   { "dew-point": { "term": "Dew point", "text": "…", "lesson": "fog", "also": ["dewpoint"] } }
//
// An entry can say which lesson introduces it; the list then links there.

import { el, type Child } from './dom';
import type { Footnote, FootnoteKind } from './footnote';
import type { Lesson } from './lesson';

export interface GlossaryEntry {
  id: string;
  term: string;
  /** The definition, with **bold** and *italic* markup. A sentence or three. */
  text: string;
  /** The lesson that introduces it, by id. */
  lesson?: string;
  /** Other spellings or names the search should find it by. */
  also?: string[];
  /** Set when the entry is a lesson's footnote, so the list can colour it like the marker. */
  note?: FootnoteKind;
  /** Makes the term a button, for an app that has more to show, such as a card with a photo. */
  open?: () => void;
}

/** A glossary file: entries by id, each without its id. */
export type GlossaryFile = Readonly<Record<string, Omit<GlossaryEntry, 'id' | 'note' | 'open'>>>;

export function glossaryFromFile(file: GlossaryFile): GlossaryEntry[] {
  return Object.entries(file).map(([id, e]) => ({ ...e, id }));
}

/** The footnotes that belong in the glossary: technical ones, unless they opt out, and digressions that opt in. */
export function glossaryFromLessons(lessons: readonly Lesson[]): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const l of lessons) {
    for (const [id, n] of Object.entries(l.footnotes ?? {}) as [string, Footnote][]) {
      const listed = n.glossary ?? n.kind === 'technical';
      if (!listed) continue;
      out.push({ id: `${l.id}/${id}`, term: typeof n.glossary === 'string' ? n.glossary : n.title, text: n.text, lesson: l.id, note: n.kind });
    }
  }
  return out;
}

/** How a term sorts and files: no case, accents, leading "the" or "a", or symbols. */
export function sortKey(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

/** Entries from any number of lists, A to Z. A term listed twice keeps its first entry. */
export function mergeGlossary(...lists: GlossaryEntry[][]): GlossaryEntry[] {
  const seen = new Map<string, GlossaryEntry>();
  for (const e of lists.flat()) if (!seen.has(sortKey(e.term))) seen.set(sortKey(e.term), e);
  return [...seen.values()].sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term), 'en', { numeric: true }));
}

/** The letter an entry is filed under, with numbers under #. */
const letterOf = (e: GlossaryEntry) => {
  const c = sortKey(e.term)[0] ?? '#';
  return /[a-z]/.test(c) ? c.toUpperCase() : '#';
};

export interface GlossaryViewOptions {
  entries: readonly GlossaryEntry[];
  /** Turns a definition's markup into a node. */
  prose: (text: string) => Node;
  /** Where an entry's lesson tag links, and what it says, such as "Lesson 2". */
  lesson?: (id: string) => { href: string; label: string } | undefined;
  /** Lessons the reader has not reached: their terms are listed, dimmed, so the glossary stays whole. */
  ahead?: (lessonId: string) => boolean;
}

/** The glossary: a search box, a row of letters to jump by, and the terms A to Z. */
export function glossaryView(o: GlossaryViewOptions): HTMLElement {
  const norm = (s: string) => sortKey(s);
  const rows = o.entries.map((e) => {
    const where = e.lesson ? o.lesson?.(e.lesson) : undefined;
    const term: Child = e.open
      ? el('button.gl-term.gl-open', { type: 'button', onclick: e.open }, e.term, el('span.gl-more', { 'aria-hidden': 'true' }, '›'))
      : el('span.gl-term', {}, e.term);
    const node = el('div.gl-entry', { id: `gl-${e.id.replace(/[^\w-]/g, '-')}` },
      el('dt', {}, e.note ? el(`span.gl-dot.fn-${e.note}`, { title: 'Also a note in the lesson' }) : null, term,
        where ? el('a.gl-lesson', { href: where.href }, where.label) : null),
      el('dd', {}, o.prose(e.text)),
    );
    if (e.lesson && o.ahead?.(e.lesson)) node.classList.add('ahead');
    const hay = norm([e.term, ...(e.also ?? []), e.text].join(' '));
    return { e, node, hay, letter: letterOf(e) };
  });

  const letters = [...new Set(rows.map((r) => r.letter))];
  const groups = letters.map((L) => {
    const mine = rows.filter((r) => r.letter === L);
    const head = el('h3.gl-letter', { id: `gl-letter-${L}` }, L);
    return { L, mine, node: el('section.gl-group', {}, head, el('dl', {}, mine.map((r) => r.node))) };
  });

  const index = el('nav.gl-index', { 'aria-label': 'Jump to a letter' },
    letters.map((L) => el('a', { href: `#gl-letter-${L}`, onclick: (e: MouseEvent) => {
      e.preventDefault();
      document.getElementById(`gl-letter-${L}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, L)));
  const search = el('input.gl-search', { type: 'search', placeholder: `Search ${rows.length} terms`, 'aria-label': 'Search the glossary', autocomplete: 'off' }) as HTMLInputElement;
  const none = el('p.gl-none', { hidden: true }, 'No term matches that.');

  search.addEventListener('input', () => {
    const q = norm(search.value);
    let shown = 0;
    for (const g of groups) {
      let any = false;
      for (const r of g.mine) {
        const hit = !q || r.hay.includes(q);
        r.node.hidden = !hit;
        if (hit) any = true;
      }
      g.node.hidden = !any;
      if (any) shown++;
    }
    index.hidden = Boolean(q);
    none.hidden = shown > 0;
  });

  return el('div.glossary', {}, el('div.gl-bar', {}, search, index), none, groups.map((g) => g.node));
}

/** Entries with no text, or naming a lesson that does not exist, for a content test. */
export function glossaryProblems(entries: readonly GlossaryEntry[], lessons: readonly Lesson[]): string[] {
  const ids = new Set(lessons.map((l) => l.id));
  const out: string[] = [];
  for (const e of entries) {
    if (!e.term?.trim() || !e.text?.trim()) out.push(`glossary ${e.id}: needs a term and text`);
    if (e.lesson && !ids.has(e.lesson)) out.push(`glossary ${e.id}: no lesson "${e.lesson}"`);
  }
  return out;
}
