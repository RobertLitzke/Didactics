import { type CodeText } from './code-text.ts';
/** One string in a source file: its words as code-text.ts lists them, and where it is written. */
export interface CodeString {
    /** A plain string's words; a template's text as written, without its backticks. */
    text: string;
    /** Where the string starts and ends in the file, quotes included. */
    start: number;
    end: number;
    quote: '"' | "'" | '`';
}
/** Every string and template in a source file that reads as words, outermost first. */
export declare function scanCode(path: string, source: string): CodeString[];
/** The words in each of `sources` (path → its text), as a code table with every string unedited. */
export declare function codeTable(sources: Record<string, string>): CodeText;
/**
 * The source files under each of `dirs`, by path from `root` with forward
 * slashes, leaving out declarations and tests.
 */
export declare function readSources(root: string, dirs: string[]): Record<string, string>;
/**
 * `source` with each string `edits` changes (as written → as edited) written
 * anew. A string inside another one that is also edited is left as the outer
 * edit has it. Returns the problems instead, and the source unchanged, when an
 * edit is not in the file or would break it.
 */
export declare function rewriteCode(path: string, source: string, edits: Record<string, string>): {
    source: string;
    problems: string[];
};
