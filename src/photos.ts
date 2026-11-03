// The credit half of a course's photo library: the licences a photo may
// carry, the fields every photo needs so it can be credited, the credit line
// under a photo, the Credits page, and the check a content test runs. What a
// photo is of, where it is fetched from and how it is drawn stay in the
// course: a course's photo type extends Photo with its own fields.

import { el, type Child } from './dom';
import type { FigureContext, FigureFactory, FigureHandle, Options } from './figure';
import type { View } from './router';

/**
 * Licences a photo may carry. Public domain and the attribution licences
 * only: no NonCommercial (a course could one day be shared widely), and no
 * NoDerivatives, because every photo is resized and cropped.
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

/** What every photo carries, so it can be shown and credited. */
export interface Photo {
  /** Stable id, such as cumulus-01: lower-case letters, digits and dashes. */
  id: string;
  width: number;
  height: number;
  author: string;
  license: LicenseId;
  /** The page the photo came from, for the credit link. */
  sourceUrl: string;
  /** Where it came from, by name: Wikimedia Commons, NOAA. */
  source: string;
}

/**
 * What is wrong with an entry's credit fields, or an empty list. A course
 * adds the checks for its own fields (what the photo is of).
 */
export function photoProblems(p: Partial<Photo>): string[] {
  const out: string[] = [];
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) out.push('id must be lower-case letters, digits and dashes');
  if (!p.author?.trim()) out.push('no author');
  if (!p.license || !isLicenseId(p.license)) out.push(`licence ${p.license} is not allowed`);
  if (!p.sourceUrl?.startsWith('https://')) out.push('no https source link');
  if (!p.source?.trim()) out.push('no source name');
  if (!(p.width! > 0 && p.height! > 0)) out.push('no size');
  return out;
}

const link = (href: string, text: string) => el('a', { href, target: '_blank', rel: 'noopener' }, text);

/** The line under a photo: "Photo: author · licence · source", linked. */
export function credit(p: Photo, lead = 'Photo: '): HTMLElement {
  const lic = LICENSES[p.license];
  return el('p.credit', {}, lead, link(p.sourceUrl, p.author), ' · ', link(lic.url, lic.name), ` · ${p.source}`);
}

export interface PhotoFigureOptions {
  /** Default: what the photo is `about`, when its record says. */
  alt?: string;
  /** Flips the picture, never the credit. */
  mirrored?: boolean;
  /** Crop to this width / height; the course's --photo-aspect otherwise. */
  aspect?: number;
  /** Where the crop sits, as CSS object-position ("50% 20%"). */
  position?: string;
  /** `lazy` for photos far down a lesson; default eager. */
  loading?: 'lazy' | 'eager';
}

/**
 * A photo with its credit under it: figure.photo > img + figcaption > p.credit,
 * styled by kit.css. `src` is the picture's URL, which the course resolves
 * (didactics/asset), since only it knows where its photos live.
 */
export function photoFigure(p: Photo & { about?: string }, src: string, o: PhotoFigureOptions = {}): HTMLElement {
  const img = el('img', { src, alt: o.alt ?? p.about ?? '', width: p.width, height: p.height, decoding: 'async', loading: o.loading, className: o.mirrored ? 'mirrored' : undefined }) as HTMLImageElement;
  if (o.aspect) img.style.aspectRatio = String(o.aspect);
  if (o.position) img.style.objectPosition = o.position;
  return el('figure.photo', {}, img, el('figcaption', {}, credit(p)));
}

/** What a course gives `stillPhoto`: how to find a photo by id and where its file is. */
export interface PhotoLibrary<P extends Photo> {
  find: (id: string) => P | undefined;
  src: (p: P) => string;
}

const stillProblems = <P extends Photo>(lib: PhotoLibrary<P>) => (o: Options | undefined): string[] => {
  if (!o || typeof o.photo !== 'string') return ['needs "photo", a photo id'];
  const out = lib.find(o.photo) ? [] : [`no photo "${o.photo}"`];
  if (o.aspect !== undefined && !(typeof o.aspect === 'number' && o.aspect > 0)) out.push('"aspect" should be width / height');
  if (o.position !== undefined && typeof o.position !== 'string') out.push('"position" should be a CSS object-position');
  return out;
};

/**
 * The figure that shows one photo from the course's library, by id, with its
 * credit: `{ "type": "diagram", "id": "photo", "options": { "photo": "causeway",
 * "aspect": 1.5 } }`. Each block is its own picture, so a gallery shows them all.
 */
export function stillPhoto<P extends Photo & { about?: string }>(lib: PhotoLibrary<P>): FigureFactory {
  const make = (_ctx: FigureContext, _goal?: string, o?: Options): FigureHandle => {
    const p = lib.find(String(o?.photo));
    const node = p
      ? photoFigure(p, lib.src(p), { alt: typeof o?.alt === 'string' ? o.alt : undefined, aspect: o?.aspect as number | undefined, position: o?.position as string | undefined, loading: 'lazy' })
      : el('p.fig-readout', {}, `No photo "${String(o?.photo)}".`);
    return { node: el('div.fig-body.fig-still', {}, node) };
  };
  return Object.assign(make, { options: stillProblems(lib), each: true as const });
}

export interface CreditsViewOptions<P extends Photo> {
  photos: readonly P[];
  /** What the photo is of, in bold at the head of its line ("Cumulus"); left out, the line starts with the author. */
  name?: (p: P) => Child;
  /** Before the photos: what else the course owes and to whom. */
  intro?: Child;
  /** After the photos: type, sounds, the version. */
  after?: Child;
  /** Shown when there are no photos yet. */
  empty?: string;
  /** Default "Credits". */
  title?: string;
}

/** The Credits page: every photo with its author, licence and source. */
export function creditsView<P extends Photo>(o: CreditsViewOptions<P>): View {
  return (root) => {
    const line = (p: P) => {
      const lic = LICENSES[p.license];
      const name = o.name?.(p);
      return el('li', {}, name != null ? [el('b', {}, name), ' by '] : 'By ', link(p.sourceUrl, p.author), ', ', link(lic.url, lic.name), `, via ${p.source}`);
    };
    root.append(
      el(
        'div.page.credits',
        {},
        el('h1', {}, o.title ?? 'Credits'),
        o.intro,
        el('h2', {}, 'Photos'),
        o.photos.length ? el('ul.credit-list', {}, o.photos.map(line)) : el('p.muted', {}, o.empty ?? 'No photos yet.'),
        o.after,
      ),
    );
  };
}
