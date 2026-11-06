---
name: new-lesson
description: Write a new lesson (or rework one) for a course on Rob's courses site, from the lesson guide through tests, the student read-through, the Gemini queue and the status table.
---

# Writing a lesson

Lessons live in the Courses repo (`courses/<course>/`), built on Didactics.
Geology, Astronomy, Botany, Ecology, Fungi, Finance and Synthesizers share one
layout; Clouds is older (`src/data/shifts/`, `src/app/figures/`), so look
before assuming paths there.

## 1. Read first

- **The lesson guide**, fresh, with the Claude Docs tools:
  https://claude.ai/artifact/9Y8iYVPYjPyk315cFAR8CP (doc id
  4521ebe4-f5e7-4269-abbd-73fa40b15b60). It holds the audience, the course's
  voice, the prose rules and the pipeline; it wins over this skill. If no
  Claude Docs tools are available, say so; don't write from memory.
- The course's outline (project files, `/mnt/project-files/<course>/`), its
  entry in `src/lessons.ts` (a `coming(...)` line gives id, n, title,
  teaches), and the lessons on either side of it, so terms are not defined
  twice and the voice matches.

## 2. Write the JSON

`courses/<course>/src/lessons/<id>.json`, in Didactics' lesson format
(README, "A lesson, as JSON"): `id`, `n`, `title`, `teaches`, `parts`,
`summary`, `footnotes`; a branch lesson adds `branch` and `needs`.

- Block types: `text`, `key_ideas`, `interactive_diagram`, `diagram`, `quiz`.
  A figure block names its code by `id`; an id with no code yet shows as a
  dashed placeholder, so write the prose first and the figures after.
- Markup: `**bold**`, `*italic*`, `[[words|colourKey]]` (palette colour),
  `[[term]]` or `[[words|@entry-id]]` (encyclopedia), `[^id]` (footnote).
- Footnotes: `"footnotes": { "<id>": { "kind": "technical" | "digression",
  "title": "…", "text": "…" } }`, about four to six a lesson.
- Last part: the check, `{ "type": "quiz", "id": "check", … "options":
  { "items": [{ "ask", "choices", "answer", "why" }] } }`. Every answer
  becomes a review card: questions must stand alone, wrong choices as long
  and plausible as the right one.
- `summary`: 5 to 10 points, each `"**Bold lead.** One sentence."`.
- No template: about six parts on average, boxes only where they fit.
- Remove the lesson's `coming(...)` line from `lessons.ts` (a written JSON
  file with the same id replaces it).
- New encyclopedia entries go in `encyclopedia/<course>.json` and on
  `tools/encyclopedia-review-queue.json`.

## 3. Figures and photos

Use the `new-figure` skill for each figure block, and `pick-images` for
photos. A lesson may ship with photos parked in `tools/pending-photos.json`.

## 4. Test

```sh
npm test -w <course>            # content test: blocks, goals, summary length, links
(cd courses/<course> && npx tsc --noEmit)
npm run dev -w <course>         # look at the lesson at phone width
```

## 5. The pipeline (record each step)

1. **Student read-through**: dump the lesson text and a one-line description
   of each figure to markdown; give it to a Haiku subagent playing a curious
   student of the course's audience, who quotes every line that confused
   them. Revise; one to three rounds with a fresh student.
2. **Gemini queue**: append `{ "lesson": "<id>", "added": "YYYY-MM-DD",
   "what": "…", "notes"?: "…" }` to `courses/<course>/tools/review-queue.json`.
   Rob runs the queue; never ask for his OpenRouter key.
3. Fact check and photos follow later, as the guide says.
4. Update `tools/lesson-status.json` if needed (read its `$comment`), run
   `npm run status`, and commit `docs/status.md` and `docs/status.html` with
   the lesson. Push to `main` (it deploys).
5. A sizeable batch (several lessons, a branch) may earn
   `npm run release -- <course> "What changed"`; see the Courses CLAUDE.md.
