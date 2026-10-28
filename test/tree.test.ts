// @vitest-environment happy-dom
// The lesson tree: which lesson is Next, what hard and soft locks do, and the
// pills that branches fork into.

import { describe, expect, it } from 'vitest';
import { el } from '../src/dom';
import { emptyProgress, finishLesson, skipLesson, type Progress } from '../src/progress';
import { lessonCodes, nextLesson, treeProblems, treeStates, treeView, type TreeBranch, type TreeLesson } from '../src/tree';

const LESSONS: TreeLesson[] = [
  { id: 'a', n: 1 },
  { id: 'b', n: 2, needs: ['a'] },
  { id: 'c', n: 3, needs: ['b'] },
  { id: 'x1', n: 4, branch: 'x', betterAfter: ['b'] },
  { id: 'x2', n: 5, branch: 'x', needs: ['x1'], betterAfter: ['c'] },
  { id: 'x3', n: 6, branch: 'x', coming: true },
  { id: 'leaf', n: 7, branch: 'l', needs: ['c'] },
];
const BRANCHES: TreeBranch[] = [
  { id: 'x', title: 'Side trip', promise: 'Somewhere else', from: 'a', prefix: 'X' },
  { id: 'l', title: 'Afterword', promise: '', from: 'c', leaf: true },
];
const done = (save: Progress, ...ids: string[]) => ids.reduce((s, id) => finishLesson(s, id, 1, 1, [], new Date(0)), save);
const state = (save: Progress) => Object.fromEntries([...treeStates(LESSONS, save)].map(([id, n]) => [id, n.state]));

describe('lesson tree', () => {
  it('fits together', () => {
    expect(treeProblems(LESSONS, BRANCHES)).toEqual([]);
    expect(treeProblems([{ id: 'q', n: 1, needs: ['nope'] }], [{ id: 'z', title: '', promise: '', from: 'q' }])).toHaveLength(2);
  });

  it('makes the first open trunk lesson Next, opens soft-locked lessons, keeps hard-locked ones shut', () => {
    expect(state(emptyProgress())).toEqual({ a: 'next', b: 'locked', c: 'locked', x1: 'soft', x2: 'locked', x3: 'coming', leaf: 'locked' });
    expect(state(done(emptyProgress(), 'a'))).toMatchObject({ a: 'done', b: 'next', x1: 'soft' });
    expect(state(done(emptyProgress(), 'a', 'b'))).toMatchObject({ c: 'next', x1: 'open', x2: 'locked' });
  });

  it('counts a skipped lesson as passed, and moves Next onto a branch once the trunk is done', () => {
    const save = skipLesson(done(emptyProgress(), 'a', 'b'), 'c');
    expect(state(save)).toMatchObject({ c: 'skipped', x1: 'next', leaf: 'open' });
    expect(nextLesson(LESSONS, done(save, 'x1', 'leaf'))?.id).toBe('x2');
    expect(nextLesson(LESSONS, done(save, 'x1', 'x2', 'leaf'))).toBeUndefined();
  });

  it('draws the trunk with a pill after the lesson a branch forks from, and the pill holding Next open', () => {
    const save = done(emptyProgress(), 'a', 'b', 'c');
    const view = treeView({ lessons: LESSONS, branches: BRANCHES, save, card: (n) => el('span', {}, `${n.lesson.id}:${n.state}`) });
    const top = [...view.children].map((li) => li.className);
    expect(top).toEqual(['tree-node is-done', 'tree-fork', 'tree-node is-done', 'tree-node is-done', 'tree-fork tree-leaf']);
    const pill = view.querySelector('.tree-pill')!;
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(pill.textContent).toContain('0/3');
    (pill as HTMLButtonElement).click();
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect((view.querySelector('.tree-fork .tree-rail') as HTMLElement).hidden).toBe(true);
  });

  it('names branch lessons by their prefix, and leaves the trunk lesson just before out of what a lesson waits for', () => {
    const codes = lessonCodes(LESSONS, BRANCHES);
    expect([...codes.values()]).toEqual(['1', '2', '3', 'X1', 'X2', 'X3', '7']);
    const nodes = treeStates(LESSONS, emptyProgress());
    expect(nodes.get('c')!.missing).toEqual([]);
    expect(nodes.get('x2')!.missing.map((l) => l.id)).toEqual(['x1']);
  });

  it('keeps a pill shut when Next is elsewhere', () => {
    const view = treeView({ lessons: LESSONS, branches: BRANCHES, save: emptyProgress(), card: () => null });
    expect(view.querySelector('.tree-pill')!.getAttribute('aria-expanded')).toBe('false');
    expect(view.querySelector('.is-next .tree-dot')!.textContent).toBe('1');
  });
});
