import { type DiagramType } from './blocks.ts';
export declare const COURSE_FORMAT = "didactics-course";
export declare const COURSE_VERSION = 1;
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
/**
 * The files from `import.meta.glob('/src/data/**\/*.json', { eager: true, import: 'default' })`
 * (or any map of path to parsed JSON), keyed by path from the repository root.
 */
export declare function courseFiles(found: Record<string, unknown>): CourseFiles;
/** The course as one file. */
export declare function exportCourse(title: string, files: CourseFiles, now?: Date): CourseFile;
/**
 * Reads a course file. `known`, the course's own files, limits it to them:
 * a path the course does not have is a problem, since nothing would read it.
 * Returns the files only when there are no problems.
 */
export declare function readCourse(raw: unknown, known?: CourseFiles): {
    files: CourseFiles;
    problems: string[];
};
/** Puts each of `files` in place of the one at its path in `into`, keeping the same object. Returns the paths changed. */
export declare function injectCourse(into: CourseFiles, files: CourseFiles): string[];
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
export declare function courseEdits(o: {
    key: string;
    title: string;
    files: CourseFiles;
}): CourseEdits;
/**
 * A lesson in the earlier JSON shape, with `kind` blocks ("text", "key",
 * "figure" with a "figure" name), in the typed shape of blocks.ts. `typeOf`
 * says what each figure is (lesson.ts diagramType); left out, or for an id it
 * does not know, a figure with a task is taken as interactive and one
 * without as a still. Files already typed come back as they were.
 */
export declare function upgradeLesson<T>(raw: T, typeOf?: (id: string) => DiagramType | undefined): T;
/**
 * A reference file (blocks.ts ReferenceFile) in the earlier shape, with
 * `kind` blocks and "figure" blocks naming a "figure", in the typed shape.
 * `typeOf` says what each figure is; left out, a figure is taken as
 * interactive. Every other kind, the course's own among them, just becomes
 * its type. Files already typed come back as they were.
 */
export declare function upgradeReference<T>(raw: T, typeOf?: (id: string) => DiagramType | undefined): T;
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
export declare function formatJson(value: unknown, like?: string): string;
/**
 * How a JSON text lays out each non-empty object and array, by JSON-encoded
 * path (`["parts",0,"blocks",3]`). Text that is not JSON gives none.
 */
export declare function jsonLayouts(text: string): Map<string, JsonLayout>;
