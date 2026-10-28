# Changelog

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
  so hand-compact one-line blocks stay on one line (`formatJson`,
  `oneLinePaths`).
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
