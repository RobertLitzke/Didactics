// @vitest-environment happy-dom
// Options a second course needs: a logo in the bar, lessons not written yet,
// a save with no radio, lesson files that keep their layout, extra icons.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { formatJson, oneLinePaths, upgradeLesson } from '../src/course';
import { el } from '../src/dom';
import { lessonProblems, lessonView, prose, type Lesson } from '../src/lesson';
import { emptyProgress, finishLesson, migrateProgress } from '../src/progress';
import { appShell, topBar } from '../src/shell';
import { createStore } from '../src/store';

// The PWA plugin, as lessonApp configures it.
vi.mock('vite-plugin-pwa', () => ({ VitePWA: (options: unknown) => ({ name: 'pwa-options', options }) }));

describe('top bar', () => {
  it('puts a mark before the words, inside the link home', () => {
    const bar = topBar({ title: 'Dirt', subtitle: 'Soil', mark: el('img.logo', { src: 'icons/icon.svg', alt: '' }) });
    const a = bar.querySelector('a.wordmark')!;
    expect(a.classList.contains('with-mark')).toBe(true);
    expect(a.firstElementChild!.matches('img.logo')).toBe(true);
    expect(a.querySelector('.wordmark-words')!.textContent).toBe('DirtSoil');
  });

  it('takes a node as the title, and is as before without a mark', () => {
    const shell = appShell({ mount: el('div'), title: el('b.logotype', {}, 'Dirt'), nav: [{ path: '/home', label: 'Home' }] });
    const a = shell.header.querySelector('a.wordmark')!;
    expect(a.classList.contains('with-mark')).toBe(false);
    expect(a.firstElementChild!.matches('b.logotype')).toBe(true);
  });
});

describe('lessons not written yet', () => {
  const written: Lesson = { id: 'a', n: 1, title: 'A', teaches: '', learned: [], next: '', journal: [], parts: [{ title: 'One', blocks: [{ type: 'text', text: 'Hi.' }] }] };
  const open = (lesson: Lesson) => {
    const store = createStore({ key: 'coming-test', empty: emptyProgress, migrate: migrateProgress });
    const went: string[] = [];
    const root = el('div');
    lessonView({ lessons: [lesson], figures: {}, store, prose: (t) => prose(t, {}), home: '/tree' })(root, { params: { id: lesson.id }, navigate: () => {}, replace: (p: string) => went.push(p) } as never);
    return { went, root };
  };

  it('sends a lesson marked coming, or one with no parts, back home', () => {
    expect(open({ ...written, coming: true }).went).toEqual(['/tree']);
    expect(open({ ...written, parts: [] }).went).toEqual(['/tree']);
    const ok = open(written);
    expect(ok.went).toEqual([]);
    expect(ok.root.textContent).toContain('Hi.');
    expect(lessonProblems([{ ...written, id: 'b', parts: [], coming: true }], {})).toEqual([]);
  });
});

describe('a save with no radio', () => {
  it('has no radio fields, and keeps none from what was stored', () => {
    const empty = emptyProgress('imperial', { radio: false });
    expect(empty).not.toHaveProperty('talk');
    expect(empty).not.toHaveProperty('heard');
    const stored = JSON.parse(JSON.stringify({ ...finishLesson(emptyProgress(), 'a', 1, 2, [], new Date('2026-01-01')), talk: true, heard: { x: [0] } }));
    const back = migrateProgress(stored, empty);
    expect(back).not.toHaveProperty('talk');
    expect(back).not.toHaveProperty('introSeen');
    expect(back).not.toHaveProperty('heard');
    expect(back.lessons.a).toMatchObject({ done: true, best: 1, of: 2 });
  });

  it('keeps them by default', () => {
    const back = migrateProgress({ talk: false, introSeen: true, heard: { x: [1, 'z'] } });
    expect(back).toMatchObject({ talk: false, introSeen: true, heard: { x: [1, 0] } });
  });
});

describe('lesson file layout', () => {
  const compact = `{
  "id": "push",
  "title": "Pushing",
  "journal": ["a", "b"],
  "parts": [
    { "title": "Push", "blocks": [
      { "kind": "text", "text": "Push it." },
      { "kind": "figure", "figure": "push", "caption": "A block", "options": { "n": 3 } },
      {
        "kind": "text",
        "text": "Long."
      }
    ] }
  ]
}
`;

  it('finds what is written on one line', () => {
    expect(oneLinePaths(compact)).toEqual(new Set([
      '["journal"]',
      '["parts",0,"blocks",0]',
      '["parts",0,"blocks",1]',
      '["parts",0,"blocks",1,"options"]',
    ]));
    expect(oneLinePaths('{ not json').size).toBe(0);
  });

  it('keeps one-line blocks on one line through an upgrade', () => {
    const up = formatJson(upgradeLesson(JSON.parse(compact)), compact);
    expect(up).toContain('\n        { "type": "text", "text": "Push it." },\n');
    expect(up).toContain('\n        { "type": "diagram", "id": "push", "caption": "A block", "options": { "n": 3 } },\n');
    expect(up).toContain('"journal": ["a", "b"]');
    expect(up).toContain('\n          "type": "text",\n          "text": "Long."\n');
    expect(JSON.parse(up)).toEqual(upgradeLesson(JSON.parse(compact)));
  });

  it('is JSON.stringify layout with nothing to match', () => {
    const v = { a: [1, { b: 'c' }], d: {}, e: [] };
    expect(formatJson(v)).toBe(`${JSON.stringify(v, null, 2)}\n`);
    expect(formatJson(v, JSON.stringify(v, null, 2))).toBe(`${JSON.stringify(v, null, 2)}\n`);
  });

  it('is kept by the command line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'didactics-layout-'));
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    writeFileSync(join(dir, 'src/data/push.json'), compact);
    const cli = (...a: string[]) => execFileSync(process.execPath, [resolve(__dirname, '../bin/didactics-course.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
    cli('upgrade', 'src/data');
    const upgraded = readFileSync(join(dir, 'src/data/push.json'), 'utf8');
    expect(upgraded).toContain('\n        { "type": "text", "text": "Push it." },\n');
    cli('export', 'src/data');
    expect(cli('import', 'course.json')).toMatch(/already matches/);
  });
});

describe('manifest icons', () => {
  it('adds a course\'s own icons after the three PNGs', async () => {
    const { lessonApp } = await import('../src/vite');
    const config = lessonApp({
      root: '/x', version: '1', port: 5000, oneFile: 'x.html',
      manifest: { name: 'X', short_name: 'X', description: '', theme_color: '#000', icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
    });
    const pwa = (config.plugins as unknown[]).find((p) => (p as { name?: string })?.name === 'pwa-options') as { options: { manifest: { icons: { src: string }[] } } };
    const icons = pwa.options.manifest.icons.map((i) => i.src);
    expect(icons).toEqual(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png', 'icons/icon.svg']);
  });
});
