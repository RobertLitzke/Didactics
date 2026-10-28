// Picks up a new deploy without a hard refresh.
//
// Each build's service worker lists index.html with a hash of its contents, so
// a changed build is a changed sw.js. The browser only looks at sw.js when a
// page is navigated to, though, and an installed app on a phone is mostly
// resumed from the background rather than opened afresh. So this also asks for
// an update when the app comes back to the foreground, comes back online, and
// every half hour while it stays open.
//
// A new worker then waits, and a waiting worker only takes over once no page
// uses the old one. A browser tab gets there when it is closed, but an
// installed app is rarely closed: it is resumed, or reloaded in the same
// window, and either way the old worker keeps serving the old page. So the
// update is applied here rather than left to the browser:
//  - at launch, before the player has touched anything, straight away;
//  - while the app is open, with a banner whose Reload applies it now;
//  - otherwise the next time the app goes to the background, so it opens on
//    the new version.
// Applying it is a reload, which keeps the URL; `beforeReload` saves anything
// else the app wants back.

import { registerSW } from 'virtual:pwa-register';
import { el } from './dom';

/** Don't look again sooner than this after the last look. */
const MIN_GAP_MS = 60 * 1000;
/** How often to look while the app stays open in the foreground. */
const EVERY_MS = 30 * 60 * 1000;
/** If the new worker has not taken over by then, reload anyway. */
const TAKEOVER_MS = 4000;
/** Remembers, across that reload, that applying an update did not take. */
const TRIED_KEY = 'didactics.update-tried';

export interface UpdateBannerText {
  /** The banner's heading, such as "New forecast in". */
  title: string;
  /** One line under it, such as "A fresh version of Clouds is ready." */
  text: string;
  /** An SVG drawn in the banner's icon tile, as markup, so it shows offline. */
  icon?: string;
  /** Called just before the page reloads onto the new version. */
  beforeReload?: () => void;
}

export function watchForUpdates(banner: UpdateBannerText): void {
  let lastCheck = Date.now();
  // Until the player taps or types, nothing on screen is theirs to lose.
  let touched = false;
  const touch = () => { touched = true; };
  window.addEventListener('pointerdown', touch, { once: true, capture: true });
  window.addEventListener('keydown', touch, { once: true, capture: true });

  let waiting = false;
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    document.querySelector('.update-banner')?.remove();
    banner.beforeReload?.();
    // The plugin reloads once the new worker controls the page.
    void updateSW(true);
    setTimeout(() => {
      try { sessionStorage.setItem(TRIED_KEY, String(Date.now())); } catch { /* private mode */ }
      location.reload();
    }, TAKEOVER_MS);
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      // If the last try did not take, ask rather than reload again and again.
      let tried = 0;
      try { tried = Number(sessionStorage.getItem(TRIED_KEY)) || 0; } catch { /* private mode */ }
      if (Date.now() - tried < MIN_GAP_MS) showBanner(banner, apply);
      else if (!touched || document.visibilityState === 'hidden') apply();
      else showBanner(banner, apply);
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = async (force = false) => {
        if (waiting || applying) return;
        if (!force && Date.now() - lastCheck < MIN_GAP_MS) return;
        if (registration.installing || !navigator.onLine) return;
        lastCheck = Date.now();
        // Asking while the server is unreachable would log a failed update, so
        // make sure sw.js can be fetched first.
        try {
          const resp = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (resp.status === 200) await registration.update();
        } catch {
          // Offline or flaky: try again next time.
        }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check();
        else if (waiting) apply();
      });
      window.addEventListener('focus', () => void check());
      window.addEventListener('online', () => void check(true));
      setInterval(() => {
        if (document.visibilityState === 'visible') void check();
      }, EVERY_MS);
    },
  });
}

/** An up arrow in a ring, for when the app gives no icon of its own. */
const ARROW =
  '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="12" fill="#fff" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M22 28v-12m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * A banner rather than confirm(): a native dialog would land in the middle of a
 * run. It does not use the .toast class, so a passing toast cannot knock it away,
 * and it stays until the player reloads or dismisses it.
 */
function showBanner({ title, text, icon = ARROW }: UpdateBannerText, reload: () => void): void {
  if (document.querySelector('.update-banner')) return;
  const close = () => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 200);
  };
  const node = el(
    'div.update-banner',
    { role: 'status' },
    el('span.update-icon', { innerHTML: icon, 'aria-hidden': 'true' }),
    el(
      'div.update-text',
      {},
      el('strong', {}, title),
      el('span', {}, text),
    ),
    el(
      'div.update-actions',
      {},
      el('button.btn.btn-small.update-later', { type: 'button', onclick: close }, 'Later'),
      el('button.btn.btn-small', { type: 'button', onclick: () => { node.remove(); reload(); } }, 'Reload'),
    ),
  );
  document.body.append(node);
}
