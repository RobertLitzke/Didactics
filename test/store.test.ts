// @vitest-environment happy-dom
// The save in localStorage (store.ts): read once, repaired by the course's
// migrate, written on every change, moved as a file, and read again when
// another page of the site changes it.

import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProgress, migrateProgress, type Progress } from '../src/progress';
import { createStore } from '../src/store';

const KEY = 'skies.save';
const store = () => createStore<Progress>({ key: KEY, empty: emptyProgress, migrate: migrateProgress });

describe('createStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty, keeps what is set under the key it was given, and reads it back', () => {
    const s = store();
    expect(s.get()).toEqual(emptyProgress());
    expect(localStorage.getItem(KEY)).toBeNull();
    s.update((save) => ({ ...save, name: 'Rob' }));
    expect(JSON.parse(localStorage.getItem(KEY)!).name).toBe('Rob');
    expect(store().get().name).toBe('Rob');
  });

  it('repairs an older save through migrate rather than dropping it', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, name: 'Rob', lessons: { a: { done: true, best: 3, of: 4 } }, journal: ['mammatus'] }));
    const save = store().get();
    expect(save.name).toBe('Rob');
    expect(save.lessons.a).toMatchObject({ done: true, best: 3, of: 4 });
    expect('journal' in save).toBe(false);
  });

  it('plays on from an empty save when the blob is not JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(store().get()).toEqual(emptyProgress());
  });

  it('moves progress as a file and refuses files that are not a save', () => {
    const s = store();
    s.update((save) => ({ ...save, name: 'Rob' }));
    const text = s.exportText();
    localStorage.clear();
    const t = store();
    expect(t.importText('[1, 2]')).toBe(false);
    expect(t.importText('nonsense')).toBe(false);
    expect(t.get().name).toBe('');
    expect(t.importText(text)).toBe(true);
    expect(t.get().name).toBe('Rob');
  });

  it('reads the save again after another page changes it', () => {
    const s = store();
    expect(s.get().name).toBe('');
    localStorage.setItem(KEY, JSON.stringify({ ...emptyProgress(), name: 'Elsewhere' }));
    expect(s.get().name).toBe('');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other.save' }));
    expect(s.get().name).toBe('');
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(s.get().name).toBe('Elsewhere');
  });
});
