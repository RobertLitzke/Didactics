// Footnotes that open in a small popup beside the text, not at the foot of the
// page. A lesson keeps its notes in a `footnotes` table, and its text marks
// where each one hangs with [^id], straight after the word it belongs to:
//
//   "cools at about 10 °C per kilometre.[^dry-rate]"
//   "footnotes": { "dry-rate": { "kind": "technical", "title": "Dry adiabatic lapse rate", "text": "…" } }
//
// There are two kinds, coloured apart so a reader can choose which to follow:
// a `technical` note gives the proper name for something, or a detail the
// lesson does without; a `digression` is a side trip, interesting but off the
// main line. Each marker is a small raised number, counted through the lesson.
// Technical notes also go into the glossary (glossary.ts) unless they say
// "glossary": false.

import { el, type Child } from './dom';

export type FootnoteKind = 'technical' | 'digression';

export interface Footnote {
  kind: FootnoteKind;
  /** The popup's heading: for a technical note, the term itself. */
  title: string;
  /** The note, with the same **bold** and *italic* markup as lesson text. */
  text: string;
  /**
   * Whether the note goes into the glossary. Technical notes do unless this is
   * false; a digression does only if this is true. A string lists it under
   * that term instead of its title.
   */
  glossary?: boolean | string;
}

export type Footnotes = Readonly<Record<string, Footnote>>;

/** What each kind is called, on the popup and in the legend. */
export const FOOTNOTE_KINDS: Readonly<Record<FootnoteKind, { label: string; blurb: string }>> = {
  technical: { label: 'Technical note', blurb: 'A hidden technical term' },
  digression: { label: 'Side trip', blurb: 'A side trip' },
};

/** The marker in lesson text: [^id]. */
export const FOOTNOTE_MARK = /\[\^([\w-]+)\]/g;

/** A lesson's notes, and the number each marker shows. */
export interface FootnoteSet {
  notes: Footnotes;
  /** Its number, counted from 1 in the order the markers first appear. */
  number: (id: string) => number;
  /** Turns a note's text into a node. */
  render: (text: string) => Node;
}

/** Number a lesson's notes in the order their markers first appear in `texts`. */
export function footnoteSet(notes: Footnotes, texts: Iterable<string>, render: (text: string) => Node): FootnoteSet {
  const order = new Map<string, number>();
  for (const t of texts) for (const m of t.matchAll(FOOTNOTE_MARK)) if (notes[m[1]] && !order.has(m[1])) order.set(m[1], order.size + 1);
  return { notes, number: (id) => order.get(id) ?? 0, render };
}

/** The raised number for note `id`, which opens its popup. Nothing for a note that doesn't exist. */
export function footnoteMarker(id: string, set: FootnoteSet): HTMLElement | null {
  const note = set.notes[id];
  if (!note) return null;
  const n = set.number(id);
  const btn = el(`button.fn.fn-${note.kind}`, {
    type: 'button',
    'aria-label': `${FOOTNOTE_KINDS[note.kind].label}: ${note.title}`,
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  }, String(n || '•')) as HTMLButtonElement;
  marked.set(btn, { id, note, n, render: set.render });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // On a wide screen the note is already in the margin: point it out instead.
    const side = sideOf(btn);
    if (side) side.point(btn);
    else if (open?.anchor === btn) closeFootnote();
    else openFootnote(btn, note, set.render);
  });
  return btn;
}

/** What each marker on the page stands for, for the margin notes. */
const marked = new WeakMap<HTMLElement, { id: string; note: Footnote; n: number; render: (text: string) => Node }>();

let open: { anchor: HTMLElement; node: HTMLElement; off: AbortController } | null = null;

/** Close the open note, if any, and hand focus back to its marker when asked. */
export function closeFootnote(refocus = false): void {
  if (!open) return;
  const { anchor, node, off } = open;
  open = null;
  off.abort();
  node.remove();
  anchor.setAttribute('aria-expanded', 'false');
  anchor.classList.remove('on');
  if (refocus) anchor.focus({ preventScroll: true });
}

/**
 * Show a note in a popup beside `anchor`: under its line if there is room on
 * screen, else over it. It closes with its × button, Escape, a tap anywhere
 * else, or another note opening.
 */
export function openFootnote(anchor: HTMLElement, note: Footnote, render: (text: string) => Child = (t) => el('p', {}, t)): HTMLElement {
  const close = el('button.fn-close', { type: 'button', 'aria-label': 'Close note' }, '×');
  const node = el(`div.fn-pop.fn-${note.kind}`, { role: 'dialog', 'aria-label': note.title, tabindex: '-1' },
    el('i.fn-arrow'),
    el('div.fn-head', {}, el('p.fn-kind', {}, FOOTNOTE_KINDS[note.kind].label), close),
    el('h4.fn-title', {}, note.title),
    el('div.fn-body', {}, render(note.text)),
    footnoteMore.more?.(note) ?? null,
  );
  return openPopover(anchor, node, close);
}

/**
 * What a note's popup and margin card add under the note: set by a module
 * that has more to say about some notes (encyclopedia.ts links a technical
 * note to the entry for its term).
 */
export const footnoteMore: { more?: (note: Footnote) => Child } = {};

/**
 * Show `node` in a popup beside `anchor`, the way a note shows: it closes with
 * `close` (a button inside it), Escape, a tap anywhere else, a change of page,
 * or another popup opening.
 */
export function openPopover(anchor: HTMLElement, node: HTMLElement, close?: HTMLElement): HTMLElement {
  closeFootnote();
  document.body.append(node);
  place(node, anchor);

  const off = new AbortController();
  open = { anchor, node, off };
  anchor.setAttribute('aria-expanded', 'true');
  anchor.classList.add('on');
  close?.addEventListener('click', () => closeFootnote(true));
  const signal = off.signal;
  document.addEventListener('pointerdown', (e) => {
    if (!node.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) closeFootnote();
  }, { signal, capture: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFootnote(true);
  }, { signal });
  window.addEventListener('resize', () => place(node, anchor), { signal });
  window.addEventListener('hashchange', () => closeFootnote(), { signal });
  node.focus({ preventScroll: true });
  return node;
}

/** Put the popup under (or over) the anchor's line, inside the screen, its arrow on the anchor. */
function place(node: HTMLElement, anchor: HTMLElement): void {
  const a = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const gutter = 12;
  const width = Math.min(360, vw - 2 * gutter);
  node.style.width = `${width}px`;
  const h = node.offsetHeight;
  const mid = a.left + a.width / 2;
  const left = Math.max(gutter, Math.min(vw - gutter - width, mid - width / 2));
  const below = vh - a.bottom;
  const above = a.top;
  const up = below < h + 16 && above > below;
  const top = up ? a.top - h - 10 : a.bottom + 10;
  node.classList.toggle('up', up);
  node.style.left = `${left + window.scrollX}px`;
  node.style.top = `${top + window.scrollY}px`;
  node.style.setProperty('--arrow', `${Math.max(14, Math.min(width - 14, mid - left))}px`);
}

/** One line for under a lesson's lede saying what the two colours of marker mean. */
export function footnoteLegend(kinds: Iterable<FootnoteKind>): HTMLElement | null {
  const have = new Set(kinds);
  if (!have.size) return null;
  const parts = (['technical', 'digression'] as const).filter((k) => have.has(k));
  return el('p.fn-legend', {},
    'Tap for note: ',
    ...parts.flatMap((k, i) => [
      i ? ' ' : '',
      el(`span.fn.fn-${k}.fn-sample`, { 'aria-hidden': 'true' }, String(i + 1)),
      ` ${FOOTNOTE_KINDS[k].blurb}`,
    ]),
  );
}

/** Markers that point at no note, and notes no marker points at, for a content test. */
export function footnoteProblems(label: string, notes: Footnotes | undefined, texts: Iterable<string>): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(FOOTNOTE_MARK)) {
      used.add(m[1]);
      if (!notes?.[m[1]]) out.push(`${label}: no footnote "${m[1]}"`);
    }
  }
  for (const [id, n] of Object.entries(notes ?? {})) {
    if (!used.has(id)) out.push(`${label}: footnote "${id}" is never marked`);
    if (n.kind !== 'technical' && n.kind !== 'digression') out.push(`${label}: footnote "${id}" has kind "${String(n.kind)}"`);
    if (!n.title?.trim() || !n.text?.trim()) out.push(`${label}: footnote "${id}" needs a title and text`);
    if (/\[\^[\w-]+\]/.test(n.text)) out.push(`${label}: footnote "${id}" has a marker inside it`);
  }
  return out;
}

/** The screen width from which notes sit in the margin rather than in a popup. */
export const SIDE_NOTES_FROM = 1180;

interface SideNotes { point: (marker: HTMLElement) => void }
const sides = new WeakMap<HTMLElement, SideNotes>();
/** The margin notes the marker's text is in, while they are showing. */
function sideOf(marker: HTMLElement): SideNotes | undefined {
  for (let p = marker.parentElement; p; p = p.parentElement) {
    const s = sides.get(p);
    if (s) return p.classList.contains('side-notes-on') ? s : undefined;
  }
  return undefined;
}

/**
 * On a screen at least SIDE_NOTES_FROM wide, show every note of the text in
 * `scope` in a column beside it, each level with its marker's line (pushed
 * down when the one above runs long), as in the margin of a book. A marker
 * then points out its note rather than opening a popup. Narrower, nothing
 * shows and the popups work as before. The column goes in `scope`, which
 * should be positioned (it is laid out against its top edge), and it keeps up
 * as text is added, figures change height or the window is resized, until
 * `signal` aborts.
 */
export function sideNotes(scope: HTMLElement, signal: AbortSignal, o: { from?: number } = {}): void {
  const wide = window.matchMedia(`(min-width: ${o.from ?? SIDE_NOTES_FROM}px)`);
  const column = el('div.fn-side', { 'aria-label': 'Notes' });
  column.setAttribute('role', 'complementary');
  scope.append(column);
  const cards = new Map<string, HTMLElement>();
  const markers = () => [...scope.querySelectorAll<HTMLElement>('button.fn')].filter((m) => marked.has(m) && m.offsetParent);

  const card = (id: string): HTMLElement => {
    let c = cards.get(id);
    if (c) return c;
    const { note, n, render } = marked.get(markers().find((m) => marked.get(m)!.id === id)!)!;
    c = el(`aside.fn-note.fn-${note.kind}`, {},
      el('p.fn-note-head', {}, el('span.fn.fn-sample', { 'aria-hidden': 'true' }, String(n || '•')), el('b', {}, note.title)),
      el('div.fn-note-body', {}, render(note.text)),
      footnoteMore.more?.(note) ?? null,
    );
    cards.set(id, c);
    return c;
  };

  let queued = 0;
  const layout = () => {
    queued = 0;
    const on = wide.matches;
    scope.classList.toggle('side-notes-on', on);
    if (!on) {
      column.replaceChildren();
      return;
    }
    closeFootnote();
    const top = scope.getBoundingClientRect().top;
    const seen = new Set<string>();
    let floor = 0;
    for (const m of markers()) {
      const { id } = marked.get(m)!;
      if (seen.has(id)) continue;
      seen.add(id);
      const c = card(id);
      if (c.parentElement !== column) column.append(c);
      // The note's first line sits on the marker's line.
      const want = m.getBoundingClientRect().top - top - 6;
      const at = Math.max(want, floor);
      c.style.top = `${Math.round(at)}px`;
      floor = at + c.offsetHeight + 14;
    }
    for (const [id, c] of cards) if (!seen.has(id)) c.remove();
  };
  const soon = () => {
    if (!queued) queued = requestAnimationFrame(layout);
  };

  sides.set(scope, {
    point: (m) => {
      const c = cards.get(marked.get(m)!.id);
      if (!c) return;
      for (const other of cards.values()) other.classList.toggle('on', other === c);
      const r = c.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });
  // A marker under the pointer lights its note, and the note its marker.
  scope.addEventListener('pointerover', (e) => {
    const m = (e.target as HTMLElement).closest?.('button.fn') as HTMLElement | null;
    const note = (e.target as HTMLElement).closest?.('.fn-note') as HTMLElement | null;
    const id = m ? marked.get(m)?.id : note ? [...cards].find(([, c]) => c === note)?.[0] : undefined;
    for (const [cid, c] of cards) c.classList.toggle('hover', cid === id);
    for (const mk of markers()) mk.classList.toggle('lit', id !== undefined && marked.get(mk)!.id === id);
  }, { signal });

  const resized = new ResizeObserver(soon);
  resized.observe(scope);
  // New text (a part opening) can bring markers; a figure redrawing its own
  // words cannot, and changes height only through the ResizeObserver.
  const changed = new MutationObserver((records) => {
    if (records.some((r) => !column.contains(r.target) && !(r.target as Element).closest?.('.fig'))) soon();
  });
  changed.observe(scope, { childList: true, subtree: true });
  wide.addEventListener('change', soon, { signal });
  void document.fonts?.ready.then(soon);
  soon();
  signal.addEventListener('abort', () => {
    resized.disconnect();
    changed.disconnect();
    cancelAnimationFrame(queued);
    sides.delete(scope);
    column.remove();
  });
}
