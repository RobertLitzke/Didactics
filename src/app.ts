// A whole course app in one call. Every course built on Didactics boots the
// same way: a store for the save, the top bar and its page menu, a router
// with a home page, the lesson player, Settings, the update banner, the
// course's words loaded with any edits, and the dev overflow strip.
// defineCourse does all of that from what is the course's own (its lessons,
// figures, palette and words) and takes the course's own pages besides, so a
// course's main.ts is one call and its figures, not a page of wiring. Each
// part is still the module that makes it (shell, router, lesson, settings,
// ...), so a course that outgrows this can call them itself.

import { assetFrom } from './asset';
import { courseEdits, type CourseEdits, type CourseEditsOptions, type CoursePiece } from './course';
import { courseSection } from './course-view';
import { el, type Child } from './dom';
import type { FootnoteSet } from './footnote';
import type { FigureFactory } from './figure';
import { glossaryFromLessons, glossaryView, mergeGlossary, type GlossaryEntry } from './glossary';
import { lessonView, type Lesson, type LessonViewOptions } from './lesson';
import { retireWhenSaved } from './offline';
import { creditsView, type CreditsViewOptions, type Photo } from './photos';
import { emptyProgress, migrateProgress, skipLesson, type EmptyOptions, type Progress, type Units } from './progress';
import { quizView, type QuizViewOptions } from './quiz-view';
import type { Card } from './quiz';
import { resumeFor } from './resume';
import { Router, type View } from './router';
import { settingsView, type SettingsOptions } from './settings';
import { appShell, type AppShell, type NavLink } from './shell';
import { showSplash, type SplashOptions } from './splash';
import { createStore, type Store } from './store';
import { nextLesson, treeView, type TreeBranch, type TreeNode } from './tree';
import type { UpdateBannerText } from './update';

/** A page of the course's own, such as a lab or a journal. */
export interface CoursePage {
  /** Its route, such as "/lab" or "/journal/:tab". */
  path: string;
  view: View;
  /** Its name in the page menu; left out, the page is reached only by links. */
  label?: string;
  /** Shown without the top bar, like a lesson. */
  fullScreen?: boolean;
}

/** How the save is made: given whole, or from these settings. */
export type CourseSave<S extends Progress> =
  | { store: Store<S>; empty: () => S }
  | {
      store?: undefined;
      /** Units a new reader starts in. Default metric. */
      units?: Units;
      /** One unit system only: no switch in Settings. */
      fixedUnits?: boolean;
      /** Keep the radio's fields; on by default when `lesson.radio` is given. */
      radio?: boolean;
    };

export interface CourseOptions<L extends Lesson, S extends Progress, C extends Card = Card, P extends Photo = Photo> {
  /**
   * A short lower-case name, such as "levers". It names what the course keeps
   * in the browser ("levers.save", "levers.course", "levers.tree") and its
   * files ("levers-save.json", "levers-course.json", "levers.html").
   */
  id: string;
  /** The wordmark, and the app's name in Settings and the update banner. */
  title: string;
  subtitle?: string;
  /** A logo before the title (shell.ts). */
  mark?: Child;
  /** The element the app fills. Default #app. */
  mount?: HTMLElement;

  lessons: readonly L[];
  /** Each diagram id a lesson names, to its code. */
  figures: Readonly<Record<string, FigureFactory>>;
  /** A paragraph's markup to a node, usually prose with the course's palette. */
  prose: (text: string, notes?: FootnoteSet) => HTMLElement;
  /** The lesson player's other options: hero, intro, radio, noun, countComing. */
  lesson?: Omit<LessonViewOptions<L, S>, 'lessons' | 'figures' | 'store' | 'prose' | 'home'>;
  /** Where a lesson opens, as "/lesson/:id". Default "/lesson". */
  lessonPath?: string;

  /** The save, or how to make it. Default: progress only, in metric. */
  save?: CourseSave<S>;

  /** The home page. Default: the lessons as a tree (with `branches`), each with Start, Continue or Again. */
  home?: View;
  /** Words at the top of the default home page, under the title. */
  welcome?: Child;
  /** Branches of the default home page's lesson tree (tree.ts). */
  branches?: readonly TreeBranch[];

  /** The course's own pages. */
  pages?: readonly CoursePage[];
  /** The page menu's paths in order, to place the course's pages among the built-in ones. */
  menu?: readonly string[];

  /** A quiz page at /quiz. */
  quiz?: Omit<QuizViewOptions<C, S>, 'store'> & { label?: string };
  /** A glossary page at /glossary: the lessons' technical footnotes, and `entries` before them. */
  glossary?: { entries?: GlossaryEntry[]; label?: string };
  /** A Credits page at /credits, linked from Settings. */
  photos?: CreditsViewOptions<P>;

  /**
   * The course's words, to download, edit and load back in Settings. Either
   * edits already made (with courseEdits, in a module the entry imports
   * first, for a course whose modules copy words out at import), or what to
   * make them from now (kept under "<id>.course").
   */
  text?: CourseEdits | Omit<CourseEditsOptions, 'key' | 'title'>;
  /** Parts of the words to download on their own, such as one per lesson (course-view.ts). */
  textPieces?: CoursePiece[];

  /** Settings beyond what defineCourse fills in (units label, radio blurb, more sections). */
  settings?: Partial<Omit<SettingsOptions<S>, 'store' | 'empty'>>;
  /**
   * The live site, ending in /, so the one-file copy opened from disk fetches
   * photos and the poster from it (asset.ts). Settings' one-file link then
   * points there too.
   */
  site?: string;
  /** The one-file copy's name, as lessonApp's `oneFile`. Default "<id>.html"; false for no link. */
  oneFile?: string | false;
  /** The poster shown while the app loads. */
  splash?: SplashOptions;
  /** The new-version banner's words. Default "New version", "A fresh version of <title> is ready." */
  update?: UpdateBannerText;
  /**
   * Large files the service worker keeps for offline (lessonApp's
   * `precache`), for Settings' Offline section; `retire` lists caches of an
   * older scheme to delete once every file is saved.
   */
  offline?: { folder: string; total: number; noun: string; retire?: string[] };
  /** The page the app opens on. Default /home. */
  start?: string;
  /**
   * The course is one of several on a site: the menu ends with a link to the
   * site's catalog of courses. `href` is relative to the course's page, "../"
   * when the course sits in a folder under the catalog. The one-file copy,
   * opened from disk, links to the catalog on the live site (`site`).
   */
  catalog?: { href: string; label?: string };
}

export interface Course<S extends Progress> {
  store: Store<S>;
  empty: () => S;
  router: Router;
  shell: AppShell;
  /** The course's words with their edits, when `text` was given. */
  text?: CourseEdits;
  /** A path next to the page, or on the live site when opened from disk. */
  asset: (path: string) => string;
}

const isEdits = (t: object): t is CourseEdits => 'load' in t && 'reset' in t;

/** The save and its store, from the course's settings. */
export function courseStore<S extends Progress>(id: string, save: CourseSave<S> = {}, radio = false): { store: Store<S>; empty: () => S } {
  if (save.store) return save;
  const make = emptyProgress as (units: Units, o: EmptyOptions) => Progress;
  const empty = () => make(save.units ?? 'metric', { radio: save.radio ?? radio, fixedUnits: save.fixedUnits }) as S;
  return { store: createStore({ key: `${id}.save`, empty, migrate: (raw) => migrateProgress(raw, empty()) }), empty };
}

/** The default home page: the welcome, a button for the lesson that is next, and the lessons as a tree. */
export function courseHome<L extends Lesson, S extends Progress>(o: {
  title: string;
  subtitle?: string;
  welcome?: Child;
  lessons: readonly L[];
  branches?: readonly TreeBranch[];
  store: Store<S>;
  lessonPath?: string;
  remember?: string;
  noun?: string;
}): View {
  const path = o.lessonPath ?? '/lesson';
  const noun = o.noun ?? 'Lesson';
  return (root, nav) => {
    const save = o.store.get();
    const started = (l: L) => !l.coming && !save.lessons[l.id]?.done && resumeFor(save.resume, l.id, l) !== undefined;
    const next = nextLesson(o.lessons, save);
    const name = (l: L) => `${noun} ${l.code ?? l.n}`;
    const card = ({ lesson: l, state, missing }: TreeNode<L>) => {
      const rec = save.lessons[l.id];
      const status = state === 'done' && rec ? `Check: ${rec.best} of ${rec.of}`
        : state === 'skipped' ? 'Skipped'
        : state === 'coming' ? 'Coming'
        : state === 'locked' && missing.length ? `After ${missing.map(name).join(' and ')}`
        : null;
      const open = state !== 'locked' && state !== 'coming';
      return el('div.lesson-card', { className: state === 'next' ? 'lesson-card next' : undefined },
        el('div', {}, el('h3', {}, l.title), el('p', {}, l.teaches), status ? el('p.score', {}, status) : null),
        open ? el('div.lesson-actions', {},
          el('a.btn', { href: `#${path}/${l.id}` }, rec?.done ? 'Again' : started(l) ? 'Continue' : 'Start'),
          state === 'next'
            ? el('button.btn.btn-ghost.btn-small', { type: 'button', onclick: () => { o.store.update((s) => skipLesson(s, l.id)); nav.replace('/home'); } }, 'Skip')
            : null) : null);
    };
    root.append(el('div.page.course-home', {},
      el('h1', {}, o.title),
      o.subtitle ? el('p.subtitle', {}, o.subtitle) : null,
      o.welcome ?? null,
      next ? el('a.btn.btn-big', { href: `#${path}/${next.id}` }, `${started(next) ? 'Continue' : 'Start'} ${name(next).toLowerCase()}: ${next.title}`) : null,
      el('h2', {}, `${noun}s`),
      treeView({ lessons: o.lessons, branches: o.branches ?? [], save, card, remember: o.remember })));
  };
}

/** Boots the course: makes its store, shell, routes and Settings, and starts the router. */
export function defineCourse<L extends Lesson, S extends Progress = Progress, C extends Card = Card, P extends Photo = Photo>(o: CourseOptions<L, S, C, P>): Course<S> {
  const asset = o.site ? assetFrom(o.site) : (p: string) => p;
  const { store, empty } = courseStore<S>(o.id, o.save, !!o.lesson?.radio);
  const text = o.text && (isEdits(o.text) ? o.text : courseEdits({ key: `${o.id}.course`, title: o.title, ...o.text }));
  const lessonPath = o.lessonPath ?? '/lesson';
  if (o.splash) showSplash(o.splash);

  const pages: CoursePage[] = [
    { path: '/home', label: 'Home', view: o.home ?? courseHome({ ...o, store, lessonPath, remember: `${o.id}.tree`, noun: o.lesson?.noun }) },
    { path: `${lessonPath}/:id`, fullScreen: true, view: lessonView({ ...o.lesson, lessons: o.lessons, figures: o.figures, store, prose: o.prose }) },
    ...(o.pages ?? []),
  ];
  if (o.quiz) pages.push({ path: '/quiz', label: o.quiz.label ?? 'Quiz', view: quizView({ ...o.quiz, store }) });
  if (o.glossary) {
    const entries = mergeGlossary(o.glossary.entries ?? [], glossaryFromLessons(o.lessons));
    const lesson = (id: string) => {
      const l = o.lessons.find((x) => x.id === id);
      return l && { href: `#${lessonPath}/${l.id}`, label: `${o.lesson?.noun ?? 'Lesson'} ${l.code ?? l.n}` };
    };
    pages.push({ path: '/glossary', label: o.glossary.label ?? 'Glossary', view: (root) => { root.append(el('div.page', {}, el('h1', {}, 'Glossary'), glossaryView({ entries, prose: o.prose, lesson }))); } });
  }
  if (o.photos) pages.push({ path: '/credits', view: creditsView(o.photos) });
  const oneFile = o.oneFile ?? `${o.id}.html`;
  pages.push({
    path: '/settings',
    label: 'Settings',
    view: settingsView({
      appName: o.title,
      saveFile: `${o.id}-save.json`,
      oneFile: oneFile ? { href: asset(oneFile), name: oneFile } : undefined,
      offline: o.offline,
      sections: text ? courseSection({ edits: text, fileName: `${o.id}-course.json`, pieces: o.textPieces }) : undefined,
      about: o.photos ? el('p', {}, el('a', { href: '#/credits' }, 'Credits'), ': who made the photos, and under what licence.') : undefined,
      ...o.settings,
      store,
      empty,
    }),
  });

  const labelled = pages.filter((p): p is CoursePage & { label: string } => !!p.label);
  const nav: NavLink[] = (o.menu ? o.menu.map((path) => labelled.find((p) => p.path === path)).filter((p) => !!p) : labelled)
    .map((p) => ({ path: p.path, label: p.label }));
  if (o.catalog) nav.push({ path: '/catalog', label: o.catalog.label ?? 'All courses', href: asset(o.catalog.href) });
  const full = pages.filter((p) => p.fullScreen).map((p) => p.path.split('/:')[0] + '/');
  const shell = appShell({
    mount: o.mount ?? document.getElementById('app')!,
    title: o.title,
    subtitle: o.subtitle,
    mark: o.mark,
    nav,
    fullScreen: (path) => full.some((f) => path.startsWith(f)),
  });
  const router = new Router(shell.outlet, { before: shell.before });
  for (const p of pages) router.add(p.path, p.view);
  router.start(o.start ?? '/home');

  if (import.meta.env?.DEV) void import('./overflow').then((m) => m.watchOverflow());
  // The one-file copy runs straight from disk, where there is no service worker.
  if (import.meta.env?.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Loaded only here: the service worker's register module exists only in the app's build.
    void import('./update').then((m) => m.watchForUpdates(o.update ?? { title: 'New version', text: `A fresh version of ${o.title} is ready.` }));
    if (o.offline?.retire) void retireWhenSaved(o.offline.folder, o.offline.total, o.offline.retire);
  }
  return { store, empty, router, shell, text, asset };
}
