/** The cache the site's service worker serves course files from, and saveForOffline fills. */
export declare const COURSE_FILES_CACHE = "course-files";
/** The file the build writes next to a course's page, listing its large files for saveForOffline. */
export declare const OFFLINE_LIST = "offline.json";
/** The paths of every file under `folder` (next to the page) held in either cache. */
export declare function savedPaths(folder: string): Promise<Set<string>>;
/**
 * How many of the files under `folder` (such as "photos/", next to the page)
 * are saved. Next to the page, so that on a site of several courses, which
 * share one service worker, each counts only its own.
 */
export declare function savedCount(folder: string): Promise<number>;
export interface SaveProgress {
    /** Files saved so far, counting those that were there already. */
    saved: number;
    total: number;
}
/**
 * Save every file in the course's list (OFFLINE_LIST next to the page) into
 * the course-files cache, skipping those already held, and report progress
 * after each. Stops when `signal` aborts. Resolves to how many are saved.
 */
export declare function saveForOffline(onProgress: (p: SaveProgress) => void, signal?: AbortSignal, list?: string): Promise<number>;
/** Drop every file under `folder` from the course-files cache (the precache is the worker's own). */
export declare function forgetOffline(folder: string): Promise<void>;
/**
 * Deletes caches an older version kept, such as one that held each photo once
 * seen, but only once all `total` files are in the precache, so nothing that
 * worked offline stops working.
 */
export declare function retireWhenSaved(folder: string, total: number, names: string[]): Promise<void>;
