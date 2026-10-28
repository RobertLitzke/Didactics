// The blocks a lesson is made of, as its JSON file writes them. Text and key
// ideas are words; every other block is a callout for something the course
// draws, named by id, which the course maps to its own code:
//
//   { "type": "text", "text": "Air cools as it rises." }
//   { "type": "key_ideas", "title": "Hold on to", "points": ["…"] }
//   { "type": "interactive_diagram", "id": "parcel", "caption": "A rising parcel",
//     "task": "Lift it to cloud base", "goal": "base", "aspect_ratio": 1.66 }
//   { "type": "diagram", "id": "edges", "caption": "Sharp and soft edges" }
//   { "type": "quiz", "id": "check", "caption": "Five skies", "task": "Answer them" }
//
// This file has no imports, so the course tools (course.ts, and the command
// line in bin/) can use it outside a browser.

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
  | { type: 'text'; text: string }
  /** The few ideas to hold on to, as a short list set apart from the article. */
  | { type: 'key_ideas'; title: string; points: string[] }
  | DiagramBlock<F>;

export type BlockType = Block['type'];

export const DIAGRAM_TYPES: readonly DiagramType[] = ['interactive_diagram', 'diagram', 'quiz'];
export const BLOCK_TYPES: readonly BlockType[] = ['text', 'key_ideas', ...DIAGRAM_TYPES];

/** Whether a block is a callout for a diagram, a figure or a quiz. */
export const isDiagram = <F extends string>(b: Block<F>): b is DiagramBlock<F> => (DIAGRAM_TYPES as readonly string[]).includes(b.type);

/** Whether a value read from JSON looks like a lesson: an object with `parts`. */
export const isLessonShaped = (v: unknown): v is { id?: unknown; parts: unknown[] } =>
  typeof v === 'object' && v !== null && Array.isArray((v as { parts?: unknown }).parts);

/**
 * What is wrong with a lesson read from JSON, in words, before it goes near
 * the lesson view: parts without blocks, blocks of no known type, or missing
 * the fields their type needs. `where` names it in the messages.
 */
export function lessonShapeProblems(raw: unknown, where: string): string[] {
  if (!isLessonShaped(raw)) return [`${where}: not a lesson (no "parts" list)`];
  const out: string[] = [];
  const str = (v: unknown) => typeof v === 'string';
  for (const k of ['id', 'title'] as const) if (!str((raw as Record<string, unknown>)[k])) out.push(`${where}: "${k}" should be text`);
  raw.parts.forEach((p, i) => {
    const at = `${where}, part ${i + 1}`;
    const part = p as { title?: unknown; blocks?: unknown };
    if (!part || !str(part.title)) out.push(`${at}: "title" should be text`);
    if (!part || !Array.isArray(part.blocks)) return void out.push(`${at}: "blocks" should be a list`);
    part.blocks.forEach((b, j) => {
      const block = (b ?? {}) as Record<string, unknown>;
      const bat = `${at}, block ${j + 1}`;
      if (!(BLOCK_TYPES as readonly unknown[]).includes(block.type)) {
        out.push(`${bat}: "type" should be one of ${BLOCK_TYPES.join(', ')}`);
      } else if (block.type === 'text') {
        if (!str(block.text)) out.push(`${bat}: a text block needs "text"`);
      } else if (block.type === 'key_ideas') {
        if (!str(block.title) || !Array.isArray(block.points) || !block.points.every(str)) out.push(`${bat}: key_ideas needs a "title" and a list of "points"`);
      } else {
        if (!str(block.id) || !block.id) out.push(`${bat}: a ${block.type} needs an "id"`);
        if (!str(block.caption)) out.push(`${bat}: a ${block.type} needs a "caption"`);
        if (block.aspect_ratio !== undefined && !(typeof block.aspect_ratio === 'number' && block.aspect_ratio > 0)) out.push(`${bat}: "aspect_ratio" should be a number above 0`);
      }
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The reference page's file (reference.ts shows it): sections to look things
// up in, each tied to the lesson it comes from, made of blocks typed like a
// lesson's. A course can add block types of its own, which it draws itself:
//
//   { "sections": [{ "id": "ohms-law", "title": "Ohm's law", "summary": "V, I and R",
//       "lesson": "what-flows", "blocks": [
//         { "type": "table", "columns": ["To find", "Formula"], "rows": [["Voltage", "V = I × R"]] },
//         { "type": "interactive_diagram", "id": "loop", "caption": "Tap a wire to probe it." } ] }] }

/** The reference blocks Didactics draws. */
export type RefBlock<F extends string = string> =
  /** A paragraph, with the same markup as lesson text. */
  | { type: 'text'; text: string }
  /** Terms and what they mean. */
  | { type: 'terms'; items: { term: string; means: string }[] }
  /** A table; the first column is the row's name. */
  | { type: 'table'; columns: string[]; rows: string[][] }
  /** Numbered steps. */
  | { type: 'steps'; items: string[] }
  /** A course figure by id, live, with no task; a placeholder while the id has no code. */
  | { type: 'interactive_diagram' | 'diagram'; id: F; caption: string; options?: Record<string, unknown>; aspect_ratio?: number }
  /** The glossary (glossary.ts), with its search box. */
  | { type: 'glossary' };

/** A block type of the course's own, such as a table of schematic symbols; the course draws it. */
export interface CourseBlock {
  type: string;
  [field: string]: unknown;
}

export interface RefSection<B extends { type: string } = RefBlock> {
  id: string;
  title: string;
  /** One line under the title, and the line in the contents. */
  summary: string;
  /** The lesson it comes from, by id. */
  lesson?: string;
  /** Empty while its lesson is not written: it shows as coming. */
  blocks: B[];
}

export interface ReferenceFile<B extends { type: string } = RefBlock> {
  sections: RefSection<B>[];
}

export const REF_BLOCK_TYPES: readonly RefBlock['type'][] = ['text', 'terms', 'table', 'steps', 'interactive_diagram', 'diagram', 'glossary'];

/** Whether a value read from JSON looks like a reference file: an object with `sections`. */
export const isReferenceShaped = (v: unknown): v is { sections: unknown[] } =>
  typeof v === 'object' && v !== null && Array.isArray((v as { sections?: unknown }).sections);

/**
 * What is wrong with a reference file read from JSON, in words: sections
 * missing their words, blocks with no type, or Didactics' own blocks missing
 * the fields they need. A type Didactics does not know is taken as the
 * course's own; reference.ts referenceProblems checks those against the course.
 */
export function referenceShapeProblems(raw: unknown, where: string): string[] {
  if (!isReferenceShaped(raw)) return [`${where}: not a reference file (no "sections" list)`];
  const out: string[] = [];
  const str = (v: unknown) => typeof v === 'string';
  const strs = (v: unknown) => Array.isArray(v) && v.every(str);
  raw.sections.forEach((s, i) => {
    const sec = (s ?? {}) as Record<string, unknown>;
    const at = `${where}, section ${str(sec.id) ? `"${sec.id as string}"` : i + 1}`;
    for (const k of ['id', 'title', 'summary'] as const) if (!str(sec[k])) out.push(`${at}: "${k}" should be text`);
    if (sec.lesson !== undefined && !str(sec.lesson)) out.push(`${at}: "lesson" should be a lesson's id`);
    if (!Array.isArray(sec.blocks)) return void out.push(`${at}: "blocks" should be a list`);
    sec.blocks.forEach((b, j) => {
      const block = (b ?? {}) as Record<string, unknown>;
      const bat = `${at}, block ${j + 1}`;
      if (!str(block.type) || !block.type) return void out.push(`${bat}: a block needs a "type"`);
      switch (block.type) {
        case 'text':
          if (!str(block.text)) out.push(`${bat}: a text block needs "text"`);
          break;
        case 'terms':
          if (!Array.isArray(block.items) || !block.items.every((t) => t && str(t.term) && str(t.means))) out.push(`${bat}: terms needs "items", each a "term" and what it "means"`);
          break;
        case 'table':
          if (!strs(block.columns) || !Array.isArray(block.rows) || !block.rows.every(strs)) out.push(`${bat}: a table needs "columns" and "rows", lists of text`);
          else if (block.rows.some((r) => (r as string[]).length !== (block.columns as string[]).length)) out.push(`${bat}: every row should have one entry per column`);
          break;
        case 'steps':
          if (!strs(block.items)) out.push(`${bat}: steps needs "items", a list of text`);
          break;
        case 'interactive_diagram':
        case 'diagram':
          if (!str(block.id) || !block.id) out.push(`${bat}: a ${block.type} needs an "id"`);
          if (!str(block.caption)) out.push(`${bat}: a ${block.type} needs a "caption"`);
          break;
      }
    });
  });
  return out;
}
