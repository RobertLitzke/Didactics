// A lesson left part way, so that coming back to it picks up where the reader
// was instead of starting over. It is kept in the save (progress.ts, `resume`)
// by lesson id, and the lesson view (lesson.ts) writes and reads it:
//
// - how far the reader got: the part open now, and the block they were reading;
// - which figures' tasks are done, and what each check scored;
// - each figure's sliders, and whatever a figure chose to keep (Task.keep in
//   figure.ts), such as a guess it was given or the answers to a quiz.
//
// Blocks are named by place, "part.block". A lesson whose figures change (one
// added, moved, given another goal or other options) gets a new signature,
// and a resume made for the old one is dropped rather than restored onto the
// wrong figures. Edits to the text alone keep it. Finishing the lesson drops it.

// progress.ts imports this file, so these two are its own copies rather than progress.ts's.
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const stringSet = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string'))] : []);

export interface LessonResume {
  /** The shape of this record. Another one is dropped on load. */
  v: 1;
  /** The lesson's figures, as lessonSignature saw them. */
  sig: string;
  /** The part open now, from 0; the number of parts once the log is up. */
  part: number;
  /** The block at the top of the screen, as "part.block". */
  at?: string;
  /** Blocks whose task is done. */
  done: string[];
  /** What each scored block reported, as [right, of]. */
  scores: Record<string, [number, number]>;
  /** Each figure's range inputs, in document order. */
  sliders: Record<string, number[]>;
  /** What each figure kept with Task.keep. Any JSON. */
  kept: Record<string, unknown>;
}

/** What the resume needs to know of a lesson: its figures, in order. */
interface Shape {
  parts: readonly { blocks: readonly { kind: string; figure?: string; goal?: string; task?: string; options?: unknown }[] }[];
}

export const blockKey = (part: number, block: number) => `${part}.${block}`;

export function emptyResume(sig: string): LessonResume {
  return { v: 1, sig, part: 0, done: [], scores: {}, sliders: {}, kept: {} };
}

/**
 * A short hash of the parts and figures of a lesson, but not its words: the
 * kind of every block, and for a figure its name, goal, whether it has a task,
 * and its options.
 */
export function lessonSignature(lesson: Shape): string {
  const text = JSON.stringify(lesson.parts.map((p) => p.blocks.map((b) =>
    b.kind === 'figure' ? [b.figure, b.goal ?? '', b.task ? 1 : 0, b.options ?? null] : b.kind)));
  // FNV-1a, 32 bits.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The resume kept for `lesson`, if there is one and it was made for this version of it. */
export function resumeFor(resume: Readonly<Record<string, LessonResume>>, id: string, lesson: Shape): LessonResume | undefined {
  const r = resume[id];
  if (!r || r.sig !== lessonSignature(lesson)) return undefined;
  return r.part >= 0 && r.part <= lesson.parts.length ? r : undefined;
}

const count = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
const KEY = /^\d+\.\d+$/;

/** Repair the stored resumes, dropping any that cannot be read. */
export function migrateResume(raw: unknown): Record<string, LessonResume> {
  const out: Record<string, LessonResume> = {};
  if (!isObj(raw)) return out;
  for (const [id, r] of Object.entries(raw)) {
    if (!isObj(r) || r.v !== 1 || typeof r.sig !== 'string') continue;
    const one = emptyResume(r.sig);
    one.part = count(r.part);
    if (typeof r.at === 'string' && KEY.test(r.at)) one.at = r.at;
    one.done = stringSet(r.done).filter((k) => KEY.test(k));
    if (isObj(r.scores)) {
      for (const [k, s] of Object.entries(r.scores)) {
        if (KEY.test(k) && Array.isArray(s) && s.length === 2) one.scores[k] = [count(s[0]), count(s[1])];
      }
    }
    if (isObj(r.sliders)) {
      for (const [k, s] of Object.entries(r.sliders)) {
        if (KEY.test(k) && Array.isArray(s)) one.sliders[k] = s.map(Number).filter(Number.isFinite);
      }
    }
    if (isObj(r.kept)) for (const [k, s] of Object.entries(r.kept)) if (KEY.test(k) && s !== undefined) one.kept[k] = s;
    out[id] = one;
  }
  return out;
}
