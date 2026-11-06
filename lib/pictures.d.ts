/**
 * Licences a picture may carry. Public domain and the attribution licences
 * only: no NonCommercial (a course could one day be shared widely), and no
 * NoDerivatives, because every picture is resized and many are cropped.
 */
export declare const LICENSES: {
    readonly PD: {
        readonly name: "Public domain";
        readonly url: "https://creativecommons.org/publicdomain/mark/1.0/";
    };
    readonly CC0: {
        readonly name: "CC0";
        readonly url: "https://creativecommons.org/publicdomain/zero/1.0/";
    };
    readonly 'CC-BY-2.0': {
        readonly name: "CC BY 2.0";
        readonly url: "https://creativecommons.org/licenses/by/2.0/";
    };
    readonly 'CC-BY-3.0': {
        readonly name: "CC BY 3.0";
        readonly url: "https://creativecommons.org/licenses/by/3.0/";
    };
    readonly 'CC-BY-4.0': {
        readonly name: "CC BY 4.0";
        readonly url: "https://creativecommons.org/licenses/by/4.0/";
    };
    readonly 'CC-BY-SA-2.0': {
        readonly name: "CC BY-SA 2.0";
        readonly url: "https://creativecommons.org/licenses/by-sa/2.0/";
    };
    readonly 'CC-BY-SA-3.0': {
        readonly name: "CC BY-SA 3.0";
        readonly url: "https://creativecommons.org/licenses/by-sa/3.0/";
    };
    readonly 'CC-BY-SA-4.0': {
        readonly name: "CC BY-SA 4.0";
        readonly url: "https://creativecommons.org/licenses/by-sa/4.0/";
    };
};
export type LicenseId = keyof typeof LICENSES;
export declare function isLicenseId(value: string): value is LicenseId;
/**
 * The licence id for a licence as a source spells it, or null when it is not
 * one the courses accept. Reads Commons' short names ("CC BY-SA 4.0", "Public
 * domain", "PD-USGov"), Creative Commons URLs (PhyloPic, BHL), iNaturalist's
 * codes ("cc-by-sa", always version 4.0 there) and the ids themselves.
 * NonCommercial, NoDerivatives, GFDL-only, version 2.5 and anything unclear
 * are refused.
 */
export declare function licenceFrom(text: string | null | undefined): LicenseId | null;
/**
 * The kinds of picture, and the word a credit line starts with for each.
 * A course says which kind each picture is, because the reader should know
 * a reconstruction from a photograph, and an engraving from a diagram.
 */
export declare const KINDS: {
    /** A photograph of the thing itself. */
    readonly photo: "Photo";
    /** A painting, print or engraving made as art, often historical. */
    readonly painting: "Painting";
    /** A drawing made to show something: a book plate, a naturalist's sketch, an artist's impression. */
    readonly illustration: "Illustration";
    /** A diagram, chart or figure from a paper. */
    readonly diagram: "Diagram";
    /** A map. */
    readonly map: "Map";
    /** A silhouette of an organism (PhyloPic). */
    readonly silhouette: "Silhouette";
    /** A life reconstruction of an extinct animal or plant (paleoart): checked against Commons' inaccurate-paleoart list. */
    readonly reconstruction: "Reconstruction";
    /** A scan of a page, a specimen sheet or a document, shown as the thing it is. */
    readonly scan: "Scan";
};
export type PictureKind = keyof typeof KINDS;
export declare const isKind: (k: unknown) => k is PictureKind;
/**
 * The changes a picture may have had on its way into a course, as a credit
 * says them. Resizing and re-encoding are not listed: every picture has them.
 * A change outside this list may be written in plain words ("labels added
 * in English"), starting lower-case, since the credit runs it on.
 */
export declare const CHANGES: readonly ["cropped", "recoloured", "cut out", "retouched", "rotated", "straightened", "labelled", "traced", "combined", "mirrored"];
/** What every picture carries, so it can be shown and credited. */
export interface Picture {
    /** Stable id, such as cumulus-01: lower-case letters, digits and dashes. Saves remember it. */
    id: string;
    /** What sort of picture it is (KINDS). */
    kind: PictureKind;
    width: number;
    height: number;
    author: string;
    license: LicenseId;
    /** The page the picture came from, for the credit link and to read its licence again. */
    sourceUrl: string;
    /** Where it came from, by name: Wikimedia Commons, NOAA, PhyloPic. */
    source: string;
    /** What was done to it beyond resizing (CHANGES, or plain words), for the credit. */
    changes?: string[];
}
/**
 * What is wrong with a record's own fields, or an empty list. A course adds
 * the checks for its own fields (what the picture is of).
 */
export declare function pictureProblems(p: Partial<Picture>): string[];
/** The changes as a credit says them: "cropped, recoloured", or ''. */
export declare const changesText: (p: Pick<Picture, "changes">) => string;
/** "Photo: ", "Silhouette: ": what a credit line starts with. */
export declare const creditLead: (p: Partial<Pick<Picture, "kind">>) => string;
/**
 * A record in the old photo shape, brought up to a picture: `kind` set
 * (default photo, or `guess` when given), a `crop` the fetch tool applied
 * recorded as the change "cropped". Records that already have a kind come
 * back as they were. Nothing else moves, so ids and every course field stay.
 */
export declare function migratePicture<T extends Record<string, unknown>>(record: T, guess?: PictureKind): T & {
    kind: PictureKind;
};
/** The file title a Commons page URL names ("File:Foo bar.jpg"), or null for any other page. */
export declare function commonsTitle(url: string | undefined): string | null;
/** A Commons title as the API spells it: spaces, not underscores, and a capital first letter after File:. */
export declare function normalTitle(title: string): string;
/**
 * A list of Commons files that its paleoart reviewers have marked inaccurate
 * (Category:Inaccurate paleoart and the files tagged {{Inaccurate paleoart}}),
 * as `didactics-pictures paleoart` saves it.
 */
export interface PaleoartList {
    /** When it was read from Commons (ISO date). */
    fetched: string;
    /** Where it was read from. */
    from: string[];
    /** File titles, normalised ("File:Foo bar.jpg"). */
    files: string[];
}
/** The records whose Commons file is on the inaccurate-paleoart list, with the reason to show. */
export declare function paleoartFlags<P extends Pick<Picture, 'id' | 'sourceUrl'>>(records: readonly P[], list: PaleoartList): {
    id: string;
    title: string;
    problem: string;
}[];
