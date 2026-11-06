import { type LicenseId, type PictureKind } from './pictures.ts';
/** One picture at a source, read and ready to download. */
export interface Found {
    /** The source by name, for the record: "Wikimedia Commons". */
    source: string;
    /** The file to download, sized near the width asked for where the source can. */
    imageUrl: string;
    /** A small copy for a contact sheet. */
    thumbUrl: string;
    /** The page the credit links to. */
    pageUrl: string;
    author: string;
    /** Null when the licence is not one the courses accept. */
    license: LicenseId | null;
    /** The licence as the source spells it, to say why a file was refused. */
    licenseName: string;
    width: number;
    height: number;
    /** svg for a vector file, kept as it is; raster for everything else. */
    format: 'svg' | 'raster';
    /** The kind the source suggests: a PhyloPic image is a silhouette. */
    kind?: PictureKind;
    /** What it is called at the source, for the contact sheet. */
    label: string;
    /** The pick fields that name it at its source: { "phylopic": "<uuid>" }. */
    ref: Record<string, string>;
    /** Commons only: the file's title and categories (for the paleoart check). */
    title?: string;
    categories?: string[];
}
export interface SourceContext {
    /** Who is asking: "GeologyCourse/0.1 (https://github.com/…)". */
    userAgent: string;
    /** The width the course stores pictures at (default 1024). */
    width?: number;
    /** BHL_API_KEY, SI_API_KEY. Default process.env. */
    env?: Record<string, string | undefined>;
    /** For tests. */
    fetch?: typeof fetch;
    /** Warnings. Default console.warn. */
    warn?: (message: string) => void;
}
/** A pick: one line of tools/photo-picks.json. The course's own fields ride along. */
export type Pick = {
    id: string;
    kind?: PictureKind;
    crop?: [number, number, number, number];
    changes?: string[];
} & Record<string, unknown>;
export interface Source {
    /** The pick field that names it ("phylopic"). */
    key: string;
    /** The source by name. */
    name: string;
    resolve(pick: Pick, ctx: SourceContext): Promise<Found | null>;
    /** Candidates for a query (a taxon, a subject), for the contact sheet. */
    search?(query: string, ctx: SourceContext, limit: number): Promise<Found[]>;
}
/**
 * Fetch politely: when a source says slow down (429, or a 5xx), wait and try
 * again, a little longer each time. `body` posts a form.
 */
export declare function politeFetch(url: string, ctx: SourceContext, body?: URLSearchParams, tries?: number): Promise<Response>;
/** Sources give authors as HTML, often a link to a user page. */
export declare function plainText(html: string | null | undefined): string;
/**
 * Commons hands out thumbnails on thumb.wikimedia.org, which some networks do
 * not reach. upload.wikimedia.org serves the same path, so use that, without
 * the tracking parameters.
 */
export declare const thumbHost: (url: string) => string;
/** A Commons page from the API's imageinfo answer. */
export declare function commonsFound(page: any, categories: string[]): Found | null;
/**
 * Read up to 50 files at a time: licence, author, page, a copy `thumbWidth`
 * wide, size and categories (so a file Commons marks as inaccurate paleoart
 * is seen at the moment it is fetched).
 */
export declare function commonsFiles(titles: string[], thumbWidth: number, ctx: SourceContext): Promise<Found[]>;
/** Every file directly in a category, up to `limit`. */
export declare function categoryFiles(category: string, ctx: SourceContext, limit?: number): Promise<string[]>;
/** Files in a category and its subcategories, `depth` levels down. */
export declare function categoryTreeFiles(category: string, ctx: SourceContext, depth?: number): Promise<string[]>;
/** Files that use a template (a review tag such as {{Inaccurate paleoart}}). */
export declare function templateFiles(template: string, ctx: SourceContext): Promise<string[]>;
/** Where Commons keeps its paleoart reviewers' verdicts. */
export declare const PALEOART: {
    categories: string[];
    templates: string[];
};
/** A Commons category name that marks a file as inaccurate paleoart. */
export declare const isPaleoartCategory: (c: string) => boolean;
export declare const commons: Source;
/** A PhyloPic image from the API's answer (the image with its links). */
export declare function phylopicFound(image: any): Found;
export declare const phylopic: Source;
/** "(c) Jane Doe, some rights reserved (CC BY)" → "Jane Doe". */
export declare function inatAuthor(attribution: string | undefined, user?: {
    name?: string;
    login?: string;
}): string;
/** A photo of an iNaturalist observation. iNaturalist's CC licences are version 4.0. */
export declare function inatFound(obs: any, photo: any, width?: number): Found;
export declare const inaturalist: Source;
/**
 * A BHL page, its book (item) and title, as the API gives them. Most of
 * BHL is public domain; books still in copyright are often CC BY-NC-SA,
 * which is refused.
 */
export declare function bhlFound(page: any, item: any, title: any): Found;
export declare const bhl: Source;
/**
 * A Smithsonian Open Access record and one of its images. Only CC0 media are
 * open access; everything else in the record is refused.
 */
export declare function smithsonianFound(row: any, mediaId?: string, width?: number): Found | null;
export declare const smithsonian: Source;
/** A file named by its URL: the pick gives the page, source, author and licence read by a person. */
export declare const direct: Source;
/** Every source, by the pick field that names it. */
export declare const SOURCES: readonly Source[];
/** The source a pick names, or null. A plain `title` is Commons, as picks always were. */
export declare function sourceOf(pick: Pick): Source | null;
/** The kind a pick will be recorded as: its own, else the source's suggestion, else photo. */
export declare const kindFor: (pick: Pick, found: Found) => PictureKind;
