// The words a course writes in its code rather than in JSON: a figure's labels
// and running commentary, a page's buttons and headings, the feedback a check
// gives. course.ts carries them in a course file as "code", one table per
// source file, each string under its own text:
//
//   "code": { "src/app/figures/fog.ts": { "clear gap": "clear gap", ... } }
//
// Edit a value and leave its key. A template string is listed as written,
// `${...}` and all ("Dew point ${fmt(d)}"); its edit keeps the same `${...}`
// parts, in any order. A string the code uses twice is listed once and edited
// in both places.
//
// The same table goes back in two ways, as the rest of a course file does:
// - in the repository, `didactics-course import` writes each edited string
//   into its source file (code-scan.ts finds them);
// - in the app, `liveCodeText` puts edited words in place of the built-in
//   ones as they reach the page, so a revision can be read in the running app
//   before it is committed. It matches what the page shows, so it covers text
//   in the page and its SVG drawings, but not words painted on a canvas.
//
// Which strings count as words is a guess (`isProse`): a capitalised word, or
// letters with a space. Ids, class names, CSS, SVG paths and the like are left
// out. This file imports nothing that needs a browser, so the command line can
// use it.
const CSS = /var\(--|\d(px|em|rem|vh|vw)\b|rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b|=>|;\s*[a-z-]+\s*:/i;
const CALL = /^[\w-]+\(/;
const PATH = /^[MmLlCcQqAaZzHhVvSsTt\d.,\s-]+$/;
const PROPERTY = /^[a-z-]+\s*:\s*\S+;?$/;
const LOCATION = /^[#./][\w/-]/;
const FILE = /\.(webp|png|jpe?g|gif|svg|json|html?|css|m?js|tsx?)\b/i;
/** Whether a string reads as words for people, as opposed to an id, a class name, CSS, or a path. */
export function isProse(s) {
    const t = s.trim();
    if (!/\p{L}{2}/u.test(t))
        return false;
    if (CSS.test(t) || CALL.test(t) || PATH.test(t) || PROPERTY.test(t) || LOCATION.test(t) || FILE.test(t))
        return false;
    if (/\s/.test(t))
        return /\p{L}{2}[^\s]*\s+[^\s]*\p{L}|\p{L}{2}.*[.!?:…]$/u.test(t);
    return /^\p{Lu}\p{Ll}/u.test(t);
}
/**
 * A template string as written (no backticks), split into its words and the
 * `${...}` expressions between them: `texts` has one more entry than `exprs`,
 * with escapes such as \n read as the characters they stand for.
 */
export function templateParts(raw) {
    const texts = [];
    const exprs = [];
    let text = '';
    let i = 0;
    while (i < raw.length) {
        const c = raw[i];
        if (c === '\\') {
            const m = /^\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/.exec(raw.slice(i));
            text += unescape(m[1]);
            i += m[0].length;
        }
        else if (c === '$' && raw[i + 1] === '{') {
            const end = exprEnd(raw, i + 2);
            texts.push(text);
            exprs.push(raw.slice(i + 2, end).trim());
            text = '';
            i = end + 1;
        }
        else {
            text += c;
            i++;
        }
    }
    texts.push(text);
    return { texts, exprs };
}
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' };
function unescape(e) {
    if (e.startsWith('u{'))
        return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e.length > 1)
        return String.fromCharCode(parseInt(e.slice(1), 16));
    return ESCAPES[e] ?? e;
}
/** Whether a template's words (not its `${...}` parts, which may hold templates of their own) have a backtick that would end it. */
function bareBacktick(raw) {
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '\\')
            i++;
        else if (raw[i] === '`')
            return true;
        else if (raw[i] === '$' && raw[i + 1] === '{')
            i = exprEnd(raw, i + 2);
    }
    return false;
}
/** Where the `${` expression starting at `from` ends: the index of its closing brace. */
function exprEnd(raw, from) {
    let depth = 0;
    let quote = '';
    for (let i = from; i < raw.length; i++) {
        const c = raw[i];
        if (quote) {
            if (c === '\\')
                i++;
            else if (c === quote)
                quote = '';
        }
        else if (c === '"' || c === "'" || c === '`')
            quote = c;
        else if (c === '{')
            depth++;
        else if (c === '}') {
            if (depth === 0)
                return i;
            depth--;
        }
    }
    return raw.length;
}
/** What is wrong with one edit of a template string: its `${...}` parts must be the same, and a backtick needs a backslash. */
export function templateEditProblems(written, edited) {
    const problems = [];
    if (bareBacktick(edited))
        problems.push('has a backtick without a backslash before it');
    const a = templateParts(written).exprs.sort();
    const b = templateParts(edited).exprs.sort();
    if (a.join('\0') !== b.join('\0'))
        problems.push(`keep the same \${...} parts as before: ${a.map((x) => `\${${x}}`).join(' ') || 'none'}`);
    return problems;
}
/**
 * What is wrong with a course file's "code" table. With `known`, the course's
 * own table, each string must be one the course has.
 */
export function codeTextProblems(raw, known) {
    if (raw === undefined)
        return [];
    if (!isTable(raw))
        return ['"code" should be a table of source files, each a table of strings.'];
    const problems = [];
    for (const [path, strings] of Object.entries(raw)) {
        if (!isTable(strings)) {
            problems.push(`code ${path}: should be a table of strings, each as written → as edited`);
            continue;
        }
        if (known && !(path in known)) {
            problems.push(`code ${path}: the course has no words in such a file`);
            continue;
        }
        for (const [written, edited] of Object.entries(strings)) {
            const at = `code ${path}: "${short(written)}"`;
            if (typeof edited !== 'string')
                problems.push(`${at} should be words in quotes`);
            else if (known && !(written in known[path]))
                problems.push(`${at} is not in that file (change the words on the right, not the ones on the left)`);
            else if (written.includes('${') || edited.includes('${'))
                problems.push(...templateEditProblems(written, edited).map((p) => `${at} ${p}`));
        }
    }
    return problems;
}
/** Only the strings `table` changes. */
export function changedCode(table) {
    const out = {};
    for (const [path, strings] of Object.entries(table ?? {})) {
        for (const [written, edited] of Object.entries(strings))
            if (written !== edited)
                (out[path] ??= {})[written] = edited;
    }
    return out;
}
/** `known` with the edits of `edited` in place. */
export function withCodeEdits(known, edited) {
    const out = structuredClone(known);
    for (const [path, strings] of Object.entries(edited))
        for (const [written, now] of Object.entries(strings))
            if (out[path] && written in out[path])
                out[path][written] = now;
    return out;
}
const isTable = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const short = (s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
const regExpText = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** How to find each edited string in what the page shows, and what to show instead. */
export function codeSwaps(edited) {
    const swaps = [];
    for (const strings of Object.values(edited)) {
        for (const [written, now] of Object.entries(strings)) {
            if (written === now)
                continue;
            const was = templateParts(written);
            const will = templateParts(now);
            const body = was.texts.map(regExpText).join('([\\s\\S]*?)');
            const ends = was.texts[0] !== '' && was.texts[was.texts.length - 1] !== '';
            const inside = ends && was.texts.join('').trim().length >= 12;
            swaps.push({
                find: new RegExp(inside ? body : `^${body}$`, inside ? 'g' : ''),
                make: (groups) => will.texts.reduce((s, t, i) => s + (i ? groups[was.exprs.indexOf(will.exprs[i - 1])] ?? '' : '') + t, ''),
                inside,
            });
        }
    }
    // Longest first, so a sentence is swapped before a word inside it.
    return swaps.sort((a, b) => b.find.source.length - a.find.source.length);
}
/** `text` with every edited string in it swapped, or the same text when none is there. */
export function swapCodeText(text, swaps) {
    let out = text;
    for (const s of swaps) {
        s.find.lastIndex = 0;
        out = out.replace(s.find, (...m) => s.make(m.slice(1, -2)));
        if (!s.inside && out !== text)
            break;
    }
    return out;
}
/**
 * Shows the edits of `edited` in place of the built-in words, in every text
 * the page shows from now on, until the returned function is called. Call it
 * as the app starts, before anything is drawn.
 */
export function liveCodeText(edited, root = document) {
    const swaps = codeSwaps(edited);
    if (!swaps.length || typeof MutationObserver === 'undefined')
        return () => { };
    // What this wrote into each text node, so its own writes are not swapped again.
    const wrote = new WeakMap();
    const fix = (n) => {
        if (n.nodeType === 3) {
            const t = n;
            if (wrote.get(t) === t.data)
                return;
            const next = swapCodeText(t.data, swaps);
            wrote.set(t, next);
            if (next !== t.data)
                t.data = next;
        }
        else
            for (const c of Array.from(n.childNodes))
                fix(c);
    };
    const seen = new MutationObserver((records) => {
        for (const r of records) {
            if (r.type === 'characterData')
                fix(r.target);
            else
                r.addedNodes.forEach(fix);
        }
    });
    seen.observe(root, { subtree: true, childList: true, characterData: true });
    fix(root);
    return () => seen.disconnect();
}
