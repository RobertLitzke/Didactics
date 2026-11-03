// Where the reader stands with a lesson, for the lists of lessons on a home
// page: not started, started and left part way (it has a place kept, resume.ts),
// or done. Each has its own button colour, icon and word, so the three can be
// told apart at a glance and without colour (kit.css, `.go-new` and the rest).

import { el } from './dom';
import type { Progress } from './progress';
import { resumeFor, type LessonResume } from './resume';

export type LessonStatus = 'new' | 'started' | 'done';

/** What lessonStatus needs of a lesson; one not written yet has no parts and is never started. */
export interface StatusLesson {
  id: string;
  parts?: Parameters<typeof resumeFor>[2]['parts'];
}

/** The place kept in a lesson left part way, if it is still good for this version of the lesson. */
export function placeKept(save: Pick<Progress, 'lessons' | 'resume'>, lesson: StatusLesson): LessonResume | undefined {
  if (save.lessons[lesson.id]?.done || !lesson.parts?.length) return undefined;
  return resumeFor(save.resume ?? {}, lesson.id, { parts: lesson.parts });
}

export function lessonStatus(save: Pick<Progress, 'lessons' | 'resume'>, lesson: StatusLesson): LessonStatus {
  if (save.lessons[lesson.id]?.done) return 'done';
  return placeKept(save, lesson) ? 'started' : 'new';
}

/** A short line on how far a started lesson got, such as "In progress: part 2 of 5". */
export function progressLine(save: Pick<Progress, 'lessons' | 'resume'>, lesson: StatusLesson): string | null {
  const r = placeKept(save, lesson);
  const n = lesson.parts?.length ?? 0;
  return r ? `In progress: part ${Math.min(r.part + 1, n)} of ${n}` : null;
}

const GO: Record<LessonStatus, string> = { new: 'Start', started: 'Continue', done: 'Again' };

/**
 * The button that opens a lesson, coloured and marked by where the reader
 * stands with it: Start (peach), Continue (rose, a half-filled circle) or
 * Again (teal, a tick). The marks are drawn by kit.css, so any link given
 * the classes `btn go-<status>` gets them too.
 */
export function lessonGo(href: string, status: LessonStatus, word?: string): HTMLElement {
  return el('a.btn.lesson-go', { className: `btn lesson-go go-${status}`, href }, word ?? GO[status]);
}
