# Changelog

## 0.4.0 (2026-10-28)

Gaps found moving a third course (Circuitry) onto Didactics:

- `overflow`: shapes inside an SVG are no longer flagged; an SVG clips its
  own drawing, so only the svg itself is measured.
- `reference` (new): `referenceView({ sections, store, prose, figures,
  lessons?, blocks?, glossary? })`, the reference page Circuitry and Dirt
  each wrote for themselves: a contents list, then sections tied to lessons,
  with `text`, `terms`, `table`, `steps`, figure (`interactive_diagram` /
  `diagram`, by `id`) and `glossary` blocks, and `blocks` for a course's own
  types. `referenceProblems` for content tests. The file's types and
  `referenceShapeProblems` are in `blocks`; the course file checks reference
  files, and `didactics-course upgrade` (`upgradeReference`) turns the old
  `kind`/`figure` blocks into `type`/`id`. kit.css styles the page.
- `figure`: `standaloneFigure(factory, { caption, save, goal?, options? })`
  shows a figure outside a lesson, captioned as a lesson would, with a
  `close`; `testContext(save)` is a context for tests that collects scores;
  `placeCaption` is the caption step the lesson player uses.
- `settings`: the one-file section speaks of photos only for an app that has
  them (`offline`, or `oneFile.offline`), and `oneFile.text` replaces its
  words.
- `lesson`: "Lesson 3 of N" counts only written lessons; `of` lets the course
  say. `placeholder` is exported.
- `progress`: `emptyProgress(units, { fixedUnits: true })` marks a course
  with one unit system; `migrateProgress` then keeps its units whatever was
  stored, and Settings shows no units switch.
- `quiz-view`: an `empty` message for a reader with no cards (an empty deck,
  or every card waiting on a lesson), instead of an empty tally.

## 0.3.1 (2026-10-28)

- `course`: `formatJson` keeps every object's and list's line breaks, not
  just the one-line ones, so a block opened on its parent's line and spread
  over several (a key-ideas list, a check's questions) comes back as it was.
  `oneLinePaths` became `jsonLayouts`, which says where each one breaks.

## 0.3.0 (2026-10-28)

Gaps found moving a second course (Dirt) onto Didactics:

- `shell`: `topBar` and `appShell` take a `mark` (a logo before the words,
  which then stack beside it), and `title` can be a node.
- `lesson`: a lesson marked `coming`, or with no parts, sends the reader back
  `home` instead of opening blank.
- `progress`: the radio's fields (`talk`, `introSeen`, `heard`) are optional
  on `Progress` and required on `RadioProgress`, which extends it. `emptyProgress(units, { radio:
  false })` leaves them out, and `migrateProgress` keeps them only when its
  empty save has them. `emptyProgress()` still returns them, so an app with a
  radio types its save as `RadioProgress` (breaking only for code
  that reads `heard` from a plain `Progress`).
- `course`: `didactics-course upgrade` and `import` keep each file's layout,
  so hand-compact one-line blocks stay on one line (`formatJson`).
- `vite`: `manifest.icons` adds icons after the three PNGs.

## 0.2.0 (2026-10-28)

- Lesson blocks are typed: `text`, `key_ideas`, and callouts by `id` for
  what the course draws, `interactive_diagram`, `diagram` and `quiz`, with an
  optional `aspect_ratio` (blocks.ts). An id with no code shows a placeholder
  box. `lessonProblems` checks a callout's type against its code. Breaking:
  `kind`/`figure` became `type`/`id`; `npx didactics-course upgrade` or
  `upgradeLesson` converts old files, and readers' places in lessons survive.
- `course`, `course-view` and `bin/didactics-course`: the whole course as one
  JSON file, out and back in, from the command line or from Settings in the
  app (edited text read on this device before it is committed).
- `shell`: the top bar with the wordmark and the dropdown page menu
  (`appShell`, `topBar`, `pageMenu`); kit.css styles `.navmenu`, and the old
  row of links in the bar is gone.
- Theme properties `--type` (the slip's typewriter) and `--page-width`.
- `settingsView` takes `sections`.

## 0.1.0 (2026-10-28)

First release, taken out of Clouds (its `packages/lesson-kit`) with no change
in behaviour. Differences from that copy:

- Imported as `didactics/<module>`; the `exports` map lists each module.
- `Units` lives in `units` (still re-exported from `progress`).
- The Vite helper also ships compiled (`lib/vite.js`, `lib/vite.d.ts`), and
  `lessonApp()` keeps Vite's dev server from pre-bundling the library.
- The update banner's sessionStorage key is `didactics.update-tried`.
