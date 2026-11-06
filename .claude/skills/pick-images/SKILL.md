---
name: pick-images
description: Find, pick, license and record pictures (photos, paintings, illustrations, silhouettes, reconstructions) for a course lesson on Rob's courses site (allowed sources, photo-picks.json, kinds and changes, the paleoart check, parking blocks for Rob's PC, photos.json credits).
---

# Picking images

Read "Footnotes, encyclopedia and photos" in the lesson guide
(https://claude.ai/artifact/9Y8iYVPYjPyk315cFAR8CP) first; it wins over this.

## Rules

- **Sources**: Wikimedia Commons, PhyloPic (silhouettes), iNaturalist,
  the Biodiversity Heritage Library, Smithsonian Open Access, NOAA, USGS,
  Flickr under a Creative Commons licence, the Seattle Municipal Archives.
  Never the WMO Cloud Atlas, never a source Rob hasn't approved (if a
  course's `photo-search.json` names another, it was approved for that
  course only).
- **Licences**: public domain, CC0, CC BY, CC BY-SA (`LICENSES` in
  Didactics' `src/pictures.ts`). No NonCommercial (common on iNaturalist,
  PhyloPic and in-copyright BHL books), no NoDerivatives: every picture is
  resized and many are cropped. The pipeline reads the licence at download
  and refuses the rest.
- **Kind**: every record says what it is, `kind`: photo, painting,
  illustration (book plates, engravings, artist's impressions), diagram,
  map, silhouette, reconstruction (paleoart), scan. The credit leads with it
  ("Reconstruction: …"), so never call a painting a photo.
- **Changes**: what was done beyond resizing goes in `changes` (cropped,
  recoloured, cut out, labelled…); `crop` and `fill` on a pick add theirs.
  CC BY and BY-SA ask a credit to say so, and the credit line does.
- **Paleoart**: never show a reconstruction Commons' reviewers mark
  inaccurate (Category:Inaccurate paleoart, ~3,200 files, including photos
  of old museum models). The fetch refuses them and `npm run
  pictures:check` flags them. Prefer recent reconstructions or PhyloPic
  silhouettes. An outdated picture shown on purpose, as history, carries
  `"outdated": "<why>"` and the lesson must say it is wrong.
- **Content**: the photo must clearly show what the caption says (Commons
  categories are often wrong); prefer 1200 px wide or more. Some courses
  carry their own limits in `tools/photo-search.json` (Fungi: fungi in nature
  only, no disease or dying trees, no edibles on plates).
- **Ids are permanent**: saves remember photo ids (check answers, review
  cards), so never rename or reuse one.

## Picking

1. Search by file page, category or taxon. For a course with
   `tools/photo-search.json` (Commons `categories` per key, and `sources`
   per key: `{ "amanita": { "inaturalist": "Amanita muscaria", "phylopic":
   "Amanita", "smithsonian": "fly agaric" } }`), `npm run photos:find --
   <course>` writes a contact sheet (`tools/candidates/index.html`).
2. Write each pick into `courses/<course>/tools/photo-picks.json` (the
   pipeline is Didactics' `picture-tools`; its README has the table):
   - Commons: `{ "id": "basalt-columns", "title": "File:….jpg", "about": "…" }`.
   - PhyloPic: `{ "id", "phylopic": "<image uuid>", "about" }`, kept as SVG;
     `"fill": "#hex"` recolours it to the course palette.
   - iNaturalist: `{ "id", "inaturalist": <observation id>, "photo": <photo id> }`.
   - BHL: `{ "id", "bhl": <page id> }` (needs `BHL_API_KEY`, else add
     `license` and `author` read from the book's page).
   - Smithsonian: `{ "id", "smithsonian": "<record id>", "media": "<ids id>" }`
     (CC0 only; `SI_API_KEY` from api.data.gov).
   - Elsewhere (NOAA, USGS, Flickr, the archives): `{ "id", "url" (direct
     image), "page" (the record the licence was read from), "source",
     "author", "license" (a short id such as "PD" or "CC-BY-2.0"), "about" }`.
   - `kind` unless it is a photo (PhyloPic defaults to silhouette, BHL to
     illustration); optional `crop: [left, top, width, height]` in source
     pixels, `changes`; other fields (`subject`, `genus`…) are carried into
     photos.json.
3. Put the photo in the lesson as a block, `{ "type": "diagram", "id":
   "photo", "caption": "…", "options": { "photo": "<id>", "aspect": 1.5 } }`,
   or on a check question.

## Fetching (not from the cloud)

Cloud sessions can't reach Commons reliably, so don't fetch there. Instead:

- Park each photo block whose photo isn't on disk in
  `tools/pending-photos.json` (`{ lesson, part, after, block, search }`,
  `search` a hint for whoever fetches), so the lesson reads fine without it.
- Rob's PC fetches them in a Remote Control session:
  `npm run photos -- <course>` (resizes to 1024 px WebP, or keeps SVG, in
  `public/photos/`, writes the credit with `kind` and `changes` to
  `src/data/photos.json`), then
  `npm run restore-photos -- <course>` puts parked blocks back.
  `npm run restore-photos -- <course> --list` shows what is still waiting.
- In the same session, `npm run pictures:paleoart` refreshes
  `tools/inaccurate-paleoart.json` (the offline list the site test reads).
- Never write `photos.json` by hand except for a file Rob saved himself; it
  must carry `kind`, `author`, `license`, `sourceUrl` and `source`
  (`npm run pictures:check` checks every course).

Afterwards: for a stand-in that is now a real photo, remove its `images`
note from `tools/lesson-status.json`, run `npm run status`, and commit
`docs/status.*` with the change.
