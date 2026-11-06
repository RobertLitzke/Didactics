---
name: new-figure
description: Add a figure to a course lesson on Rob's courses site: a live figure, a still, a JSON chart or map, a guess-first figure or the check, with the Didactics figure API and the course's tests.
---

# Adding a figure

A lesson block names a figure by `id`; the course maps the id to code. Read
the "Figures" section of the lesson guide
(https://claude.ai/artifact/9Y8iYVPYjPyk315cFAR8CP) and Didactics' README
("A palette and the figure kit", "A figure", "Charts from JSON", "Maps of
real places", "Tests") before writing one.

## 1. Choose the kind

Ask what the reader should see change. In order of preference:

1. **No code at all**: a chart from the block's JSON (`didactics/charts`:
   timeline, tree, scale, plate) or a relief map (`didactics/maps`), or a
   photo (`"id": "photo"`, see `pick-images`).
2. **A still** (`diagram` block): the text describes something the reader
   can't see. A plain factory returning `{ node }`, built with `still(w, h)`
   and the pieces in `didactics/draw` (label, line, arrow, curve, redraw…).
3. **A live figure** (`interactive_diagram` block), only if moving a control
   changes something the reader can predict: cause and effect, or behaviour
   over time. A slider that only makes a drawing bigger is a still.
   - Turns on one threshold? Use `guessFirst(t, f, { ask, options, answer,
     sliders })` so the reader predicts before the sliders unlock.
   - A time slider? Give it `player(...)` for a Play button (Rob likes time
     lapses).
   - Would it make a good review card? Add `{ card: { front, back } }` and
     draw starting readings from `startRng(t)`.
4. **The check** is the course's `check` figure (`src/figures/check.ts`),
   driven by the quiz block's `items`; don't make a new one per lesson.

## 2. Write it

- One file per lesson in `courses/<course>/src/figures/<lesson-id>.ts`, figures
  in lesson order; a figure used twice lives in the lesson that first uses it.
- Import from the course's `./kit` (re-exports `didactics/figure` plus `COL`,
  `slider`, `prose`, `tint`). Use `COL` keys, never raw hex, and keep each
  colour's meaning the same in every figure and in `[[words|key]]` prose.
- `figure(['goal', …], (ctx, t, options) => node)`: call `t.done()` when the
  reader meets the goal the block names. `frame(w, h, lines)` gives a drawing,
  `controls` and a `readout` of fixed height (one text box per figure, sized
  for its longest line, so the controls never move).
- Motion with `animate(node, ctx, dt => …)` (stops off screen). Keep anything
  the reader set with `t.keep` if the figure should survive leaving the lesson.
- Physics or maths that a test should check goes in an exported function, not
  inside the drawing code.
- Never hide the diagram while the reader works through it; mark progress on it.

## 3. Register and test

1. Add `id: factory` to the `FIGURES` map in `src/figures/index.ts`.
2. Set the block's `goal` and `task` in the lesson JSON (a task needs a goal).
3. Extend `test/figures.test.ts`: every goal must be reachable, ideally by
   setting sliders or clicking the guess, and exported maths checked against
   known numbers.
4. `npm test -w <course>`, then `npm run dev -w <course>` and open
   `/figures.html?only=<id>` at phone width (`?frozen` for repeatable
   screenshots; some courses' galleries also take `?metric` or `?imperial`).

If the figure would help a second course, it belongs in Didactics as a small
module that names neither course (see this repo's CLAUDE.md for releasing).
