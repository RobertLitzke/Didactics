// @vitest-environment happy-dom
// The settings page (settings.ts): the name, moving progress as a file, the
// Offline section's count and buttons, a course's own sections, and erasing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { el } from '../src/dom';
import { COURSE_FILES_CACHE } from '../src/offline';
import { emptyProgress, migrateProgress, type Progress } from '../src/progress';
import { settingsView } from '../src/settings';
import { createStore } from '../src/store';

const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (sel: string) => [...document.querySelectorAll(sel)].map((n) => n.textContent);
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;

function render(extra: Partial<Parameters<typeof settingsView<Progress>>[0]> = {}) {
  localStorage.clear();
  document.body.innerHTML = '<main></main>';
  const store = createStore<Progress>({ key: 'skies.save', empty: emptyProgress, migrate: migrateProgress });
  store.update((s) => ({ ...s, name: 'Rob' }));
  const view = settingsView({ store, empty: emptyProgress, appName: 'Skies', saveFile: 'skies-save.json', ...extra });
  view(document.querySelector("main")!, { params: {}, navigate: () => {}, replace: () => {} });
  return store;
}

describe('settingsView', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', () => true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the name and the progress buttons, and a course\'s own sections between them and About', () => {
    render({ sections: el('h2', {}, 'Course text'), about: el('p', {}, 'Version 1') });
    expect(document.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe('Rob');
    expect(text('h2')).toEqual(['Progress', 'Course text', 'About']);
    expect(text('.row .btn')).toEqual(['Save to file', 'Load from file']);
  });

  it('keeps a changed name, and erases everything on the red button', () => {
    const store = render();
    const name = document.querySelector<HTMLInputElement>('input[type=text]')!;
    name.value = ' Ann ';
    name.dispatchEvent(new Event('change'));
    expect(store.get().name).toBe('Ann');
    button('Erase progress').click();
    expect(store.get()).toEqual(emptyProgress());
  });

  it('offers to save the photos for offline, counting those already held', async () => {
    const held = new Map<string, Response>();
    const cache = {
      keys: async () => [...held.keys()].map((u) => new Request(u)),
      put: async (req: URL, res: Response) => void held.set(req.href, res),
      delete: async (req: Request | string) => held.delete(typeof req === 'string' ? req : req.url),
    };
    vi.stubGlobal('caches', { keys: async () => [COURSE_FILES_CACHE], open: async () => cache });
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    vi.stubGlobal('fetch', async (input: URL | string) => {
      const url = String(input instanceof URL ? input.href : input);
      return url.endsWith('offline.json') ? new Response(JSON.stringify(['photos/a.jpg', 'photos/b.jpg'])) : new Response('pic');
    });
    render({ offline: { noun: 'photos' } });
    await settle();
    expect(text('h2')).toEqual(['Progress', 'Offline']);
    const line = document.querySelector('.settings progress + p')!;
    expect(line.textContent).toBe('The photos are fetched as you read. Save them all to read with no connection.');
    const save = button('Save the photos for offline');
    const forget = button('Remove them from this device');
    expect(save.hidden).toBe(false);
    expect(forget.hidden).toBe(true);
    save.click();
    await settle();
    expect(held.size).toBe(2);
    expect(line.textContent).toBe('All 2 photos are saved on this device. The app works with no connection.');
    expect(save.hidden).toBe(true);
    expect(forget.hidden).toBe(false);
    forget.click();
    await settle();
    expect(held.size).toBe(0);
    expect(forget.hidden).toBe(true);
  });
});
