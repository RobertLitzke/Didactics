// A whole course as one JSON file, for revising it in one place: every
// lesson, and any other words the course keeps in JSON (radio talks, quiz
// cards, a glossary), each under the path of the file it came from. Lessons
// keep their diagram callouts (blocks.ts), so the file reads as the text with
// "interactive_diagram parcel goes here" where each drawing sits.
//
// The same file goes back in two ways:
// - in the repository, `npx didactics-course import course.json` writes each
//   file back to its path (bin/didactics-course.mjs; `export` makes one);
// - in the app, `courseEdits` keeps an edited file in this browser and puts
//   its words in place of the built-in ones as the app starts, so a revision
//   can be read in the real lessons before it is committed (course-view.ts
//   is the Settings section for it).
//
// Files are matched by path, and an edited file replaces the built-in one's
// contents in place, so the course code that imported it sees the new words
// without knowing about any of this. Apply edits before anything reads the
// files: make `courseEdits` in a module the app's entry imports first.
//
// This file imports nothing that needs a browser, so the command line can use it.

import { lessonShapeProblems, isLessonShaped, type DiagramType } from './blocks.ts';

export const COURSE_FORMAT = 'didactics-course';
export const COURSE_VERSION = 1;

/** A course's JSON files, by path from the repository root ("src/data/lessons/fog.json"). */
export type CourseFiles = Record<string, unknown>;

export interface CourseFile {
  format: typeof COURSE_FORMAT;
  version: typeof COURSE_VERSION;
  title: string;
  /** When it was exported, as an ISO date. */
  exported: string;
  _howTo: string;
  files: CourseFiles;
}

const HOW_TO =
  'The whole course, one entry in "files" per JSON file of the course, under its path. Edit any words freely. ' +
  'A lesson is a list of "parts", each a list of "blocks" with a "type": "text" (a paragraph), "key_ideas" (a title and points), ' +
  'or a callout for something the course draws, by "id": "interactive_diagram", "diagram" (a still) or "quiz". ' +
  'A callout\'s "caption" and "task" are words to edit; its "id", "goal" and "options" wire it to the code, so keep them unless the code changes too. ' +
  'Blocks can be added, removed and moved. A callout with an id the course has no code for yet shows as a box saying that the diagram goes there, ' +
  '"aspect_ratio" (width / height) wide. Text markup: **bold**, *italic*, [[words|colour]] and [^footnote].';

/**
 * The files from `import.meta.glob('/src/data/**\/*.json', { eager: true, import: 'default' })`
 * (or any map of path to parsed JSON), keyed by path from the repository root.
 */
export function courseFiles(found: Record<string, unknown>): CourseFiles {
  const out: CourseFiles = {};
  for (const [path, json] of Object.entries(found)) out[cleanPath(path)] = json;
  return out;
}

const cleanPath = (p: string) => p.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');

/** The course as one file. */
export function exportCourse(title: string, files: CourseFiles, now = new Date()): CourseFile {
  const sorted: CourseFiles = {};
  for (const path of Object.keys(files).sort()) sorted[path] = files[path];
  return { format: COURSE_FORMAT, version: COURSE_VERSION, title, exported: now.toISOString(), _howTo: HOW_TO, files: structuredClone(sorted) };
}

/**
 * Reads a course file. `known`, the course's own files, limits it to them:
 * a path the course does not have is a problem, since nothing would read it.
 * Returns the files only when there are no problems.
 */
export function readCourse(raw: unknown, known?: CourseFiles): { files: CourseFiles; problems: string[] } {
  const f = raw as Partial<CourseFile> | null;
  if (!f || typeof f !== 'object' || f.format !== COURSE_FORMAT) return { files: {}, problems: ['This is not a course file (its "format" is not "didactics-course").'] };
  if (f.version !== COURSE_VERSION) return { files: {}, problems: [`This course file is version ${String(f.version)}; this app reads version ${COURSE_VERSION}.`] };
  if (!f.files || typeof f.files !== 'object') return { files: {}, problems: ['The course file has no "files".'] };
  const problems: string[] = [];
  const files: CourseFiles = {};
  for (const [p, json] of Object.entries(f.files)) {
    const path = cleanPath(p);
    if (!path.endsWith('.json') || path.split('/').includes('..')) problems.push(`${p}: not a JSON file inside the course`);
    else if (known && !(path in known)) problems.push(`${p}: the course has no such file`);
    else if (isLessonShaped(json) || (known && isLessonShaped(known[path]))) problems.push(...lessonShapeProblems(json, path));
    files[path] = json;
  }
  return { files: problems.length ? {} : files, problems };
}

/** Puts each of `files` in place of the one at its path in `into`, keeping the same object. Returns the paths changed. */
export function injectCourse(into: CourseFiles, files: CourseFiles): string[] {
  const changed: string[] = [];
  for (const [path, json] of Object.entries(files)) {
    const target = into[path];
    if (target === undefined || JSON.stringify(target) === JSON.stringify(json)) continue;
    if (typeof target === 'object' && target !== null && typeof json === 'object' && json !== null && Array.isArray(target) === Array.isArray(json)) {
      if (Array.isArray(target)) target.splice(0, target.length, ...(structuredClone(json) as unknown[]));
      else {
        for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
        Object.assign(target, structuredClone(json));
      }
    } else into[path] = structuredClone(json);
    changed.push(path);
  }
  return changed;
}

export interface CourseEdits {
  /** The paths whose words in this browser are edited ones. */
  readonly edited: readonly string[];
  /** The course as it reads now, edits and all. */
  file: () => CourseFile;
  /** Keeps an edited course file's words in this browser. Returns what is wrong with it, and keeps nothing then; reload to see it. */
  load: (text: string) => string[];
  /** Forgets the edits; reload to see the built-in words again. */
  reset: () => void;
}

/**
 * The course's words as this browser has them: the built-in `files`, with any
 * edits loaded earlier (kept in localStorage under `key`) put in their place
 * now, in place. Call it before anything reads the files.
 */
export function courseEdits(o: { key: string; title: string; files: CourseFiles }): CourseEdits {
  const built = structuredClone(o.files);
  let edited: string[] = [];
  try {
    const kept = localStorage.getItem(o.key);
    if (kept) {
      const { files, problems } = readCourse(JSON.parse(kept), o.files);
      if (problems.length) localStorage.removeItem(o.key);
      else edited = injectCourse(o.files, files);
    }
  } catch {
    // Storage blocked, or a file that no longer reads: the built-in words stand.
  }
  return {
    get edited() {
      return edited;
    },
    file: () => exportCourse(o.title, o.files),
    load(text) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (e) {
        return [`That file is not JSON: ${(e as Error).message}`];
      }
      const { files, problems } = readCourse(raw, built);
      if (problems.length) return problems;
      // Keep only what differs from the built-in words: storage is small.
      const changed: CourseFiles = {};
      for (const [path, json] of Object.entries(files)) if (JSON.stringify(json) !== JSON.stringify(built[path])) changed[path] = json;
      try {
        if (Object.keys(changed).length) localStorage.setItem(o.key, JSON.stringify(exportCourse(o.title, changed)));
        else localStorage.removeItem(o.key);
      } catch (e) {
        return [`This browser would not keep it: ${(e as Error).message}`];
      }
      edited = Object.keys(changed);
      return [];
    },
    reset() {
      try {
        localStorage.removeItem(o.key);
      } catch {
        // Nothing kept, then.
      }
      edited = [];
    },
  };
}

/**
 * A lesson in the earlier JSON shape, with `kind` blocks ("text", "key",
 * "figure" with a "figure" name), in the typed shape of blocks.ts. `typeOf`
 * says what each figure is (lesson.ts diagramType); left out, or for an id it
 * does not know, a figure with a task is taken as interactive and one
 * without as a still. Files already typed come back as they were.
 */
export function upgradeLesson<T>(raw: T, typeOf?: (id: string) => DiagramType | undefined): T {
  if (!isLessonShaped(raw)) return raw;
  const parts = (raw.parts as { blocks?: Record<string, unknown>[] }[]).map((p) => ({
    ...p,
    blocks: (p.blocks ?? []).map((b) => {
      if (!('kind' in b) || 'type' in b) return b;
      const { kind, figure, ...rest } = b;
      if (kind === 'text') return { type: 'text', ...rest };
      if (kind === 'key') return { type: 'key_ideas', ...rest };
      const id = String(figure);
      return { type: typeOf?.(id) ?? (rest.task && !rest.goal ? 'quiz' : rest.task ? 'interactive_diagram' : 'diagram'), id, ...rest };
    }),
  }));
  return { ...raw, parts };
}

/**
 * JSON text for a course file, laid out like the file it replaces: two-space
 * indents, but every object or array that `like` (the file's text before)
 * wrote on one line stays on one line, so hand-compact blocks keep their one
 * line each through an upgrade or an import. Containers are matched by where
 * they sit (parts 0, blocks 3), so they may change inside. With no `like`,
 * it is JSON.stringify's layout. Ends with a newline.
 */
export function formatJson(value: unknown, like?: string): string {
  const compact = like ? oneLinePaths(like) : new Set<string>();
  const inline = (v: unknown): string => {
    if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
    if (isPlainObject(v)) {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined);
      return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
    }
    return JSON.stringify(v) ?? 'null';
  };
  const write = (v: unknown, path: (string | number)[], indent: string): string => {
    if (!Array.isArray(v) && !isPlainObject(v)) return JSON.stringify(v) ?? 'null';
    if (compact.has(JSON.stringify(path))) return inline(v);
    const inner = `${indent}  `;
    if (Array.isArray(v)) {
      return v.length ? `[\n${v.map((x, i) => inner + write(x, [...path, i], inner)).join(',\n')}\n${indent}]` : '[]';
    }
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${write(x, [...path, k], inner)}`).join(',\n')}\n${indent}}`;
  };
  return `${write(value, [], '')}\n`;
}

const STRING = /"(?:[^"\\]|\\.)*"/y;
const WORD = /[-+.\w]+/y;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Where JSON text writes a non-empty object or array on a single line, as
 * JSON-encoded paths (`["parts",0,"blocks",3]`). Text that is not JSON gives none.
 */
export function oneLinePaths(text: string): Set<string> {
  const out = new Set<string>();
  let at = 0;
  const space = () => {
    while (at < text.length && ' \t\r\n'.includes(text[at])) at++;
  };
  const string = (): string => {
    STRING.lastIndex = at;
    const m = STRING.exec(text);
    if (!m) throw new Error('bad string');
    at = STRING.lastIndex;
    return JSON.parse(m[0]) as string;
  };
  const value = (path: (string | number)[]): void => {
    space();
    const start = at;
    const c = text[at];
    if (c === '{' || c === '[') {
      at++;
      space();
      const close = c === '{' ? '}' : ']';
      let n = 0;
      while (text[at] !== close) {
        if (n) {
          if (text[at] !== ',') throw new Error('bad list');
          at++;
          space();
        }
        if (c === '{') {
          const key = string();
          space();
          if (text[at++] !== ':') throw new Error('bad object');
          value([...path, key]);
        } else value([...path, n]);
        n++;
        space();
        if (at >= text.length) throw new Error('unclosed');
      }
      at++;
      if (n && !text.slice(start, at).includes('\n')) out.add(JSON.stringify(path));
    } else if (c === '"') string();
    else {
      WORD.lastIndex = at;
      if (!WORD.exec(text)) throw new Error('bad value');
      at = WORD.lastIndex;
    }
  };
  try {
    value([]);
  } catch {
    return new Set();
  }
  return out;
}
