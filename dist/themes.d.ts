/**
 * The bundled themes (`themes/<id>.css`, shipped in the package and served by
 * jsDelivr): their ids, the names a theme picker shows, and each theme's
 * colour scheme (the chrome, code highlighting and SMILES follow it). The ONE
 * list of the family (2.2.0): a carrier's theme picker, its read view and its
 * preview name these ids; `tests/themes.test.ts` checks it against the files
 * in `themes/` (claim M.25). Same set, names and order as the site editor's
 * theme menu. Pure data: no DOM, no Node built-ins.
 *
 * Exported from the main entry and as `orz-markdown/themes`
 * (`orz-markdown/themes/<id>.css` stays the stylesheet path).
 */
export type ThemeScheme = 'light' | 'dark';
export interface ThemeInfo {
    /** The theme id: the stylesheet `themes/<id>.css`. */
    readonly id: string;
    /** The label a theme picker shows. */
    readonly name: string;
    /** The theme's colour scheme (`color-scheme` in its stylesheet). */
    readonly scheme: ThemeScheme;
}
export declare const THEMES: readonly ThemeInfo[];
/** The theme of a document whose header names none, or an unknown one (the site editor's default too). */
export declare const DEFAULT_THEME = "light-neat-3";
/** Whether `id` names a bundled theme. */
export declare function isThemeId(id: unknown): id is string;
/** The bundled theme `id` names, else the default theme. */
export declare function themeInfo(id: string | null | undefined): ThemeInfo;
//# sourceMappingURL=themes.d.ts.map