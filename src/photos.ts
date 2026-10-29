// The credit half of a course's photo library: the licences a photo may
// carry, the fields every photo needs so it can be credited, the credit line
// under a photo, the Credits page, and the check a content test runs. What a
// photo is of, where it is fetched from and how it is drawn stay in the
// course: a course's photo type extends Photo with its own fields.

import { el, type Child } from './dom';
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
