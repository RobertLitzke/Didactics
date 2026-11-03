// What a course keeps on this device for use with no connection, beyond its
// page: its photos, maps and data files. Two caches hold them. The service
// worker's precache has whatever the build listed (vite.ts `precache`: a
// course on its own precaches everything). On a site of several courses the
// site's worker precaches only the pages, and a course's large files are
// saved on request: `saveForOffline` fetches the list the build wrote
// (dist/offline.json, vite.ts offlineList) and puts each file into the
// COURSE_FILES_CACHE, which the worker serves from (the catalog's workbox
// route). Counting both caches is counting what works offline.

/** The cache the site's service worker serves course files from, and saveForOffline fills. */
export const COURSE_FILES_CACHE = 'course-files';

/** The file the build writes next to a course's page, listing its large files for saveForOffline. */
export const OFFLINE_LIST = 'offline.json';

/** The caches that hold a course's files: workbox's precaches and the course-files cache. */
async function holding(): Promise<Cache[]> {
  const names = (await caches.keys()).filter((n) => n.startsWith('workbox-precache') || n === COURSE_FILES_CACHE);
  return Promise.all(names.map((n) => caches.open(n)));
}

/** The paths of every file under `folder` (next to the page) held in either cache. */
export async function savedPaths(folder: string): Promise<Set<string>> {
  const seen = new Set<string>();
  if (typeof caches === 'undefined') return seen;
  const under = new URL(folder, location.href).pathname;
  for (const cache of await holding()) {
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith(under)) seen.add(path);
    }
  }
  return seen;
}

/** The build's list of the course's large files (OFFLINE_LIST next to the page), as paths relative to it. */
export async function offlineFiles(list = OFFLINE_LIST): Promise<string[]> {
  const res = await fetch(new URL(list, location.href));
  if (!res.ok) throw new Error(`${list}: ${res.status}`);
  return (await res.json()) as string[];
}

/** The pathnames of every file held in either cache. */
async function heldPaths(): Promise<Set<string>> {
  const have = new Set<string>();
  for (const c of await holding()) for (const req of await c.keys()) have.add(new URL(req.url).pathname);
  return have;
}

/**
 * How many of `files` (paths relative to the page, as offlineFiles gives
 * them) are saved in either cache. Each course counts its own list, so on a
 * site of several courses sharing one service worker the counts stay apart.
 */
export async function savedCount(files: readonly string[]): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const have = await heldPaths();
  return files.filter((f) => have.has(new URL(f, location.href).pathname)).length;
}

export interface SaveProgress {
  /** Files saved so far, counting those that were there already. */
  saved: number;
  total: number;
}

/**
 * Save every file in the course's list (OFFLINE_LIST next to the page) into
 * the course-files cache, skipping those already held, and report progress
 * after each. Stops when `signal` aborts. Resolves to how many are saved.
 */
export async function saveForOffline(onProgress: (p: SaveProgress) => void, signal?: AbortSignal, list = OFFLINE_LIST): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const files = await offlineFiles(list);
  const cache = await caches.open(COURSE_FILES_CACHE);
  const have = await heldPaths();
  let saved = 0;
  const total = files.length;
  for (const f of files) {
    if (signal?.aborted) break;
    const url = new URL(f, location.href);
    if (!have.has(url.pathname)) {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      await cache.put(url, r);
    }
    saved++;
    onProgress({ saved, total });
  }
  return saved;
}

/** Drop `files` (paths relative to the page) from the course-files cache (the precache is the worker's own). */
export async function forgetOffline(files: readonly string[]): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(COURSE_FILES_CACHE);
  for (const f of files) await cache.delete(new URL(f, location.href).href);
}

/**
 * Deletes caches an older version kept, such as one that held each photo once
 * seen, but only once every one of `files` is saved, so nothing that worked
 * offline stops working.
 */
export async function retireWhenSaved(files: readonly string[], names: string[]): Promise<void> {
  if (typeof caches === 'undefined' || (await savedCount(files)) < files.length) return;
  for (const name of names) await caches.delete(name);
}
