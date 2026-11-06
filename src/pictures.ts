// What a course's picture record is, with no DOM and no network, so that the
// app (didactics/photos), the content tests and the picture tools in Node
// (didactics/picture-sources, didactics/picture-tools) all read it the same
// way.
//
// A record says what kind of picture it is (a photograph, a painting, a
// silhouette, a reconstruction of an extinct animal, ...), who made it,
// under which licence, where it came from, and what was done to it on the
// way into the course (cropped, recoloured, ...), which the attribution
// licences ask a credit to say.

/**
 * Licences a picture may carry. Public domain and the attribution licences
 * only: no NonCommercial (a course could one day be shared widely), and no
 * NoDerivatives, because every picture is resized and many are cropped.
 */
export const LICENSES = {
  'PD': { name: 'Public domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
  'CC0': { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC-BY-2.0': { name: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/' },
  'CC-BY-3.0': { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'CC-BY-SA-2.0': { name: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  'CC-BY-SA-3.0': { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  'CC-BY-SA-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
} as const;

export type LicenseId = keyof typeof LICENSES;

export function isLicenseId(value: string): value is LicenseId {
  return Object.hasOwn(LICENSES, value);
}

/**
 * The licence id for a licence as a source spells it, or null when it is not
 * one the courses accept. Reads Commons' short names ("CC BY-SA 4.0", "Public
 * domain", "PD-USGov"), Creative Commons URLs (PhyloPic, BHL), iNaturalist's
 * codes ("cc-by-sa", always version 4.0 there) and the ids themselves.
 * NonCommercial, NoDerivatives, GFDL-only, version 2.5 and anything unclear
 * are refused.
 */
export function licenceFrom(text: string | null | undefined): LicenseId | null {
  const s = (text ?? '').trim().toLowerCase();
  if (!s) return null;
  if (isLicenseId(text!.trim())) return text!.trim() as LicenseId;
  const url = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/.exec(s);
  if (url) {
    if (url[1] === 'publicdomain') return url[2] === 'zero' ? 'CC0' : url[2] === 'mark' ? 'PD' : null;
    return ccId(url[2], url[3]);
  }
  if (s === 'public domain' || s.startsWith('public domain') || s.startsWith('pd') || s === 'no restrictions' || s === 'no known copyright restrictions') return 'PD';
  if (s === 'cc0' || s.startsWith('cc0 ') || s.startsWith('cc-zero')) return 'CC0';
  const inat = /^cc-(by(?:-sa)?)$/.exec(s);
  if (inat) return ccId(inat[1], '4.0');
  const m = /^cc[ -](by(?:-sa)?)[ -](\d\.\d)$/.exec(s);
  if (m) return ccId(m[1], m[2]);
  return null;
}

function ccId(kind: string, version: string): LicenseId | null {
  const id = `CC-${kind.toUpperCase()}-${version}`;
  return isLicenseId(id) ? id : null;
}

/**
 * The kinds of picture, and the word a credit line starts with for each.
 * A course says which kind each picture is, because the reader should know
 * a reconstruction from a photograph, and an engraving from a diagram.
 */
export const KINDS = {
  /** A photograph of the thing itself. */
  photo: 'Photo',
  /** A painting, print or engraving made as art, often historical. */
  painting: 'Painting',
  /** A drawing made to show something: a book plate, a naturalist's sketch, an artist's impression. */
  illustration: 'Illustration',
  /** A diagram, chart or figure from a paper. */
  diagram: 'Diagram',
  /** A map. */
  map: 'Map',
  /** A silhouette of an organism (PhyloPic). */
  silhouette: 'Silhouette',
  /** A life reconstruction of an extinct animal or plant (paleoart): checked against Commons' inaccurate-paleoart list. */
  reconstruction: 'Reconstruction',
  /** A scan of a page, a specimen sheet or a document, shown as the thing it is. */
  scan: 'Scan',
} as const;

export type PictureKind = keyof typeof KINDS;

export const isKind = (k: unknown): k is PictureKind => typeof k === 'string' && Object.hasOwn(KINDS, k);

/**
 * The changes a picture may have had on its way into a course, as a credit
 * says them. Resizing and re-encoding are not listed: every picture has them.
 * A change outside this list may be written in plain words ("labels added
 * in English"), starting lower-case, since the credit runs it on.
 */
export const CHANGES = ['cropped', 'recoloured', 'cut out', 'retouched', 'rotated', 'straightened', 'labelled', 'traced', 'combined', 'mirrored'] as const;

/** What every picture carries, so it can be shown and credited. */
export interface Picture {
  /** Stable id, such as cumulus-01: lower-case letters, digits and dashes. Saves remember it. */
  id: string;
  /** What sort of picture it is (KINDS). */
  kind: PictureKind;
  width: number;
  height: number;
  author: string;
  license: LicenseId;
  /** The page the picture came from, for the credit link and to read its licence again. */
  sourceUrl: string;
  /** Where it came from, by name: Wikimedia Commons, NOAA, PhyloPic. */
  source: string;
  /** What was done to it beyond resizing (CHANGES, or plain words), for the credit. */
  changes?: string[];
  /**
   * Set, with the reason, on a picture shown as out of date on purpose: a
   * Crystal Palace dinosaur in a lesson on how ideas changed. Such a picture
   * passes the inaccurate-paleoart check; the lesson must say it is wrong.
   */
  outdated?: string;
}

/**
 * What is wrong with a record's own fields, or an empty list. A course adds
 * the checks for its own fields (what the picture is of).
 */
export function pictureProblems(p: Partial<Picture>): string[] {
  const out: string[] = [];
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) out.push('id must be lower-case letters, digits and dashes');
  if (!isKind(p.kind)) out.push(p.kind === undefined ? 'no kind (photo, painting, illustration, ...): run didactics-pictures migrate' : `unknown kind ${p.kind}`);
  if (!p.author?.trim()) out.push('no author');
  if (!p.license || !isLicenseId(p.license)) out.push(`licence ${p.license} is not allowed`);
  if (!p.sourceUrl?.startsWith('https://')) out.push('no https source link');
  if (!p.source?.trim()) out.push('no source name');
  if (!(p.width! > 0 && p.height! > 0)) out.push('no size');
  if (p.outdated !== undefined && !(typeof p.outdated === 'string' && p.outdated.trim())) out.push('outdated should say why the picture is shown anyway');
  if (p.changes !== undefined) {
    if (!Array.isArray(p.changes) || !p.changes.length) out.push('changes should be a list of words, or left out');
    else for (const c of p.changes) if (typeof c !== 'string' || !/^[a-z]/.test(c.trim())) out.push(`change "${c}" should be words starting lower-case`);
  }
  return out;
}

/** The changes as a credit says them: "cropped, recoloured", or ''. */
export const changesText = (p: Pick<Picture, 'changes'>): string => (p.changes ?? []).join(', ');

/** "Photo: ", "Silhouette: ": what a credit line starts with. */
export const creditLead = (p: Partial<Pick<Picture, 'kind'>>): string => `${KINDS[isKind(p.kind) ? p.kind : 'photo']}: `;

/**
 * A record in the old photo shape, brought up to a picture: `kind` set
 * (default photo, or `guess` when given), a `crop` the fetch tool applied
 * recorded as the change "cropped". Records that already have a kind come
 * back as they were. Nothing else moves, so ids and every course field stay.
 */
export function migratePicture<T extends Record<string, unknown>>(record: T, guess?: PictureKind): T & { kind: PictureKind } {
  if (isKind(record.kind)) return record as T & { kind: PictureKind };
  const { crop, ...rest } = record as T & { crop?: unknown };
  const changes = [...((record.changes as string[] | undefined) ?? [])];
  if (crop && !changes.includes('cropped')) changes.push('cropped');
  // kind goes after id so the files read in a sensible order.
  const { id, ...others } = rest as Record<string, unknown>;
  return { id, kind: guess ?? 'photo', ...others, ...(changes.length ? { changes } : {}) } as unknown as T & { kind: PictureKind };
}

/** The file title a Commons page URL names ("File:Foo bar.jpg"), or null for any other page. */
export function commonsTitle(url: string | undefined): string | null {
  const m = /^https?:\/\/commons\.(?:m\.)?wikimedia\.org\/wiki\/(File:[^?#]+)/.exec(url ?? '');
  return m ? normalTitle(decodeURIComponent(m[1])) : null;
}

/** A Commons title as the API spells it: spaces, not underscores, and a capital first letter after File:. */
export function normalTitle(title: string): string {
  const t = title.replace(/_/g, ' ').trim();
  const name = t.replace(/^file:/i, '');
  return `File:${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * A list of Commons files that its paleoart reviewers have marked inaccurate
 * (Category:Inaccurate paleoart and the files tagged {{Inaccurate paleoart}}),
 * as `didactics-pictures paleoart` saves it.
 */
export interface PaleoartList {
  /** When it was read from Commons (ISO date). */
  fetched: string;
  /** Where it was read from. */
  from: string[];
  /** File titles, normalised ("File:Foo bar.jpg"). */
  files: string[];
}

/**
 * The records whose Commons file is on the inaccurate-paleoart list, with the
 * reason to show. Any kind is checked (a photo of an old museum model misleads
 * as much as a painting); a record marked `outdated` is shown so on purpose.
 */
export function paleoartFlags<P extends Pick<Picture, 'id' | 'sourceUrl'> & { outdated?: string }>(records: readonly P[], list: PaleoartList): { id: string; title: string; problem: string }[] {
  const bad = new Set(list.files.map(normalTitle));
  const out: { id: string; title: string; problem: string }[] = [];
  for (const r of records) {
    const title = commonsTitle(r.sourceUrl);
    if (title && bad.has(title) && !r.outdated) out.push({ id: r.id, title, problem: `${title} is on Commons' inaccurate-paleoart list (read ${list.fetched}): pick another, or mark it outdated with the reason` });
  }
  return out;
}
