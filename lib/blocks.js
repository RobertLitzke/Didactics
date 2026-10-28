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
export const DIAGRAM_TYPES = ['interactive_diagram', 'diagram', 'quiz'];
export const BLOCK_TYPES = ['text', 'key_ideas', ...DIAGRAM_TYPES];
/** Whether a block is a callout for a diagram, a figure or a quiz. */
export const isDiagram = (b) => DIAGRAM_TYPES.includes(b.type);
/** Whether a value read from JSON looks like a lesson: an object with `parts`. */
export const isLessonShaped = (v) => typeof v === 'object' && v !== null && Array.isArray(v.parts);
/**
 * What is wrong with a lesson read from JSON, in words, before it goes near
 * the lesson view: parts without blocks, blocks of no known type, or missing
 * the fields their type needs. `where` names it in the messages.
 */
export function lessonShapeProblems(raw, where) {
    if (!isLessonShaped(raw))
        return [`${where}: not a lesson (no "parts" list)`];
    const out = [];
    const str = (v) => typeof v === 'string';
    for (const k of ['id', 'title'])
        if (!str(raw[k]))
            out.push(`${where}: "${k}" should be text`);
    raw.parts.forEach((p, i) => {
        const at = `${where}, part ${i + 1}`;
        const part = p;
        if (!part || !str(part.title))
            out.push(`${at}: "title" should be text`);
        if (!part || !Array.isArray(part.blocks))
            return void out.push(`${at}: "blocks" should be a list`);
        part.blocks.forEach((b, j) => {
            const block = (b ?? {});
            const bat = `${at}, block ${j + 1}`;
            if (!BLOCK_TYPES.includes(block.type)) {
                out.push(`${bat}: "type" should be one of ${BLOCK_TYPES.join(', ')}`);
            }
            else if (block.type === 'text') {
                if (!str(block.text))
                    out.push(`${bat}: a text block needs "text"`);
            }
            else if (block.type === 'key_ideas') {
                if (!str(block.title) || !Array.isArray(block.points) || !block.points.every(str))
                    out.push(`${bat}: key_ideas needs a "title" and a list of "points"`);
            }
            else {
                if (!str(block.id) || !block.id)
                    out.push(`${bat}: a ${block.type} needs an "id"`);
                if (!str(block.caption))
                    out.push(`${bat}: a ${block.type} needs a "caption"`);
                if (block.aspect_ratio !== undefined && !(typeof block.aspect_ratio === 'number' && block.aspect_ratio > 0))
                    out.push(`${bat}: "aspect_ratio" should be a number above 0`);
            }
        });
    });
    return out;
}
export const REF_BLOCK_TYPES = ['text', 'terms', 'table', 'steps', 'interactive_diagram', 'diagram', 'glossary'];
/** Whether a value read from JSON looks like a reference file: an object with `sections`. */
export const isReferenceShaped = (v) => typeof v === 'object' && v !== null && Array.isArray(v.sections);
/**
 * What is wrong with a reference file read from JSON, in words: sections
 * missing their words, blocks with no type, or Didactics' own blocks missing
 * the fields they need. A type Didactics does not know is taken as the
 * course's own; reference.ts referenceProblems checks those against the course.
 */
export function referenceShapeProblems(raw, where) {
    if (!isReferenceShaped(raw))
        return [`${where}: not a reference file (no "sections" list)`];
    const out = [];
    const str = (v) => typeof v === 'string';
    const strs = (v) => Array.isArray(v) && v.every(str);
    raw.sections.forEach((s, i) => {
        const sec = (s ?? {});
        const at = `${where}, section ${str(sec.id) ? `"${sec.id}"` : i + 1}`;
        for (const k of ['id', 'title', 'summary'])
            if (!str(sec[k]))
                out.push(`${at}: "${k}" should be text`);
        if (sec.lesson !== undefined && !str(sec.lesson))
            out.push(`${at}: "lesson" should be a lesson's id`);
        if (!Array.isArray(sec.blocks))
            return void out.push(`${at}: "blocks" should be a list`);
        sec.blocks.forEach((b, j) => {
            const block = (b ?? {});
            const bat = `${at}, block ${j + 1}`;
            if (!str(block.type) || !block.type)
                return void out.push(`${bat}: a block needs a "type"`);
            switch (block.type) {
                case 'text':
                    if (!str(block.text))
                        out.push(`${bat}: a text block needs "text"`);
                    break;
                case 'terms':
                    if (!Array.isArray(block.items) || !block.items.every((t) => t && str(t.term) && str(t.means)))
                        out.push(`${bat}: terms needs "items", each a "term" and what it "means"`);
                    break;
                case 'table':
                    if (!strs(block.columns) || !Array.isArray(block.rows) || !block.rows.every(strs))
                        out.push(`${bat}: a table needs "columns" and "rows", lists of text`);
                    else if (block.rows.some((r) => r.length !== block.columns.length))
                        out.push(`${bat}: every row should have one entry per column`);
                    break;
                case 'steps':
                    if (!strs(block.items))
                        out.push(`${bat}: steps needs "items", a list of text`);
                    break;
                case 'interactive_diagram':
                case 'diagram':
                    if (!str(block.id) || !block.id)
                        out.push(`${bat}: a ${block.type} needs an "id"`);
                    if (!str(block.caption))
                        out.push(`${bat}: a ${block.type} needs a "caption"`);
                    break;
            }
        });
    });
    return out;
}
