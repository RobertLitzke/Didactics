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
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
/**
 * Writes dist/index.html again as dist/`name`. A second name, so the browser
 * saves it as a file rather than opening the app, and so it is not the page
 * the service worker serves.
 */
export function oneFileCopy(root, name) {
    return {
        name: 'one-file-copy',
        apply: 'build',
        closeBundle() {
            const out = resolve(root, 'dist');
            copyFileSync(resolve(out, 'index.html'), resolve(out, name));
        },
    };
}
/** The module a course imports for the words in its code: `import('virtual:didactics/code-text')`. */
export const CODE_TEXT_MODULE = 'virtual:didactics/code-text';
/**
 * Serves CODE_TEXT_MODULE: every string that reads as words in the source
 * files under `dirs` (code-text.ts), as a table the course file carries.
 * Import it with a dynamic import(), so the table is its own chunk, loaded
 * only when someone downloads the course.
 */
export function codeTextModule(root, dirs) {
    const id = `\0${CODE_TEXT_MODULE}`;
    return {
        name: 'didactics-code-text',
        resolveId: (source) => (source === CODE_TEXT_MODULE ? id : null),
        async load(source) {
            if (source !== id)
                return null;
            const { codeTable, readSources } = await import("./code-scan.js");
            const sources = readSources(root, dirs);
            for (const path of Object.keys(sources))
                this.addWatchFile(resolve(root, path));
            return `export default ${JSON.stringify(codeTable(sources))};`;
        },
    };
}
/** Media types for the files an offline copy may inline. */
const TYPES = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
};
/** A glob as workbox reads it (`*` within a folder, `{a,b}`) as a RegExp. */
export function globRegExp(glob) {
    const body = glob
        .replace(/[.+^$()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\{([^}]*)\}/g, (_, alts) => `(${alts.split(',').join('|')})`);
    return new RegExp(`^${body}$`);
}
/** Every file under `dir`, as a path relative to it with forward slashes. */
function filesUnder(dir, prefix = '') {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? filesUnder(join(dir, d.name), `${prefix}${d.name}/`) : [`${prefix}${d.name}`]);
}
/**
 * Writes dist/index.html again as dist/`name`, with every file matching
 * `globs` inlined as a data URI in window.__LESSON_FILES__, keyed by its path.
 * Didactics' asset() looks there first, so this copy needs no connection.
 * The classic script runs before the app's module script, which waits for the
 * page to finish parsing.
 */
export function offlineCopy(root, name, globs) {
    return {
        name: 'offline-copy',
        apply: 'build',
        closeBundle() {
            const out = resolve(root, 'dist');
            const tests = globs.map(globRegExp);
            const files = {};
            for (const f of filesUnder(out).sort()) {
                const type = TYPES[extname(f).toLowerCase()];
                if (!type || !tests.some((t) => t.test(f)))
                    continue;
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
export function inlineFavicon(root) {
    const file = resolve(root, 'public', 'icons', 'icon.svg');
    return {
        name: 'inline-favicon',
        apply: 'build',
        transformIndexHtml(html) {
            if (!existsSync(file))
                return html;
            const uri = `data:image/svg+xml,${encodeURIComponent(readFileSync(file, 'utf8'))}`;
            return html.replace(/href="\.\/icons\/icon\.svg"/, `href="${uri}"`);
        },
    };
}
/** The whole Vite config for a lesson app. */
export function lessonApp(o) {
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
            o.codeText === false ? null : codeTextModule(o.root, o.codeText ?? ['src']),
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
