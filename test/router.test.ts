// @vitest-environment happy-dom
// The hash router (router.ts): patterns with params, teardown between views,
// the fallback page, replace without a history step, and the rewrite hook.

import { beforeEach, describe, expect, it } from 'vitest';
import { el } from '../src/dom';
import { Router } from '../src/router';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Router', () => {
  let outlet: HTMLElement;
  beforeEach(async () => {
    document.body.innerHTML = '';
    outlet = el('main');
    document.body.append(outlet);
    // Clear the hash and let its event settle before a new router starts.
    location.hash = '';
    await settle();
  });

  it('renders the view for the hash, with its params decoded', async () => {
    const seen: string[] = [];
    const r = new Router(outlet)
      .add('/home', (root) => void root.append(el('h1', {}, 'Home')))
      .add('/lesson/:id', (root, ctx) => {
        seen.push(ctx.params.id);
        root.append(el('h1', {}, `Lesson ${ctx.params.id}`));
      });
    r.start('/home');
    await settle();
    expect(outlet.textContent).toBe('Home');
    expect(location.hash).toBe('#/home');
    r.navigate('/lesson/a%20b');
    await settle();
    expect(seen).toEqual(['a b']);
    expect(outlet.querySelector('h1')!.textContent).toBe('Lesson a b');
  });

  it('tears the old view down before the next renders, and replaces the outlet', async () => {
    const log: string[] = [];
    const r = new Router(outlet)
      .add('/a', (root) => {
        log.push(`render a ${location.hash}`);
        root.append(el('p', {}, 'A'));
        return () => log.push('tear a');
      })
      .add('/b', (root) => {
        log.push('render b');
        root.append(el('p', {}, 'B'));
      });
    r.start('/a');
    await settle();
    r.navigate('/b');
    await settle();
    expect(log).toEqual(['render a #/a', 'tear a', 'render b']);
    expect(outlet.textContent).toBe('B');
  });

  it('shows the fallback page with a way home when nothing matches', async () => {
    const r = new Router(outlet).add('/home', (root) => void root.append('Home'));
    r.start('/home');
    await settle();
    r.navigate('/nowhere/at/all');
    await settle();
    expect(outlet.textContent).toContain('Nothing here.');
    expect(outlet.querySelector('a.btn')!.getAttribute('href')).toBe('#/home');
  });

  it('replaces the hash without a history step, and rewrites where a view asks to go', async () => {
    const r = new Router(outlet, { rewrite: (path) => (path === '/shift/x' ? '/lesson/x' : path) })
      .add('/home', (root) => void root.append('Home'))
      .add('/lesson/:id', (root, ctx) => void root.append(`Lesson ${ctx.params.id}`));
    r.start('/home');
    await settle();
    const steps = history.length;
    r.navigate('/shift/x', true);
    await settle();
    expect(outlet.textContent).toBe('Lesson x');
    expect(location.hash).toBe('#/lesson/x');
    expect(history.length).toBe(steps);
  });
});
