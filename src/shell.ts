// The frame around every page: a top bar with the app's wordmark on the left
// and a dropdown menu of its pages on the right, which shows the current
// page's name and opens a short list, so more pages can join without crowding
// the bar. Pages on which the bar would be in the way (a lesson fills the
// screen) hide it. Its styles are in kit.css (.topbar, .wordmark, .navmenu).
//
// Use the pieces on their own (pageMenu, topBar) or all of it (appShell):
//
//   const shell = appShell({ mount: document.getElementById('app')!, title: 'Levers', subtitle: 'How a long handle helps',
//     mark: el('img.logo', { src: 'icons/icon.svg', alt: '' }),
//     nav: [{ path: '/home', label: 'Home' }, { path: '/settings', label: 'Settings' }], fullScreen: (p) => p.startsWith('/lesson/') });
//   new Router(shell.outlet, { before: shell.before }).add(…).start('/home');

import { el, type Child } from './dom';

export interface NavLink {
  /** The route, such as "/quiz"; it is "here" for any path that starts with it. */
  path: string;
  label: string;
}

export interface PageMenu {
  node: HTMLDetailsElement;
  /** Show `path` as the current page. */
  mark: (path: string) => void;
}

/** The dropdown of pages. It closes when a page is picked or on a tap elsewhere. */
export function pageMenu(links: readonly NavLink[], fallback = 'Menu'): PageMenu {
  const anchors = links.map((l) => el('a', { href: `#${l.path}` }, l.label));
  const current = el('span');
  const node = el('details.navmenu', {}, el('summary', {}, current), el('nav', {}, anchors)) as HTMLDetailsElement;
  node.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) node.open = false;
  });
  document.addEventListener('pointerdown', (e) => {
    if (node.open && !node.contains(e.target as Node)) node.open = false;
  });
  const mark = (path: string) => {
    anchors.forEach((a, i) => a.classList.toggle('here', path.startsWith(links[i].path)));
    current.textContent = links.find((l) => path.startsWith(l.path))?.label ?? fallback;
    node.open = false;
  };
  return { node, mark };
}

export interface TopBarOptions {
  /** The app's name: words, or any node, such as a styled logotype. */
  title: Child;
  subtitle?: string;
  /** A logo before the title, such as an <img> or <svg>, inside the link home. */
  mark?: Child;
  home?: string;
}

/**
 * The bar itself: the wordmark (a link home: the mark, the title, the
 * subtitle) and whatever goes on the right, usually a pageMenu.
 */
export function topBar(o: TopBarOptions & { right?: Child }): HTMLElement {
  const words: Child[] = [o.title, o.subtitle ? el('span', {}, o.subtitle) : null];
  const href = `#${o.home ?? '/home'}`;
  // With a mark, the words stack beside it rather than under it.
  const wordmark = o.mark
    ? el('a.wordmark.with-mark', { href }, o.mark, el('div.wordmark-words', {}, words))
    : el('a.wordmark', { href }, words);
  return el('header.topbar', {}, wordmark, o.right ?? null);
}

export interface AppShellOptions extends TopBarOptions {
  /** The element the app fills, such as #app. */
  mount: HTMLElement;
  nav: readonly NavLink[];
  /** Pages shown without the bar; the body gets the class `in-lesson` on them. */
  fullScreen?: (path: string) => boolean;
}

export interface AppShell {
  header: HTMLElement;
  menu: PageMenu;
  /** Where the router puts each page. */
  outlet: HTMLElement;
  /** The router's `before` hook: marks the page in the menu, and hides the bar on full-screen pages. */
  before: (path: string) => void;
}

export function appShell(o: AppShellOptions): AppShell {
  const menu = pageMenu(o.nav);
  const header = topBar({ title: o.title, subtitle: o.subtitle, mark: o.mark, home: o.home, right: menu.node });
  const outlet = el('main');
  o.mount.replaceChildren(header, outlet);
  return {
    header,
    menu,
    outlet,
    before: (path) => {
      document.body.classList.toggle('in-lesson', o.fullScreen?.(path) ?? false);
      menu.mark(path);
    },
  };
}
