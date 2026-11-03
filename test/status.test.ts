// @vitest-environment happy-dom
// Where the reader stands with a lesson (status.ts), its mark in the tree, and
// the list keeping its place across a visit to a lesson (place.ts).

import { afterEach, describe, expect, it } from 'vitest';
import { el } from '../src/dom';
import { keepPlace } from '../src/place';
import { emptyProgress, finishLesson, type Progress } from '../src/progress';
import { emptyResume, lessonSignature } from '../src/resume';
import { lessonGo, lessonStatus, progressLine } from '../src/status';
import { treeView } from '../src/tree';

const LESSON = { id: 'a', n: 1, parts: [{ blocks: [{ type: 'text' }] }, { blocks: [{ type: 'text' }] }] };
const OTHER = { id: 'b', n: 2, parts: [{ blocks: [{ type: 'text' }] }] };
const leftAt = (save: Progress, part: number): Progress => ({ ...save, resume: { a: { ...emptyResume(lessonSignature(LESSON)), part } } });

describe('lesson status', () => {
  it('tells new, started and done apart', () => {
    const save = emptyProgress();
    expect(lessonStatus(save, LESSON)).toBe('new');
    expect(lessonStatus(leftAt(save, 1), LESSON)).toBe('started');
    expect(progressLine(leftAt(save, 1), LESSON)).toBe('In progress: part 2 of 2');
    expect(lessonStatus(finishLesson(leftAt(save, 1), 'a', 1, 1, new Date(0)), LESSON)).toBe('done');
    // A place kept for another version of the lesson does not count.
    expect(lessonStatus({ ...save, resume: { a: { ...emptyResume('old'), part: 1 } } }, LESSON)).toBe('new');
  });

  it('gives each its own button and mark', () => {
    const go = (s: 'new' | 'started' | 'done') => lessonGo('#/lesson/a', s);
    expect(go('new').className).toContain('go-new');
    expect(go('started').textContent).toBe('Continue');
    expect(go('done').textContent).toBe('Again');
    expect(go('done').getAttribute('href')).toBe('#/lesson/a');
  });

  it('marks started lessons in the tree and names each node', () => {
    const tree = treeView({ lessons: [LESSON, OTHER], branches: [], save: leftAt(emptyProgress(), 0), card: () => null });
    const nodes = [...tree.querySelectorAll<HTMLElement>('.tree-node')];
    expect(nodes.map((n) => n.dataset.lesson)).toEqual(['a', 'b']);
    expect(nodes[0].classList.contains('is-started')).toBe(true);
    expect(nodes[1].classList.contains('is-started')).toBe(false);
  });
});

describe('keepPlace', () => {
  afterEach(() => {
    sessionStorage.clear();
    document.body.replaceChildren();
  });

  it('remembers the lesson followed and where it sat on the screen', () => {
    const root = el('div', {}, el('div', { dataset: { lesson: 'a' } }, el('a', { href: '#/lesson/a' }, 'go')));
    document.body.append(root);
    const done = keepPlace(root, 'k');
    root.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    done();
    const kept = JSON.parse(sessionStorage.getItem('k')!);
    expect(kept.lesson).toBe('a');
    expect(typeof kept.top).toBe('number');
  });

  it('keeps only the scroll offset when a link outside any lesson is followed', () => {
    const root = el('div', {}, el('a', { href: '#/seed' }, 'orders'));
    document.body.append(root);
    const done = keepPlace(root, 'k');
    root.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    done();
    expect(JSON.parse(sessionStorage.getItem('k')!).lesson).toBeUndefined();
  });
});
