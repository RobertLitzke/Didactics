import { type PaleoartList, type PictureKind } from './pictures.ts';
import { type Found, type Pick, type SourceContext } from './picture-sources.ts';
export interface CourseFiles {
    /** The course's folder. */
    dir: string;
    /** Default tools/photo-picks.json. */
    picks?: string;
    /** Default src/data/photos.json. */
    records?: string;
    /** Where files go, under public/ (default photos): public/photos/<id>.webp. */
    folder?: string;
}
/** The changes a pick's record will list: its own, plus those the tool makes (crop, fill). */
export declare function changesFor(pick: Pick): string[];
/** An SVG drawn in one colour: CSS outranks the fill attributes inside. */
export declare function recolourSvg(svg: string, fill: string): string;
/** Width and height an SVG declares (viewBox, else width/height). */
export declare function svgSize(svg: string): [number, number];
export interface FetchOptions extends CourseFiles, SourceContext {
    /** Redo picks already saved. */
    redo?: boolean;
    /** Delete files no record names. */
    prune?: boolean;
    /** WebP settings (default quality 72, effort 6). */
    webp?: Record<string, unknown>;
    /** A saved inaccurate-paleoart list to refuse picks on, besides the file's own categories. */
    paleoart?: PaleoartList;
    log?: (message: string) => void;
}
/**
 * Fetches a course's picks into public/<folder>/ and src/data/photos.json.
 * Each pick names a source (didactics/picture-sources); its licence and
 * author are read from the source now, and a licence the courses do not
 * accept, or a Commons file marked inaccurate paleoart, is refused. Raster
 * pictures are resized to `width` and saved as WebP; SVG (PhyloPic) is kept
 * as SVG, recoloured if the pick has `fill`. Returns how many failed.
 */
export declare function fetchPictures(o: FetchOptions): Promise<{
    records: number;
    failed: string[];
}>;
/** Records in the old photo shape given a kind (default photo); records that have one are left alone. */
export declare function migrateList<T extends Record<string, unknown>>(list: T[], guess?: (r: T) => PictureKind | undefined): (T & {
    kind: PictureKind;
})[];
/** Migrates a records file in place; returns how many records changed. */
export declare function migrateFile(file: string, guess?: (r: Record<string, unknown>) => PictureKind | undefined): number;
/** Reads Commons' inaccurate-paleoart category tree and template users into a list to save. */
export declare function fetchPaleoart(ctx: SourceContext, o?: {
    categories?: string[];
    templates?: string[];
    depth?: number;
}): Promise<PaleoartList>;
export interface CheckResult {
    /** Records whose fields are wrong. */
    problems: {
        id: string;
        problem: string;
    }[];
    /** Records on the inaccurate-paleoart list. */
    paleoart: {
        id: string;
        title: string;
        problem: string;
    }[];
}
/**
 * Checks a course's records offline: every record's fields, and none on the
 * saved inaccurate-paleoart list. `live` also asks Commons for every Commons
 * file's categories, for a file marked since the list was saved.
 */
export declare function checkPictures(records: Record<string, unknown>[], o?: {
    paleoart?: PaleoartList;
    live?: SourceContext;
}): Promise<CheckResult>;
/** What `find` searches: tools/photo-search.json. */
export interface SearchSpec {
    /** Commons categories per key: { "cirrus": ["Cirrus clouds"] }. */
    categories?: Record<string, string[]>;
    /** Keys whose pictures belong to another key's genus (Clouds): { "mammatus": { "genus": "cumulonimbus", "categories": [...] } }. */
    features?: Record<string, {
        genus: string;
        categories: string[];
    }>;
    /** Other sources per key: { "trex": { "phylopic": "Tyrannosaurus", "inaturalist": "Amanita muscaria", "smithsonian": "trilobite" } }. */
    sources?: Record<string, {
        phylopic?: string;
        inaturalist?: string;
        smithsonian?: string;
    }>;
    /** Narrower raster files are left out (default 1200). */
    minWidth?: number;
    /** The field the key goes into on a pick (default about). */
    field?: string;
}
/**
 * Categories list files alphabetically, so one keen photographer's series can
 * fill a whole sheet. Take every author's first picture, then every author's
 * second, and so on.
 */
export declare function spreadByAuthor<T extends {
    author: string;
}>(files: T[]): T[];
/**
 * Searches every source the spec names and writes a contact sheet,
 * <outDir>/index.html (and candidates.json): tap the pictures that clearly
 * show their subject (categories and searches are often loose), then paste
 * the JSON at the bottom into tools/photo-picks.json.
 */
export declare function findCandidates(o: CourseFiles & SourceContext & {
    spec: SearchSpec;
    outDir?: string;
    perKey?: number;
    title?: string;
    log?: (m: string) => void;
}): Promise<string>;
/** The contact sheet: a grid per key; ticked pictures become picks in the box at the bottom, ids following on from the picks made. */
export declare function contactSheet(found: Record<string, Found[]>, picks: Pick[], spec: SearchSpec, title: string): string;
