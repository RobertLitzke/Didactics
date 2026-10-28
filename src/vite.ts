// The build every lesson app shares. The app is inlined into dist/index.html
// (JS, CSS and fonts), so the page works from file:// and from a GitHub Pages
// sub-path; photos and other large files sit next to it, and the service
// worker downloads all of them when it installs, so the installed app works
// offline from then on. The same page is also written under a second name, the
// one-file copy that the settings page offers to download, and optionally a
// third time with every large file inlined, a bigger copy that needs no
// connection at all.

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Writes dist/index.html again as dist/`name`. A second name, so the browser
 * saves it as a file rather than opening the app, and so it is not the page
 * the service worker serves.
 */
export function oneFileCopy(root: string, name: string): Plugin {
  return {
    name: 'one-file-copy',
    apply: 'build',
    closeBundle() {
      const out = resolve(root, 'dist');
      copyFileSync(resolve(out, 'index.html'), resolve(out, name));
    },
  };
}

/** Media types for the files an offline copy may inline. */
const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/** A glob as workbox reads it (`*` within a folder, `{a,b}`) as a RegExp. */
export function globRegExp(glob: string): RegExp {
  const body = glob
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\{([^}]*)\}/g, (_, alts: string) => `(${alts.split(',').join('|')})`);
  return new RegExp(`^${body}$`);
}

/** Every file under `dir`, as a path relative to it with forward slashes. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? filesUnder(join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`],
  );
}

/**
 * Writes dist/index.html again as dist/`name`, with every file matching
 * `globs` inlined as a data URI in window.__LESSON_FILES__, keyed by its path.
 * Didactics' asset() looks there first, so this copy needs no connection.
 * The classic script runs before the app's module script, which waits for the
 * page to finish parsing.
 */
export function offlineCopy(root: string, name: string, globs: string[]): Plugin {
  return {
    name: 'offline-copy',
    apply: 'build',
    closeBundle() {
      const out = resolve(root, 'dist');
      const tests = globs.map(globRegExp);
      const files: Record<string, string> = {};
      for (const f of filesUnder(out).sort()) {
        const type = TYPES[extname(f).toLowerCase()];
        if (!type || !tests.some((t) => t.test(f))) continue;
        files[f] = `data:${type};base64,${readFileSync(join(out, f)).toString('base64')}`;
      }
      const script = `<script>window.__LESSON_FILES__=${JSON.stringify(files)}</script>`;
      const html = readFileSync(resolve(out, 'index.html'), 'utf8');
      writeFileSync(resolve(out, name), html.replace('</body>', () => `${script}\n</body>`));
    },
  };
}

/**
 * Inlines public/icons/icon.svg, the favicon, as a data URI in the built page,
 * so the one-file copy keeps its tab icon when opened from file://.
 */
export function inlineFavicon(root: string): Plugin {
  const file = resolve(root, 'public', 'icons', 'icon.svg');
  return {
    name: 'inline-favicon',
    apply: 'build',
    transformIndexHtml(html) {
      if (!existsSync(file)) return html;
      const uri = `data:image/svg+xml,${encodeURIComponent(readFileSync(file, 'utf8'))}`;
      return html.replace(/href="\.\/icons\/icon\.svg"/, `href="${uri}"`);
    },
  };
}

export interface LessonAppOptions {
  /** The folder vite.config.ts is in. */
  root: string;
  /** The app's version, shown as __APP_VERSION__. */
  version: string;
  /** Dev server port; the preview server gets the next one. */
  port: number;
  /** The one-file copy's name, such as "clouds.html". */
  oneFile: string;
  /**
   * The name of a bigger one-file copy with every `precache` file inlined, such
   * as "clouds-offline.html", for a page that works with no connection at all.
   */
  offlineFile?: string;
  /**
   * The manifest. `id` is what the browser knows an installed app by; it
   * defaults to start_url. Changing it makes the browser treat the app as a
   * new one, which is how to get past an install the browser remembers but
   * the phone no longer has. `icons` are listed after the three PNGs every app
   * has (public/icons/icon-192.png, icon-512.png, icon-512-maskable.png), such
   * as an SVG: `{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }`.
   */
  manifest: { name: string; short_name: string; description: string; theme_color: string; background_color?: string; id?: string; icons?: ManifestIcon[] };
  /**
   * Files besides index.html and the icons that the service worker downloads
   * when it installs, as globs under dist/: a poster, 'photos/*.webp'. A file
   * whose contents have not changed is not downloaded again by a new version.
   */
  precache?: string[];
}

/** An icon in the web app manifest, with `src` relative to the built page. */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

/** The whole Vite config for a lesson app. */
export function lessonApp(o: LessonAppOptions): UserConfig {
  const { icons = [], ...manifest } = o.manifest;
  return {
    // Relative, so index.html works from file:// and from a GitHub Pages sub-path.
    base: './',
    server: { port: o.port, strictPort: true },
    preview: { port: o.port + 1, strictPort: true },
    define: { __APP_VERSION__: JSON.stringify(o.version) },
    // Didactics ships TypeScript source; Vite compiles it with the app's own
    // files rather than pre-bundling it as a dependency.
    optimizeDeps: { exclude: ['didactics'] },
    build: { target: 'es2022' },
    plugins: [
      viteSingleFile(),
      inlineFavicon(o.root),
      oneFileCopy(o.root, o.oneFile),
      o.offlineFile ? offlineCopy(o.root, o.offlineFile, o.precache ?? []) : null,
      VitePWA({
        registerType: 'prompt',
        injectRegister: null, // registered by hand, with Didactics' update.ts
        // The glob below already lists the icons; left on, the plugin lists them
        // a second time without a revision and workbox refuses the conflict.
        includeManifestIcons: false,
        workbox: {
          globPatterns: ['index.html', ...(o.precache ?? []), 'icons/*.{png,svg}'],
          inlineWorkboxRuntime: true,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // Photos are well under this; the inlined page is the largest file.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Nothing here has a hashed name, so every file gets a revision.
          dontCacheBustURLsMatching: /^(?!)/,
        },
        manifest: {
          ...manifest,
          background_color: manifest.background_color ?? manifest.theme_color,
          display: 'standalone',
          orientation: 'portrait',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ...icons,
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
}
