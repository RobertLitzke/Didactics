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
import { lessonShapeProblems, isLessonShaped } from "./blocks.js";
export const COURSE_FORMAT = 'didactics-course';
export const COURSE_VERSION = 1;
const HOW_TO = 'The whole course, one entry in "files" per JSON file of the course, under its path. Edit any words freely. ' +
    'A lesson is a list of "parts", each a list of "blocks" with a "type": "text" (a paragraph), "key_ideas" (a title and points), ' +
    'or a callout for something the course draws, by "id": "interactive_diagram", "diagram" (a still) or "quiz". ' +
    'A callout\'s "caption" and "task" are words to edit; its "id", "goal" and "options" wire it to the code, so keep them unless the code changes too. ' +
    'Blocks can be added, removed and moved. A callout with an id the course has no code for yet shows as a box saying that the diagram goes there, ' +
    '"aspect_ratio" (width / height) wide. Text markup: **bold**, *italic*, [[words|colour]] and [^footnote].';
/**
 * The files from `import.meta.glob('/src/data/**\/*.json', { eager: true, import: 'default' })`
 * (or any map of path to parsed JSON), keyed by path from the repository root.
 */
export function courseFiles(found) {
    const out = {};
    for (const [path, json] of Object.entries(found))
        out[cleanPath(path)] = json;
    return out;
}
const cleanPath = (p) => p.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
/** The course as one file. */
export function exportCourse(title, files, now = new Date()) {
    const sorted = {};
    for (const path of Object.keys(files).sort())
        sorted[path] = files[path];
    return { format: COURSE_FORMAT, version: COURSE_VERSION, title, exported: now.toISOString(), _howTo: HOW_TO, files: structuredClone(sorted) };
}
/**
 * Reads a course file. `known`, the course's own files, limits it to them:
 * a path the course does not have is a problem, since nothing would read it.
 * Returns the files only when there are no problems.
 */
export function readCourse(raw, known) {
    const f = raw;
    if (!f || typeof f !== 'object' || f.format !== COURSE_FORMAT)
        return { files: {}, problems: ['This is not a course file (its "format" is not "didactics-course").'] };
    if (f.version !== COURSE_VERSION)
        return { files: {}, problems: [`This course file is version ${String(f.version)}; this app reads version ${COURSE_VERSION}.`] };
    if (!f.files || typeof f.files !== 'object')
        return { files: {}, problems: ['The course file has no "files".'] };
    const problems = [];
    const files = {};
    for (const [p, json] of Object.entries(f.files)) {
        const path = cleanPath(p);
        if (!path.endsWith('.json') || path.split('/').includes('..'))
            problems.push(`${p}: not a JSON file inside the course`);
        else if (known && !(path in known))
            problems.push(`${p}: the course has no such file`);
        else if (isLessonShaped(json) || (known && isLessonShaped(known[path])))
            problems.push(...lessonShapeProblems(json, path));
        files[path] = json;
    }
    return { files: problems.length ? {} : files, problems };
}
/** Puts each of `files` in place of the one at its path in `into`, keeping the same object. Returns the paths changed. */
export function injectCourse(into, files) {
    const changed = [];
    for (const [path, json] of Object.entries(files)) {
        const target = into[path];
        if (target === undefined || JSON.stringify(target) === JSON.stringify(json))
            continue;
        if (typeof target === 'object' && target !== null && typeof json === 'object' && json !== null && Array.isArray(target) === Array.isArray(json)) {
            if (Array.isArray(target))
                target.splice(0, target.length, ...structuredClone(json));
            else {
                for (const k of Object.keys(target))
                    delete target[k];
                Object.assign(target, structuredClone(json));
            }
        }
        else
            into[path] = structuredClone(json);
        changed.push(path);
    }
    return changed;
}
/**
 * The course's words as this browser has them: the built-in `files`, with any
 * edits loaded earlier (kept in localStorage under `key`) put in their place
 * now, in place. Call it before anything reads the files.
 */
export function courseEdits(o) {
    const built = structuredClone(o.files);
    let edited = [];
    try {
        const kept = localStorage.getItem(o.key);
        if (kept) {
            const { files, problems } = readCourse(JSON.parse(kept), o.files);
            if (problems.length)
                localStorage.removeItem(o.key);
            else
                edited = injectCourse(o.files, files);
        }
    }
    catch {
        // Storage blocked, or a file that no longer reads: the built-in words stand.
    }
    return {
        get edited() {
            return edited;
        },
        file: () => exportCourse(o.title, o.files),
        load(text) {
            let raw;
            try {
                raw = JSON.parse(text);
            }
            catch (e) {
                return [`That file is not JSON: ${e.message}`];
            }
            const { files, problems } = readCourse(raw, built);
            if (problems.length)
                return problems;
            // Keep only what differs from the built-in words: storage is small.
            const changed = {};
            for (const [path, json] of Object.entries(files))
                if (JSON.stringify(json) !== JSON.stringify(built[path]))
                    changed[path] = json;
            try {
                if (Object.keys(changed).length)
                    localStorage.setItem(o.key, JSON.stringify(exportCourse(o.title, changed)));
                else
                    localStorage.removeItem(o.key);
            }
            catch (e) {
                return [`This browser would not keep it: ${e.message}`];
            }
            edited = Object.keys(changed);
            return [];
        },
        reset() {
            try {
                localStorage.removeItem(o.key);
            }
            catch {
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
export function upgradeLesson(raw, typeOf) {
    if (!isLessonShaped(raw))
        return raw;
    const parts = raw.parts.map((p) => ({
        ...p,
        blocks: (p.blocks ?? []).map((b) => {
            if (!('kind' in b) || 'type' in b)
                return b;
            const { kind, figure, ...rest } = b;
            if (kind === 'text')
                return { type: 'text', ...rest };
            if (kind === 'key')
                return { type: 'key_ideas', ...rest };
            const id = String(figure);
            return { type: typeOf?.(id) ?? (rest.task && !rest.goal ? 'quiz' : rest.task ? 'interactive_diagram' : 'diagram'), id, ...rest };
        }),
    }));
    return { ...raw, parts };
}
