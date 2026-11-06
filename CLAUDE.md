# Notes for Claude sessions

Didactics is the shared library under every course on Rob's courses site.
The courses themselves live in the Courses repository
(RobertLitzke/Courses, formerly CloudsWhatAreTheyUpTo, live at
robertlitzke.github.io/Courses/,
one folder per course in `courses/<folder>/`), which
has its own CLAUDE.md for lesson status, review queues and course versions.
Work on a course's lessons, figures or photos happens there; this repo only
changes when something should be shared by more than one course.

Readers: Rob and his partner. Rob lets threads push straight to `main` here.

## Layout

```
src/<module>.ts     one module each, imported by courses as didactics/<module>;
                    the exports map in package.json is the public interface
                    (test/package.test.ts fails for a module left out)
lib/                compiled copies of the modules that run in Node (vite, offline,
                    course, blocks, code-text, code-scan, scaffold; see
                    tsconfig.lib.json), made by npm run build
bin/                didactics-course: new, export, import, upgrade
styles/             kit.css and friends, themed by CSS custom properties
test/               vitest + happy-dom, one file per module or feature
docs/topics.md      ideas for future courses
README.md           the full guide: modules, lesson JSON, figures, charts,
                    maps, app, tree, review, tests, conventions
CHANGELOG.md        one entry per version
```

Composition, not inheritance: each module is a few functions and types, and
a course passes in what is its own (lessons, figures map, palette, store,
words). Low modules import nothing from the rest (see "How it fits together"
in the README); keep it that way. Plain TypeScript, no framework: DOM from
`el()`/`svg()` in `dom`, drawings in SVG.

What stays in a course, not here: its figures and diagrams, simulations,
subject drawing code, palette and fonts, photos and their pipeline, and all
content. When a piece of course code would help a second course, move it here
as a small module that names neither course.

## Commands

```sh
npm run check     # tsc --noEmit
npm test          # vitest run
npm run build     # recompile lib/ after changing any module listed in tsconfig.lib.json
```

A test fails when `lib/` is stale, so build before committing those.

## Releasing and pinning

1. Change it here, with a test in `test/`. Add or extend a README section for
   anything a course author will call.
2. `npm run build` if a Node-side module changed; `npm run check && npm test`.
3. Bump `version` in package.json (while 0.x, a breaking change to an export
   bumps the minor), add a CHANGELOG entry, push to `main`.
4. Courses pin Didactics once, in the Courses repo's **root** package.json:
   `npm install github:RobertLitzke/Didactics#<full commit sha>` there, then
   its `npm test` and `npm run build`, and push. Pins are commit SHAs because
   cloud sessions cannot push tags (403); Rob tags by hand if he wants.
5. Don't leave a course on an older pin unless a test there fails; fix it.

Breaking a saved field breaks readers' progress: any change to a save key or
shape needs a `migrate` path and a test that an old save loads. Progress is
keyed by lesson id, photo id and figure id, so those never change once
shipped.

## Rules that come from Rob

- **Read the lesson guide** before planning a course or writing, expanding
  or reworking a lesson: https://claude.ai/artifact/9Y8iYVPYjPyk315cFAR8CP
  (Claude Doc, id 4521ebe4-f5e7-4269-abbd-73fa40b15b60), read fresh with the
  Claude Docs tools each time. It is the only copy; don't copy it into a repo.
  New rules Rob gives about lessons go into that doc.
- **No template for a lesson.** Only the end quiz and the 5 to 10 point
  summary are fixed; everything else fits the material. Library code must not
  force a section list.
- **Figures earn their place.** An interactive figure shows cause and effect
  (or behaviour over time), else it is a still. One fixed-height text box per
  figure; guess first when a figure turns on one threshold; a colour means
  the same thing everywhere. Never hide a diagram while the reader works on it.
- **Photos** only from Wikimedia Commons, NOAA, USGS, Flickr under CC, and the
  Seattle Municipal Archives; never the WMO Cloud Atlas. Licences are limited
  to `LICENSES` in `src/photos.ts` (public domain, CC0, CC BY, CC BY-SA).
- Prose in this repo's docs follows the same plain style: no dashes as
  punctuation, no filler words.

## Skills

`.claude/skills/` holds the on-demand procedures for course work, used from
either repo (the Courses repo's copies point here):

- `new-lesson`: write a lesson into a course and take it through the pipeline
- `new-figure`: add a live figure, a still or a chart to a lesson
- `pick-images`: find, license and record photos for a lesson
