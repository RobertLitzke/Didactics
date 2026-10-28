// A lesson, read as an illustrated workbook chapter on paper, in the manner of
// an interactive explainer: a picture at the top, then the lesson's parts one
// after another, each paragraphs and live figures. The next part opens once
// every task in this one is done, so the lesson is read in order the first
// time; a finished lesson opens in full. The last part is the check, and its
// score goes into the log at the end, which the reader signs.
//
// A lesson's words live in a JSON file (the Lesson shape below, less what the
// app adds), so they can be edited outside the code. Its blocks are typed
// (blocks.ts): text, key ideas, and callouts for the course's own diagrams,
// figures and quizzes by id; an id with no code yet shows as a placeholder. Text takes a little
// markup (see prose): **bold**, *italic*, [[words|colour]] to tie a word
// to the same colour in a figure, and [^id] for a footnote from the lesson's
// `footnotes` table, which opens in a popup (footnote.ts).
//
// With a radio (radio.ts, slip.ts) and the reader's radio setting on, a talk
// comes on as the lesson opens, only the first time through. The check's talk
// is not played on the slip: it is handed to the check's figures, which type
// it above and below their questions (check.ts), so the check is one thing.
//
// A reader who leaves part way (another page, a reload, the app closed) comes
// back to where they were: the parts they had opened, the figures they had
// done and how they had set them, their check answers, and the place on the
// page (resume.ts). The opening talk is not played again past the first part.
// Finishing the lesson forgets all that. A lesson already finished opens in
// full, as before, and keeps no place.

import { isDiagram, type Block, type DiagramBlock, type DiagramType } from './blocks.ts';
import { el, type Child } from './dom';
import type { FigureContext, FigureFactory } from './figure';
import { closeFootnote, footnoteLegend, footnoteMarker, footnoteProblems, footnoteSet, type FootnoteSet, type Footnotes } from './footnote';
import { finishLesson, type Progress } from './progress';
import type { Cue, Talk } from './radio';
import { blockKey, emptyResume, lessonSignature, resumeFor, type LessonResume } from './resume';
import type { View } from './router';
import type { Store } from './store';

export { BLOCK_TYPES, DIAGRAM_TYPES, isDiagram, lessonShapeProblems, type Block, type BlockType, type DiagramBlock, type DiagramType } from './blocks.ts';

/** The type a block for this factory should have: a quiz, a live figure, or a still. */
export function diagramType(f: FigureFactory): DiagramType {
  return f.quiz ? 'quiz' : f.goals ? 'interactive_diagram' : 'diagram';
}

export interface Part<F extends string = string> {
  title: string;
  blocks: Block<F>[];
}

export interface Lesson<F extends string = string> {
  id: string;
  /** Its number in the series, from 1. */
  n: number;
  /** Its name, when the lessons form a tree rather than a line ("5", "P2"); see tree.ts lessonCodes. */
  code?: string;
  title: string;
  /** One line for the lesson board, and the lede under the title. */
  teaches: string;
  parts: Part<F>[];
  /** What was learned, written into the log. */
  learned: string[];
  /** A line at the foot of the log, on what comes next. */
  next: string;
  /** Journal entries this lesson unlocks. */
  journal: string[];
  /** Notes its text marks with [^id], shown in a popup (footnote.ts). */
  footnotes?: Footnotes;
}

/** Every piece of a lesson's text that takes markup, in reading order. */
export function lessonTexts(lesson: Lesson): string[] {
  return lesson.parts.flatMap((p) => p.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : b.type === 'key_ideas' ? b.points : [])));
}

/**
 * A paragraph of lesson text. **bold**, *italic*, [[words|key]] in the
 * colour `palette[key]` (the ink colour, `palette.ink`, for a key it lacks),
 * and [^id], the marker for footnote `id` in `notes` (dropped without them).
 */
export function prose(text: string, palette: Readonly<Record<string, string>>, notes?: FootnoteSet): HTMLElement {
  const p = el('p');
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[\[(.+?)\|(\w+)\]\]|\[\^([\w-]+)\]/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) p.append(text.slice(at, m.index));
    if (m[1]) p.append(el('b', {}, m[1]));
    else if (m[2]) p.append(el('i', {}, m[2]));
    else if (m[3]) p.append(el('b.tint', { style: `color: ${palette[m[4]] ?? palette.ink}` }, m[3]));
    else {
      const mark = notes && footnoteMarker(m[5], notes);
      // A word joiner keeps the number on the line of the word it follows.
      if (mark) p.append('\u2060', mark);
    }
    at = m.index! + m[0].length;
  }
  if (at < text.length) p.append(text.slice(at));
  return p;
}

export interface LessonViewOptions<L extends Lesson, S extends Progress> {
  lessons: readonly L[];
  figures: Readonly<Record<string, FigureFactory>>;
  store: Store<S>;
  /** Turns a paragraph's markup into a node; usually prose with the app's palette, passing `notes` on. */
  prose: (text: string, notes?: FootnoteSet) => HTMLElement;
  /** The picture over the paper, at the top of the lesson. */
  hero?: (lesson: L) => Child;
  /** More under the lede, such as the names a lesson introduces. */
  intro?: (lesson: L) => Child;
  /** The lesson's radio talks, the slip to play them on, and the station they come from. */
  radio?: { talks: (lessonId: string) => readonly Talk[]; play: (talk: Talk) => Promise<boolean>; clear: () => void; them?: { call: string; place: string } };
  /** Where the back arrow and signing the log go. Default /home. */
  home?: string;
  /** What a lesson is called in the headings. Default "Lesson". */
  noun?: string;
}

/** The view for a route like /lesson/:id. */
export function lessonView<L extends Lesson, S extends Progress>(o: LessonViewOptions<L, S>): View {
  const home = o.home ?? '/home';
  const noun = o.noun ?? 'Lesson';

  /** How a block's figure is remembered between visits; nothing is, in a finished lesson. */
  interface Keeping {
    key: string;
    /** Its task was done before (or its part passed): count it done now. */
    done: boolean;
    sliders?: number[];
    /** Note the task done, and the sliders moved. */
    onDone: () => void;
    onSliders: (values: number[]) => void;
  }

  function renderBlock(block: Block, ctx: FigureContext, tasks: Promise<void>[], notes: FootnoteSet, keeping?: Keeping): HTMLElement {
    if (block.type === 'text') return o.prose(block.text, notes);
    if (block.type === 'key_ideas') {
      return el('section.key-ideas', {}, el('p.key-title', {}, block.title), el('ul', {}, ...block.points.map((p) => el('li', {}, o.prose(p, notes)))));
    }
    const status = block.task ? el('p.fig-task', {}, el('span.tick', { 'aria-hidden': 'true' }), block.task) : null;
    // The caption opens the figure's one text box, above what the figure is
    // showing now; a still or a quiz has no live text, so it gets a box of its own.
    const caption = el('p.fig-lead', {}, block.caption);
    const factory = o.figures[block.id];
    if (!factory) {
      // Written before it was drawn: say what goes here, and hold no one up.
      const fig = el('figure.fig.fig-missing.done', { 'data-figure': block.id }, status, placeholder(block), el('div.fig-text', {}, caption));
      return fig;
    }
    const handle = factory(ctx, block.goal, block.options);
    const box = handle.node.querySelector('.fig-text');
    if (box) box.prepend(caption);
    const fig = el('figure.fig', { 'data-figure': block.id }, status, handle.node, box ? null : el('div.fig-text', {}, caption));
    if (keeping) keepSliders(handle.node, keeping);
    if (handle.done) {
      const done = keeping?.done ? Promise.resolve() : handle.done;
      if (keeping && !keeping.done) void handle.done.then(keeping.onDone);
      tasks.push(done);
      void done.then(() => fig.classList.add('done'));
    }
    return fig;
  }

  return (root, nav) => {
    const lesson = o.lessons.find((l) => l.id === nav.params.id);
    if (!lesson) {
      nav.replace(home);
      return;
    }
    let alive = true;
    const closed = new AbortController();
    const save = o.store.get();
    const replay = save.lessons[lesson.id]?.done === true;
    // Where the reader is, kept in the save as they go so a visit can be picked up again.
    const stored = save.resume?.[lesson.id];
    const resumed = replay ? undefined : resumeFor(save.resume ?? {}, lesson.id, lesson);
    const here: LessonResume = resumed ? structuredClone(resumed) : emptyResume(lessonSignature(lesson));
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      clearTimeout(timer);
      timer = undefined;
      if (replay || finished) return;
      o.store.update((s) => ({ ...s, resume: { ...s.resume, [lesson.id]: structuredClone(here) } }));
    };
    /** Save soon: sliders and scrolling change many times a second. */
    const keepSoon = () => {
      if (replay || finished) return;
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    };
    // Made for another version of this lesson: forget it.
    if (stored && !resumed && !replay) {
      o.store.update((s) => {
        const { [lesson.id]: _old, ...rest } = s.resume ?? {};
        return { ...s, resume: rest };
      });
    }
    const passed = (part: number, key: string) => part < here.part || here.done.includes(key);
    const scoreTotal = () => Object.values(here.scores).reduce((t, [r, n]) => ({ right: t.right + r, of: t.of + n }), { right: 0, of: 0 });
    const footnotes = lesson.footnotes ?? {};
    const notes = footnoteSet(footnotes, lessonTexts(lesson), (t) => o.prose(t));
    const talks = o.radio?.talks(lesson.id) ?? [];
    const talking = Boolean(o.radio) && save.talk && !replay;
    /** The talk on this cue, if the radio is on and it has not been heard. */
    const waiting = (c: Cue) => (talking ? talks.find((t) => t.cue === c && !o.store.get().heard[t.id]) : undefined);
    const ctx: FigureContext = { save, closed: closed.signal, score: () => {} };
    /** A block's own context: its score, and its memory between visits. */
    // The check's talk frames the check itself, whenever the radio is on.
    const checkTalk = o.radio && save.talk ? talks.find((t) => t.cue === 'check') : undefined;
    const blockCtx = (part: number, key: string): FigureContext => {
      let mine: [number, number] | undefined;
      return {
        ...ctx,
        radio: checkTalk && part === lesson.parts.length - 1 ? { talk: checkTalk, them: o.radio!.them } : undefined,
        score: (right, of) => {
          mine = mine ? [mine[0] + right, mine[1] + of] : [right, of];
          here.scores[key] = mine;
          keepSoon();
        },
        memo: replay ? undefined : {
          restored: passed(part, key),
          kept: here.kept[key],
          keep: (state) => {
            here.kept[key] = state;
            keepSoon();
          },
        },
      };
    };
    const keeping = (part: number, key: string): Keeping | undefined => (replay ? undefined : {
      key,
      done: passed(part, key),
      sliders: here.sliders[key],
      onDone: () => {
        if (!here.done.includes(key)) here.done.push(key);
        flush();
      },
      onSliders: (values) => {
        here.sliders[key] = values;
        keepSoon();
      },
    });

    const progress = el('div.article-progress', {}, el('i'));
    const bar = progress.firstElementChild as HTMLElement;
    const article = el('article.article');
    const total = lesson.parts.length + 1;
    const reached = (n: number) => (bar.style.width = `${(100 * n) / total}%`);

    root.append(
      el('div.lesson', {},
        el('header.lesson-head', {},
          el('a.back', { href: `#${home}`, 'aria-label': 'Back home' }, '‹'),
          el('div', {}, el('p.eyebrow', {}, `${noun} ${lesson.code ?? lesson.n}`), el('h1', {}, lesson.title)),
          progress,
        ),
        o.hero ? el('div.article-hero', {}, o.hero(lesson)) : null,
        el('div.paper', {},
          el('div.article-intro', {},
            el('p.eyebrow', {}, lesson.code ? `${noun} ${lesson.code}` : `${noun} ${lesson.n} of ${o.lessons.length}`),
            el('h1.poster-type', {}, lesson.title),
            el('p.lede', {}, /[.!?]$/.test(lesson.teaches) ? lesson.teaches : lesson.teaches + '.'),
            o.intro?.(lesson),
            footnoteLegend(Object.values(footnotes).map((n) => n.kind)),
          ),
          article,
        ),
      ),
    );

    const renderPart = (part: Part, i: number): Promise<void> => {
      const tasks: Promise<void>[] = [];
      const section = el('section.part', {}, el('h2', {}, el('span.part-n', {}, String(i + 1)), part.title));
      article.append(section);
      section.append(...part.blocks.map((b, j) => {
        const key = blockKey(i, j);
        const node = renderBlock(b, blockCtx(i, key), tasks, notes, keeping(i, key));
        node.dataset.at = key;
        return node;
      }));
      return Promise.all(tasks).then(() => undefined);
    };

    /** A button at the end of a part, enabled once its tasks are done. */
    const gate = (ready: Promise<void>, last: boolean): Promise<void> => {
      const btn = el('button.btn.btn-big', { type: 'button', disabled: true }, last ? 'Write up the log' : 'Continue') as HTMLButtonElement;
      const hint = el('p.gate-hint', {}, 'Finish the tasks above to go on.');
      const box = el('div.gate', {}, hint, btn);
      article.append(box);
      void ready.then(() => {
        btn.disabled = false;
        hint.textContent = last ? 'Check done.' : 'Done. On to the next part.';
      });
      return new Promise((resolve) => btn.addEventListener('click', () => {
        box.remove();
        resolve();
      }));
    };

    /** The log: what was learned, the check's score, and a line to sign. */
    const renderLog = () => {
      const score = scoreTotal();
      const name = el('input.sign', { type: 'text', maxLength: 40, placeholder: 'Your name', value: save.name, 'aria-label': 'Your name' }) as HTMLInputElement;
      const sign = el('button.btn.btn-big', { type: 'button' }, 'Sign the log') as HTMLButtonElement;
      const section = el('section.part.log', {},
        el('div.logbook', {},
          el('p.eyebrow', {}, `${noun} ${lesson.code ?? lesson.n} log`),
          el('h2', {}, lesson.title),
          score.of ? el('p.score', {}, `${o.radio && save.talk ? 'Radio check' : 'Check'}: ${score.right} of ${score.of} right`) : null,
          el('ul', {}, lesson.learned.map((l) => el('li', {}, l))),
          el('p.next', {}, lesson.next),
          el('label', {}, 'Signed, ', name),
        ),
        el('div.gate', {}, sign),
      );
      article.append(section);
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sign.addEventListener('click', () => {
        finished = true;
        clearTimeout(timer);
        o.store.update((s) => ({ ...finishLesson(s, lesson.id, score.right, score.of, lesson.journal, new Date()), name: name.value.trim() || s.name }));
        nav.navigate(home);
      });
    };

    /** Scroll to the block the reader was at, or else to `fallback`. */
    const backToPlace = (fallback: HTMLElement | null) => {
      const at = here.at && article.querySelector<HTMLElement>(`[data-at="${here.at}"]`);
      const target = at || fallback;
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    };

    void (async () => {
      if (replay) {
        // Everything at once; only the check (the last part) gates the log.
        let last: Promise<void> = Promise.resolve();
        lesson.parts.forEach((p, i) => (last = renderPart(p, i)));
        reached(total - 1);
        await gate(last, true);
      } else {
        const opening = waiting('start');
        // Coming back past the first part, the reader has heard it start already.
        if (opening && here.part === 0) void o.radio!.play(opening);
        for (const [i, part] of lesson.parts.entries()) {
          reached(i);
          const last = i === lesson.parts.length - 1;
          const ready = renderPart(part, i);
          if (i < here.part) {
            // Passed on an earlier visit.
            if (last) await ready;
            continue;
          }
          if (resumed && i === resumed.part) backToPlace(article.lastElementChild as HTMLElement);
          else if (i > 0) article.lastElementChild!.scrollIntoView({ behavior: 'smooth', block: 'start' });
          await gate(ready, last);
          here.part = i + 1;
          flush();
        }
      }
      if (!alive) return;
      reached(total);
      renderLog();
      if (resumed && resumed.part === lesson.parts.length) backToPlace(null);
    })();

    // Note the block at the top of the screen as the reader scrolls, and save
    // before the page goes away; a reload does not close the view.
    const onScroll = () => {
      if (replay || finished) return;
      const top = [...article.querySelectorAll<HTMLElement>('[data-at]')].find((b) => b.getBoundingClientRect().bottom > 80);
      // Still at the top of the first part is no place worth keeping.
      if (top && top.dataset.at !== here.at && (here.at || top.dataset.at !== '0.0')) {
        here.at = top.dataset.at;
        keepSoon();
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden' && timer !== undefined) flush();
    };
    const onPageHide = () => timer !== undefined && flush();
    window.addEventListener('scroll', onScroll, { passive: true, signal: closed.signal });
    document.addEventListener('visibilitychange', onHide, { signal: closed.signal });
    window.addEventListener('pagehide', onPageHide, { signal: closed.signal });

    return () => {
      if (timer !== undefined) flush();
      alive = false;
      closed.abort();
      closeFootnote();
      o.radio?.clear();
    };
  };
}

/**
 * Put a figure's range inputs back where they were left, as if dragged there,
 * and report them when they move. Only inputs the figure leaves unlocked are
 * put back, so a guess-first figure that still wants its guess stays locked.
 */
function keepSliders(node: HTMLElement, keeping: { sliders?: number[]; onSliders: (values: number[]) => void }): void {
  const ranges = () => [...node.querySelectorAll<HTMLInputElement>('input[type=range]')];
  keeping.sliders?.forEach((v, i) => {
    const input = ranges()[i];
    if (!input || input.disabled || Number(input.value) === v) return;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  node.addEventListener('input', (e) => {
    if ((e.target as HTMLInputElement).type === 'range') keeping.onSliders(ranges().map((r) => Number(r.value)));
  });
}

/**
 * What is wrong with a set of lessons and the figures they use, for an app's
 * content test: a figure that does not exist, a goal its figure would never
 * meet, a task on a live figure with no goal (the lesson would stall), or a
 * footnote marker with no note, or a note with no marker.
 */
export function lessonProblems(
  lessons: readonly Lesson[],
  figures: Readonly<Record<string, FigureFactory>>,
  opts: { allowPlaceholders?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const l of lessons) {
    out.push(...footnoteProblems(l.id, l.footnotes, lessonTexts(l)));
    for (const p of l.parts) {
      for (const b of p.blocks) {
        if (!isDiagram(b)) continue;
        const f = figures[b.id];
        if (!f) {
          if (!opts.allowPlaceholders) out.push(`${l.id}: no figure "${b.id}"`);
        } else if (b.type !== diagramType(f)) out.push(`${l.id}: ${b.id} should have "type": "${diagramType(f)}", not "${b.type}"`);
        else if (b.goal && !f.goals?.includes(b.goal)) out.push(`${l.id}: ${b.id} does not know the goal "${b.goal}"`);
        else if (b.task && !b.goal && !f.quiz) out.push(`${l.id}: ${b.id} has a task but no goal`);
      }
    }
  }
  return out;
}

/** The box shown for a diagram the course has no code for yet. */
function placeholder(b: DiagramBlock): HTMLElement {
  const words = { interactive_diagram: 'Interactive diagram', diagram: 'Diagram', quiz: 'Quiz' }[b.type] ?? 'Diagram';
  return el('div.fig-placeholder', { style: `aspect-ratio: ${b.aspect_ratio && b.aspect_ratio > 0 ? b.aspect_ratio : 16 / 9}` },
    el('p', {}, `${words} `, el('code', {}, b.id), ' goes here'));
}
