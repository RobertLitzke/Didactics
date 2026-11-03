/** The cache the site's service worker serves course files from, and saveForOffline fills. */
export declare const COURSE_FILES_CACHE = "course-files";
/** The file the build writes next to a course's page, listing its large files for saveForOffline. */
export declare const OFFLINE_LIST = "offline.json";
/** The paths of every file under `folder` (next to the page) held in either cache. */
export declare function savedPaths(folder: string): Promise<Set<string>>;
/** The build's list of the course's large files (OFFLINE_LIST next to the page), as paths relative to it. */
export declare function offlineFiles(list?: string): Promise<string[]>;
/**
 * How many of `files` (paths relative to the page, as offlineFiles gives
 * them) are saved in either cache. Each course counts its own list, so on a
 * site of several courses sharing one service worker the counts stay apart.
 */
export declare function savedCount(files: readonly string[]): Promise<number>;
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
/** Drop `files` (paths relative to the page) from the course-files cache (the precache is the worker's own). */
export declare function forgetOffline(files: readonly string[]): Promise<void>;
/**
 * Deletes caches an older version kept, such as one that held each photo once
 * seen, but only once every one of `files` is saved, so nothing that worked
 * offline stops working.
 */
export declare function retireWhenSaved(files: readonly string[], names: string[]): Promise<void>;
