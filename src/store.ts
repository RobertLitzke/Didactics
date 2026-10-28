// Progress and settings, in localStorage. All shaping and repair of the data
// is the app's `migrate` (see progress.ts for the part every lesson app
// shares); this file only moves the blob.

export interface Store<S> {
  get: () => S;
  set: (save: S) => void;
  update: (change: (save: S) => S) => S;
  /** The save as a JSON file's text. */
  exportText: () => string;
  /** Replace everything with an exported file's contents. Returns false if it is not one. */
  importText: (text: string) => boolean;
}

export interface StoreOptions<S> {
  /** The localStorage key, such as "clouds.save". */
  key: string;
  empty: () => S;
  /** Repair whatever was stored into a valid save, keeping all that can be kept. */
  migrate: (raw: unknown) => S;
}

export function createStore<S>({ key, empty, migrate }: StoreOptions<S>): Store<S> {
  let cache: S | null = null;

  const get = (): S => {
    if (cache) return cache;
    try {
      const text = localStorage.getItem(key);
      cache = text ? migrate(JSON.parse(text)) : empty();
    } catch {
      // Storage blocked (a private window) or the blob is not JSON: play on
      // without it rather than fail to load.
      cache = empty();
    }
    return cache;
  };

  const set = (save: S): void => {
    cache = save;
    try {
      localStorage.setItem(key, JSON.stringify(save));
    } catch {
      // Nothing useful to do; the session keeps working from the cache.
    }
  };

  return {
    get,
    set,
    update: (change) => {
      const next = change(get());
      set(next);
      return next;
    },
    exportText: () => JSON.stringify(get(), null, 2),
    importText: (text) => {
      try {
        const raw: unknown = JSON.parse(text);
        if (typeof raw !== 'object' || raw === null || !('v' in raw)) return false;
        set(migrate(raw));
        return true;
      } catch {
        return false;
      }
    },
  };
}
