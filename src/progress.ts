// The part of the save file every lesson app shares: lessons finished and how
// they went, units, the review cards, and, for an app with a radio (radio.ts),
// the radio's setting and what was heard. An app
// adds its own fields alongside these (Clouds' core/save.ts is an example) and repairs them
// after migrateProgress has done these.

import { emptyResume, migrateResume, type LessonResume } from './resume';
import { migrateCollection, type Collection } from './srs';
import type { Units } from './units';

export type { Units } from './units';

export interface LessonRecord {
  done: boolean;
  /** Best check score, as right answers out of `of`. */
  best: number;
  of: number;
  /** ISO date of the first time it was finished. */
  finishedAt?: string;
  /** Set aside without being done: it counts as passed for what comes next, and can still be started. */
  skipped?: boolean;
}

/**
 * The shared save. The radio's fields are there only in an app with a radio,
 * whose save is a RadioProgress, as emptyProgress's is by default.
 */
export interface Progress {
  v: 1;
  /** The player's name, as signed on the log. Empty until given. */
  name: string;
  lessons: Record<string, LessonRecord>;
  units: Units;
  /** The course has one unit system: `units` is always the one emptyProgress set, whatever was stored. */
  fixedUnits?: true;
  /**
   * The Leitner quiz of versions before 0.12, by card id: box and due date.
   * Read only to carry those cards into `review` (review.ts fromLeitner);
   * nothing writes it any more.
   */
  quiz: Record<string, { box: number; due: number }>;
  /** Lessons left part way, by id, to pick up again where the reader was (resume.ts); for a finished lesson, only how its figures were left. */
  resume: Record<string, LessonResume>;
  /**
   * The review page's cards: every check question answered and every quiz
   * card met, with their schedules and every answer, in Anki's shape
   * (srs.ts, review.ts). Absent until the first one.
   */
  review?: Collection;
  /** Radio talks on. Off, the lessons are a plain workbook. */
  talk?: boolean;
  /** The opening talk has been offered once. */
  introSeen?: boolean;
  /** Talks heard to the end, with the reply picked at each turn. */
  heard?: Record<string, number[]>;
}

/** The save of an app with a radio (radio.ts): the radio's fields are always there. */
export interface RadioProgress extends Progress {
  talk: boolean;
  introSeen: boolean;
  heard: Record<string, number[]>;
}

/** How a new save is made: with the radio's fields or without, and whether the reader can change units. */
export interface EmptyOptions {
  radio?: boolean;
  /** One unit system for the whole course: migrateProgress then never reads `units` from what was stored. */
  fixedUnits?: boolean;
}

/**
 * A new save. With `radio: false` it has no radio fields, and migrateProgress
 * given it keeps none from what was stored. With `fixedUnits: true` its
 * `units` stay as given, through every migrateProgress.
 */
export function emptyProgress(units?: Units, o?: EmptyOptions & { radio?: true }): RadioProgress;
export function emptyProgress(units: Units, o: EmptyOptions & { radio: false }): Progress;
export function emptyProgress(units: Units = 'metric', o: EmptyOptions = {}): Progress {
  const base: Progress = { v: 1, name: '', lessons: {}, units, quiz: {}, resume: {}, ...(o.fixedUnits ? { fixedUnits: true as const } : {}) };
  return o.radio === false ? base : { ...base, talk: true, introSeen: false, heard: {} };
}

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Strings in a stored list, each once; anything else is dropped. */
export const stringSet = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string'))] : []);

/**
 * Repair the shared fields of whatever was stored, keeping all that can be
 * kept, onto `empty`. The radio's fields are read only if `empty` has them,
 * and `units` only if `empty` does not have `fixedUnits`.
 * Lesson records are read from `lessons`, or from `shifts`, the name Clouds
 * stored them under first. A `journal` list from before 0.21 is dropped: the
 * journal is gone, and its entries were only ever unlocked by finished lessons.
 */
export function migrateProgress<P extends Progress = RadioProgress>(raw: unknown, empty: P = emptyProgress() as P): P {
  const out: P = { ...empty, lessons: {}, quiz: {}, resume: {} };
  delete (out as Partial<Record<'journal', unknown>>).journal;
  const radio = typeof empty.talk === 'boolean';
  if (radio) out.heard = {};
  if (!isObj(raw)) return out;
  if (typeof raw.name === 'string') out.name = raw.name.slice(0, 40);
  if (!empty.fixedUnits && (raw.units === 'metric' || raw.units === 'imperial')) out.units = raw.units;
  if (radio) {
    if (typeof raw.talk === 'boolean') out.talk = raw.talk;
    if (raw.introSeen === true) out.introSeen = true;
    if (isObj(raw.heard)) {
      for (const [id, picks] of Object.entries(raw.heard)) {
        if (Array.isArray(picks)) out.heard![id] = picks.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
      }
    }
  }
  if (isObj(raw.quiz)) {
    for (const [id, st] of Object.entries(raw.quiz)) {
      if (!isObj(st)) continue;
      const box = Math.max(0, Math.floor(Number(st.box) || 0));
      const due = Number(st.due);
      if (Number.isFinite(due)) out.quiz[id] = { box, due };
    }
  }
  if (isObj(raw.review)) out.review = migrateCollection(raw.review);
  out.resume = migrateResume(raw.resume);
  const lessons = isObj(raw.lessons) ? raw.lessons : raw.shifts;
  if (isObj(lessons)) {
    for (const [id, rec] of Object.entries(lessons)) {
      if (!isObj(rec)) continue;
      const of = Number(rec.of) > 0 ? Math.floor(Number(rec.of)) : 0;
      const best = Math.min(of, Math.max(0, Math.floor(Number(rec.best) || 0)));
      out.lessons[id] = {
        done: rec.done === true,
        best,
        of,
        ...(typeof rec.finishedAt === 'string' ? { finishedAt: rec.finishedAt } : {}),
        ...(rec.skipped === true && rec.done !== true ? { skipped: true } : {}),
      };
    }
  }
  return out;
}

/** The lesson is done or was skipped, so the next one is open. */
export const passed = (p: Progress, id: string): boolean => p.lessons[id]?.done === true || p.lessons[id]?.skipped === true;

/** Skip a lesson that is not done: the next one opens, and anything left part way is forgotten. */
export function skipLesson<S extends Progress>(save: S, id: string): S {
  if (save.lessons[id]?.done) return save;
  const { [id]: _left, ...resume } = save.resume ?? {};
  return { ...save, resume, lessons: { ...save.lessons, [id]: { done: false, best: 0, of: 0, skipped: true } } };
}

/** Move a lesson's record to a new id (a lesson renamed or merged), unless the new id has one already. */
export function moveLesson(p: Progress, from: string, to: string): void {
  const rec = p.lessons[from];
  if (!rec) return;
  p.lessons[to] ??= { ...rec };
  delete p.lessons[from];
}

/**
 * Record a finished lesson, keeping the best score and the first finish date.
 * Where it was left part way is dropped, all but what its figures kept and
 * how their sliders were set, so that it opens again as the reader left it.
 */
export function finishLesson<S extends Progress>(save: S, id: string, right: number, of: number, now: Date): S {
  const prev = save.lessons[id];
  const better = !prev || prev.of === 0 || right / Math.max(1, of) > prev.best / Math.max(1, prev.of);
  const { [id]: left, ...resume } = save.resume ?? {};
  if (left) resume[id] = { ...emptyResume(left.sig), sliders: left.sliders, kept: left.kept };
  return {
    ...save,
    resume,
    lessons: {
      ...save.lessons,
      [id]: {
        done: true,
        best: better ? right : prev.best,
        of: better ? of : prev.of,
        finishedAt: prev?.finishedAt ?? now.toISOString().slice(0, 10),
      },
    },
  };
}
