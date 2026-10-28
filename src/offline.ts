// How much of a folder of large files (photos) the service worker has saved on
// this device. It downloads them all when it installs (vite.ts precache), into
// workbox's precache, so counting that cache is counting what works offline.

/** The paths under `folder` (such as "photos/") held in the precache. */
export async function savedCount(folder: string): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const seen = new Set<string>();
  for (const name of await caches.keys()) {
    if (!name.startsWith('workbox-precache')) continue;
    for (const req of await (await caches.open(name)).keys()) {
      const path = new URL(req.url).pathname;
      if (path.includes(`/${folder}`)) seen.add(path);
    }
  }
  return seen.size;
}

/**
 * Deletes caches an older version kept, such as one that held each photo once
 * seen, but only once all `total` files are in the precache, so nothing that
 * worked offline stops working.
 */
export async function retireWhenSaved(folder: string, total: number, names: string[]): Promise<void> {
  if (typeof caches === 'undefined' || (await savedCount(folder)) < total) return;
  for (const name of names) await caches.delete(name);
}
