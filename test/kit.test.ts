// @vitest-environment happy-dom
// Didactics stands on its own: nothing in it reaches into an app, and a lesson
// app made of nothing but a JSON-shaped lesson and one figure runs.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../src/check';
import { el } from '../src/dom';
import { figure, frame, quiz, slider } from '../src/figure';
import { closeFootnote, footnoteProblems, footnoteSet } from '../src/footnote';
import { glossaryFromLessons, glossaryView, mergeGlossary } from '../src/glossary';
import { lessonProblems, lessonView, prose, type Lesson } from '../src/lesson';
import { emptyProgress, finishLesson, migrateProgress, passed, skipLesson } from '../src/progress';
import { deal, review, tally } from '../src/quiz';
import { lessonSignature, migrateResume } from '../src/resume';
import { makeRng } from '../src/rng';
import { createStore } from '../src/store';

const SRC = resolve(__dirname, '../src');

describe('Didactics', () => {
  it('imports only itself and its build tools', () => {
    for (const f of readdirSync(SRC)) {
      for (const [, from] of readFileSync(resolve(SRC, f), 'utf8').matchAll(/from '([^']+)'/g)) {
        expect(from.startsWith('./') || /^(node:|vite|virtual:pwa-register)/.test(from), `${f} imports ${from}`).toBe(true);
      }
    }
  });

  it('reads precache globs the way workbox does', async () => {
    const { globRegExp } = await import('../src/vite');
    expect(globRegExp('photos/*.webp').test('photos/cumulus-01.webp')).toBe(true);
    expect(globRegExp('photos/*.webp').test('photos/.gitkeep')).toBe(false);
    expect(globRegExp('photos/*.webp').test('photos/x/cumulus-01.webp')).toBe(false);
    expect(globRegExp('icons/*.{png,svg}').test('icons/icon.svg')).toBe(true);
    expect(globRegExp('poster.webp').test('posterXwebp')).toBe(false);
  });

  it('migrates junk to an empty save and keeps the best score', () => {
    expect(migrateProgress('x')).toEqual(emptyProgress());
    const once = finishLesson(emptyProgress(), 'a', 3, 4, ['j'], new Date('2026-01-02'));
    const worse = finishLesson(once, 'a', 1, 4, [], new Date('2026-02-02'));
    expect(worse.lessons.a).toEqual({ done: true, best: 3, of: 4, finishedAt: '2026-01-02' });
    expect(migrateProgress(JSON.parse(JSON.stringify(worse)))).toEqual(worse);
  });

  it('schedules cards further apart as they are got right', () => {
    const deck = [{ id: 'c1', question: '?', options: ['yes', 'no'], why: '' }];
    const s1 = review(undefined, true, 0);
    expect(review(s1, true, 0).due).toBeGreaterThan(s1.due);
    expect(tally(deck, {}, 0).fresh).toBe(1);
    expect(deal(deck, {}, 0, 5, 5, makeRng(1))).toHaveLength(1);
  });

  it('runs a lesson made of one paragraph and one figure', async () => {
    globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;
    const push = figure(['far'], (_ctx, t) => {
      const f = frame(200, 100, 2);
      f.controls.append(slider('Push', 0, 10, 1, 0, String, (v) => v >= 8 && t.done()).node);
      return f.node;
    });
    const check = quiz((ctx, t) => el('button', { onclick: () => { ctx.score(1, 1); t.done(); } }, 'Answer'));
    const lessons: Lesson[] = [{
      id: 'push', n: 1, title: 'Pushing', teaches: 'What a push does', learned: ['Pushes move things'], next: 'Next: pulling.', journal: [],
      parts: [
        { title: 'Push', blocks: [{ kind: 'text', text: 'A **push** in [[red|warm]].' }, { kind: 'figure', figure: 'push', caption: 'A block', task: 'Push it far', goal: 'far' }] },
        { title: 'Check', blocks: [{ kind: 'figure', figure: 'check', caption: 'One question', task: 'Answer' }] },
      ],
    }];
    const figures = { push, check };
    expect(lessonProblems(lessons, figures)).toEqual([]);
    expect(lessonProblems(lessons, { push })).toEqual(['push: no figure "check"']);

    const store = createStore({ key: 'test', empty: emptyProgress, migrate: migrateProgress });
    const root = el('div');
    const view = lessonView({ lessons, figures, store, prose: (t) => prose(t, { ink: '#000', warm: '#c00' }) });
    view(root, { params: { id: 'push' }, navigate: () => {}, replace: () => {} });
    expect(root.querySelector('.part b.tint')?.getAttribute('style')).toContain('#c00');
    const input = root.querySelector('input[type=range]') as HTMLInputElement;
    input.value = '9';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r));
    expect(root.querySelector('.fig.done')).not.toBeNull();
    (root.querySelector('.gate button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    (root.querySelector('[data-figure=check] button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    (root.querySelector('.gate button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    expect(root.querySelector('.logbook .score')?.textContent).toBe('Check: 1 of 1 right');
  });

  it('numbers footnotes in reading order and opens one at a time', () => {
    const notes = {
      b: { kind: 'digression' as const, title: 'Side', text: 'A *side* trip.' },
      a: { kind: 'technical' as const, title: 'Term', text: 'A term.' },
    };
    const texts = ['First[^a] and then[^b].', 'Again[^a].'];
    const set = footnoteSet(notes, texts, (t) => prose(t, { ink: '#000' }));
    expect([set.number('a'), set.number('b')]).toEqual([1, 2]);
    const p = prose(texts[0], { ink: '#000' }, set);
    document.body.append(p);
    const marks = [...p.querySelectorAll('button.fn')] as HTMLButtonElement[];
    expect(marks.map((m) => m.textContent)).toEqual(['1', '2']);
    expect(marks[0].classList.contains('fn-technical')).toBe(true);
    expect(p.textContent).not.toContain('[^');
    marks[1].click();
    expect(document.querySelectorAll('.fn-pop')).toHaveLength(1);
    expect(document.querySelector('.fn-pop .fn-body i')?.textContent).toBe('side');
    marks[0].click();
    expect(document.querySelectorAll('.fn-pop')).toHaveLength(1);
    expect(document.querySelector('.fn-pop .fn-title')?.textContent).toBe('Term');
    closeFootnote();
    expect(document.querySelector('.fn-pop')).toBeNull();
    expect(prose('No notes[^a].', { ink: '#000' }).textContent).toBe('No notes.');
    expect(footnoteProblems('x', notes, ['Only[^a] and[^c].'])).toEqual(['x: no footnote "c"', 'x: footnote "b" is never marked']);
  });

  it('builds a glossary from technical footnotes and a list, A to Z, and searches it', () => {
    const lesson: Lesson = {
      id: 'l', n: 1, title: 'L', teaches: 't', learned: [], next: '', journal: [], parts: [],
      footnotes: {
        t: { kind: 'technical', title: 'Torque', text: 'Turning force.' },
        d: { kind: 'digression', title: 'Archimedes', text: 'Give me a place to stand.' },
        h: { kind: 'technical', title: 'Hidden', text: 'Not listed.', glossary: false },
      },
    };
    const from = glossaryFromLessons([lesson]);
    expect(from.map((e) => e.term)).toEqual(['Torque']);
    const all = mergeGlossary([{ id: 'f', term: 'The fulcrum', text: 'The pivot.', also: ['pivot point'] }, { id: 'x', term: 'torque', text: 'Duplicate.' }], from);
    expect(all.map((e) => e.term)).toEqual(['The fulcrum', 'torque']);
    const view = glossaryView({ entries: all, prose: (t) => document.createTextNode(t) });
    expect([...view.querySelectorAll('.gl-letter')].map((h) => h.textContent)).toEqual(['F', 'T']);
    const search = view.querySelector('input') as HTMLInputElement;
    search.value = 'pivot point';
    search.dispatchEvent(new Event('input'));
    expect([...view.querySelectorAll('.gl-entry')].filter((n) => !(n as HTMLElement).hidden)).toHaveLength(1);
  });

  describe('the check', () => {
    const steps = () => [
      { ask: 'Two and two?', choices: ['Four', 'Five'], answer: 0, why: 'Count them.', row: true },
      { ask: 'Water freezes at?', choices: ['10 °C', '0 °C'], answer: 1, why: 'Zero.' },
    ];
    const talk = { id: 't-check', cue: 'check' as const, when: 'Tuesday', turns: [{ them: 'Questions over the air.' }, { them: 'Signing off.' }] };
    const answerAll = (node: HTMLElement) => {
      for (let i = 0; i < 5; i++) {
        node.querySelector<HTMLButtonElement>('.floor-buttons button, .answer-list button')?.click();
        node.querySelector<HTMLButtonElement>('.actions .btn')?.click();
      }
    };

    it('asks every step in one run, under one count and one score', async () => {
      let score: [number, number] | undefined;
      const handle = check(steps)({ save: emptyProgress(), closed: new AbortController().signal, score: (r, n) => (score = [r, n]) });
      expect(handle.node.querySelector('.check-count')?.textContent).toBe('Question 1 of 2');
      expect(handle.node.querySelector('.check-wire')).toBeNull();
      handle.node.querySelector<HTMLButtonElement>('.floor-buttons button')!.click();
      expect(handle.node.querySelector('.verdict')?.textContent).toBe('Right. Count them.');
      answerAll(handle.node);
      await handle.done;
      expect(score).toEqual([1, 2]);
    });

    it('is framed by the check’s radio talk when there is one', () => {
      const handle = check(steps)({ save: emptyProgress(), closed: new AbortController().signal, score: () => {}, radio: { talk, them: { call: 'G2XX', place: 'Workshop' } } });
      const wire = handle.node.querySelector('.check-wire')!;
      expect(wire.textContent).toContain('G2XX · Workshop');
      expect(wire.textContent).toContain('Questions over the air.');
      handle.node.querySelector<HTMLButtonElement>('.floor-buttons button')!.click();
      expect(handle.node.querySelector('.verdict')?.textContent).toBe('Copy that. Count them.');
      answerAll(handle.node);
      expect(handle.node.querySelector('.check-wire-end')?.textContent).toBe('Signing off.');
    });

    it('hands the check talk to the check instead of playing it', async () => {
      const played: string[] = [];
      const lesson: Lesson = {
        id: 'sums', n: 1, title: 'Sums', teaches: 'Adding', learned: [], next: '', journal: [],
        parts: [{ title: 'Check', blocks: [{ kind: 'figure', figure: 'check', caption: 'Sums', task: 'Answer' }] }],
      };
      const store = createStore({ key: 'check-test', empty: emptyProgress, migrate: migrateProgress });
      const root = el('div');
      const close = lessonView({
        lessons: [lesson], figures: { check: check(steps) }, store, prose: (t) => prose(t, { ink: '#000' }),
        radio: { talks: () => [talk], play: async (t) => (played.push(t.id), true), clear: () => {}, them: { call: 'G2XX', place: 'Workshop' } },
      })(root, { params: { id: 'sums' }, navigate: () => {}, replace: () => {} }) as () => void;
      expect(root.querySelector('.check-wire')?.textContent).toContain('Questions over the air.');
      answerAll(root);
      await new Promise((r) => setTimeout(r));
      expect(played).toEqual([]);
      close();
    });
  });

  describe('picking a lesson up where it was left', () => {
    globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;
    const tick = () => new Promise((r) => setTimeout(r));
    const push = figure(['far'], (_ctx, t) => {
      const f = frame(200, 100, 2);
      f.controls.append(slider('Push', 0, 10, 1, 0, String, (v) => v >= 8 && t.done()).node);
      return f.node;
    });
    // A two-question check that keeps its answers.
    const check = quiz((ctx, t) => {
      const answers: boolean[] = Array.isArray(t.kept) ? [...t.kept] : [];
      const node = el('div');
      const show = () => {
        if (answers.length === 2) {
          node.replaceChildren(el('p.result', {}, `${answers.filter(Boolean).length} right`));
          ctx.score(answers.filter(Boolean).length, 2);
          t.done();
          return;
        }
        const answer = (right: boolean) => {
          answers.push(right);
          t.keep([...answers]);
          show();
        };
        node.replaceChildren(el('button.right', { onclick: () => answer(true) }, 'Right'), el('button.wrong', { onclick: () => answer(false) }, 'Wrong'));
      };
      show();
      return node;
    });
    const figures = { push, check };
    const lesson = (goal = 'far'): Lesson => ({
      id: 'push', n: 1, title: 'Pushing', teaches: 'What a push does', learned: [], next: '', journal: [],
      parts: [
        { title: 'Push', blocks: [{ kind: 'text', text: 'Push it.' }, { kind: 'figure', figure: 'push', caption: 'A block', task: 'Push it far', goal }] },
        { title: 'Check', blocks: [{ kind: 'figure', figure: 'check', caption: 'Two questions', task: 'Answer' }] },
      ],
    });
    const open = (lessons: Lesson[], store: ReturnType<typeof createStore<ReturnType<typeof emptyProgress>>>) => {
      const root = el('div');
      document.body.replaceChildren(root);
      const close = lessonView({ lessons, figures, store, prose: (t) => prose(t, { ink: '#000' }) })(root, { params: { id: 'push' }, navigate: () => {}, replace: () => {} });
      return { root, close: close as () => void };
    };
    const newStore = () => {
      localStorage.clear();
      return createStore({ key: 'resume-test', empty: emptyProgress, migrate: migrateProgress });
    };

    it('keeps the parts passed, the tasks done, the sliders and the answers', async () => {
      const store = newStore();
      let v = open([lesson()], store);
      const input = v.root.querySelector('input[type=range]') as HTMLInputElement;
      input.value = '9';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
      (v.root.querySelector('.gate button') as HTMLButtonElement).click();
      await tick();
      (v.root.querySelector('button.right') as HTMLButtonElement).click();
      v.close();
      // Read back from storage, as after a reload.
      const saved = createStore({ key: 'resume-test', empty: emptyProgress, migrate: migrateProgress }).get().resume.push;
      expect(saved).toMatchObject({ v: 1, part: 1, done: ['0.1'], sliders: { '0.1': [9] }, kept: { '1.0': [true] } });

      v = open([lesson()], store);
      await tick();
      expect(v.root.querySelectorAll('.part')).toHaveLength(2);
      expect(v.root.querySelector('[data-figure=push]')!.classList.contains('done')).toBe(true);
      expect((v.root.querySelector('input[type=range]') as HTMLInputElement).value).toBe('9');
      // No gate is left between the parts, only the one under the check.
      expect(v.root.querySelectorAll('.gate')).toHaveLength(1);
      (v.root.querySelector('button.wrong') as HTMLButtonElement).click();
      await tick();
      expect(v.root.querySelector('.result')?.textContent).toBe('1 right');
      v.close();

      // The check done and the log not yet signed: it opens at the log, with the score.
      v = open([lesson()], store);
      await tick();
      await tick();
      expect(v.root.querySelector('.gate button')).not.toBeNull();
      (v.root.querySelector('.gate button') as HTMLButtonElement).click();
      await tick();
      expect(v.root.querySelector('.logbook .score')?.textContent).toBe('Check: 1 of 2 right');
      v.close();
      v = open([lesson()], store);
      await tick();
      await tick();
      expect(v.root.querySelector('.logbook .score')?.textContent).toBe('Check: 1 of 2 right');
      (v.root.querySelector('.log .gate button') as HTMLButtonElement).click();
      v.close();
      expect(store.get().lessons.push).toMatchObject({ done: true, best: 1, of: 2 });
      expect(store.get().resume.push).toBeUndefined();
    });

    it('starts over when the figures change, but not for a change of words', async () => {
      const store = newStore();
      let v = open([lesson()], store);
      const input = v.root.querySelector('input[type=range]') as HTMLInputElement;
      input.value = '9';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
      v.close();
      const reworded = lesson();
      reworded.parts[0].blocks[0] = { kind: 'text', text: 'Push it hard.' };
      expect(lessonSignature(reworded)).toBe(lessonSignature(lesson()));
      v = open([reworded], store);
      await tick();
      expect(v.root.querySelector('[data-figure=push]')!.classList.contains('done')).toBe(true);
      v.close();
      const moved = lesson();
      moved.parts[0].blocks.reverse();
      expect(lessonSignature(moved)).not.toBe(lessonSignature(lesson()));
      v = open([moved], store);
      await tick();
      expect(v.root.querySelector('.fig.done')).toBeNull();
      expect(store.get().resume.push).toBeUndefined();
      v.close();
    });

    it('skips a lesson: it passes, keeps no place, and finishing it later replaces the skip', () => {
      const left = { ...emptyProgress(), resume: { a: { v: 1 as const, sig: 's', part: 1, done: [], scores: {}, sliders: {}, kept: {} } } };
      const skipped = skipLesson(left, 'a');
      expect(passed(skipped, 'a')).toBe(true);
      expect(passed(skipped, 'b')).toBe(false);
      expect(skipped.resume.a).toBeUndefined();
      expect(migrateProgress(JSON.parse(JSON.stringify(skipped))).lessons.a).toEqual({ done: false, best: 0, of: 0, skipped: true });
      const done = finishLesson(skipped, 'a', 2, 2, [], new Date('2026-01-02'));
      expect(done.lessons.a.skipped).toBeUndefined();
      expect(skipLesson(done, 'a')).toBe(done);
    });

    it('reads old saves and drops resumes it cannot read', () => {
      const old = JSON.parse(JSON.stringify(emptyProgress()));
      delete old.resume;
      expect(migrateProgress(old)).toEqual(emptyProgress());
      expect(migrateResume({ a: { v: 2, sig: 'x' }, b: 'junk', c: { v: 1, sig: 's', part: '2', done: ['0.1', 'x', 3], scores: { '1.0': [1, 2], bad: [1, 1] }, sliders: { '0.1': [1, 'n'] }, kept: { '0.1': { g: 1 } } } }))
        .toEqual({ c: { v: 1, sig: 's', part: 2, done: ['0.1'], scores: { '1.0': [1, 2] }, sliders: { '0.1': [1] }, kept: { '0.1': { g: 1 } } } });
    });
  });
});
