# Changelog

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
