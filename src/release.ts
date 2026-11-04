// A course's release: its version and whether it is still in beta.
//
// A course is in beta while it is being written and checked: lessons may be
// added, reworded or reordered, and some facts and pictures are not yet
// checked. Once its author has read it through and every lesson has been
// checked, it is released. The version goes up when its author says so (a
// batch of lessons, a round of fixes), not with every change: 0.x while in
// beta, 1.0 on release, then 1.1, 1.2 or 2.0.
//
// Readers' progress is kept by lesson id, so neither a new version nor
// moving out of beta touches it.
//
// A course gives its release to defineCourse (`release`): the default home
// page shows a beta slip under the welcome, and Settings' About says the
// version. A course with a home page of its own puts releaseSlip() in it.

import { el } from './dom';

export type ReleaseStage = 'beta' | 'released';

/** One version, as a course's history keeps it. */
export interface ReleaseNote {
  version: string;
  stage: ReleaseStage;
  /** When it came out, YYYY-MM-DD. */
  date: string;
  /** A sentence on what changed. */
  note?: string;
}

/** A course's current release, and the versions before it, newest first. */
export interface CourseRelease extends ReleaseNote {
  history?: ReleaseNote[];
}

/** What beta means, in a sentence a reader sees on the home page. */
export const BETA_TEXT = 'This course is still being written and checked. Lessons may be added, reworded or reordered, and some facts and pictures have not been checked yet. Your progress is kept through every change.';

/** What released means, for Settings. */
export const RELEASED_TEXT = 'Every lesson is written, read through and checked. New lessons may still be added, and your progress is kept when they are.';

const VERSION = /^\d+\.\d+$/;

/** The problems with a release, as sentences; none when it is fine. */
export function releaseProblems(r: unknown): string[] {
  if (typeof r !== 'object' || r === null) return ['"release" should be { version, stage, date }'];
  const o = r as Record<string, unknown>;
  const out: string[] = [];
  const one = (x: Record<string, unknown>, where: string) => {
    if (typeof x.version !== 'string' || !VERSION.test(x.version)) out.push(`${where}"version" should be two numbers, such as "0.3" or "1.0"`);
    if (x.stage !== 'beta' && x.stage !== 'released') out.push(`${where}"stage" should be "beta" or "released"`);
    if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) out.push(`${where}"date" should be YYYY-MM-DD`);
    if (x.stage === 'beta' && typeof x.version === 'string' && !x.version.startsWith('0.')) out.push(`${where}a beta's version starts with 0.`);
    if (x.stage === 'released' && typeof x.version === 'string' && x.version.startsWith('0.')) out.push(`${where}a released version is 1.0 or more`);
  };
  one(o, '');
  if (o.history !== undefined && !Array.isArray(o.history)) out.push('"history" should be a list');
  for (const h of Array.isArray(o.history) ? o.history : []) one(h as Record<string, unknown>, `history ${String((h as { version?: unknown })?.version)}: `);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "4 November 2026" from "2026-11-04". */
export function releaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return MONTHS[m - 1] ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}

/** The word for a stage: "Beta" or "Released". */
export const stageLabel = (s: ReleaseStage) => (s === 'beta' ? 'Beta' : 'Released');

/**
 * The slip for a course home: for a beta, a tag, what beta means and the
 * version; for a released course nothing, unless `always`.
 */
export function releaseSlip(r: CourseRelease | undefined, o: { always?: boolean } = {}): HTMLElement | null {
  if (!r || (r.stage === 'released' && !o.always)) return null;
  return el(`aside.release-slip.release-${r.stage}`, { 'aria-label': stageLabel(r.stage) },
    el('span.release-tag', {}, stageLabel(r.stage)),
    el('p', {},
      r.stage === 'beta' ? BETA_TEXT : RELEASED_TEXT,
      ' ',
      el('span.release-v', {}, `Version ${r.version}, ${releaseDate(r.date)}.`)));
}

/** Settings' About: the version, its stage and what changed lately. */
export function releaseAbout(r: CourseRelease, o: { recent?: number } = {}): HTMLElement {
  const past = [r, ...(r.history ?? [])].filter((h) => h.note).slice(0, o.recent ?? 3);
  return el('div.release-about', {},
    el('p', {},
      el('span.release-tag', { className: `release-tag release-${r.stage}` }, stageLabel(r.stage)),
      ' ',
      el('b', {}, `Version ${r.version}`),
      `, ${releaseDate(r.date)}. `,
      r.stage === 'beta' ? BETA_TEXT : RELEASED_TEXT),
    past.length
      ? el('ul.release-history', {}, past.map((h) => el('li', {}, el('b', {}, h.version), ` (${releaseDate(h.date)}): ${h.note}`)))
      : null);
}
