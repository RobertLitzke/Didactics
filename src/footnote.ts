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
  technical: { label: 'Technical note', blurb: 'a technical term or detail' },
  digression: { label: 'Side trip', blurb: 'a side trip off the main line' },
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
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open?.anchor === btn) closeFootnote();
    else openFootnote(btn, note, set.render);
  });
  return btn;
}

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
  closeFootnote();
  const close = el('button.fn-close', { type: 'button', 'aria-label': 'Close note' }, '×');
  const node = el(`div.fn-pop.fn-${note.kind}`, { role: 'dialog', 'aria-label': note.title, tabindex: '-1' },
    el('i.fn-arrow'),
    el('div.fn-head', {}, el('p.fn-kind', {}, FOOTNOTE_KINDS[note.kind].label), close),
    el('h4.fn-title', {}, note.title),
    el('div.fn-body', {}, render(note.text)),
  );
  document.body.append(node);
  place(node, anchor);

  const off = new AbortController();
  open = { anchor, node, off };
  anchor.setAttribute('aria-expanded', 'true');
  anchor.classList.add('on');
  close.addEventListener('click', () => closeFootnote(true));
  const signal = off.signal;
  document.addEventListener('pointerdown', (e) => {
    if (!node.contains(e.target as Node) && e.target !== anchor) closeFootnote();
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
    'Tap a raised number for a note: ',
    ...parts.flatMap((k, i) => [
      i ? ', ' : '',
      el(`span.fn.fn-${k}.fn-sample`, { 'aria-hidden': 'true' }, String(i + 1)),
      ` ${FOOTNOTE_KINDS[k].blurb}`,
    ]),
    '.',
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
