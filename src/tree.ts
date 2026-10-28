// The lessons as a tree, for the home page. A trunk of lessons runs down the
// page in order; each branch forks off the trunk lesson it grows from, as a
// pill that opens into its own rail of lessons. A branch of one lesson (a
// leaf) hangs off its trunk lesson without a pill.
//
// What opens when is said per lesson: `needs` are hard (the lesson stays shut
// until each is passed or skipped), `betterAfter` soft (the lesson opens, but
// says what to do first). Exactly one lesson is Next: the first open trunk
// lesson not yet passed, or once the trunk is done, the first open branch
// lesson. The app draws each lesson's card; this draws the tree around them.

import { el, type Child } from './dom';
import { passed, type Progress } from './progress';

export interface TreeLesson {
  id: string;
  /** Shown in the lesson's dot. */
  n: number | string;
  /** The branch it is on; left out for the trunk. */
  branch?: string;
  /** Lessons that must be passed or skipped first. */
  needs?: readonly string[];
  /** Lessons that are best done first; the lesson still opens without them. */
  betterAfter?: readonly string[];
  /** Not written yet: shown, never opened. */
  coming?: boolean;
  /** Its name in the tree, such as "P2", in place of `n`; see lessonCodes. */
  code?: string;
}

export interface TreeBranch {
  id: string;
  title: string;
  /** One line on the pill: what the branch answers. */
  promise: string;
  /** The trunk lesson it forks after. */
  from: string;
  /** A CSS colour for the pill and its rail. */
  color?: string;
  /** One lesson hung off the trunk, with no pill. */
  leaf?: boolean;
  /**
   * Letters its lessons are named by, like a course code: prefix "P" makes them
   * P1, P2, P3 in branch order, so a branch's lessons are not mistaken for the
   * trunk's next ones. Left out, they keep their `n`.
   */
  prefix?: string;
}

/** Each lesson's name in the tree, by id: its `n` on the trunk, its branch's prefix and place on a branch that has one. */
export function lessonCodes(lessons: readonly TreeLesson[], branches: readonly TreeBranch[]): Map<string, string> {
  const out = new Map<string, string>();
  const count = new Map<string, number>();
  for (const l of lessons) {
    const prefix = l.branch ? branches.find((b) => b.id === l.branch)?.prefix : undefined;
    if (!prefix) {
      out.set(l.id, String(l.n));
      continue;
    }
    const i = (count.get(prefix) ?? 0) + 1;
    count.set(prefix, i);
    out.set(l.id, `${prefix}${i}`);
  }
  return out;
}

export type TreeState = 'done' | 'skipped' | 'next' | 'open' | 'soft' | 'locked' | 'coming';

export interface TreeNode<L extends TreeLesson> {
  lesson: L;
  state: TreeState;
  /** Hard needs not yet passed, leaving out the trunk lesson just before it (the trunk says that by its order). */
  missing: L[];
  /** Soft ones not yet passed. */
  wanting: L[];
}

/** Every lesson's state, by id. */
export function treeStates<L extends TreeLesson>(lessons: readonly L[], save: Progress): Map<string, TreeNode<L>> {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const unmet = (ids: readonly string[] | undefined) => (ids ?? []).filter((id) => !passed(save, id)).map((id) => byId.get(id)).filter((l): l is L => l !== undefined);
  const out = new Map<string, TreeNode<L>>();
  const trunk = lessons.filter((l) => !l.branch);
  for (const lesson of lessons) {
    const missing = unmet(lesson.needs);
    const wanting = unmet(lesson.betterAfter);
    const rec = save.lessons[lesson.id];
    const state: TreeState = rec?.done ? 'done'
      : rec?.skipped ? 'skipped'
        : lesson.coming ? 'coming'
          : missing.length ? 'locked'
            : wanting.length ? 'soft'
              : 'open';
    const before = lesson.branch ? undefined : trunk[trunk.indexOf(lesson) - 1];
    out.set(lesson.id, { lesson, state, missing: missing.filter((l) => l !== before), wanting });
  }
  const free = (l: L) => ['open', 'soft'].includes(out.get(l.id)!.state);
  const next = lessons.find((l) => !l.branch && free(l))
    ?? lessons.find((l) => l.branch && out.get(l.id)!.state === 'open')
    ?? lessons.find((l) => l.branch && free(l));
  if (next) out.get(next.id)!.state = 'next';
  return out;
}

/** The lesson that is Next, if any. */
export function nextLesson<L extends TreeLesson>(lessons: readonly L[], save: Progress): L | undefined {
  return [...treeStates(lessons, save).values()].find((n) => n.state === 'next')?.lesson;
}

export interface TreeOptions<L extends TreeLesson> {
  lessons: readonly L[];
  branches: readonly TreeBranch[];
  save: Progress;
  /** The lesson's card, drawn beside its dot. */
  card: (node: TreeNode<L>) => Child;
  /** A localStorage key to remember which pills were left open on this device. */
  remember?: string;
}

const MARK: Partial<Record<TreeState, string>> = { done: '✓' };

function readOpen(key: string | undefined): Set<string> {
  if (!key) return new Set();
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeOpen(key: string | undefined, open: Set<string>): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...open]));
  } catch {
    // Storage blocked: the pills just start shut next time.
  }
}

/**
 * The tree: an ordered list of the trunk's lessons, with each branch's pill
 * after the lesson it forks from. The pill holding Next starts open, as do any
 * left open before; the rest start shut.
 */
export function treeView<L extends TreeLesson>(o: TreeOptions<L>): HTMLElement {
  const states = treeStates(o.lessons, o.save);
  const open = readOpen(o.remember);
  const nodeEl = (l: L) => {
    const node = states.get(l.id)!;
    return el('li.tree-node', { className: `tree-node is-${node.state}` },
      el('span.tree-dot', { 'aria-hidden': 'true' }, MARK[node.state] ?? l.code ?? String(l.n)),
      el('div.tree-card', {}, o.card(node)),
    );
  };
  const inBranch = (b: TreeBranch) => o.lessons.filter((l) => l.branch === b.id);

  const pill = (b: TreeBranch) => {
    const lessons = inBranch(b);
    const done = lessons.filter((l) => o.save.lessons[l.id]?.done).length;
    const holdsNext = lessons.some((l) => states.get(l.id)!.state === 'next');
    const rail = el('ol.tree-rail', {}, lessons.map(nodeEl));
    rail.hidden = !(holdsNext || open.has(b.id));
    const button = el('button.tree-pill', {
      type: 'button',
      'aria-expanded': String(!rail.hidden),
      onclick: () => {
        rail.hidden = !rail.hidden;
        button.setAttribute('aria-expanded', String(!rail.hidden));
        if (rail.hidden) open.delete(b.id);
        else open.add(b.id);
        writeOpen(o.remember, open);
      },
    },
      el('span.tree-pill-title', {}, b.title),
      el('span.tree-pill-count', {}, `${done}/${lessons.length}`),
      el('span.tree-pill-promise', {}, b.promise),
    );
    return el('li.tree-fork', { style: b.color ? `--branch: ${b.color}` : '' }, button, rail);
  };

  const leaf = (b: TreeBranch) => el('li.tree-fork.tree-leaf', { style: b.color ? `--branch: ${b.color}` : '' },
    el('p.tree-leaf-title', {}, b.title),
    el('ol.tree-rail', {}, inBranch(b).map(nodeEl)),
  );

  return el('ol.tree', {}, o.lessons.filter((l) => !l.branch).flatMap((l) => [
    nodeEl(l),
    ...o.branches.filter((b) => b.from === l.id).map((b) => (b.leaf ? leaf(b) : pill(b))),
  ]));
}

/** Lessons and branches that do not fit together: a branch from nowhere, a need on no lesson, a lesson on no branch. */
export function treeProblems(lessons: readonly TreeLesson[], branches: readonly TreeBranch[]): string[] {
  const ids = new Set(lessons.map((l) => l.id));
  const bids = new Set(branches.map((b) => b.id));
  const out: string[] = [];
  for (const b of branches) {
    if (!lessons.some((l) => l.id === b.from && !l.branch)) out.push(`branch ${b.id} forks from ${b.from}, which is not on the trunk`);
    if (!lessons.some((l) => l.branch === b.id)) out.push(`branch ${b.id} has no lessons`);
  }
  for (const l of lessons) {
    if (l.branch && !bids.has(l.branch)) out.push(`${l.id} is on branch ${l.branch}, which does not exist`);
    for (const id of [...(l.needs ?? []), ...(l.betterAfter ?? [])]) if (!ids.has(id)) out.push(`${l.id} leans on ${id}, which is not a lesson`);
  }
  return out;
}
