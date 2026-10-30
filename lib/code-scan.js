// Finds the words in a course's source files and writes edited ones back
// (code-text.ts has the format). It reads the code with TypeScript's own
// parser, so a string inside a comment or a regular expression is never taken
// for words, and runs only in Node: from the Vite build (vite.ts codeTextModule)
// and the command line (bin/didactics-course.mjs). The course's own
// `typescript` package does the parsing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { isProse, templateEditProblems, templateParts } from "./code-text.js";
/** Whether a string is a name the code reads rather than words it shows: a module, a key, a type. */
function isName(node) {
    const p = node.parent;
    if (!p)
        return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p))
        return true;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p)) && p.name === node)
        return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node)
        return true;
    if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword)
        return true;
    if (ts.isModuleDeclaration(p))
        return true;
    return false;
}
/** Every string and template in a source file that reads as words, outermost first. */
export function scanCode(path, source) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const out = [];
    const visit = (node) => {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && !isName(node)) {
            const start = node.getStart(file);
            const end = node.getEnd();
            const quote = source[start];
            const text = quote === '`' ? source.slice(start + 1, end - 1) : node.text;
            const words = quote === '`' ? templateParts(text).texts.join(' ') : text;
            if (isProse(words) && !ts.isTaggedTemplateExpression(node.parent))
                out.push({ text, start, end, quote });
        }
        node.forEachChild(visit);
    };
    visit(file);
    return out;
}
/** The words in each of `sources` (path → its text), as a code table with every string unedited. */
export function codeTable(sources) {
    const out = {};
    for (const path of Object.keys(sources).sort()) {
        const strings = scanCode(path, sources[path]);
        if (!strings.length)
            continue;
        out[path] = {};
        for (const s of strings)
            out[path][s.text] = s.text;
    }
    return out;
}
const SOURCE = /\.(ts|tsx|js|mjs)$/;
const SKIP = /\.(d|test|spec)\.\w+$/;
/**
 * The source files under each of `dirs`, by path from `root` with forward
 * slashes, leaving out declarations and tests.
 */
export function readSources(root, dirs) {
    const out = {};
    const walk = (p) => {
        if (statSync(p).isDirectory()) {
            for (const f of readdirSync(p).sort())
                if (f !== 'node_modules' && !f.startsWith('.'))
                    walk(resolve(p, f));
        }
        else if (SOURCE.test(p) && !SKIP.test(p))
            out[relative(root, p).split(sep).join('/')] = readFileSync(p, 'utf8');
    };
    for (const d of dirs)
        walk(resolve(root, d));
    return out;
}
/** A plain string's words written as code, in the quotes it had. */
function quoted(text, quote) {
    const body = JSON.stringify(text).slice(1, -1);
    return quote === '"' ? `"${body}"` : `'${body.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}
/**
 * `source` with each string `edits` changes (as written → as edited) written
 * anew. A string inside another one that is also edited is left as the outer
 * edit has it. Returns the problems instead, and the source unchanged, when an
 * edit is not in the file or would break it.
 */
export function rewriteCode(path, source, edits) {
    const strings = scanCode(path, source);
    const problems = [];
    const found = new Set(strings.map((s) => s.text));
    for (const [written, edited] of Object.entries(edits)) {
        if (written === edited)
            continue;
        if (!found.has(written))
            problems.push(`${path}: "${written.slice(0, 60)}" is no longer in the file`);
        else if (strings.some((s) => s.text === written && s.quote === '`'))
            problems.push(...templateEditProblems(written, edited).map((p) => `${path}: "${written.slice(0, 60)}" ${p}`));
    }
    if (problems.length)
        return { source, problems };
    let out = '';
    let at = 0;
    for (const s of strings) {
        const edited = edits[s.text];
        if (edited === undefined || edited === s.text || s.start < at)
            continue;
        out += source.slice(at, s.start) + (s.quote === '`' ? `\`${edited}\`` : quoted(edited, s.quote));
        at = s.end;
    }
    return { source: out + source.slice(at), problems: [] };
}
