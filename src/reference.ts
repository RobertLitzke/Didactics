// The reference page: everything the lessons teach, set out to look things up
// rather than to read through. A contents list, then a section per topic from
// the course's reference file (blocks.ts ReferenceFile). A section names the
// lesson it comes from; one with no blocks yet, its lesson not written, shows
// only its title and what it will hold.
//
// Didactics draws the shared blocks (text, terms, tables, steps, a live
// figure, the glossary). A course hands in renderers for block types of its
// own, such as a table of schematic symbols or a photo of a soil.

import { REF_BLOCK_TYPES, type RefBlock, type RefSection } from './blocks.ts';
import { el, type Child } from './dom';
import { standaloneFigure, type FigureFactory } from './figure';
import { glossaryView, type GlossaryViewOptions } from './glossary';
import { diagramType, placeholder } from './lesson';
import type { Progress } from './progress';
import type { View } from './router';
import type { Store } from './store';

export { isReferenceShaped, REF_BLOCK_TYPES, referenceShapeProblems, type CourseBlock, type RefBlock, type ReferenceFile, type RefSection } from './blocks.ts';

/** What the reference page knows of a lesson: enough to name it and link to it. */
export interface RefLesson {
  id: string;
  n: number;
  code?: string;
  title: string;
}

/** What a course's own block renderer is handed. */
export interface RefContext {
  save: Progress;
  /** Aborted when the page closes. */
  closed: AbortSignal;
  prose: (text: string) => HTMLElement;
  /** A lesson's link and name ("Lesson 3"), if it is one the page knows. */
  lessonLink: (id: string) => { href: string; label: string; title: string } | undefined;
}

/** Renderers for the course's own block types, by type. */
export type RefRenderers<X extends { type: string }> = { [T in X['type']]: (block: Extract<X, { type: T }>, ctx: RefContext) => Child };

export interface ReferenceViewOptions<S extends Progress, X extends { type: string } = never> {
  sections: readonly RefSection<RefBlock | X>[];
  store: Store<S>;
  /** Turns a paragraph's markup into a node; usually lesson.ts prose with the app's palette. */
  prose: (text: string) => HTMLElement;
  /** The course's figures, for figure blocks. */
  figures: Readonly<Record<string, FigureFactory>>;
  /** The lessons, for each section's "From lesson 3" line. */
  lessons?: readonly RefLesson[];
  /** Renderers for the course's own block types. */
  blocks?: RefRenderers<X>;
  /** The glossary block's entries and links. */
  glossary?: GlossaryViewOptions;
  /** Heading and the line under it. Defaults: "Reference", "What the lessons teach, to look up." */
  title?: string;
  blurb?: string;
  /** What a lesson is called. Default "Lesson". */
  noun?: string;
  /** Where a lesson's link goes. Default `#/lesson/<id>`. */
  lessonHref?: (id: string) => string;
}

/** The view for a reference route. */
export function referenceView<S extends Progress, X extends { type: string } = never>(o: ReferenceViewOptions<S, X>): View {
  const noun = o.noun ?? 'Lesson';
  const href = o.lessonHref ?? ((id: string) => `#/lesson/${id}`);
  const lessonLink = (id: string) => {
    const l = o.lessons?.find((x) => x.id === id);
    return l ? { href: href(l.id), label: `${noun} ${l.code ?? l.n}`, title: l.title } : undefined;
  };
  const custom = (o.blocks ?? {}) as Record<string, (b: unknown, ctx: RefContext) => Child>;

  const block = (b: RefBlock | X, ctx: RefContext, closers: (() => void)[]): Child => {
    const own = custom[b.type];
    if (own) return own(b, ctx);
    const r = b as RefBlock;
    switch (r.type) {
      case 'text':
        return o.prose(r.text);
      case 'terms':
        return el('dl.terms', {}, r.items.flatMap((t) => [el('dt', {}, t.term), el('dd', {}, t.means)]));
      case 'table':
        return el('div.table-wrap', {}, el('table.ref-table', {},
          el('thead', {}, el('tr', {}, r.columns.map((c) => el('th', {}, c)))),
          el('tbody', {}, r.rows.map((row) => el('tr', {}, row.map((c) => el('td', {}, c))))),
        ));
      case 'steps':
        return el('ol.steps', {}, r.items.map((s) => el('li', {}, s)));
      case 'interactive_diagram':
      case 'diagram': {
        const factory = o.figures[r.id];
        if (!factory) return el('figure.fig.fig-missing', { 'data-figure': r.id }, placeholder(r), el('div.fig-text', {}, el('p.fig-lead', {}, r.caption)));
        const fig = standaloneFigure(factory, { caption: r.caption, save: ctx.save, options: r.options });
        fig.node.dataset.figure = r.id;
        closers.push(fig.close);
        return fig.node;
      }
      case 'glossary':
        return o.glossary ? glossaryView(o.glossary) : null;
      default:
        return null;
    }
  };

  return (root) => {
    const closed = new AbortController();
    const closers: (() => void)[] = [];
    const ctx: RefContext = { save: o.store.get(), closed: closed.signal, prose: o.prose, lessonLink };
    const nodes = new Map<string, HTMLElement>();
    const section = (s: RefSection<RefBlock | X>) => {
      const from = s.lesson ? lessonLink(s.lesson) : undefined;
      const soon = s.blocks.length === 0;
      const node = el(
        'section.ref-section',
        { className: `ref-section${soon ? ' soon' : ''}`, id: `ref-${s.id}` },
        el('h2', {}, s.title),
        el('p.summary', {}, /[.!?]$/.test(s.summary) ? s.summary : s.summary + '.'),
        soon
          ? el('p', {}, from ? `Comes with ${from.label.toLowerCase()}, “${from.title}”.` : 'Coming.')
          : s.blocks.map((b) => block(b, ctx, closers)),
        !soon && from ? el('p.from-lesson', {}, 'From ', el('a', { href: from.href }, `${from.label.toLowerCase()}, “${from.title}”`), '.') : null,
      );
      nodes.set(s.id, node);
      return node;
    };
    // Buttons, not links: the hash is the router's.
    const contents = el('ol.contents', {}, o.sections.map((s) => el('li', { className: s.blocks.length ? '' : 'soon' },
      el('button', { type: 'button', onclick: () => nodes.get(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        s.title, el('span', {}, s.blocks.length ? s.summary : 'coming')),
    )));
    root.append(el('div.page.reference', {},
      el('h1', {}, o.title ?? 'Reference'),
      el('p.muted', {}, o.blurb ?? 'What the lessons teach, to look up.'),
      contents,
      o.sections.map(section),
    ));
    return () => {
      closed.abort();
      for (const c of closers) c();
    };
  };
}

/**
 * What is wrong with a reference file against the course, for a content
 * test: sections with the same id, lessons that do not exist, block types
 * neither Didactics nor the course draws, a glossary block with no glossary,
 * and figure blocks whose type does not match the figure (a quiz has no
 * place here). With `allowPlaceholders`, a figure id with no code is fine.
 */
export function referenceProblems(
  sections: readonly RefSection<{ type: string }>[],
  o: { figures: Readonly<Record<string, FigureFactory>>; lessons?: readonly RefLesson[]; blocks?: readonly string[]; glossary?: boolean; allowPlaceholders?: boolean },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const known = new Set<string>([...REF_BLOCK_TYPES, ...(o.blocks ?? [])]);
  for (const s of sections) {
    const at = `reference "${s.id}"`;
    if (seen.has(s.id)) out.push(`${at}: another section has this id`);
    seen.add(s.id);
    if (s.lesson && o.lessons && !o.lessons.some((l) => l.id === s.lesson)) out.push(`${at}: no lesson "${s.lesson}"`);
    for (const b of s.blocks) {
      if (!known.has(b.type)) out.push(`${at}: no renderer for "${b.type}" blocks`);
      else if (b.type === 'glossary' && !o.glossary) out.push(`${at}: a glossary block, but the page is given no glossary`);
      else if (b.type === 'interactive_diagram' || b.type === 'diagram') {
        const id = String((b as { id?: unknown }).id);
        const f = o.figures[id];
        if (!f) {
          if (!o.allowPlaceholders) out.push(`${at}: no figure "${id}"`);
        } else if (f.quiz) out.push(`${at}: ${id} is a quiz, which belongs in a lesson`);
        else if (b.type !== diagramType(f)) out.push(`${at}: ${id} should have "type": "${diagramType(f)}", not "${b.type}"`);
      }
    }
  }
  return out;
}
