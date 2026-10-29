// Every figure on one page, each with its caption from the lessons, for
// checking drawings without playing through and for screenshot diffs. A
// course's figures.html loads a few lines that call galleryPage; with
// ?frozen (import 'didactics/frozen' first) the page is the same every load.

import { el } from './dom';
import { standaloneFigure, type FigureFactory, type StandaloneFigure } from './figure';
import { isDiagram, type DiagramBlock, type Lesson } from './lesson';
import type { Progress } from './progress';

export interface GalleryOptions {
  figures: Readonly<Record<string, FigureFactory>>;
  /** Where captions, goals and options come from: the first block that uses each figure. */
  lessons: readonly Pick<Lesson, 'parts'>[];
  /** The save figures are built with; set its units for a page in the other system. */
  save: Progress;
  /** Show only this figure. Default: the page's ?only= */
  only?: string | null;
}

export interface Gallery {
  /** A `main.view` holding the figures, each a `figure.fig` with `data-figure` set to its id. */
  node: HTMLElement;
  figures: StandaloneFigure[];
  /**
   * Resolves once every figure is ready; the page node then has
   * `data-ready`, so a screenshot tool can wait for `[data-ready]`.
   */
  ready: Promise<void>;
}

/** Build the gallery. Mount its node, then wait for `ready` before a screenshot. */
export function galleryPage(o: GalleryOptions): Gallery {
  const uses = new Map<string, DiagramBlock>();
  for (const l of o.lessons) for (const p of l.parts) for (const b of p.blocks) if (isDiagram(b) && !uses.has(b.id)) uses.set(b.id, b);
  const only = o.only !== undefined ? o.only : typeof location !== 'undefined' ? new URLSearchParams(location.search).get('only') : null;
  const article = el('article.article');
  const figures: StandaloneFigure[] = [];
  for (const [id, factory] of Object.entries(o.figures)) {
    if (only && only !== id) continue;
    const b = uses.get(id);
    const fig = standaloneFigure(factory, { caption: `${id}: ${b?.caption ?? '(not in any lesson)'}`, save: o.save, goal: b?.goal, options: b?.options });
    fig.node.dataset.figure = id;
    figures.push(fig);
    article.append(fig.node);
  }
  const node = el('main.view', {}, article);
  const ready = Promise.all(figures.map((f) => f.ready)).then(() => void (node.dataset.ready = ''));
  return { node, figures, ready };
}
