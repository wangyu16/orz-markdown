"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_THEME = exports.THEMES = void 0;
exports.isThemeId = isThemeId;
exports.themeInfo = themeInfo;
exports.THEMES = Object.freeze([
    { id: 'light-neat-3', name: 'Orchard', scheme: 'light' },
    { id: 'light-neat-1', name: 'Neat', scheme: 'light' },
    { id: 'light-neat-2', name: 'Neat 2', scheme: 'light' },
    { id: 'light-academic-1', name: 'Academic', scheme: 'light' },
    { id: 'light-academic-2', name: 'Academic 2', scheme: 'light' },
    { id: 'beige-decent-1', name: 'Beige', scheme: 'light' },
    { id: 'beige-decent-2', name: 'Beige 2', scheme: 'light' },
    { id: 'light-playful-1', name: 'Playful', scheme: 'light' },
    { id: 'light-playful-2', name: 'Playful 2', scheme: 'light' },
    { id: 'dark-elegant-1', name: 'Dark Elegant', scheme: 'dark' },
    { id: 'dark-elegant-2', name: 'Dark Elegant 2', scheme: 'dark' },
    { id: 'dark-elegant-3', name: 'Nocturne', scheme: 'dark' },
].map((t) => Object.freeze(t)));
/** The theme of a document whose header names none, or an unknown one (the site editor's default too). */
exports.DEFAULT_THEME = 'light-neat-3';
/** Whether `id` names a bundled theme. */
function isThemeId(id) {
    return typeof id === 'string' && exports.THEMES.some((t) => t.id === id);
}
/** The bundled theme `id` names, else the default theme. */
function themeInfo(id) {
    return exports.THEMES.find((t) => t.id === id) ?? exports.THEMES.find((t) => t.id === exports.DEFAULT_THEME);
}
//# sourceMappingURL=themes.js.map