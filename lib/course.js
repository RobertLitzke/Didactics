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
import { changedCode, codeTextProblems, liveCodeText, withCodeEdits } from "./code-text.js";
import { isLessonShaped, isReferenceShaped, lessonShapeProblems, referenceShapeProblems } from "./blocks.js";
export const COURSE_FORMAT = 'didactics-course';
export const COURSE_VERSION = 1;
const HOW_TO = 'The whole course, one entry in "files" per JSON file of the course, under its path. Edit any words freely. ' +
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
export function courseFiles(found) {
    const out = {};
    for (const [path, json] of Object.entries(found))
        out[cleanPath(path)] = json;
    return out;
}
const cleanPath = (p) => p.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
/** The course as one file. */
export function exportCourse(title, files, now = new Date(), code) {
    const out = { format: COURSE_FORMAT, version: COURSE_VERSION, title, exported: now.toISOString(), _howTo: HOW_TO, files: structuredClone(sorted(files)) };
    if (code)
        out.code = structuredClone(sorted(code));
    return out;
}
function sorted(table) {
    const out = {};
    for (const path of Object.keys(table).sort())
        out[path] = table[path];
    return out;
}
/**
 * Reads a course file. `known`, the course's own files, limits it to them:
 * a path the course does not have is a problem, since nothing would read it.
 * `knownCode`, the course's own code table, does the same for "code".
 * Returns the files, and the code strings it changes, only when there are no problems.
 */
export function readCourse(raw, known, knownCode) {
    const f = raw;
    const none = (problem) => ({ files: {}, code: {}, problems: [problem] });
    if (!f || typeof f !== 'object' || f.format !== COURSE_FORMAT)
        return none('This is not a course file (its "format" is not "didactics-course").');
    if (f.version !== COURSE_VERSION)
        return none(`This course file is version ${String(f.version)}; this app reads version ${COURSE_VERSION}.`);
    if (!f.files || typeof f.files !== 'object')
        return none('The course file has no "files".');
    const problems = codeTextProblems(f.code, knownCode);
    const files = {};
    for (const [p, json] of Object.entries(f.files)) {
        const path = cleanPath(p);
        if (!path.endsWith('.json') || path.split('/').includes('..'))
            problems.push(`${p}: not a JSON file inside the course`);
        else if (known && !(path in known))
            problems.push(`${p}: the course has no such file`);
        else if (isLessonShaped(json) || (known && isLessonShaped(known[path])))
            problems.push(...lessonShapeProblems(json, path));
        else if (isReferenceShaped(json) || (known && isReferenceShaped(known[path])))
            problems.push(...referenceShapeProblems(json, path));
        files[path] = json;
    }
    return problems.length ? { files: {}, code: {}, problems } : { files, code: changedCode(f.code), problems };
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
 * now, in place, and edited code strings swapped in as the page shows them
 * (code-text.ts liveCodeText). Call it before anything reads the files.
 */
export function courseEdits(o) {
    const built = structuredClone(o.files);
    let edited = [];
    let keptCode = {};
    try {
        const kept = localStorage.getItem(o.key);
        if (kept) {
            const { files, code, problems } = readCourse(JSON.parse(kept), o.files);
            if (problems.length)
                localStorage.removeItem(o.key);
            else {
                edited = [...injectCourse(o.files, files), ...Object.keys(code)];
                keptCode = code;
                if (typeof document !== 'undefined')
                    liveCodeText(code);
            }
        }
    }
    catch {
        // Storage blocked, or a file that no longer reads: the built-in words stand.
    }
    const codeTable = async () => (o.code ? await o.code() : undefined);
    return {
        get edited() {
            return edited;
        },
        hasCode: !!o.code,
        async file() {
            const code = await codeTable();
            return exportCourse(o.title, o.files, new Date(), code && withCodeEdits(code, keptCode));
        },
        async load(text) {
            let raw;
            try {
                raw = JSON.parse(text);
            }
            catch (e) {
                return [`That file is not JSON: ${e.message}`];
            }
            const { files, code, problems } = readCourse(raw, built, (await codeTable()) ?? {});
            if (problems.length)
                return problems;
            // Keep only what differs from the built-in words: storage is small.
            const changed = {};
            for (const [path, json] of Object.entries(files))
                if (JSON.stringify(json) !== JSON.stringify(built[path]))
                    changed[path] = json;
            const some = Object.keys(changed).length + Object.keys(code).length > 0;
            try {
                if (some)
                    localStorage.setItem(o.key, JSON.stringify(exportCourse(o.title, changed, new Date(), code)));
                else
                    localStorage.removeItem(o.key);
            }
            catch (e) {
                return [`This browser would not keep it: ${e.message}`];
            }
            edited = [...Object.keys(changed), ...Object.keys(code)];
            keptCode = code;
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
/**
 * A reference file (blocks.ts ReferenceFile) in the earlier shape, with
 * `kind` blocks and "figure" blocks naming a "figure", in the typed shape.
 * `typeOf` says what each figure is; left out, a figure is taken as
 * interactive. Every other kind, the course's own among them, just becomes
 * its type. Files already typed come back as they were.
 */
export function upgradeReference(raw, typeOf) {
    if (!isReferenceShaped(raw))
        return raw;
    const sections = raw.sections.map((s) => ({
        ...s,
        blocks: (s.blocks ?? []).map((b) => {
            if (!('kind' in b) || 'type' in b)
                return b;
            const { kind, ...rest } = b;
            if (kind !== 'figure')
                return { type: kind, ...rest };
            const { figure, ...more } = rest;
            const id = String(figure);
            const t = typeOf?.(id);
            return { type: t === 'diagram' ? 'diagram' : 'interactive_diagram', id, ...more };
        }),
    }));
    return { ...raw, sections };
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
export function formatJson(value, like) {
    const layouts = like ? jsonLayouts(like) : new Map();
    const EXPANDED = { open: true, between: true, close: true, flat: false };
    const FLAT = { open: false, between: false, close: false, flat: true };
    /** `indent` is the indent of the line the value starts on. */
    const write = (v, path, indent, inFlat) => {
        if (!Array.isArray(v) && !isPlainObject(v))
            return JSON.stringify(v) ?? 'null';
        const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v).filter(([, x]) => x !== undefined);
        const [l, r] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
        if (!entries.length)
            return l + r;
        const layout = layouts.get(JSON.stringify(path)) ?? (inFlat ? FLAT : EXPANDED);
        const pad = Array.isArray(v) ? '' : ' ';
        const inner = `${indent}  `;
        let out = l;
        let broken = false;
        entries.forEach(([k, x], i) => {
            const brk = i === 0 ? layout.open : layout.between;
            if (i)
                out += ',';
            out += brk ? `\n${inner}` : i === 0 ? pad : ' ';
            broken ||= brk;
            if (typeof k === 'string')
                out += `${JSON.stringify(k)}: `;
            out += write(x, [...path, k], broken ? inner : indent, layout.flat);
        });
        return out + (layout.close ? `\n${indent}` : pad) + r;
    };
    return `${write(value, [], '', false)}\n`;
}
const STRING = /"(?:[^"\\]|\\.)*"/y;
const WORD = /[-+.\w]+/y;
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/**
 * How a JSON text lays out each non-empty object and array, by JSON-encoded
 * path (`["parts",0,"blocks",3]`). Text that is not JSON gives none.
 */
export function jsonLayouts(text) {
    const out = new Map();
    let at = 0;
    /** Skip spaces; whether they held a line break. */
    const space = () => {
        const from = at;
        while (at < text.length && ' \t\r\n'.includes(text[at]))
            at++;
        return text.slice(from, at).includes('\n');
    };
    const string = () => {
        STRING.lastIndex = at;
        const m = STRING.exec(text);
        if (!m)
            throw new Error('bad string');
        at = STRING.lastIndex;
        return JSON.parse(m[0]);
    };
    const value = (path) => {
        space();
        const start = at;
        const c = text[at];
        if (c === '{' || c === '[') {
            at++;
            const layout = { open: space(), between: false, close: false, flat: false };
            const close = c === '{' ? '}' : ']';
            let n = 0;
            while (text[at] !== close) {
                if (n) {
                    if (text[at] !== ',')
                        throw new Error('bad list');
                    at++;
                    if (space())
                        layout.between = true;
                }
                if (c === '{') {
                    const key = string();
                    space();
                    if (text[at++] !== ':')
                        throw new Error('bad object');
                    value([...path, key]);
                }
                else
                    value([...path, n]);
                n++;
                layout.close = space();
                if (at >= text.length)
                    throw new Error('unclosed');
            }
            at++;
            // With one entry, there is nothing between: a new one goes as the first did.
            if (n === 1)
                layout.between = layout.open;
            if (n) {
                layout.flat = !text.slice(start, at).includes('\n');
                out.set(JSON.stringify(path), layout);
            }
        }
        else if (c === '"')
            string();
        else {
            WORD.lastIndex = at;
            if (!WORD.exec(text))
                throw new Error('bad value');
            at = WORD.lastIndex;
        }
    };
    try {
        value([]);
    }
    catch {
        return new Map();
    }
    return out;
}
