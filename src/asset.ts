// Where the files that are not inlined (photos, a poster) come from. On the
// site they sit next to the page, and the service worker keeps a copy of each.
// A downloaded copy of the page opened from disk has nothing next to it, so it
// fetches them from the site instead, and shows them whenever the phone is
// online. The bigger offline copy (vite.ts offlineCopy) carries them inside.

/** True when the page was opened from a file rather than from a web server. */
export const fromDisk = typeof location !== 'undefined' && !location.protocol.startsWith('http');

/** The files the offline copy carries, by path, as data URIs. */
const inlined: Record<string, string> | undefined = (globalThis as { __LESSON_FILES__?: Record<string, string> }).__LESSON_FILES__;

/** True in the offline copy: every photo is inside the page. */
export const selfContained = inlined !== undefined;

/** A resolver for paths next to the page, falling back to `siteUrl` (ending in /) when opened from disk. */
export function assetFrom(siteUrl: string): (path: string) => string {
  return (path) => inlined?.[path] ?? (fromDisk ? siteUrl + path : path);
}
