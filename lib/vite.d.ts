import type { Plugin, UserConfig } from 'vite';
import { COURSE_FILES_CACHE, OFFLINE_LIST } from './offline.ts';
export { COURSE_FILES_CACHE, OFFLINE_LIST };
/**
 * Writes dist/index.html again as dist/`name`. A second name, so the browser
 * saves it as a file rather than opening the app, and so it is not the page
 * the service worker serves.
 */
export declare function oneFileCopy(root: string, name: string): Plugin;
/** The module a course imports for the words in its code: `import('virtual:didactics/code-text')`. */
export declare const CODE_TEXT_MODULE = "virtual:didactics/code-text";
/**
 * Serves CODE_TEXT_MODULE: every string that reads as words in the source
 * files under `dirs` (code-text.ts), as a table the course file carries.
 * Import it with a dynamic import(), so the table is its own chunk, loaded
 * only when someone downloads the course.
 */
export declare function codeTextModule(root: string, dirs: string[]): Plugin;
/** The module a course imports for the site's encyclopedia: import it as the default export of ENCYCLOPEDIA_MODULE. */
export declare const ENCYCLOPEDIA_MODULE = "virtual:didactics/encyclopedia";
/**
 * The encyclopedia's data (encyclopedia.ts EncyclopediaData): every JSON file
 * in `dir`, by path "encyclopedia/<name>.json", and every course in a folder
 * of `courses` that has a course.json: its title, icon and lessons' titles.
 */
export declare function readEncyclopedia(dir: string, courses: string): {
    files: Record<string, unknown>;
    courses: Record<string, {
        title: string;
        icon?: string;
        lessonPath?: string;
        lessons: Record<string, string>;
    }>;
};
/** Serves ENCYCLOPEDIA_MODULE from readEncyclopedia(`dir`, `courses`), both relative to `root`. */
export declare function encyclopediaModule(root: string, dir: string, courses: string): Plugin;
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
 * Writes dist/offline.json: every file matching `globs` under dist/, so the
 * page can save them for offline on request (offline.ts saveForOffline) on a
 * site whose worker does not precache a course's large files.
 */
export declare function offlineList(root: string, globs: string[], name?: string): Plugin;
/**
 * The workbox route a site's service worker serves course files from: a
 * course's photos, maps and data folders, cached as they are first fetched
 * (and filled all at once by offline.ts saveForOffline), in the course-files
 * cache. For the site's `workbox.runtimeCaching`.
 */
export declare function courseFilesRoute(): {
    urlPattern: RegExp;
    handler: "CacheFirst";
    options: {
        cacheName: string;
        cacheableResponse: {
            statuses: number[];
        };
    };
};
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
     * the phone no longer has. `icons` are listed after the three PNGs every app
     * has (public/icons/icon-192.png, icon-512.png, icon-512-maskable.png), such
     * as an SVG: `{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }`.
     */
    manifest: {
        name: string;
        short_name: string;
        description: string;
        theme_color: string;
        background_color?: string;
        id?: string;
        icons?: ManifestIcon[];
    };
    /**
     * The course's large files, as globs under dist/: a poster, 'photos/*.webp',
     * 'maps/*'. Listed in dist/offline.json for Settings' Offline section. A
     * course on its own has its worker download them when it installs (a file
     * whose contents have not changed is not downloaded again by a new version);
     * on a site (`inSite`) they are fetched as read and saved on request.
     */
    precache?: string[];
    /**
     * The folders whose source files' words the course file carries
     * (codeTextModule), from `root`; `false` for none. Defaults to ['src'].
     */
    codeText?: string[] | false;
    /**
     * The course is one of several on a site, in a folder under the site's
     * root, and the site's own build writes the one service worker and manifest
     * for all of them. The page registers ../sw.js with the root as its scope
     * and links ../manifest.webmanifest; the site's build leaves out the sw.js
     * and manifest this build still writes for itself.
     */
    inSite?: boolean;
    /**
     * The site's encyclopedia, served as ENCYCLOPEDIA_MODULE: `dir`, the folder
     * of its files, and `courses`, the folder holding every course's folder,
     * both relative to `root` (in a site of courses, "../../encyclopedia" and "..").
     */
    encyclopedia?: {
        dir: string;
        courses: string;
    };
}
/** An icon in the web app manifest, with `src` relative to the built page. */
export interface ManifestIcon {
    src: string;
    sizes: string;
    type?: string;
    purpose?: string;
}
/** The whole Vite config for a lesson app. */
export declare function lessonApp(o: LessonAppOptions): UserConfig;
