# Didactics

Small libraries for building interactive explainers: lessons written as
JSON, made of paragraphs and live figures that show cause and effect, with
tasks that open the next part, a check at the end, and a log the reader
signs. Alongside the lessons there are footnotes, a glossary, a lesson tree,
a spaced-repetition quiz, optional radio talks typed out on a paper slip, a
settings page, and a PWA shell and build that work offline and as a single
HTML file.

It is plain TypeScript with no framework. The DOM comes from a small `el()`
helper and drawings are SVG. It ships as source, and the app's own Vite build
compiles it, so there is no build step for the library itself (apart from the
Vite helper, see [Releasing](#releasing)).

It was taken out of
[Clouds: What are they up to?](https://github.com/RobertLitzke/CloudsWhatAreTheyUpTo),
which is the fullest example of a course built on it.

## How it fits together

**Composition, not inheritance.** Each module is a few functions and types.
A course builds its app by calling them and passing in what is its own: its
lessons, its figures, its palette, its store, its words. Nothing in Didactics
is subclassed or overridden, and nothing in it reaches into an app. For
example:

- `lessonView({ lessons, figures, store, prose, radio?, hero?, intro? })`
  returns a route view. The figures are a plain `{ name: factory }` map; the
  hero picture and the intro lines are functions the app hands in.
- `createStore({ key, empty, migrate })` knows nothing about the save's
  fields. `progress` supplies the fields every lesson app shares, and the
  app adds its own next to them (`type Save = Progress & { … }` or an
  interface that lists both) and repairs them in its own `migrate`.
- A course's palette wraps `figure`'s `slider` and `lesson`'s `prose` in a
  three-line file of its own, rather than configuring a theme object.
- The stylesheet is themed through CSS custom properties, which the app sets
  after importing it.

Each module can be used without the others above it. `dom`, `rng`, `store`,
`units`, `radio`, `resume`, `blocks`, `asset`, `offline` and `vite` import
nothing from the rest; `course` only `blocks`; `quiz` only `rng`; `router`, `ui`, `shell`, `draw`, `footnote`,
`splash`, `update` and `overflow` only `dom`. The lesson player (`lesson`) is the one
that brings the most together.

**What belongs to the course, not here:** its interactive diagrams and live
figures, simulation pages (like Clouds' sky lab or seeding game), drawing
code for its subject (Clouds' cloud rendering), its palette and fonts, its
home page, photos and their pipeline, and all of its content. If a piece of
course code turns out to be useful to a second course, move it here as its
own small module with no knowledge of either.

## Using it in a course

Add it as a git dependency pinned to a commit on main (or to a release tag,
`#v0.1.0`, where one has been pushed):

```jsonc
// package.json
{
  "type": "module",
  "dependencies": { "didactics": "github:RobertLitzke/Didactics#<commit sha>" },
  "devDependencies": { "@types/node": "^20.19.43", "typescript": "^5.7.2", "vite": "^6.0.5",
                       "vite-plugin-pwa": "^1.0.0", "vite-plugin-singlefile": "^2.3.0",
                       "vitest": "^3.0.0", "happy-dom": "^20.14.6" },
  "scripts": { "dev": "vite", "build": "tsc --noEmit && vite build", "test": "vitest run" }
}
```

npm records the exact commit in package-lock.json, so `npm ci` (locally, in
GitHub Actions, anywhere) installs the same code until the pin in
package.json is changed. The repository is public, so no token is needed.
Everything ends up inlined in the app's build, so the one-file and offline
copies need nothing from this repository at run time.

Import each module by name: `import { el } from 'didactics/dom'`. The
`exports` map in package.json is the public interface; anything not listed
there is internal.

Because the library is TypeScript source, two settings in the course repo
let its tools compile it:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'], server: { deps: { inline: ['didactics'] } } },
});
```

```jsonc
// tsconfig.json: "moduleResolution": "bundler", "allowImportingTsExtensions": true,
// "verbatimModuleSyntax": true, "types": ["node", "vite/client", "vite-plugin-pwa/client"]
// (Clouds' tsconfig.json is a working copy.)
```

`lessonApp()` (below) already tells Vite's dev server not to pre-bundle it.
Declare the version constant the build defines, in `src/env.d.ts`:

```ts
declare const __APP_VERSION__: string;
```

While working on Didactics and a course at once, `npm link` (or
`npm install ../Didactics`) points the course at a local checkout; put the
pin back before committing.

## Modules

| Module | What it gives you |
| --- | --- |
| **Foundations** | |
| `dom` | `el('div.card', props, ...children)` and `svg(tag, attrs, ...children)` |
| `rng` | `makeRng(seed)` (mulberry32), `shuffle(items, rng)` |
| `store` | `createStore({ key, empty, migrate })`, localStorage with repair, export and import |
| `units` | `Units`, `height(m, units)`, `length(m, units)` (cm to km, in to mi), `feet`, `deg`, `temp` |
| `router` | `new Router(outlet, hooks).add('/x/:id', view).start('/home')`, hash routes, views return a teardown |
| **Shell** | |
| `shell` | `appShell({ mount, title, subtitle?, mark?, nav, fullScreen? })`: the top bar with the wordmark and the dropdown page menu; also `topBar`, `pageMenu` |
| `ui` | `page()`, `toast()`, `segmented()`, `sheet()` (a card over the page), `freshSeed()` |
| `settings` | `settingsView({ store, empty, appName, saveFile, units?, radio?, offline?, oneFile?, sections?, about? })`; `offline` shows how many photos are saved on the device, `oneFile.offline` offers the copy with photos inside |
| `update` | `watchForUpdates({ title, text, icon?, beforeReload? })`, gets a new deploy into the installed app, with a "new version" banner |
| `splash` | `showSplash({ src, alt })`, a poster as the loading screen |
| `asset` | `assetFrom(siteUrl)`, `fromDisk` (lets the one-file copy fetch photos from the live site), `selfContained` (the offline copy, photos inlined) |
| `offline` | `savedCount(folder)`, `retireWhenSaved(folder, total, oldCaches)` |
| `overflow` | Dev only: flags anything wider than the screen |
| `vite` | `lessonApp({...})`, the whole Vite config (single-file build, one-file copy, offline copy, PWA); also its parts `oneFileCopy`, `offlineCopy`, `inlineFavicon`, `globRegExp` |
| `styles/kit.css` | All the styles, themed through CSS custom properties |
| **Lessons** | |
| `progress` | The shared save fields (`Progress`): lessons done, best scores, journal, units, radio, quiz, lessons left part way, and the radio's fields (`RadioProgress`) unless made with `emptyProgress(units, { radio: false })`. Also `emptyProgress`, `migrateProgress`, `finishLesson`, `skipLesson`, `passed`, `moveLesson` |
| `blocks` | The typed blocks of a lesson's JSON (`text`, `key_ideas`, `interactive_diagram`, `diagram`, `quiz`), `isDiagram`, `lessonShapeProblems`; the reference file's (`RefBlock`, `RefSection`, `referenceShapeProblems`) |
| `lesson` | The lesson JSON types, `prose(text, palette, notes?)`, `lessonView(options)` (the lesson player and log card), `lessonTexts()`, `lessonProblems()` for content tests, `diagramType(factory)` |
| `course` | The whole course as one JSON file: `courseFiles`, `exportCourse`, `readCourse`, `injectCourse`, `courseEdits`, `upgradeLesson`, `upgradeReference`, `formatJson` (keeps a file's layout); the command line `didactics-course` |
| `course-view` | `courseSection({ edits, fileName })`, the Settings section to download, load and reset the course's text |
| `figure` | What a figure is: `figure(goals, build, { options? })`, `quiz(build)`, `frame` (around an SVG, or `frame({ drawing })` around a canvas, video or photo), `canvasFrame`, `slider` (linear, `steps`, or `scale: 'log'`), `animate`, `standaloneFigure` (a figure outside a lesson, for a reference page, a gallery or a test), `testContext`, `figureReady`, guess-first helpers (`lock`, `choices`, `lockIn`, `placeable`) |
| `draw` | SVG pieces: `still`, `label`/`small`/`note`/`heading`, `line`, `polyline`, `arrow`, `wavy`, `curve`, `hexagon`, `redraw` |
| `check` | `check((ctx, options, rng) => steps)`, the figure that ends a lesson: one run of questions (each a picture, a question, choices, an answer and a why) under one count and one score, framed by the radio when it is on |
| `resume` | Lessons left part way: `LessonResume`, `lessonSignature`, `resumeFor`, `migrateResume`. `lessonView` uses it by itself |
| `footnote` | Footnotes that open in a popup: `footnoteSet`, `footnoteMarker`, `openFootnote`, `closeFootnote`, `footnoteLegend`, `footnoteProblems` |
| `glossary` | `glossaryFromLessons`, `glossaryFromFile`, `mergeGlossary`, `glossaryView({ entries, prose, lesson? })` (search, letter index, A to Z), `glossaryProblems` |
| `reference` | `referenceView({ sections, store, prose, figures, lessons?, blocks?, glossary? })`, a reference page of sections tied to lessons (text, terms, tables, steps, live figures, the glossary, and the course's own block types); `referenceProblems` |
| `photos` | The credit half of a photo library: `LICENSES`, the `Photo` fields every photo needs (a course extends it), `credit(photo)`, `creditsView({ photos, name?, intro?, after? })`, `photoProblems` |
| `gallery` | `galleryPage({ figures, lessons, save })`, every figure on one page with its lesson caption, `data-ready` once all are drawn |
| `frozen` | Imported first on a gallery page, `?frozen` seeds `Math.random` and fakes the clock, for screenshot diffs; `freezeClock()` |
| `tree` | The home page's lesson tree: `treeView`, `treeStates`, `nextLesson`, `lessonCodes`, `treeProblems`, `TreeLesson`, `TreeBranch` |
| **Practice** | |
| `quiz` | Leitner scheduling: `review`, `deal`, `tally`, `GAPS_DAYS`, the `Card` shape, `conceptCard` for hand-written cards |
| `quiz-view` | `quizView({ deck, store, blurb, media?, empty? })`, the quiz page |
| **Radio** | |
| `radio` | Talk, Turn and Reply types, `transcript()` |
| `slip` | `createSlip({ stations, snubs, signOff, onHeard, onOff })` returns `{ play, clear }`, the typewriter slip |

Each source file opens with a comment saying what it is for, and each export
has a doc comment.

## A new course, step by step

The example is a made-up topic, "Levers", in a single file layout. Start
with the package.json, tsconfig, vitest config and env.d.ts above.

### vite.config.ts

```ts
import { defineConfig } from 'vite';
import { lessonApp } from 'didactics/vite';
import pkg from './package.json';

export default defineConfig(lessonApp({
  root: __dirname,
  version: pkg.version,
  port: 5430,                       // one block of ten ports per project
  oneFile: 'levers.html',
  precache: ['poster.webp', 'photos/*.webp'], // optional: downloaded when the service worker installs
  offlineFile: 'levers-offline.html', // optional: one-file copy with every precache file inlined
  manifest: { name: 'Levers', short_name: 'Levers', description: '…', theme_color: '#1b172f' },
}));
```

`public/icons/icon-192.png`, `icon-512.png` and `icon-512-maskable.png` must
exist. If `public/icons/icon.svg` exists and index.html links it as the
favicon (`href="./icons/icon.svg"`), the build inlines it, so the one-file
copy has a tab icon too. Clouds makes all of them with `tools/icons.mjs`.
More icons for the manifest go in `manifest.icons`, listed after those three,
such as `[{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }]`.

### The save

```ts
// src/save.ts
import { emptyProgress, migrateProgress, type Progress } from 'didactics/progress';
export type SaveData = Progress;                 // or `interface SaveData extends Progress { … }`
export const emptySave = (): SaveData => emptyProgress('metric');
export const migrate = (raw: unknown): SaveData => migrateProgress(raw, emptySave());

// src/store.ts
import { createStore } from 'didactics/store';
export const store = createStore({ key: 'levers.save', empty: emptySave, migrate });
```

An app with no radio makes its save with `emptyProgress('metric', { radio:
false })`: it then has no `talk`, `introSeen` or `heard`, and
`migrateProgress` given it keeps none of them from an older save. A course
with one unit system adds `fixedUnits: true`: its `units` then stay as
given whatever was stored, and Settings shows no units switch. With a
radio, the save type is `RadioProgress` (or extends it), which is what
`emptyProgress` returns by default.

If you add your own fields, repair them in `migrate` after
`migrateProgress` runs. Clouds' `src/core/save.ts` shows how. Rename a lesson
with `moveLesson(save, 'old-id', 'new-id')` so readers keep their progress.

### A palette and the figure kit

Each topic picks a few colours that always mean the same thing in every
figure and in the text, like Clouds' orange for rising air.

```ts
// src/figures/kit.ts
import { slider as kitSlider, type Slider } from 'didactics/figure';
import { prose as kitProse } from 'didactics/lesson';
export * from 'didactics/figure';
export const COL = { ink: '#2a2547', soft: '#6a5c80', paper: '#fffaf0', effort: '#e0663f', load: '#3a7bd5', pivot: '#0e7a8f' } as const;
export type ColorKey = keyof typeof COL;
export const slider = (label: string, min: number, max: number, step: number, value: number,
  show: (v: number) => string, onInput: (v: number) => void, color: ColorKey = 'ink'): Slider =>
  kitSlider(label, min, max, step, value, show, onInput, COL[color]);
export const prose = (text: string) => kitProse(text, COL);
```

### A figure

A live figure lists the goals a lesson can set it. When the reader meets
the goal, it calls `t.done()`. It must show cause and effect: moving a
slider should change something the reader can predict, not just make a
drawing bigger.

```ts
// src/figures/lever.ts
import { svg } from 'didactics/dom';
import { line, label, redraw } from 'didactics/draw';
import { COL, figure, frame, slider } from './kit';

export const leverFigure = figure(['balance'], (_ctx, t) => {
  const f = frame(400, 200, 2);                // drawing 400×200, a two-line readout
  const g = svg('g');
  f.svg.append(g);
  let pivot = 200;
  const paint = () => {
    const tilt = (pivot - 200) / 10;           // load 1 kg at the left end, 1 kg at the right
    redraw(g, line(40, 120 + tilt, 360, 120 - tilt, COL.ink, 4), label(pivot, 160, '▲', { anchor: 'middle' }));
    f.readout.textContent = Math.abs(tilt) < 0.5 ? 'Balanced: equal turning on each side.' : 'The longer side wins.';
    if (Math.abs(tilt) < 0.5 && t.goal === 'balance') t.done();
  };
  f.controls.append(slider('Pivot', 60, 340, 1, 120, (v) => `${v}`, (v) => { pivot = v; paint(); }, 'pivot').node);
  paint();
  return f.node;
});
```

A **still** is a plain function that returns `{ node }`, built with
`still(w, h)` from `draw`. A **quiz** figure is `quiz((ctx, t) => …)`. It
reports the reader's score with `ctx.score(right, of)` and calls `t.done()`
once it has been answered. The lesson's check is a quiz figure, and usually
one made with `check`: give it a function that turns the block's options
(and a seeded `rng`, for shuffles and deals) into steps, and it asks them one
at a time, explains each answer, keeps the answers for a reader who leaves,
and reports one score. Put every kind of question (photos, diagrams, plain
questions) into that one check, so the lesson ends in one thing, not several:

```ts
export const checkFigure = check((ctx, options, rng) => shuffle(options!.items as Q[], rng).map((q) => ({
  picture: () => drawing(q), ask: q.question, choices: q.options, answer: q.answer, why: q.why,
})));
```

A figure that draws on a canvas, a video or a photo uses `frame({ drawing,
lines })` (or `canvasFrame(w, h, lines)`), which puts the same text box and
controls under it. A slider can walk set values (`slider('Shutter', { steps:
[1/250, 1/500], value, show, onInput })`) or run on a log scale (`{ min: 24,
max: 2000, scale: 'log', ... }`). A figure whose options name things (a
photo, a subject) gives them a check, `figure<{ photo: string }>(goals,
build, { options: (o) => problems })`, and `lessonProblems` runs it on every
block. A figure that paints only once something loads calls
`t.waitFor(promise)`; its `ready` (and `standaloneFigure(...).ready`) settles
when that has, so a test, a screenshot or the gallery can wait for it.

Use `animate(node, ctx, dt => …)` for motion. It runs only while the figure
is on screen and stops when the lesson closes. Guess-first figures lock
their sliders with `lock(sliders, true)`, offer a `choices([...])` row and a
`lockIn('Lock it in', …)` button, then unlock the sliders. See Clouds'
`heaps.ts` parcel figure for a full example.

### Leaving a lesson part way

A reader who leaves a lesson part way (another page, a reload, the app
closed or updated) comes back to where they were. `lessonView` does this by
itself and keeps it in the save under `resume`, by lesson id:

- the parts already passed open without their Continue buttons, and the
  page scrolls back to the block that was at the top of the screen;
- figures whose tasks were done count as done, and every figure's sliders
  are put back where they were (only sliders the figure leaves unlocked, so
  a guess-first figure still waiting for its guess stays locked);
- each check's score is kept, so the log adds up the same;
- the opening radio talk is not played again past the first part, and a
  footnote popup is never reopened.

It is saved at once when a task is done or a part is passed, a moment after
a slider or the scroll stops, and when the page is hidden or closed.
Finishing the lesson (signing the log) forgets it. A lesson already finished
opens in full as before and keeps no place.

A figure with a state worth coming back to (a guess made, quiz answers
given, a random deal) keeps it with `t.keep(state)` (any JSON) and puts
itself back from `t.kept` when built. `t.restored` says its task was done on
an earlier visit, for a figure that unlocks more once done:

```ts
const markIt = lockIn('Mark it', () => { t.keep(pick.picked()); /* …unlock… */ });
if (typeof t.kept === 'number') { pick.pick(t.kept); markIt.click(); }
```

For a quiz, keep the random seed and the answers, and on build replay the
answers and go on from the next question; a finished one reports its score
again. Clouds' `quizzes.ts` (the check, sort, names) and its six
guess-first figures show how.

On the lesson board, show "Continue" instead of "Start" when
`resumeFor(save.resume, id, lesson)` finds something. A lesson can be
skipped with `skipLesson(save, id)`: it records `skipped: true` (not done, no
score), `passed(save, id)` is then true so the next lesson opens, and the
skipped one can still be started. Finishing it later replaces the skip.
Clouds' home view shows both (a Skip button on the lesson that is next).

A resume belongs to one version of a lesson. `lessonSignature` hashes the
type of every block and each figure's name, goal, task and options, but not
the words, so editing text keeps readers' places, while adding, moving or
re-optioning a figure drops them (they start that lesson over). The record
has its own `v: 1`; one that can't be read is dropped and the rest of the
save loads as before.

### A lesson, as JSON

```json
{
  "id": "levers", "n": 1, "title": "Why a long handle helps",
  "teaches": "How a lever trades distance for force",
  "parts": [
    { "title": "The seesaw", "blocks": [
      { "type": "text", "text": "Push near the **pivot** and it barely moves; push at the [[end|effort]] and it swings." },
      { "type": "interactive_diagram", "id": "lever", "caption": "A plank on a pivot", "task": "Find the balance point", "goal": "balance", "aspect_ratio": 2 },
      { "type": "diagram", "id": "crowbar", "caption": "A crowbar is a lever too", "aspect_ratio": 1.66 },
      { "type": "key_ideas", "title": "Hold on to", "points": ["Turning = force × distance from the pivot."] }
    ]},
    { "title": "Check", "blocks": [ { "type": "quiz", "id": "check", "caption": "Three questions", "task": "Answer them" } ] }
  ],
  "learned": ["A lever trades distance for force."],
  "next": "Next: pulleys.",
  "journal": []
}
```

Every block has a `type` (`blocks.ts`):

| `type` | Fields | What it is |
| --- | --- | --- |
| `text` | `text` | A paragraph |
| `key_ideas` | `title`, `points` | The few ideas to hold on to, set apart |
| `interactive_diagram` | `id`, `caption`, `task?`, `goal?`, `options?`, `aspect_ratio?` | A live figure the course draws (made with `figure`) |
| `diagram` | the same | A still (a plain factory) |
| `quiz` | the same | A quiz or the check (made with `quiz` or `check`) |

The last three are callouts: the lesson names the thing by `id`, and the
course maps each id to its code (the `figures` map handed to `lessonView`).
An id with no code yet shows as a dashed box, `aspect_ratio` (width / height)
wide, reading "Diagram crowbar goes here", and holds no one up, so a lesson
can be written and read before its drawings exist. `lessonProblems` lists
such ids (pass `{ allowPlaceholders: true }` while drafting), and a callout
whose `type` does not match its code.

Text markup: `**bold**`, `*italic*`, `[[words|key]]`, which colours the
words with `COL[key]`, and `[^id]`, a footnote. A part opens once every task
in the part before it is done. The last part is the check, and its score goes
into the log.

Lessons written in the earlier shape (`"kind": "text" | "key" | "figure"`)
convert with `npx didactics-course upgrade <folder>`, or `upgradeLesson` in
`course`; readers' places in a lesson survive the change. The command line
keeps each file's layout (`formatJson`): every block and list keeps its line
breaks, so one written on one line stays on one line, and one opened on its
parent's line, like `{ "type": "key_ideas", "title": "…", "points": [` with
a point on each line after it, comes back that way.

### The whole course as one JSON file

To revise a course in one place, put all its words in one file and back:

```sh
npx didactics-course export src/data --title Levers --out course.json   # every .json under src/data
npx didactics-course import course.json                                 # each file back to its path
npx didactics-course import course.json --dry-run                       # say what would change
```

The file is `{ "format": "didactics-course", "version": 1, "title", "exported", "_howTo", "files" }`,
with each JSON file of the course under its path from the repository root
(lessons, and anything else kept in JSON, such as radio talks, quiz cards or
a glossary). Import checks every lesson's blocks before it writes anything.
Run both from the repository root.

The same file works inside the app, so a reader without the repository (on
a phone, say) can download the course, edit it, and read the edited text in
the real lessons before anyone commits it. Make the edits first thing the
app does, in a module the entry imports before anything else:

```ts
// src/course.ts
import { courseEdits, courseFiles } from 'didactics/course';
export const COURSE = courseEdits({
  key: 'levers.course', title: 'Levers',
  files: courseFiles(import.meta.glob('/src/data/**/*.json', { eager: true, import: 'default' })),
});

// src/main.ts
import './course';            // first: the edited words go in before any module reads them
…
import { courseSection } from 'didactics/course-view';
settingsView({ …, sections: courseSection({ edits: COURSE, fileName: 'levers-course.json' }) });
```

`courseEdits` keeps a loaded file in localStorage (only the files that
differ) and puts its words into the very objects the course's modules
import, so nothing else in the course needs to know about it. Settings then
has **Download the course**, **Load edited text** (which reports what is
wrong with a file instead of loading it) and **Back to the built-in text**.

### Footnotes

A footnote opens in a small popup beside the text, which the reader closes
with its ×, Escape or a tap elsewhere, instead of sitting at the foot of the
page. Put the marker straight after the word or sentence it belongs to, with
no space, and the note in the lesson's `footnotes` table under the same id:

```json
{ "type": "text", "text": "A longer handle turns the nut more easily.[^torque]" }

"footnotes": {
  "torque": { "kind": "technical", "title": "Torque", "text": "Engineers call turning force **torque**: force × distance." },
  "archimedes": { "kind": "digression", "title": "Give me a lever", "text": "…" }
}
```

There are two kinds, coloured apart: `technical` (a term or detail the main
text does without; `--fn-technical`, teal by default) and `digression` (a
side trip off the main line; `--fn-digression`, rose). Markers show as small
raised numbers counted through the lesson, and the lesson's intro gets a
one-line legend. Technical notes also go into the glossary; add
`"glossary": false` to keep one out, `"glossary": true` to put a digression
in, or a string to list it under another term. `lessonProblems` reports a
marker with no note and a note with no marker. Use them sparingly: a note
for what would trip up a casual reader, or what is interesting but off the
line, not for every term. Clouds keeps it to about four per lesson.

### Glossary (optional)

```ts
import { glossaryFromFile, glossaryFromLessons, glossaryView, mergeGlossary } from 'didactics/glossary';
import terms from './glossary.json';      // { "fulcrum": { "term": "Fulcrum", "text": "…", "lesson": "levers", "also": ["pivot"] } }
const entries = mergeGlossary(glossaryFromFile(terms), glossaryFromLessons(LESSONS));
page.append(glossaryView({ entries, prose, lesson: (id) => ({ href: `#/lesson/${id}`, label: 'Lesson 1' }) }));
```

The view is a search box (it searches terms, `also` names and definitions),
a row of letters to jump by, and the terms A to Z, each with a tag linking to
its lesson. An entry with `open` becomes a button, for an app with more to
show; Clouds opens a cloud's photo card with `sheet()`. A term listed twice
keeps its first entry, so pass the lists in order of preference.

### The app

```ts
// src/main.ts
import 'didactics/styles/kit.css';
import './tokens.css';                         // your colours and fonts (see below)
import { el } from 'didactics/dom';
import { lessonView } from 'didactics/lesson';
import { Router } from 'didactics/router';
import { appShell } from 'didactics/shell';
import { settingsView } from 'didactics/settings';
import { watchForUpdates } from 'didactics/update';
import levers from './lessons/levers.json';
import { leverFigure } from './figures/lever';
import { checkFigure } from './figures/check';
import { prose } from './figures/kit';
import { emptySave } from './save';
import { store } from './store';

const LESSONS = [levers];
const FIGURES = { lever: leverFigure, check: checkFigure };

const shell = appShell({
  mount: document.getElementById('app')!, title: 'Levers', subtitle: 'Why a long handle helps',
  nav: [{ path: '/home', label: 'Home' }, { path: '/settings', label: 'Settings' }],
  fullScreen: (p) => p.startsWith('/lesson/'),
});
new Router(shell.outlet, { before: shell.before })
  .add('/home', (root) => { root.append(el('div.page', {}, LESSONS.map((l) => el('p', {}, el('a', { href: `#/lesson/${l.id}` }, l.title))))); })
  .add('/lesson/:id', lessonView({ lessons: LESSONS, figures: FIGURES, store, prose }))
  .add('/settings', settingsView({ store, empty: emptySave, appName: 'Levers', saveFile: 'levers-save.json' }))
  .start('/home');

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  watchForUpdates({ title: 'New version', text: 'A fresh version of Levers is ready.' });
}
```

"Lesson 3 of N" counts the lessons that are written. A course whose home
page shows its whole plan, drafted lessons too, passes `countComing: true`
to `lessonView` (or `of: (lesson) => n` to say exactly).

`appShell` is the top bar: the wordmark on the left (a link home) and a
dropdown of the pages on the right, showing the current page's name. Pages
for which `fullScreen` is true hide the bar. `title` can be words or a node,
and `mark` puts a logo before it, such as
`el('img', { src: 'icons/icon.svg', alt: '' })`, with the words stacked
beside it (kit.css sizes the mark to the words). Its parts, `topBar` and
`pageMenu`, can be used on their own, for a bar with more in it.

How updates reach an installed app: a waiting service worker only takes over
once no page uses the old one, and an installed app (on Android especially)
is resumed or reloaded in the same window rather than closed, so left alone
it stays on the old version, and the banner's offer comes back each time.
`watchForUpdates` looks for a new sw.js at launch, on return to the
foreground, on coming back online and every half hour, and applies one
itself: straight away at launch if the player has not touched anything yet,
from the banner's Reload, or else the next time the app goes to the
background, so it opens on the new version. Applying is a reload that keeps
the URL hash; save anything else, such as the step a lesson is on, in
`beforeReload` or as it changes.

`lessonView` also takes these options:

- `hero(lesson)`: the picture above the paper.
- `intro(lesson)`: extra lines under the lede, such as Clouds' chips naming
  the clouds a lesson introduces.
- `radio`: the lesson's talks (see below).
- `home`: the route the back arrow goes to.
- `noun`: what a lesson is called. The default is "Lesson".

A lesson marked `coming`, or with no parts, is not written yet: opening it
goes back to `home`, so a tree or list can show it without a guard of its own.

If you put extra fields on your lessons, such as Clouds' `clouds` and `sky`,
type them as `interface MyLesson extends Lesson<FigureId> { … }`.

### The lesson tree

`treeView` draws the lessons as a trunk running down the page, with each
branch forking off the trunk lesson it grows from as a pill that opens into
its own rail. Give each lesson a `branch` (left out on the trunk), hard
`needs` (shut until each is passed or skipped) and soft `betterAfter` (opens,
but says what to do first), and mark unwritten ones `coming`. Exactly one
lesson is Next: the first open trunk lesson, or once the trunk is done, the
first open branch lesson. The app draws each lesson's card from the
`TreeNode` it is handed (`state`, and the `missing` and `wanting` lessons;
`missing` leaves out the trunk lesson just before, which the trunk's order
already says).

Give a branch a `prefix` and its lessons are named like course codes, P1, P2,
P3, instead of carrying on the trunk's numbers: `lessonCodes(lessons,
branches)` returns each lesson's code, to set as its `code` (shown in its dot
and, on a `Lesson`, in the lesson's header).

```ts
const branches: TreeBranch[] = [
  { id: 'pedals', title: 'Guitar pedals', promise: 'Inside a Fuzz Face', from: 'amps', color: 'var(--sun)', prefix: 'G' },
  { id: 'epilogue', title: 'Afterwards', promise: '', from: 'faults', leaf: true },
];
root.append(treeView({ lessons, branches, save, card: ({ lesson, state }) => myCard(lesson, state), remember: 'myapp.tree' }));
```

A pill shows how many of its lessons are done. The pill holding Next starts open;
`remember` keeps the others as they were left on this device. Test the shape
with `treeProblems(lessons, branches)`. Its styles are in kit.css.

### Layout and theme

The page layout (top bar, `.page` column, buttons, the lesson on paper,
figures, slip, log, quiz, settings) is all in `kit.css`, and everything a
course would change about it is a custom property with a default there.
Import `kit.css`, then set your own values in a `:root` rule, and add
`@font-face` rules for the fonts you name. Clouds' `src/app/styles/tokens.css`
is a full example.

| Property | What it colours or sets |
| --- | --- |
| `--bg`, `--bg-2` | The page behind everything, and raised parts of it (the menu, chips) |
| `--panel`, `--panel-2` | Cards and fields on the page |
| `--paper`, `--ink`, `--ink-soft` | A lesson's paper and its writing |
| `--text`, `--muted`, `--title` | Writing on the page, quieter writing, the wordmark |
| `--sun`, `--sun-deep`, `--rose`, `--teal` | Accents: links and headings, part numbers, highlights |
| `--good`, `--bad` | Right and wrong answers |
| `--fn-technical`, `--fn-digression` | The two kinds of footnote |
| `--font` | Body text |
| `--display` | Headings, buttons, the menu, labels |
| `--hand` | The handwritten log |
| `--type` | The typewritten radio slip |
| `--radius` | Card corners |
| `--page-width` | How wide ordinary pages run (720px) |

```css
/* src/styles/tokens.css, imported after didactics/styles/kit.css */
@font-face { font-family: 'Inter'; font-display: swap; src: url('…/inter.woff2') format('woff2'); }
:root {
  --bg: #102027; --bg-2: #1c313a; --paper: #fbf8f1; --ink: #20302f; --sun: #f4b860;
  --font: 'Inter', system-ui, sans-serif; --display: 'Inter', system-ui, sans-serif;
}
```

Fonts are inlined into the one-file build, so name few, and Latin-only
subsets keep the page small.

### Quiz (optional)

```ts
import { conceptCard, type Concept } from 'didactics/quiz';
import { quizView } from 'didactics/quiz-view';
import ideas from './quiz.json';           // { "cards": Concept[] }
const deck = (ideas.cards as Concept[]).map((c) => conceptCard(c));
// A card with `after: 'lesson-id'` is dealt only once that lesson is passed or skipped.
router.add('/quiz', quizView({ deck, store, blurb: 'Cards on the ideas behind the lessons.' }));
```

Generated cards work too. Any object with `{ id, question, options, why }`
is a card, with the right answer at `options[0]`. To show a picture above a
card, pass `media: (card) => node | null`.

### Radio talks (optional)

```ts
import { createSlip } from 'didactics/slip';
const slip = createSlip({
  stations: { them: { call: 'G2XX', place: 'The workshop' }, you: { call: 'G2YOU', place: 'Home' } },
  signOff: 'Thanks. Signing off.',
  onHeard: (id, picks) => store.update((s) => ({ ...s, heard: { ...s.heard, [id]: picks } })),
  onOff: () => store.update((s) => ({ ...s, talk: false })),
});
lessonView({ …, radio: { talks: (id) => TALKS[id] ?? [], play: slip.play, clear: slip.clear } });
```

A talk has `{ id, cue: 'start' | 'check', when, turns: [{ them, replies?: [{ say, back?, right?, off? }] }] }`.
The `start` talk plays once, on the slip, when the lesson opens, and only if
the reader has the radio on. The `check` talk is not played: with the radio
on, `lessonView` hands it to the check's figures as `ctx.radio`, and a `check`
figure types its first line above the questions and its last line under the
score, so the questions come over the air without a second quiz. Give it two
turns with no replies. Pass `them: stations.them` in `radio` to head it with
the call sign. Pass `radio: { blurb }`
to `settingsView` to show the on/off switch.

### Tests

```ts
// test/content.test.ts (happy-dom)
import { lessonProblems } from 'didactics/lesson';
expect(lessonProblems(LESSONS, FIGURES)).toEqual([]);   // unknown figures, unknown goals, tasks with no goal
```

Clouds' `test/figures.test.ts` builds every figure in both unit systems and
checks that none of them throws, and that the guess-first figures and checks
come back as they were from what they kept. A gallery of every figure is a
few lines with `galleryPage`, and `?frozen` makes it the same on every load,
so before and after screenshots can be pixel-diffed:

```ts
// tools/gallery/main.ts, loaded by figures.html (served by the dev server only)
import 'didactics/frozen';                     // first, before any figure
import { galleryPage } from 'didactics/gallery';
const g = galleryPage({ figures: FIGURES, lessons: LESSONS, save: emptySave() });
document.getElementById('app')!.append(g.node); // [data-ready] once every figure has drawn
```

---

## Conventions that keep lessons good

- Put each lesson's words in one JSON file, so they can be edited without
  touching code.
- Use one file per lesson for its figures, in lesson order.
- An interactive figure must show cause and effect. If it can't, make it a
  still. When the text describes something the reader can't see, add a
  still that shows it.
- Give each figure one text box of fixed height (`frame(w, h, lines)`), so
  the controls don't move as the readout changes.
- Ask for a guess before unlocking sliders when a figure turns on a single
  threshold.
- Keep colours consistent: a colour means the same thing in every figure and
  in the prose.

## Releasing

1. Make the change here, with a test in `test/`.
2. If `src/vite.ts`, `src/course.ts` or `src/blocks.ts` changed, run
   `npm run build`. Node will not run TypeScript from inside node_modules,
   and those run in Node (an app's vite.config.ts, and the command line), so
   they also ship compiled in `lib/`. A test fails if lib is out of date.
3. `npm run check && npm test`.
4. Bump `version` in package.json (a breaking change to an export bumps the
   minor version while it is 0.x), note the change in CHANGELOG.md, and push
   to main. Tag it too if you like (`git tag v0.2.0 && git push --tags`).
5. In each course, run `npm install github:RobertLitzke/Didactics#<new sha or tag>`,
   then its tests and build.

More ideas for courses are in [docs/topics.md](docs/topics.md).
