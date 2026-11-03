# Changelog

## 0.23.0 (2026-11-03)

- `defineCourse` takes `hero`, a picture across the top of the default home
  page: the title and subtitle sit over its upper half in the heading face
  with a hard shadow, and the welcome becomes a card over its foot
  (kit.css `.course-hero`; a course sets `--hero-text` and `--hero-shadow`).

## 0.22.1 (2026-11-03)

- `styles/plain-type.css` follows the 0.21.0 retheme: buttons and the
  wordmark keep kit.css's Fraunces, as in every course; only headings, labels
  and tags are set in the course's own faces.

## 0.22.0 (2026-11-03)

Less for a course to carry: the shared parts of every course's kit, styles,
photos and offline saving move here, and two old pieces retire. Saves are
read as before; nothing a reader has done is lost.

- `kit` (new): `courseKit(COL)` gives a course its `slider` (colour by
  palette key, positional or options form), `prose` and `tint`, in place of
  the kit.ts every course copied. `didactics-course new` writes it that way.
- `photos`: `photoFigure(photo, src, options)`, the picture over its credit,
  and `stillPhoto({ find, src })`, the figure a lesson's JSON names a photo
  in by id, in place of each course's copy.
- `styles/kit.css` now has a course's own home page (`.hero`, `.hero-text`,
  `.letter`, `.lesson-board`, `.lesson-n`, `.ref-card` with `--stripe`),
  photos with their credit (`.photo`, `.credit`, `--photo-aspect`) and the
  figure extras courses shared (`.fig-hint`, `.chip-label`, `.detective`);
  new `styles/plain-type.css`, the skin for a course set in a text face.
- `offline`: on a site of several courses the worker precaches the pages
  only (`vite` `courseFilesRoute` caches a course's photos, maps and data as
  they are fetched); a course's large files are saved all at once on
  request. `offlineFiles` reads the build's `offline.json` (`vite`
  `offlineList`, written and precached for any `precache`), `saveForOffline`
  fetches the list into the `course-files` cache, `forgetOffline` empties it,
  and `savedCount` counts both caches. Settings' Offline section has the
  Save and Remove buttons with a progress bar; a course asks for it with
  `offline: { noun }`, nothing more to plumb.
- `app`: `save: { key }` and `text: { key }` keep a course on the storage
  keys it has always used when they differ from its id, so the old courses
  can drop their store and course modules without anyone losing progress;
  `textPieces: { modules }` makes the per-lesson text pieces.
- `didactics/course` resolves to the built `lib/course.js` under Node (a
  tool script can import `formatJson`); in a bundler it is the source as before.
- `course`: `lessonPieces({ lessons, figures, modules })`.
- `figure`: every figure is `role="img"` named by its caption; `animate` and
  `player` run at two frames a second under `prefers-reduced-motion`
  (`reducedMotion`, `nextFrame`).
- Retired: the lesson `journal` (the field is dropped from saves on load;
  `finishLesson` takes no journal) and the Leitner quiz (`quiz-view` is gone;
  `quiz` keeps `Card` and `conceptCard`; a save's old `quiz` places still
  seed the review deck through `fromLeitner`).
- `course`: `formatJson` keeps a flat value's spacing (`{"type": "text"}` or
  `{"type":"text"}` come back as written), so a tool that rewrites a lesson
  file leaves no layout churn.
- Retired `encyclopedia.activeEncyclopedia`, which nothing read.
- Tests for `store`, `router`, `settings`, `offline` and `photos`.

## 0.21.1 (2026-11-03)

- The wordmark's title sits a little higher and its subtitle a little lower (line-height 0.9, a 5 px gap).

## 0.21.0 (2026-11-03)

A light retheme to match the painted course icons.

- Headings, the wordmark and buttons are set in Fraunces (bundled, Latin
  only, soft axis up), a chunky soft serif, in sentence case: new tokens
  `--head` and `--head-settings`. `--display` still sets the wordmark's
  subtitle, the menu, labels, tags and the poster lettering.
- A four-colour band (`--stripe-1` … `--stripe-4`: orange, mustard, teal,
  ink) runs under the top bar.
- Buttons have 10 px corners, a hard offset shadow and bigger type
  (`.btn-big` 1.3rem).

## 0.20.0 (2026-11-03)

An encyclopedia for a site of courses.

- `encyclopedia`: entries on ideas, people, places and things, kept once for
  the whole site in a JSON file per course, and a page per course that is
  its one-page glossary (key people, ideas, things and reference tables).
  `encyclopediaView` lists them (search; People, Ideas, Places and things,
  Courses; this course or all) beside the open entry from 960px, one or the
  other on a phone, with a trail of the entries just visited. An entry shows
  its line, text, why it matters, connected entries (its own list and every
  entry that links to it), lessons in any course, and its Wikipedia article
  in a new tab. `encyclopediaProblems`, `entryLinkProblems` for tests.
- `lesson`: `prose` turns `[[words]]` and `[[words|@id]]` into a link to an
  entry, which opens a card beside the words; links also work inside bold and
  italic. Colour markup (`[[words|key]]`) is unchanged.
- `app`: `defineCourse({ encyclopedia: { data, course } })` adds the pages
  and menu item and puts the course's file into Settings' course download.
- `glossary`, `footnote`: a glossary term or technical note whose term has an
  entry links to it (`glossaryMore`, `footnoteMore`); `openPopover` is the
  popup notes use, for any small card beside a word.
- `vite`: `lessonApp({ encyclopedia: { dir, courses } })` serves
  `virtual:didactics/encyclopedia` (`encyclopediaModule`, `readEncyclopedia`).
- `didactics-course import --map <prefix>=<folder>/` writes files kept
  outside the course (the encyclopedia) back where they live.

## 0.19.0 (2026-11-03)

The lesson list keeps its place, and says at a glance what is done.

- `place` (new): `keepPlace(root, key)` brings a home page back scrolled
  where it was left, after leaving or finishing a lesson, the browser's Back
  or a reload (sessionStorage): the lesson whose link was followed comes back
  at the same height on the screen, or else the old scroll offset.
  `courseHome` uses it.
- `status` (new): `lessonStatus` (new, started, done), `progressLine` and
  `lessonGo`, the lesson's button: peach ▸ Start, rose ◐ Continue, outlined
  ✓ Again. Cards with `stand-<status>` get a matching left edge.
- `tree`: nodes carry `data-lesson`; a lesson left part way gets `is-started`
  (a rose dot) and its branch's pill starts open. Option `started`.
- `app`: `courseHome` cards use `lessonGo` and say how far a started lesson
  got.
- `router`: sets `history.scrollRestoration` to manual, so the browser no
  longer fights the views over where the page is scrolled.

## 0.18.0 (2026-11-02)

Desktop layout: the room either side of a lesson on a wide screen is used.

- `footnote`: `sideNotes(scope, signal)`. From 1180px wide
  (`SIDE_NOTES_FROM`) every note of a lesson sits in the right-hand margin,
  level with its marker's line and pushed down when the one above runs long;
  clicking a marker outlines its note (scrolling to it if need be) instead of
  opening the popup, and hovering either lights the other. It keeps up as
  parts open, figures change height and the window is resized. Narrower
  screens keep the popup. `lessonView` turns it on for every lesson.
- `lesson`: from 1180px, the lesson's parts are listed in the left margin,
  the one being read lit, those opened so far a click away, the rest greyed.
- Styles: from 1360px the radio slip stands in the left margin, off the
  text, and its reopen button moves to the left too.
- `shell`: `pageMenu` also returns `tabs`, the pages as a row of links;
  `appShell` puts them beside the dropdown, and from 960px kit.css shows the
  tabs instead of the dropdown.

## 0.17.2 (2026-11-02)

- Styles: answer buttons in a lesson's check, the quiz and review cards
  (`.answer-list .btn`) use the reader's type at normal weight, in sentence
  case, with a 10px corner instead of the pill's round ends.

## 0.17.1 (2026-11-01)

- `maps`: `mapKey(items)`, the map chart's key on its own, for a figure
  that draws its own map. The key, credit and note styles now apply to any
  map, not only the map chart's.

## 0.17.0 (2026-11-01)

- `figure`: `player(slider, ctx, { seconds?, onEnd? })`, a Play / Pause /
  Play again button that runs a time slider from where it stands to its end
  in `seconds` (default 12), through the slider's own `onInput`. A hand on
  the slider pauses it; a locked slider (guess first) locks it; closing the
  lesson stops it. Taken from Geology lesson 5's roots figure.

## 0.16.1 (2026-11-01)

- `lesson`: in a lesson without a picture on top, the first line of the
  title block moves over to make room for the round back button that
  stands in for the tucked-away bar (0.15.1).

## 0.16.0 (2026-11-01)

Zones on a map:

- `maps`: the `map` chart takes `areas` (filled regions through places,
  `color`, `opacity`), drawn under its lines and labels and clipped to the
  map's edges, and `key` (swatches and words under the map). `mapAreas` does
  the drawing for a course's own map figure. Both are checked with the rest
  of the options.

## 0.15.1 (2026-11-01)

- `lesson`: the bar at the top of a lesson no longer repeats the big title
  at the start. It floats over the page, tucked up out of sight but for its
  progress line, and slides in once the title has scrolled up under it; a
  small round back button stands in for it meanwhile. Lessons without a
  picture on top get room for the status bar (`.lesson.no-hero`).

## 0.15.0 (2026-11-01)

Predictions marked plainly, and live figures as flash cards:

- `figure`: `choices().mark(answer)` turns the pick green with a tick or red
  with a cross, rings the right option when the pick was not it, and adds a
  verdict line; a frozen pick stands out as "Your guess". `verdict(right,
  text)` and `showVerdict(t, where, right, text)` do the same for a guess put
  on the drawing. `guessFirst` moves here from the courses, with `answer`
  (a number or a function) and `reveal: 'lock' | 'done'`.
- Flash cards from figures: `FigureSpec.card` / `FigureFactory.card`
  (`{ front, back, goal? }`), `FigureContext.card` and `Task.card` (`{ seed,
  verdict }`), `startRng(t)`, `tellCard(t, right)`. `rng`: `between`,
  `oneOf`, `jitter`.
- `review`: `FigureSource`, `fillFigureCards`, `figureFor`,
  `figureCardBlocks`, `figureCardProblems`, `isFigureNote`. The review page
  adds each finished lesson's figure cards and asks them with the figure
  itself (`figureCard` in `review-view`); the Anki download gives them a
  picture of the figure. `review-all` leaves them out of its sittings
  (`askableHere`, `figuresWaiting`) and links to the courses that have them.
- `lesson`: `lessonProblems` reports a card goal its figure does not know.

## 0.14.0 (2026-11-01)

The log at a lesson's end becomes its summary:

- `lesson`: `Lesson.summary` (five to ten main points, with text markup)
  replaces `learned` and `next`. After the check, "Finish the lesson" saves
  the lesson as done and shows the summary in a dark box (`.summary`) with
  the check's score and a "Back to the lessons" button. No name, no
  signature, no handwriting: the ruled `.logbook` card, `input.sign` and the
  `--hand` property are gone.
- A finished lesson opened again shows its summary at the top, under the
  title, then every part with no Continue or Finish buttons. Its figures get
  `t.restored` and their own `t.kept`, and their sliders are put back:
  `finishLesson` now keeps a finished lesson's sliders and kept figure state
  (its place is still dropped), so guess-first figures reopen with their
  guess made and their controls free.
- `course`: `upgradeSummary(raw)` reads a lesson with `learned`/`next` as one
  with `summary`; `readCourse` applies it, so course files and edits saved
  before this load as they were, and `upgradeLesson` (and `didactics-course
  upgrade`) include it. `lessonShapeProblems` checks `summary` is a list of
  text. The course file's how-to says what the summary is.
- Breaking: lesson files and `Lesson` objects need `summary` in place of
  `learned` and `next`.

## 0.13.0 (2026-10-31)

Review across every course on a site:

- `review-all`: `allCoursesReview({ courses })`, a page for a site's catalog
  that reads each course's save, deals their due cards in one sitting (each
  course's own queue and limits, a missed card back first, whichever course),
  shows each card in its course's colours (`theme`), writes each answer back
  into its course's save, and downloads one .apkg of every course.
  `readCollections`, `writeCollection`. Its look is
  `didactics/styles/review-all.css`, for a page without kit.css.
- `srs`: `mergeCollections` (ids under each collection's key, guids kept);
  a note's `image` (its photo's address) and `drawing`, so a card can be shown
  away from the course that made it.
- `check`: an answer passes on its photo's address (`imageOf`); the review page
  notes it for cards made before.
- `review-view`: `noteCard`, one card being asked, shared by both pages; a
  link to the review of all courses when the course has a `catalog`.
- `store`: a save changed by another page of the site is read again.

## 0.12.0 (2026-10-31)

Spaced repetition in Anki's shape, and a review page in every course:

- `srs`: a collection of decks, notes (basic, or multiple choice), cards
  (type new/learning/review/relearning, queue, due, interval, ease, reps,
  lapses, (re)learning step, FSRS stability and difficulty) and a review log,
  as plain data and pure functions. Two schedulers, as Anki runs them:
  `fsrs()` (ts-fsrs, the default) and `sm2()`, with learning and relearning
  steps, fuzz, leeches, daily limits and a day that starts at 4 am. The study
  queue comes from Syrinx: due cards most overdue first, new ones woven
  through at a share of the sitting, and, once nothing is due, the cards
  nearest to being forgotten (`reviewAhead`).
- `anki`: `toApkg` writes the collection as an .apkg (schema 11) with the
  cards' schedules, FSRS memory, the review log and pictures; checked by
  importing into Anki 26.9. `sqlite`: the SQLite file writer it uses.
- `review` and `review-view`: every check question a reader answers is kept
  in a deck per lesson, with the answer as its first review; lessons finished
  earlier add their checks as new cards; the course's quiz deck joins a few
  new cards a day, and cards from the old Leitner quiz keep their place.
- `app`: `defineCourse` adds the review page at /review (`review: false` for
  none). Breaking: there is no separate quiz page any more; `quiz: { deck }`
  feeds the review page (its `blurb` is no longer shown; `review: { blurb }` sets the page's), /quiz opens it, and a `menu` naming '/quiz' shows
  Review there. A menu without either gets Review before Settings.
- `check`: a `CheckStep` may carry a `key`, to tell apart questions with the
  same words over different pictures. `FigureContext.answered` and
  `LessonViewOptions.answered` pass each answer on. `Progress.review` holds
  the collection.

## 0.11.0 (2026-10-31)

Maps of real places, as the background of a figure:

- `maps`: a relief (a grid of heights made ahead of time, shipped as a
  Terrarium PNG and a JSON file saying where it lies and where it came from)
  drawn as a shaded map. `loadRelief`, `mapView` (a canvas with an SVG on top,
  400 units wide), `paintRelief` with the sun, height exaggeration, a water
  level and a colour per cell as parameters, `hillshade`, `profile` (heights
  along a line), `outcrops` (where a tilted stack of layers meets the
  ground), `mapLabels`, `mapLines`, `scaleBar`. The reliefs are made by a
  script in the course's repository (the monorepo's `tools/geo/relief.mjs`).
- `maps({ palette, asset })` gives the `map` chart: a still map from a block's
  options alone (relief, sun, water, labels, lines), with the heights' credit
  under it.
- A map block's `scale: "right"` puts the scale bar in the bottom-right corner, to keep it off a label.

## 0.10.0 (2026-10-31)

Several courses on one site, each in a folder under a catalog page:

- `app`: `defineCourse({ catalog: { href: '../' } })` ends the page menu with
  an "All courses" link (`label` to rename it) to the site's catalog. The
  one-file copy links to the catalog on the live site (`site`).
- `shell`: a `NavLink` may carry `href`, a page outside the app; it is never
  marked as the current page, and is set apart at the foot of the menu.
- `vite`: `lessonApp({ inSite: true })` for a course in a folder of a site
  whose own build writes the one service worker and manifest: the page
  registers `../sw.js` with the site's root as its scope and links
  `../manifest.webmanifest`.
- `offline`: `savedCount(folder)` counts files under the folder next to the
  page, so courses sharing one service worker each count their own photos.

## 0.9.1 (2026-10-31)

- `scaffold`: a new course's `src/figures/index.ts` includes the charts
  (`...charts({ palette: COL })`), so its lessons can use timeline, tree,
  scale and plate from the start.
- `charts`: a scale's labels are in ink unless `bold`, which puts them in
  their bar's colour, so pale bars keep readable labels.

## 0.9.0 (2026-10-31)

A course without the boilerplate:

- `app` (new): `defineCourse({ id, title, lessons, figures, prose, ... })`
  boots the whole app in one call: the save and its store, the top bar and
  page menu, a home page with the lesson tree (`courseHome`), the lesson
  player, Settings (one-file link, offline count, course text and its
  pieces), and optionally a quiz, a glossary and Credits, plus the course's
  own `pages`, the update banner and the dev overflow strip. Storage keys and
  file names come from `id`. Also `courseStore`.
- `scaffold` (new, Node only) and `didactics-course new <folder> --title T`:
  a new course that installs, tests, builds and deploys as written, pinned to
  the Didactics commit the command came from.
- `styles/kit.css`: `.lesson-card` and `.lesson-actions` for the default home
  page.

## 0.8.0 (2026-10-31)

Figures a lesson sets up in its JSON, with no code in the course:

- `charts` (new): `charts({ palette?, asset? })` gives four stills drawn
  from a block's `options`: `timeline` (events and spans, by time or evenly
  spaced), `tree` (an outline, or downward for up to 6 leaves), `scale` (bars,
  linear or log, lengths in the reader's units) and `plate` (an image with
  labels and leader lines in its margins). Each checks its options, so
  `lessonProblems` names a bad one. Their words live in the lesson file, so
  the course file carries them, and its how-to says they are there to edit.
- `figure`: `FigureFactory.each`, set on charts: the gallery shows every
  block that uses such a figure, not just the first.

## 0.7.0 (2026-10-30)

Downloading the course a piece at a time:

- `course-view`: `courseSection({ …, pieces?, allLabel? })`. With pieces
  (such as one per lesson) Settings shows a menu, "All" first, and one
  Download button for what is picked. `pieceFileName(fileName, piece)`.
- `course`: `CoursePiece { label, files, code?, fileName? }`;
  `CourseEdits.file(piece?)` and `pieceOf(file, piece)` give only its JSON
  files and code tables, with `"part"` set to its label.
- `course`: `CourseEdits.load` merges: what a loaded file holds replaces the
  edits of the same files and strings, and other edits stay, so loading one
  lesson keeps another's edits. (It used to replace every edit.)

## 0.6.0 (2026-10-30)

All of a course's text in one JSON file, the words written in its code too:

- `code-text` (new): a course file can carry `"code"`, the strings that read
  as words in the course's source files (labels, commentary, buttons,
  headings), one table per file, as written → as edited. `isProse`,
  `templateParts`, `codeTextProblems`, `liveCodeText`, which swaps edited
  words into the page as it shows them (DOM and SVG text, not canvas).
- `code-scan` (new, Node only, uses the course's `typescript`): `scanCode`,
  `codeTable`, `readSources`, `rewriteCode`.
- `didactics-course export … --code src` adds the code's words; `import`
  writes edited strings back into their source files, checking every one
  first (a string no longer in its file, a template that lost a `${...}`).
- `vite`: `lessonApp` serves `virtual:didactics/code-text`, the table for
  `src` (option `codeText`: folders, or `false`); also `codeTextModule`.
- `course`: `exportCourse(title, files, now?, code?)`; `readCourse(raw,
  known?, knownCode?)` also returns `code` (only the changed strings);
  `courseEdits({ …, code? })` puts the code table in the downloaded file and
  keeps and shows edited strings. **Breaking:** `CourseEdits.file()` and
  `load()` now return promises; new `hasCode`.
- `course-view`: the Settings text says the download has the words in the
  drawings and pages too, when it does.
- `styles/kit.css`: a hidden `.btn` stays hidden (Settings showed "Reload
  to read it" and "Back to the built-in text" when there was nothing to do).

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
