/** Each source file's strings, by path from the repository root, as written → as edited. */
export type CodeText = Record<string, Record<string, string>>;
/** Whether a string reads as words for people, as opposed to an id, a class name, CSS, or a path. */
export declare function isProse(s: string): boolean;
/**
 * A template string as written (no backticks), split into its words and the
 * `${...}` expressions between them: `texts` has one more entry than `exprs`,
 * with escapes such as \n read as the characters they stand for.
 */
export declare function templateParts(raw: string): {
    texts: string[];
    exprs: string[];
};
/** What is wrong with one edit of a template string: its `${...}` parts must be the same, and a backtick needs a backslash. */
export declare function templateEditProblems(written: string, edited: string): string[];
/**
 * What is wrong with a course file's "code" table. With `known`, the course's
 * own table, each string must be one the course has.
 */
export declare function codeTextProblems(raw: unknown, known?: CodeText): string[];
/** Only the strings `table` changes. */
export declare function changedCode(table: CodeText | undefined): CodeText;
/** `known` with the edits of `edited` in place. */
export declare function withCodeEdits(known: CodeText, edited: CodeText): CodeText;
/** One edited string as the page will show it. */
interface Swap {
    /** Matches the built-in words; groups hold what the `${...}` parts showed. */
    find: RegExp;
    /** The edited words, given what the `${...}` parts showed. */
    make: (groups: string[]) => string;
    /** Short or open-ended strings must be the whole of a text; others are also looked for inside longer ones. */
    inside: boolean;
}
/** How to find each edited string in what the page shows, and what to show instead. */
export declare function codeSwaps(edited: CodeText): Swap[];
/** `text` with every edited string in it swapped, or the same text when none is there. */
export declare function swapCodeText(text: string, swaps: Swap[]): string;
/**
 * Shows the edits of `edited` in place of the built-in words, in every text
 * the page shows from now on, until the returned function is called. Call it
 * as the app starts, before anything is drawn.
 */
export declare function liveCodeText(edited: CodeText, root?: Node): () => void;
export {};
