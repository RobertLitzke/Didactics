// @vitest-environment happy-dom
// The course as one file: out, edited, and back in; callouts with no code yet.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { lessonShapeProblems } from '../src/blocks';
import { courseEdits, courseFiles, exportCourse, injectCourse, readCourse, upgradeLesson } from '../src/course';
import { el } from '../src/dom';
import { figure, frame } from '../src/figure';
import { lessonProblems, lessonView, prose, type Lesson } from '../src/lesson';
import { emptyProgress, migrateProgress } from '../src/progress';
import { lessonSignature } from '../src/resume';
import { createStore } from '../src/store';

const lesson = (): Lesson => ({
  id: 'push', n: 1, title: 'Pushing', teaches: 'What a push does', learned: [], next: '', journal: [],
  parts: [
    { title: 'Push', blocks: [
      { type: 'text', text: 'Push it.' },
      { type: 'interactive_diagram', id: 'push', caption: 'A block', task: 'Push it far', goal: 'far' },
      { type: 'diagram', id: 'notYet', caption: 'Drawn later', aspect_ratio: 2 },
    ] },
    { title: 'More', blocks: [{ type: 'text', text: 'Pushed.' }] },
  ],
});

describe('course file', () => {
  beforeEach(() => localStorage.clear());

  it('goes out and back in unchanged, under the paths it came from', () => {
    const files = courseFiles({ '/src/data/push.json': lesson(), './src/data/quiz.json': { cards: [] } });
    expect(Object.keys(files)).toEqual(['src/data/push.json', 'src/data/quiz.json']);
    const out = JSON.parse(JSON.stringify(exportCourse('Push', files)));
    expect(out.format).toBe('didactics-course');
    expect(readCourse(out, files)).toEqual({ files, problems: [] });
  });

  it('refuses files the course does not have, and lessons that do not read', () => {
    const files = courseFiles({ '/src/data/push.json': lesson() });
    const out = exportCourse('Push', files);
    const bad = structuredClone(out);
    (bad.files['src/data/push.json'] as Lesson).parts[0].blocks.push({ type: 'graph' } as never);
    bad.files['src/data/other.json'] = {};
    bad.files['../secret.json'] = {};
    const { files: got, problems } = readCourse(bad, files);
    expect(got).toEqual({});
    expect(problems).toEqual([
      'src/data/push.json, part 1, block 4: "type" should be one of text, key_ideas, interactive_diagram, diagram, quiz',
      'src/data/other.json: the course has no such file',
      '../secret.json: not a JSON file inside the course',
    ]);
    expect(readCourse({ files: {} }).problems[0]).toMatch(/not a course file/);
  });

  it('puts edits in place of the built-in words, in the same objects', () => {
    const fog = lesson();
    const files = { 'a.json': fog };
    const edited = lesson();
    (edited.parts[0].blocks[0] as { text: string }).text = 'Push it hard.';
    expect(injectCourse(files, { 'a.json': edited, 'b.json': {} })).toEqual(['a.json']);
    expect(files['a.json']).toBe(fog);
    expect(fog.parts[0].blocks[0]).toEqual({ type: 'text', text: 'Push it hard.' });
  });

  it('keeps edits in this browser, applies them on the next start, and forgets them', () => {
    const make = () => ({ 'src/push.json': lesson() });
    const first = courseEdits({ key: 'push.course', title: 'Push', files: make() });
    expect(first.edited).toEqual([]);
    const file = first.file();
    (file.files['src/push.json'] as Lesson).title = 'Shoving';
    expect(first.load('not json')[0]).toMatch(/not JSON/);
    expect(first.load(JSON.stringify(file))).toEqual([]);
    expect(first.edited).toEqual(['src/push.json']);
    const files = make();
    const next = courseEdits({ key: 'push.course', title: 'Push', files });
    expect((files['src/push.json'] as Lesson).title).toBe('Shoving');
    expect(next.edited).toEqual(['src/push.json']);
    next.reset();
    const again = make();
    courseEdits({ key: 'push.course', title: 'Push', files: again });
    expect(again['src/push.json'].title).toBe('Pushing');
  });

  it('upgrades the old block shape, keeping the resume signature', () => {
    const old = {
      ...lesson(),
      parts: [
        { title: 'Push', blocks: [{ kind: 'text', text: 'Push it.' }, { kind: 'figure', figure: 'push', caption: 'A block', task: 'Push it far', goal: 'far' }, { kind: 'figure', figure: 'notYet', caption: 'Drawn later', aspect_ratio: 2 }] },
        { title: 'More', blocks: [{ kind: 'text', text: 'Pushed.' }] },
      ],
    };
    const up = upgradeLesson(old);
    expect(up).toEqual(lesson());
    expect(lessonShapeProblems(up, 'push')).toEqual([]);
    // The hash the old shape had: kinds by their old names, figures by name.
    const text = JSON.stringify([[ 'text', ['push', 'far', 1, null], ['notYet', '', 0, null]], ['text']]);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    expect(lessonSignature(lesson())).toBe((h >>> 0).toString(36));
  });

  it('round-trips through the command line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'didactics-cli-'));
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    writeFileSync(join(dir, 'src/data/push.json'), `${JSON.stringify(lesson(), null, 2)}\n`);
    const cli = (...a: string[]) => execFileSync(process.execPath, [resolve(__dirname, '../bin/didactics-course.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
    expect(cli('export', 'src/data', '--title', 'Push')).toMatch(/Wrote 1 files/);
    const course = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8'));
    expect(Object.keys(course.files)).toEqual(['src/data/push.json']);
    expect(cli('import', 'course.json')).toMatch(/already matches/);
    course.files['src/data/push.json'].title = 'Shoving';
    writeFileSync(join(dir, 'course.json'), JSON.stringify(course));
    expect(cli('import', 'course.json')).toMatch(/changed src\/data\/push.json/);
    expect(JSON.parse(readFileSync(join(dir, 'src/data/push.json'), 'utf8')).title).toBe('Shoving');
  });
});

describe('callouts', () => {
  const push = figure(['far'], (_ctx, t) => {
    const f = frame(100, 50, 1);
    f.controls.append(el('button', { onclick: () => t.done() }, 'push'));
    return f.node;
  });

  it('shows a box for an id with no code, which holds no one up', async () => {
    const store = createStore({ key: 'callout-test', empty: emptyProgress, migrate: migrateProgress });
    const root = el('div');
    lessonView({ lessons: [lesson()], figures: { push }, store, prose: (t) => prose(t, {}) })(root, { params: { id: 'push' }, go: () => {}, replace: () => {} } as never);
    const box = root.querySelector('[data-figure="notYet"] .fig-placeholder') as HTMLElement;
    expect(box.textContent).toBe('Diagram notYet goes here');
    expect(box.getAttribute('style')).toContain('aspect-ratio: 2');
    expect(lessonProblems([lesson()], { push })).toEqual(['push: no figure "notYet"']);
    expect(lessonProblems([lesson()], { push }, { allowPlaceholders: true })).toEqual([]);
    expect(lessonProblems([{ ...lesson(), parts: [{ title: 'x', blocks: [{ type: 'quiz', id: 'push', caption: 'c' }] }] }], { push })).toEqual(['push: push should have "type": "interactive_diagram", not "quiz"']);
  });
});
