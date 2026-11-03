// @vitest-environment happy-dom
// What a course keeps for offline (offline.ts): counting the files held in
// workbox's precache and the course-files cache, saving the build's list into
// the latter on request, and letting them go.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COURSE_FILES_CACHE, forgetOffline, offlineFiles, retireWhenSaved, saveForOffline, savedCount, savedPaths } from '../src/offline';

/** A CacheStorage of plain maps, enough for offline.ts. */
function fakeCaches(initial: Record<string, string[]>) {
  const store = new Map<string, Map<string, Response>>();
  for (const [name, urls] of Object.entries(initial)) store.set(name, new Map(urls.map((u) => [new URL(u, location.href).href, new Response('x')])));
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      put: async (req: Request | URL | string, res: Response) => void m.set(new URL(req instanceof Request ? req.url : String(req), location.href).href, res),
      delete: async (req: Request | string) => m.delete(typeof req === 'string' ? req : req.url),
    } as unknown as Cache;
  };
  return { keys: async () => [...store.keys()], open, store } as unknown as CacheStorage & { store: typeof store };
}

describe('offline.ts', () => {
  const fetchSpy = vi.fn<typeof fetch>();
  beforeEach(() => {
    history.replaceState(null, '', '/site/clouds/');
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('counts the listed files held in either cache, and only this course\'s', async () => {
    vi.stubGlobal('caches', fakeCaches({
      'workbox-precache-v2-https://x/': ['photos/a.jpg', 'index.html', '/site/geology/photos/z.jpg'],
      [COURSE_FILES_CACHE]: ['photos/b.jpg', 'photos/a.jpg', 'maps/m.png'],
      'old-photos': ['photos/c.jpg'],
    }));
    expect(await savedCount(['photos/a.jpg', 'photos/b.jpg', 'photos/c.jpg', 'photos/z.jpg'])).toBe(2);
    expect(await savedCount(['maps/m.png', 'maps/n.png'])).toBe(1);
    expect([...(await savedPaths('maps/'))]).toEqual(['/site/clouds/maps/m.png']);
  });

  it('reads the list the build wrote, and fails loudly without it', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input instanceof URL ? input.href : input);
      return url.endsWith('/site/clouds/offline.json') ? new Response(JSON.stringify(['photos/a.jpg'])) : new Response('', { status: 404 });
    });
    expect(await offlineFiles()).toEqual(['photos/a.jpg']);
    await expect(offlineFiles('other.json')).rejects.toThrow('other.json: 404');
  });

  it('saves the files the build listed that are not held yet, reporting as it goes', async () => {
    const caches = fakeCaches({ 'workbox-precache-v2': ['photos/a.jpg'] });
    vi.stubGlobal('caches', caches);
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input instanceof URL ? input.href : input);
      if (url.endsWith('offline.json')) return new Response(JSON.stringify(['photos/a.jpg', 'photos/b.jpg', 'maps/m.png']));
      return new Response(`file ${url}`);
    });
    const seen: number[] = [];
    const saved = await saveForOffline((p) => seen.push(p.saved));
    expect(saved).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
    // a.jpg was already in the precache: not fetched again.
    const fetched = fetchSpy.mock.calls.map((c) => String(c[0] instanceof URL ? c[0].pathname : c[0]));
    expect(fetched.filter((u) => !u.endsWith('offline.json'))).toEqual(['/site/clouds/photos/b.jpg', '/site/clouds/maps/m.png']);
    expect([...caches.store.get(COURSE_FILES_CACHE)!.keys()].map((u) => new URL(u).pathname)).toEqual(['/site/clouds/photos/b.jpg', '/site/clouds/maps/m.png']);
    expect(await savedCount(['photos/a.jpg', 'photos/b.jpg', 'maps/m.png'])).toBe(3);
  });

  it('stops when told to, and fails loudly when a file cannot be fetched', async () => {
    vi.stubGlobal('caches', fakeCaches({}));
    const ctl = new AbortController();
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input instanceof URL ? input.href : input);
      if (url.endsWith('offline.json')) return new Response(JSON.stringify(['photos/a.jpg', 'photos/b.jpg']));
      return url.endsWith('b.jpg') ? new Response('', { status: 404 }) : new Response('a');
    });
    await expect(saveForOffline(() => {}, ctl.signal)).rejects.toThrow('photos/b.jpg: 404');
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify(['photos/a.jpg', 'photos/b.jpg'])));
    const stopped = new AbortController();
    stopped.abort();
    expect(await saveForOffline(() => {}, stopped.signal)).toBe(0);
  });

  it('forgets only the files asked for, and only from the course-files cache', async () => {
    const caches = fakeCaches({ 'workbox-precache-v2': ['photos/a.jpg'], [COURSE_FILES_CACHE]: ['photos/a.jpg', 'photos/b.jpg', 'maps/m.png'] });
    vi.stubGlobal('caches', caches);
    await forgetOffline(['photos/a.jpg', 'photos/b.jpg']);
    expect([...caches.store.get(COURSE_FILES_CACHE)!.keys()].map((u) => new URL(u).pathname)).toEqual(['/site/clouds/maps/m.png']);
    expect(await savedCount(['photos/a.jpg', 'photos/b.jpg'])).toBe(1);
  });

  it('retires an older cache only once every listed file is saved', async () => {
    const caches = fakeCaches({ 'workbox-precache-v2': ['photos/a.jpg'], old: ['photos/x.jpg'] });
    const dropped: string[] = [];
    (caches as unknown as { delete: (n: string) => Promise<boolean> }).delete = async (n) => (dropped.push(n), true);
    vi.stubGlobal('caches', caches);
    await retireWhenSaved(['photos/a.jpg', 'photos/b.jpg'], ['old']);
    expect(dropped).toEqual([]);
    await retireWhenSaved(['photos/a.jpg'], ['old']);
    expect(dropped).toEqual(['old']);
  });
});
