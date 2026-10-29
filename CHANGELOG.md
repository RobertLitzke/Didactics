# Changelog

## 0.5.0 (2026-10-29)

Gaps found moving a fourth course (Out of Auto, photography) onto Didactics:

- `figure`: `frame({ drawing, lines?, extra? })` puts the text box and
  controls under any drawing (a canvas, a video, a photo), which gets the
  class `fig-drawing`; `canvasFrame(w, h, lines, { scale? })` makes the
  canvas. `frame(w, h, lines)` is unchanged, and its result now also has
  `drawing` (the svg).
- `figure`: `slider(label, { value, show, onInput, steps | min, max, step,
  scale, color })`. `steps` walks a list of set values; `scale: 'log'` runs
  min to max by ratio. `show`, `onInput`, `value` and `set` deal in real
  values, the input in positions, so resume keeps working. The positional
  form is unchanged.
- `units`: `length(m, units)`, a distance in cm, m or km, or in, ft or mi.
- `figure`: a figure can check its block's options, `figure<O>(goals,
  build, { options: (o) => problems })` (also `quiz` and `check`, and a
  still by `Object.assign`); `lessonProblems` and `referenceProblems` run it.
  `O` types the options the build function gets.
- `figure`: a figure that draws once something loads calls
  `t.waitFor(promise)`; `FigureHandle.ready` and `standaloneFigure(...).ready`
  settle when everything it waited for has (failed or not), and
  `figureReady(handle)` gives a promise for any figure.
- `photos` (new): `LICENSES`, `isLicenseId`, the `Photo` credit fields (a
  course extends the type with what its photos are of), `credit(photo)`,
  `creditsView({ photos, name?, intro?, after?, empty?, title? })` and
  `photoProblems`. Fetching and subjects stay in each course.
- `gallery` (new): `galleryPage({ figures, lessons, save, only? })`, every
  figure on one page with its lesson caption and `data-figure`, and
  `data-ready` once all are ready. `frozen` (new): imported first, `?frozen`
  seeds `Math.random` and runs animation on a fake clock; `freezeClock()`.
- `lesson`: `countComing: true` counts every lesson for "Lesson 3 of N", for
  a course whose home page shows its whole plan.
- kit.css: `.fig-drawing` spans the figure like `.fig-svg`.

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
