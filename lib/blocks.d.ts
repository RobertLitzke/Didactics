/** The kinds of block that stand for something the course draws, looked up by `id`. */
export type DiagramType = 'interactive_diagram' | 'diagram' | 'quiz';
/**
 * A callout for something the course itself draws, by id: a live figure
 * (`interactive_diagram`, made with figure.ts `figure`), a still (`diagram`,
 * a plain factory) or a quiz (`quiz`, made with `quiz` or `check`). An id the
 * course has no code for yet shows as a placeholder box, `aspect_ratio`
 * (width / height) wide, saying the diagram goes there.
 */
export interface DiagramBlock<F extends string = string> {
    type: DiagramType;
    id: F;
    caption: string;
    /** What to do with it; the next part opens once it is done. */
    task?: string;
    /** Tells the figure when its task is done; one of its `goals`. */
    goal?: string;
    /** Handed to the figure as it is built. */
    options?: Record<string, unknown>;
    /** Width over height of the placeholder shown while the id has no code. */
    aspect_ratio?: number;
}
export type Block<F extends string = string> = 
/** A paragraph of the article. */
{
    type: 'text';
    text: string;
}
/** The few ideas to hold on to, as a short list set apart from the article. */
 | {
    type: 'key_ideas';
    title: string;
    points: string[];
} | DiagramBlock<F>;
export type BlockType = Block['type'];
export declare const DIAGRAM_TYPES: readonly DiagramType[];
export declare const BLOCK_TYPES: readonly BlockType[];
/** Whether a block is a callout for a diagram, a figure or a quiz. */
export declare const isDiagram: <F extends string>(b: Block<F>) => b is DiagramBlock<F>;
/** Whether a value read from JSON looks like a lesson: an object with `parts`. */
export declare const isLessonShaped: (v: unknown) => v is {
    id?: unknown;
    parts: unknown[];
};
/**
 * What is wrong with a lesson read from JSON, in words, before it goes near
 * the lesson view: parts without blocks, blocks of no known type, or missing
 * the fields their type needs. `where` names it in the messages.
 */
export declare function lessonShapeProblems(raw: unknown, where: string): string[];
/** The reference blocks Didactics draws. */
export type RefBlock<F extends string = string> = 
/** A paragraph, with the same markup as lesson text. */
{
    type: 'text';
    text: string;
}
/** Terms and what they mean. */
 | {
    type: 'terms';
    items: {
        term: string;
        means: string;
    }[];
}
/** A table; the first column is the row's name. */
 | {
    type: 'table';
    columns: string[];
    rows: string[][];
}
/** Numbered steps. */
 | {
    type: 'steps';
    items: string[];
}
/** A course figure by id, live, with no task; a placeholder while the id has no code. */
 | {
    type: 'interactive_diagram' | 'diagram';
    id: F;
    caption: string;
    options?: Record<string, unknown>;
    aspect_ratio?: number;
}
/** The glossary (glossary.ts), with its search box. */
 | {
    type: 'glossary';
};
/** A block type of the course's own, such as a table of schematic symbols; the course draws it. */
export interface CourseBlock {
    type: string;
    [field: string]: unknown;
}
export interface RefSection<B extends {
    type: string;
} = RefBlock> {
    id: string;
    title: string;
    /** One line under the title, and the line in the contents. */
    summary: string;
    /** The lesson it comes from, by id. */
    lesson?: string;
    /** Empty while its lesson is not written: it shows as coming. */
    blocks: B[];
}
export interface ReferenceFile<B extends {
    type: string;
} = RefBlock> {
    sections: RefSection<B>[];
}
export declare const REF_BLOCK_TYPES: readonly RefBlock['type'][];
/** Whether a value read from JSON looks like a reference file: an object with `sections`. */
export declare const isReferenceShaped: (v: unknown) => v is {
    sections: unknown[];
};
/**
 * What is wrong with a reference file read from JSON, in words: sections
 * missing their words, blocks with no type, or Didactics' own blocks missing
 * the fields they need. A type Didactics does not know is taken as the
 * course's own; reference.ts referenceProblems checks those against the course.
 */
export declare function referenceShapeProblems(raw: unknown, where: string): string[];
