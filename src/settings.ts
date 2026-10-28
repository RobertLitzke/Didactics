// The settings page every lesson app has: the name on the log, units, the
// radio, moving progress between devices, what is saved for offline, the app
// as one file, and erasing progress. An app says what its own words are and adds any sections it needs.

import { fromDisk, selfContained } from './asset';
import { el, type Child } from './dom';
import { savedCount } from './offline';
import type { Progress, Units } from './progress';
import type { View } from './router';
import type { Store } from './store';
import { segmented, toast } from './ui';

export interface SettingsOptions<S extends Progress> {
  store: Store<S>;
  empty: () => S;
  /** The app's short name, as in "That file is not a Clouds save." */
  appName: string;
  /** The name a saved progress file gets, such as "clouds-save.json". */
  saveFile: string;
  /** A units switch, with the field's label, such as "Heights in". */
  units?: { label: string; imperial: string; metric: string };
  /** A radio switch, with a line on what the talks are. */
  radio?: { blurb: string };
  /**
   * The one-file copy of the app (see vite.ts oneFileCopy): its URL and file
   * name, and the bigger copy with every photo inside (vite.ts offlineCopy).
   */
  oneFile?: { href: string; name: string; offline?: { href: string; name: string } };
  /**
   * The folder of large files the service worker saves (such as "photos/"),
   * how many there are, and what to call them, for the Offline section.
   */
  offline?: { folder: string; total: number; noun: string };
  /** More, under About, before the erase button. */
  about?: Child;
  home?: string;
}

export function settingsView<S extends Progress>(o: SettingsOptions<S>): View {
  const { store } = o;
  return (root) => {
    const save = store.get();
    const name = el('input', { type: 'text', maxLength: 40, value: save.name, placeholder: 'Your name' }) as HTMLInputElement;
    name.addEventListener('change', () => store.update((s) => ({ ...s, name: name.value.trim() })));

    const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      toast(store.importText(await f.text()) ? 'Progress loaded.' : `That file is not a ${o.appName} save.`);
      file.value = '';
    });

    const download = () => {
      const blob = new Blob([store.exportText()], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: o.saveFile }) as HTMLAnchorElement;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    root.append(
      el(
        'div.page.settings',
        {},
        el('h1', {}, 'Settings'),
        el('label.field', {}, el('span', {}, 'Name on the logbook'), name),
        o.units
          ? el(
              'div.field',
              {},
              el('span', {}, o.units.label),
              segmented<Units>(
                [
                  { value: 'imperial', label: o.units.imperial },
                  { value: 'metric', label: o.units.metric },
                ],
                save.units,
                (units) => store.update((s) => ({ ...s, units })),
              ),
            )
          : null,
        o.radio
          ? [
              el(
                'div.field',
                {},
                el('span', {}, 'Radio talks'),
                segmented(
                  [
                    { value: 1, label: 'On' },
                    { value: 0, label: 'Off' },
                  ] as const,
                  save.talk ? 1 : 0,
                  (on) => store.update((s) => ({ ...s, talk: on === 1 })),
                ),
              ),
              el('p.muted', {}, o.radio.blurb),
              el(
                'button.btn.btn-ghost',
                {
                  type: 'button',
                  onclick: () => {
                    store.update((s) => ({ ...s, talk: true, introSeen: false }));
                    location.hash = `#${o.home ?? '/home'}`;
                  },
                },
                'Hear the opening talk again',
              ),
            ]
          : null,
        el('h2', {}, 'Progress'),
        el('p.muted', {}, 'Progress lives in this browser. Save it to a file to move it to another device.'),
        el(
          'div.row',
          {},
          el('button.btn', { type: 'button', onclick: download }, 'Save to file'),
          el('button.btn.btn-ghost', { type: 'button', onclick: () => file.click() }, 'Load from file'),
          file,
        ),
        o.offline && !fromDisk ? offlineSection(o.offline) : null,
        o.oneFile ? oneFileSection(o.oneFile) : null,
        o.about ? [el('h2', {}, 'About'), o.about] : null,
        el(
          'button.btn.btn-danger',
          {
            type: 'button',
            onclick: () => {
              if (!confirm('Erase all progress?')) return;
              store.set(o.empty());
              toast('Progress erased.');
            },
          },
          'Erase progress',
        ),
      ),
    );
  };
}

/** How many of the photos are saved on this device, counting up while the service worker downloads them. */
function offlineSection({ folder, total, noun }: NonNullable<SettingsOptions<Progress>['offline']>): Child {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') {
    return [el('h2', {}, 'Offline'), el('p.muted', {}, `This browser cannot keep the ${noun} for use with no connection.`)];
  }
  const line = el('p.muted', {}, `Checking which ${noun} are saved…`);
  const bar = el('progress.offline-bar', { max: total, value: 0 }) as HTMLProgressElement;
  const look = async () => {
    const n = Math.min(await savedCount(folder), total);
    bar.value = n;
    line.textContent =
      n >= total
        ? `All ${total} ${noun} are saved on this device. The app works with no connection.`
        : `${n} of ${total} ${noun} saved on this device so far. ${navigator.onLine ? 'The rest are downloading; keep the app open.' : 'The rest download next time you are online.'}`;
    if (n < total && line.isConnected) setTimeout(look, 1500);
  };
  // Look once the section is on the page, so the first isConnected is true.
  setTimeout(look, 0);
  return [el('h2', {}, 'Offline'), bar, line];
}

function oneFileSection(f: NonNullable<SettingsOptions<Progress>['oneFile']>): Child {
  const text = selfContained
    ? 'This is the downloaded copy with every photo inside. It needs no connection at all. Its progress is kept apart from the website’s, so use Save to file to carry progress across.'
    : fromDisk
      ? `This is the downloaded copy. It works with no connection; the photos come from the website, so they show only when you are online.${f.offline ? ` ${f.offline.name} has the photos inside.` : ''} Its progress is kept apart from the website’s, so use Save to file to carry progress across.`
      : f.offline
        ? `The app in a single page, to keep on a phone or pass to someone. ${f.name} is small and shows the photos only when you are online; ${f.offline.name} is bigger and has every photo inside, so it needs no connection at all. Either keeps its progress apart from this one’s.`
        : 'Everything but the photos in a single page, to keep on a phone or pass to someone. It works with no connection, and shows the photos whenever you are online. Its progress is kept apart from this one’s.';
  const big = f.offline ? (el('a.btn.btn-ghost', { href: f.offline.href, download: f.offline.name }, `Download ${f.offline.name}`) as HTMLAnchorElement) : null;
  if (big && f.offline) void sizeOf(f.offline.href).then((mb) => mb && (big.textContent = `Download ${f.offline!.name} (${mb})`));
  return [
    el('h2', {}, 'The app as one file'),
    el('p.muted', {}, text),
    el('div.row', {}, el('a.btn.btn-ghost', { href: f.href, download: f.name }, fromDisk && !selfContained ? 'Download the latest copy' : `Download ${f.name}`), big),
  ];
}

/** A file's size as "12.6 MB", or null when it cannot be asked for. */
async function sizeOf(href: string): Promise<string | null> {
  try {
    const res = await fetch(href, { method: 'HEAD' });
    const bytes = Number(res.headers.get('content-length'));
    return res.ok && bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : null;
  } catch {
    return null;
  }
}
