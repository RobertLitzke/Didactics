// The part of the save file every lesson app shares: lessons finished and how
// they went, unlocked journal entries, units, the radio, and the quiz. An app
// adds its own fields alongside these (Clouds' core/save.ts is an example) and repairs them
// after migrateProgress has done these.

import { migrateResume, type LessonResume } from './resume';
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

export interface Progress {
  v: 1;
  /** The player's name, as signed on the log. Empty until given. */
  name: string;
  lessons: Record<string, LessonRecord>;
  /** Journal entries unlocked, by id. */
  journal: string[];
  units: Units;
  /** Radio talks on. Off, the lessons are a plain workbook. */
  talk: boolean;
  /** The opening talk has been offered once. */
  introSeen: boolean;
  /** Talks heard to the end, with the reply picked at each turn. */
  heard: Record<string, number[]>;
  /** Quiz cards seen, by card id: their spaced-repetition box and when each is next due (quiz.ts). */
  quiz: Record<string, { box: number; due: number }>;
  /** Lessons left part way, by id, to pick up again where the reader was (resume.ts). */
  resume: Record<string, LessonResume>;
}

export function emptyProgress(units: Units = 'metric'): Progress {
  return { v: 1, name: '', lessons: {}, journal: [], units, talk: true, introSeen: false, heard: {}, quiz: {}, resume: {} };
}

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Strings in a stored list, each once; anything else is dropped. */
export const stringSet = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string'))] : []);

/**
 * Repair the shared fields of whatever was stored, keeping all that can be
 * kept. Lesson records are read from `lessons`, or from `shifts`, the name
 * Clouds stored them under first.
 */
export function migrateProgress(raw: unknown, empty: Progress = emptyProgress()): Progress {
  const out: Progress = { ...empty, lessons: {}, journal: [], heard: {}, quiz: {}, resume: {} };
  if (!isObj(raw)) return out;
  if (typeof raw.name === 'string') out.name = raw.name.slice(0, 40);
  if (raw.units === 'metric' || raw.units === 'imperial') out.units = raw.units;
  if (typeof raw.talk === 'boolean') out.talk = raw.talk;
  if (raw.introSeen === true) out.introSeen = true;
  if (isObj(raw.heard)) {
    for (const [id, picks] of Object.entries(raw.heard)) {
      if (Array.isArray(picks)) out.heard[id] = picks.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
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
  out.journal = stringSet(raw.journal);
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

/** Record a finished lesson, keeping the best score and the first finish date, and drop where it was left part way. */
export function finishLesson<S extends Progress>(save: S, id: string, right: number, of: number, journal: readonly string[], now: Date): S {
  const prev = save.lessons[id];
  const better = !prev || prev.of === 0 || right / Math.max(1, of) > prev.best / Math.max(1, prev.of);
  const { [id]: _left, ...resume } = save.resume ?? {};
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
    journal: [...new Set([...save.journal, ...journal])],
  };
}
