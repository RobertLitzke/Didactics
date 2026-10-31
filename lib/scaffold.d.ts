export interface ScaffoldOptions {
    /** A short lower-case name: storage keys, file names, the package name. */
    id: string;
    /** The course's name, as the wordmark and the page title. */
    title: string;
    /** One line under the title. */
    subtitle?: string;
    /** Dev server port; the preview server gets the next one. Default 5430. */
    port?: number;
    /** The didactics dependency, such as "github:RobertLitzke/Didactics#<sha>". */
    didactics: string;
    /** Background colour, for the page, the icon and the manifest. Default #1b172f. */
    color?: string;
}
/** Turns a title into an id: "Levers & Pulleys" → "levers-pulleys". */
export declare function courseId(title: string): string;
/** The course's files, by path from its root. */
export declare function scaffold(o: ScaffoldOptions): Record<string, string | Uint8Array>;
/** A square PNG of one colour, for icons to draw over later. */
export declare function squarePng(size: number, hex: string): Uint8Array;
