---
name: pick-images
description: Find, pick, license and record photos for a course lesson on Rob's courses site (allowed sources, photo-picks.json, parking blocks for Rob's PC, photos.json credits).
---

# Picking images

Read "Footnotes, encyclopedia and photos" in the lesson guide
(https://claude.ai/artifact/9Y8iYVPYjPyk315cFAR8CP) first; it wins over this.

## Rules

- **Sources**: Wikimedia Commons, NOAA, USGS, Flickr under a Creative Commons
  licence, the Seattle Municipal Archives. Never the WMO Cloud Atlas, never
  a source Rob hasn't approved (if a course's `photo-search.json` names
  another, it was approved for that course only).
- **Licences**: public domain, CC0, CC BY, CC BY-SA (the `LICENSES` list in
  Didactics' `src/photos.ts`). No NonCommercial, no NoDerivatives: every
  photo is resized and cropped.
- **Content**: the photo must clearly show what the caption says (Commons
  categories are often wrong); prefer 1200 px wide or more. Some courses
  carry their own limits in `tools/photo-search.json` (Fungi: fungi in nature
  only, no disease or dying trees, no edibles on plates).
- **Ids are permanent**: saves remember photo ids (check answers, review
  cards), so never rename or reuse one.

## Picking

1. Search Commons by file page or category. For a course with
   `tools/photo-search.json`, `npm run photos:find -- <course>` writes a
   contact sheet (`tools/candidates/index.html`) to pick from.
2. Write each pick into `courses/<course>/tools/photo-picks.json`:
   - Commons: `{ "id": "basalt-columns", "title": "File:….jpg", "about": "…" }`;
     the licence and author are read at download and refused if not allowed.
   - Elsewhere (NOAA, USGS, Flickr, the archives): `{ "id", "url" (direct
     image), "page" (the record the licence was read from), "source",
     "author", "license" (a short id such as "PD" or "CC-BY-2.0"), "about" }`.
   - Optional `crop: [left, top, width, height]` in source pixels for scan
     borders; other fields (`subject`, `genus`…) are carried into photos.json.
3. Put the photo in the lesson as a block, `{ "type": "diagram", "id":
   "photo", "caption": "…", "options": { "photo": "<id>", "aspect": 1.5 } }`,
   or on a check question.

## Fetching (not from the cloud)

Cloud sessions can't reach Commons reliably, so don't fetch there. Instead:

- Park each photo block whose photo isn't on disk in
  `tools/pending-photos.json` (`{ lesson, part, after, block, search }`,
  `search` a hint for whoever fetches), so the lesson reads fine without it.
- Rob's PC fetches them in a Remote Control session:
  `npm run photos -- <course>` (resizes to 1024 px WebP in
  `public/photos/`, writes the credit to `src/data/photos.json`), then
  `npm run restore-photos -- <course>` puts parked blocks back.
  `npm run restore-photos -- <course> --list` shows what is still waiting.
- Never write `photos.json` by hand except for a file Rob saved himself; it
  must carry `author`, `license`, `sourceUrl` and `source`.

Afterwards: for a stand-in that is now a real photo, remove its `images`
note from `tools/lesson-status.json`, run `npm run status`, and commit
`docs/status.*` with the change.
