// The radio slip: a talk (radio.ts) typed out on a torn strip of paper that
// rises from the foot of the screen. It sits over the lesson without blocking
// it, so reading and scrolling go on; it folds down to its header, and it can
// be shut. Shutting it midway is rude, and the reader is told so, but a small
// radio button stays in the corner so the talk can be picked up again until
// they leave the lesson. One talk shows at a time; the rest wait.

import { el, svg } from './dom';
import { ACK as DEFAULT_ACK, type Stations, type Talk } from './radio';

export function radioIcon(): SVGElement {
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    svg('rect', { x: 3, y: 9, width: 18, height: 12, rx: 2 }),
    svg('line', { x1: 8, y1: 9, x2: 17, y2: 2 }),
    svg('circle', { cx: 8.5, cy: 15, r: 3, class: 'screen' }),
    svg('rect', { x: 14, y: 12, width: 5, height: 1.6, rx: 0.8, class: 'screen' }),
    svg('rect', { x: 14, y: 16, width: 5, height: 1.6, rx: 0.8, class: 'screen' }),
  );
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Queued {
  talk: Talk;
  resolve: (heard: boolean) => void;
}

export interface SlipOptions {
  stations: Stations;
  /** Said in a fading bar when a talk is shut midway; one is picked at random. */
  snubs?: readonly string[];
  /** The last reply, which closes a talk heard to the end. */
  signOff?: string;
  /** What the reader says when a turn offers no choice. */
  ack?: string;
  /** A talk was heard to the end, with these replies picked. */
  onHeard?: (talkId: string, picks: number[]) => void;
  /** A reply marked `off` was picked: switch the radio setting off. */
  onOff?: () => void;
}

export interface Slip {
  /** Put a talk on the radio. Resolves true when it is heard to the end, false if it is shut or cleared away. */
  play: (talk: Talk) => Promise<boolean>;
  /** Take down the slip and everything waiting, when the lesson is left. */
  clear: () => void;
}

/** The radio slip for one app: its two stations and what it does with what was heard. */
export function createSlip({ stations: STATIONS, snubs: SNUBS = [], signOff = 'Signing off.', ack: ACK = DEFAULT_ACK, onHeard, onOff }: SlipOptions): Slip {
  const queue: Queued[] = [];
  let showing: Queued | null = null;
  /** Talks shut midway this visit, which the corner button brings back. */
  const snubbed: Queued[] = [];
  let reopen: HTMLElement | null = null;

  function playTalk(talk: Talk): Promise<boolean> {
    return new Promise((resolve) => {
      queue.push({ talk, resolve });
      pump();
    });
  }

  function clearRadio(): void {
    for (const q of [...queue, ...snubbed]) q.resolve(false);
    queue.length = 0;
    snubbed.length = 0;
    reopen?.remove();
    reopen = null;
    if (showing) {
      showing.resolve(false);
      showing = null;
    }
    document.querySelector('.radio-slip')?.remove();
    document.body.classList.remove('radio-up');
  }

  function pump(): void {
    if (showing || !queue.length) return;
    showing = queue.shift()!;
    show(showing);
  }

  function paintReopen(): void {
    if (!snubbed.length) {
      reopen?.remove();
      reopen = null;
      return;
    }
    if (!reopen) {
      reopen = el('button.radio-reopen', {
        type: 'button',
        'aria-label': `${STATIONS.them.place} is still on the line`,
        title: `${STATIONS.them.place} is still on the line`,
        onclick: () => {
          const q = snubbed.pop();
          paintReopen();
          if (q) {
            queue.unshift(q);
            pump();
          }
        },
      }, radioIcon());
      document.body.append(reopen);
    }
  }

  function butterbar(text: string): void {
    document.querySelector('.butterbar')?.remove();
    const node = el('div.butterbar', { role: 'status' }, text);
    document.body.append(node);
    setTimeout(() => node.remove(), 5200);
  }

  /** Type `text` into `node` a letter at a time; a tap on the slip finishes it at once. */
  function typeInto(node: HTMLElement, text: string, slip: HTMLElement): Promise<void> {
    if (reduced()) {
      node.textContent = text;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let i = 0;
      const finish = () => {
        clearInterval(timer);
        slip.removeEventListener('click', finish);
        node.textContent = text;
        resolve();
      };
      const timer = setInterval(() => {
        i += 2;
        node.textContent = text.slice(0, i);
        if (i >= text.length) finish();
      }, 22);
      slip.addEventListener('click', finish);
    });
  }

  function show(q: Queued): void {
    const { talk } = q;
    const log = el('div.slip-log', { 'aria-live': 'polite' });
    const answers = el('div.slip-replies');
    const fold = el('button.slip-btn', { type: 'button', 'aria-label': 'Fold the transcript down', title: 'Fold' }, '–') as HTMLButtonElement;
    const shut = el('button.slip-btn', { type: 'button', 'aria-label': 'Switch the radio off', title: 'Switch off' }, '×') as HTMLButtonElement;
    const slip = el('aside.radio-slip', { role: 'dialog', 'aria-label': `Radio talk with ${STATIONS.them.place}` }, el('div.slip-paper', {},
      el('header.slip-head', {},
        el('div.slip-icon', {}, radioIcon()),
        el('p', {}, `${STATIONS.them.call} ${STATIONS.them.place} · ${STATIONS.you.call} ${STATIONS.you.place}`, el('span', {}, talk.when)),
        fold, shut),
      el('div.slip-body', {}, log, answers),
    ));
    document.body.append(slip);
    document.body.classList.add('radio-up');
    requestAnimationFrame(() => slip.classList.add('in'));

    let over = false;
    const close = (heard: boolean) => {
      if (over) return;
      over = true;
      document.removeEventListener('keydown', onKey);
      slip.classList.remove('in');
      document.body.classList.remove('radio-up');
      setTimeout(() => slip.remove(), 300);
      showing = null;
      if (heard) q.resolve(true);
      else {
        // Shut is closed for whoever waits on it; the corner button can still bring it back.
        q.resolve(false);
        snubbed.push(q);
        paintReopen();
        if (SNUBS.length) butterbar(SNUBS[Math.floor(Math.random() * SNUBS.length)]);
      }
      pump();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    fold.addEventListener('click', (e) => {
      e.stopPropagation();
      slip.classList.toggle('folded');
    });
    shut.addEventListener('click', (e) => {
      e.stopPropagation();
      close(false);
    });

    const say = async (who: 'them' | 'you', text: string) => {
      const words = el('span');
      log.append(el('p', { className: who }, el('b', {}, `${(who === 'them' ? STATIONS.them : STATIONS.you).place.toUpperCase()}: `), words));
      if (who === 'them') await typeInto(words, text, slip);
      else words.textContent = text;
      log.scrollTop = log.scrollHeight;
    };
    const choose = (labels: string[]): Promise<number> =>
      new Promise((resolve) => {
        answers.replaceChildren(...labels.map((label, k) =>
          el('button.slip-reply', { type: 'button', onclick: (e: MouseEvent) => {
            e.stopPropagation();
            answers.replaceChildren();
            resolve(k);
          } }, label)));
        log.scrollTop = log.scrollHeight;
      });

    void (async () => {
      const picks: number[] = [];
      for (const turn of talk.turns) {
        await say('them', turn.them);
        if (over) return;
        const replies = turn.replies?.length ? turn.replies : [{ say: ACK }];
        const k = await choose(replies.map((r) => r.say));
        if (over) return;
        picks.push(k);
        if (replies[k].off) onOff?.();
        await say('you', replies[k].say);
        if (replies[k].back) await say('them', replies[k].back!);
        if (over) return;
      }
      onHeard?.(talk.id, picks);
      await choose([signOff]);
      close(true);
    })();
  }

  return { play: playTalk, clear: clearRadio };
}
