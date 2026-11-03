// Keeps a page of lessons scrolled where the reader left it. Going into a
// lesson and back out, finishing one, the browser's back button or a reload
// all bring the list back to the same place, rather than to its top.
//
// The place is the lesson whose link was followed and where it sat on the
// screen, so a list that has grown or shifted above it (a branch opened, a
// lesson ticked off) still comes back with that lesson where the reader saw
// it. Failing that, the page's scroll offset. Kept in sessionStorage: for
// this tab, gone when it closes.
//
//   const forget = keepPlace(root, 'clouds.home-place');
//   return () => forget();   // the view's teardown
//
// Each lesson on the page carries `data-lesson="<id>"` (treeView and
// lessonGo's cards do); a link inside one marks that lesson as the place.

interface Place {
  y: number;
  /** The lesson whose link was followed, and its top on the screen then. */
  lesson?: string;
  top?: number;
}

function read(key: string): Place | undefined {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (typeof v !== 'object' || v === null) return undefined;
    const p = v as Record<string, unknown>;
    return {
      y: Number(p.y) || 0,
      lesson: typeof p.lesson === 'string' ? p.lesson : undefined,
      top: typeof p.top === 'number' ? p.top : undefined,
    };
  } catch {
    return undefined;
  }
}

function write(key: string, place: Place): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(place));
  } catch {
    // Storage blocked: the list opens at its top.
  }
}

const lessonEl = (root: HTMLElement, id: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-lesson]')].find((e) => e.dataset.lesson === id && e.offsetParent !== null);

/** Scroll to the place kept under `key`. True if there was one. */
export function restorePlace(root: HTMLElement, key: string): boolean {
  const p = read(key);
  if (!p) return false;
  const target = p.lesson ? lessonEl(root, p.lesson) : undefined;
  if (target && p.top !== undefined) {
    const box = target.getBoundingClientRect();
    window.scrollTo(0, Math.max(0, window.scrollY + box.top - p.top));
    // Make sure it is on the screen, whatever moved.
    const after = target.getBoundingClientRect();
    if (after.top < 0 || after.bottom > window.innerHeight) target.scrollIntoView({ block: 'center' });
  } else window.scrollTo(0, p.y);
  return true;
}

/**
 * Bring the page back to where it was left, and keep track of where it is
 * left next. Call once the view is on the page; call what it returns from the
 * view's teardown.
 */
export function keepPlace(root: HTMLElement, key: string): () => void {
  let lesson: string | undefined;
  let top: number | undefined;
  const closed = new AbortController();
  const save = () => write(key, { y: window.scrollY, lesson, top });

  const restore = () => {
    const before = window.scrollY;
    restorePlace(root, key);
    return before;
  };
  restore();
  // Once more after the first paint, unless the reader has scrolled meanwhile:
  // fonts and drawings may have changed the heights.
  let settled = window.scrollY;
  requestAnimationFrame(() => {
    if (!closed.signal.aborted && window.scrollY === settled) {
      restore();
      settled = window.scrollY;
    }
  });

  root.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href]');
    if (!link || !root.contains(link)) return;
    const card = link.closest<HTMLElement>('[data-lesson]');
    lesson = card?.dataset.lesson;
    top = card ? card.getBoundingClientRect().top : undefined;
    save();
  }, { capture: true, signal: closed.signal });
  // A reload or the app going away.
  window.addEventListener('pagehide', save, { signal: closed.signal });

  return () => {
    if (closed.signal.aborted) return;
    save();
    closed.abort();
  };
}
