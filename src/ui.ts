// Small pieces every view uses.

import { el, type Child } from './dom';

export function page(...children: Child[]): HTMLElement {
  return el('div.page', {}, ...children);
}

let toastTimer = 0;

/** A short message at the foot of the screen, with an optional action. */
export function toast(message: string, action?: { label: string; run: () => void }, lingerMs = 2600): void {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const node = el('div.toast', { role: 'status' }, message);
  if (action) {
    node.append(
      el(
        'button.btn.btn-small',
        {
          onclick: () => {
            node.remove();
            action.run();
          },
        },
        action.label,
      ),
    );
  }
  document.body.append(node);
  if (!action) toastTimer = window.setTimeout(() => node.remove(), lingerMs);
}

/** A seed for a run: different every time. */
export function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** A row of mutually exclusive buttons. */
export function segmented<T extends string | number>(
  options: readonly { value: T; label: string }[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
  let current = initial;
  const buttons = options.map((o) =>
    el(
      'button',
      {
        type: 'button',
        onclick: () => {
          current = o.value;
          paint();
          onPick(o.value);
        },
      },
      o.label,
    ),
  );
  const paint = () => buttons.forEach((b, i) => b.classList.toggle('on', options[i].value === current));
  paint();
  return el('div.seg', { role: 'group' }, buttons);
}

/**
 * A card over the page with a dimmed backdrop: for more about something in a
 * list, such as a cloud's photo and notes. It closes with its × button,
 * Escape, a tap on the backdrop, or a change of page. Returns a close function.
 */
export function sheet(label: string, ...children: Child[]): () => void {
  document.querySelector('.sheet-back')?.remove();
  const off = new AbortController();
  const back = el('div.sheet-back');
  const closeBtn = el('button.sheet-close', { type: 'button', 'aria-label': 'Close' }, '×');
  const card = el('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, closeBtn, ...children);
  back.append(card);
  const before = document.activeElement as HTMLElement | null;
  const close = () => {
    off.abort();
    back.remove();
    document.body.classList.remove('sheet-up');
    before?.focus?.({ preventScroll: true });
  };
  closeBtn.addEventListener('click', close);
  back.addEventListener('click', (e) => e.target === back && close());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close(), { signal: off.signal });
  window.addEventListener('hashchange', close, { signal: off.signal });
  document.body.append(back);
  document.body.classList.add('sheet-up');
  card.focus({ preventScroll: true });
  return close;
}
