// A whole course as one JSON file, for revising it in one place: every
// lesson, and any other words the course keeps in JSON (radio talks, quiz
// cards, a glossary), each under the path of the file it came from. Lessons
// keep their diagram callouts (blocks.ts), so the file reads as the text with
// "interactive_diagram parcel goes here" where each drawing sits. Optionally
// it also holds the words the course writes in its code, under "code": a
// figure's labels and commentary, buttons, headings (code-text.ts), so one
// file has all of the course's text.
//
// The same file goes back in two ways:
// - in the repository, `npx didactics-course import course.json` writes each
//   file back to its path, and each edited string of "code" into its source
//   file (bin/didactics-course.mjs; `export` makes one);
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

import { changedCode, codeTextProblems, liveCodeText, withCodeEdits, type CodeText } from './code-text.ts';
import { isLessonShaped, isReferenceShaped, lessonShapeProblems, referenceShapeProblems, type DiagramType } from './blocks.ts';

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
  /** Which part of the course this is, such as one lesson; absent for the whole course. */
  part?: string;
  files: CourseFiles;
  /** The words written in the course's code, by source file: as written → as edited (code-text.ts). */
  code?: CodeText;
}

const HOW_TO =
  'The whole course, one entry in "files" per JSON file of the course, under its path. Edit any words freely. ' +
  'A lesson is a list of "parts", each a list of "blocks" with a "type": "text" (a paragraph), "key_ideas" (a title and points), ' +
  'or a callout for something the course draws, by "id": "interactive_diagram", "diagram" (a still) or "quiz". ' +
  'A callout\'s "caption" and "task" are words to edit; its "id", "goal" and "options" wire it to the code, so keep them unless the code changes too. ' +
  'Blocks can be added, removed and moved. A callout with an id the course has no code for yet shows as a box saying that the diagram goes there, ' +
  '"aspect_ratio" (width / height) wide. Text markup: **bold**, *italic*, [[words|colour]] and [^footnote]. ' +
  '"code", when there is one, has the words written in the course\'s code (labels, commentary, buttons), one table per source file: ' +
  'edit the words on the right of each line and keep the ones on the left, which find the string in the code. ' +
  'Keep every ${...} in a line: it is filled in by the code, and may move within the line.';

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
export function exportCourse(title: string, files: CourseFiles, now = new Date(), code?: CodeText): CourseFile {
  const out: CourseFile = { format: COURSE_FORMAT, version: COURSE_VERSION, title, exported: now.toISOString(), _howTo: HOW_TO, files: structuredClone(sorted(files)) };
  if (code) out.code = structuredClone(sorted(code));
  return out;
}

function sorted<T>(table: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const path of Object.keys(table).sort()) out[path] = table[path];
  return out;
}

/**
 * Reads a course file. `known`, the course's own files, limits it to them:
 * a path the course does not have is a problem, since nothing would read it.
 * `knownCode`, the course's own code table, does the same for "code".
 * Returns the files, and the code strings it changes, only when there are no problems.
 */
export function readCourse(raw: unknown, known?: CourseFiles, knownCode?: CodeText): { files: CourseFiles; code: CodeText; problems: string[] } {
  const f = raw as Partial<CourseFile> | null;
  const none = (problem: string) => ({ files: {}, code: {}, problems: [problem] });
  if (!f || typeof f !== 'object' || f.format !== COURSE_FORMAT) return none('This is not a course file (its "format" is not "didactics-course").');
  if (f.version !== COURSE_VERSION) return none(`This course file is version ${String(f.version)}; this app reads version ${COURSE_VERSION}.`);
  if (!f.files || typeof f.files !== 'object') return none('The course file has no "files".');
  const problems: string[] = codeTextProblems(f.code, knownCode);
  const files: CourseFiles = {};
  for (const [p, json] of Object.entries(f.files)) {
    const path = cleanPath(p);
    if (!path.endsWith('.json') || path.split('/').includes('..')) problems.push(`${p}: not a JSON file inside the course`);
    else if (known && !(path in known)) problems.push(`${p}: the course has no such file`);
    else if (isLessonShaped(json) || (known && isLessonShaped(known[path]))) problems.push(...lessonShapeProblems(json, path));
    else if (isReferenceShaped(json) || (known && isReferenceShaped(known[path]))) problems.push(...referenceShapeProblems(json, path));
    files[path] = json;
  }
  return problems.length ? { files: {}, code: {}, problems } : { files, code: changedCode(f.code), problems };
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
  /** The paths whose words in this browser are edited ones: JSON files, and source files with edited strings. */
  readonly edited: readonly string[];
  /** Whether the course file holds the words in the course's code too. */
  readonly hasCode: boolean;
  /** The course as it reads now, edits and all; with `piece`, only that part of it. */
  file: (piece?: CoursePiece) => Promise<CourseFile>;
  /**
   * Keeps an edited course file's words in this browser, the whole course or
   * a piece of it: what it holds replaces earlier edits of the same files and
   * strings, and other edits stay. Returns what is wrong with it, and keeps
   * nothing then; reload to see it.
   */
  load: (text: string) => Promise<string[]>;
  /** Forgets the edits; reload to see the built-in words again. */
  reset: () => void;
}

/** A part of the course to download on its own, such as one lesson. */
export interface CoursePiece {
  /** As the reader picks it, such as "Lesson 1: Morning fog". */
  label: string;
  /** The JSON files it holds, by path. */
  files: string[];
  /** The source files whose words it holds, by path (code-text.ts). */
  code?: string[];
  /** The downloaded file's name; courseSection makes one from the label when left out. */
  fileName?: string;
}

/** Only the files and code tables of `file` that `piece` names. */
export function pieceOf(file: CourseFile, piece: CoursePiece): CourseFile {
  const pick = <T>(table: Record<string, T>, paths: string[]) => Object.fromEntries(paths.filter((p) => p in table).map((p) => [p, table[p]]));
  const out: CourseFile = { ...file, part: piece.label, files: pick(file.files, piece.files) };
  if (file.code) out.code = pick(file.code, piece.code ?? []);
  return out;
}

export interface CourseEditsOptions {
  /** The localStorage key edits are kept under. */
  key: string;
  title: string;
  files: CourseFiles;
  /**
   * The words in the course's code, so the course file holds them too:
   * `() => import('virtual:didactics/code-text').then((m) => m.default)`,
   * the table the build makes (vite.ts codeTextModule). Left out, the course
   * file has the JSON files only.
   */
  code?: () => CodeText | Promise<CodeText>;
}

/**
 * The course's words as this browser has them: the built-in `files`, with any
 * edits loaded earlier (kept in localStorage under `key`) put in their place
 * now, in place, and edited code strings swapped in as the page shows them
 * (code-text.ts liveCodeText). Call it before anything reads the files.
 */
export function courseEdits(o: CourseEditsOptions): CourseEdits {
  const built = structuredClone(o.files);
  // What this browser keeps: only the files and strings that differ from the built-in ones.
  let keptFiles: CourseFiles = {};
  let keptCode: CodeText = {};
  let edited: string[] = [];
  try {
    const kept = localStorage.getItem(o.key);
    if (kept) {
      const { files, code, problems } = readCourse(JSON.parse(kept), o.files);
      if (problems.length) localStorage.removeItem(o.key);
      else {
        injectCourse(o.files, files);
        keptFiles = files;
        keptCode = code;
        edited = [...Object.keys(files), ...Object.keys(code)];
        if (typeof document !== 'undefined') liveCodeText(code);
      }
    }
  } catch {
    // Storage blocked, or a file that no longer reads: the built-in words stand.
  }
  const codeTable = async () => (o.code ? await o.code() : undefined);
  return {
    get edited() {
      return edited;
    },
    hasCode: !!o.code,
    async file(piece) {
      const code = await codeTable();
      const all = exportCourse(o.title, o.files, new Date(), code && withCodeEdits(code, keptCode));
      return piece ? pieceOf(all, piece) : all;
    },
    async load(text) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (e) {
        return [`That file is not JSON: ${(e as Error).message}`];
      }
      const { files, problems } = readCourse(raw, built, (await codeTable()) ?? {});
      if (problems.length) return problems;
      // What the file holds replaces what was kept for the same files and
      // strings; only what differs from the built-in words is kept, since
      // storage is small.
      const nextFiles = { ...keptFiles };
      for (const [path, json] of Object.entries(files)) {
        if (JSON.stringify(json) !== JSON.stringify(built[path])) nextFiles[path] = json;
        else delete nextFiles[path];
      }
      const nextCode = structuredClone(keptCode);
      for (const [path, strings] of Object.entries((raw as CourseFile).code ?? {})) {
        for (const [written, now] of Object.entries(strings)) {
          if (now !== written) (nextCode[path] ??= {})[written] = now;
          else if (nextCode[path]) delete nextCode[path][written];
        }
        if (nextCode[path] && !Object.keys(nextCode[path]).length) delete nextCode[path];
      }
      const some = Object.keys(nextFiles).length + Object.keys(nextCode).length > 0;
      try {
        if (some) localStorage.setItem(o.key, JSON.stringify(exportCourse(o.title, nextFiles, new Date(), nextCode)));
        else localStorage.removeItem(o.key);
      } catch (e) {
        return [`This browser would not keep it: ${(e as Error).message}`];
      }
      keptFiles = nextFiles;
      keptCode = nextCode;
      edited = [...Object.keys(nextFiles), ...Object.keys(nextCode)];
      return [];
    },
    reset() {
      try {
        localStorage.removeItem(o.key);
      } catch {
        // Nothing kept, then.
      }
      edited = [];
      keptFiles = {};
      keptCode = {};
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
 * A reference file (blocks.ts ReferenceFile) in the earlier shape, with
 * `kind` blocks and "figure" blocks naming a "figure", in the typed shape.
 * `typeOf` says what each figure is; left out, a figure is taken as
 * interactive. Every other kind, the course's own among them, just becomes
 * its type. Files already typed come back as they were.
 */
export function upgradeReference<T>(raw: T, typeOf?: (id: string) => DiagramType | undefined): T {
  if (!isReferenceShaped(raw)) return raw;
  const sections = (raw.sections as { blocks?: Record<string, unknown>[] }[]).map((s) => ({
    ...s,
    blocks: (s.blocks ?? []).map((b) => {
      if (!('kind' in b) || 'type' in b) return b;
      const { kind, ...rest } = b;
      if (kind !== 'figure') return { type: kind, ...rest };
      const { figure, ...more } = rest;
      const id = String(figure);
      const t = typeOf?.(id);
      return { type: t === 'diagram' ? 'diagram' : 'interactive_diagram', id, ...more };
    }),
  }));
  return { ...raw, sections };
}

/**
 * Where a JSON text breaks the lines of one object or array: before its first
 * entry (`open`), between entries (`between`), before its closing bracket
 * (`close`); `flat` when it is all on one line.
 */
export interface JsonLayout {
  open: boolean;
  between: boolean;
  close: boolean;
  flat: boolean;
}

/**
 * JSON text for a course file, laid out like the file it replaces (`like`,
 * its text before), with two-space indents. Each object or array keeps where
 * it broke its lines: one written on one line stays on one line, and one that
 * opened on the line of its parent, such as
 *
 *   { "type": "key_ideas", "title": "The big ideas", "points": [
 *     "First.",
 *     "Second."
 *   ] },
 *
 * comes back that way. So hand-laid blocks keep their layout through an
 * upgrade or an import. Containers are matched by where they sit (parts 0,
 * blocks 3), so what they hold may change. One `like` does not have is laid
 * out flat inside a flat one, and expanded elsewhere; with no `like`, the
 * text is JSON.stringify's layout. Ends with a newline.
 */
export function formatJson(value: unknown, like?: string): string {
  const layouts = like ? jsonLayouts(like) : new Map<string, JsonLayout>();
  const EXPANDED: JsonLayout = { open: true, between: true, close: true, flat: false };
  const FLAT: JsonLayout = { open: false, between: false, close: false, flat: true };
  /** `indent` is the indent of the line the value starts on. */
  const write = (v: unknown, path: (string | number)[], indent: string, inFlat: boolean): string => {
    if (!Array.isArray(v) && !isPlainObject(v)) return JSON.stringify(v) ?? 'null';
    const entries: [string | number, unknown][] = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v).filter(([, x]) => x !== undefined);
    const [l, r] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
    if (!entries.length) return l + r;
    const layout = layouts.get(JSON.stringify(path)) ?? (inFlat ? FLAT : EXPANDED);
    const pad = Array.isArray(v) ? '' : ' ';
    const inner = `${indent}  `;
    let out = l;
    let broken = false;
    entries.forEach(([k, x], i) => {
      const brk = i === 0 ? layout.open : layout.between;
      if (i) out += ',';
      out += brk ? `\n${inner}` : i === 0 ? pad : ' ';
      broken ||= brk;
      if (typeof k === 'string') out += `${JSON.stringify(k)}: `;
      out += write(x, [...path, k], broken ? inner : indent, layout.flat);
    });
    return out + (layout.close ? `\n${indent}` : pad) + r;
  };
  return `${write(value, [], '', false)}\n`;
}

const STRING = /"(?:[^"\\]|\\.)*"/y;
const WORD = /[-+.\w]+/y;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * How a JSON text lays out each non-empty object and array, by JSON-encoded
 * path (`["parts",0,"blocks",3]`). Text that is not JSON gives none.
 */
export function jsonLayouts(text: string): Map<string, JsonLayout> {
  const out = new Map<string, JsonLayout>();
  let at = 0;
  /** Skip spaces; whether they held a line break. */
  const space = (): boolean => {
    const from = at;
    while (at < text.length && ' \t\r\n'.includes(text[at])) at++;
    return text.slice(from, at).includes('\n');
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
      const layout: JsonLayout = { open: space(), between: false, close: false, flat: false };
      const close = c === '{' ? '}' : ']';
      let n = 0;
      while (text[at] !== close) {
        if (n) {
          if (text[at] !== ',') throw new Error('bad list');
          at++;
          if (space()) layout.between = true;
        }
        if (c === '{') {
          const key = string();
          space();
          if (text[at++] !== ':') throw new Error('bad object');
          value([...path, key]);
        } else value([...path, n]);
        n++;
        layout.close = space();
        if (at >= text.length) throw new Error('unclosed');
      }
      at++;
      // With one entry, there is nothing between: a new one goes as the first did.
      if (n === 1) layout.between = layout.open;
      if (n) {
        layout.flat = !text.slice(start, at).includes('\n');
        out.set(JSON.stringify(path), layout);
      }
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
    return new Map();
  }
  return out;
}
