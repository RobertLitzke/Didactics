import type { Plugin, UserConfig } from 'vite';
/**
 * Writes dist/index.html again as dist/`name`. A second name, so the browser
 * saves it as a file rather than opening the app, and so it is not the page
 * the service worker serves.
 */
export declare function oneFileCopy(root: string, name: string): Plugin;
/** A glob as workbox reads it (`*` within a folder, `{a,b}`) as a RegExp. */
export declare function globRegExp(glob: string): RegExp;
/**
 * Writes dist/index.html again as dist/`name`, with every file matching
 * `globs` inlined as a data URI in window.__LESSON_FILES__, keyed by its path.
 * Didactics' asset() looks there first, so this copy needs no connection.
 * The classic script runs before the app's module script, which waits for the
 * page to finish parsing.
 */
export declare function offlineCopy(root: string, name: string, globs: string[]): Plugin;
/**
 * Inlines public/icons/icon.svg, the favicon, as a data URI in the built page,
 * so the one-file copy keeps its tab icon when opened from file://.
 */
export declare function inlineFavicon(root: string): Plugin;
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
     * the phone no longer has.
     */
    manifest: {
        name: string;
        short_name: string;
        description: string;
        theme_color: string;
        background_color?: string;
        id?: string;
    };
    /**
     * Files besides index.html and the icons that the service worker downloads
     * when it installs, as globs under dist/: a poster, 'photos/*.webp'. A file
     * whose contents have not changed is not downloaded again by a new version.
     */
    precache?: string[];
}
/** The whole Vite config for a lesson app. */
export declare function lessonApp(o: LessonAppOptions): UserConfig;
