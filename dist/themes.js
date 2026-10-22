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
exports.themeSwatch = themeSwatch;
exports.isThemeId = isThemeId;
exports.themeInfo = themeInfo;
exports.THEMES = Object.freeze([
    { id: 'light-neat-3', name: 'Orchard', scheme: 'light', paper: '#fbfbf8', accent: '#5f9e44' },
    { id: 'light-neat-1', name: 'Neat', scheme: 'light', paper: '#f7f9fb', accent: '#2e8bcf' },
    { id: 'light-neat-2', name: 'Neat 2', scheme: 'light', paper: '#f7f7f2', accent: '#167a72' },
    { id: 'light-academic-1', name: 'Academic', scheme: 'light', paper: '#fffff8', accent: '#9b2d20' },
    { id: 'light-academic-2', name: 'Academic 2', scheme: 'light', paper: '#fdfdfc', accent: '#0b4a8b' },
    { id: 'beige-decent-1', name: 'Beige', scheme: 'light', paper: '#f4ecdf', accent: '#8c3b31' },
    { id: 'beige-decent-2', name: 'Beige 2', scheme: 'light', paper: '#eee6d8', accent: '#2f6154' },
    { id: 'light-playful-1', name: 'Playful', scheme: 'light', paper: '#fcf9f2', accent: '#d6336c' },
    { id: 'light-playful-2', name: 'Playful 2', scheme: 'light', paper: '#fdfcf9', accent: '#ffe66d' },
    { id: 'dark-elegant-1', name: 'Dark Elegant', scheme: 'dark', paper: '#0d0f18', accent: '#5f8cff' },
    { id: 'dark-elegant-2', name: 'Dark Elegant 2', scheme: 'dark', paper: '#071018', accent: '#e07c4a' },
    { id: 'dark-elegant-3', name: 'Nocturne', scheme: 'dark', paper: '#2a2b2f', accent: '#7fb2ea' },
].map((t) => Object.freeze(t)));
/** The theme of a document whose header names none, or an unknown one (the site editor's default too). */
exports.DEFAULT_THEME = 'light-neat-3';
/**
 * (2.5.0, STATUS D-95) A CSS `background` for a theme picker's colour dot: the
 * theme's page colour and its signature colour, split diagonally — every
 * bundled theme's dot differs (the chrome cannot read a theme's colours
 * without loading its stylesheet). An unknown id gets the default theme's.
 */
function themeSwatch(id) {
    const t = themeInfo(id);
    return `linear-gradient(135deg, ${t.paper} 50%, ${t.accent} 50%)`;
}
/** Whether `id` names a bundled theme. */
function isThemeId(id) {
    return typeof id === 'string' && exports.THEMES.some((t) => t.id === id);
}
/** The bundled theme `id` names, else the default theme. */
function themeInfo(id) {
    return exports.THEMES.find((t) => t.id === id) ?? exports.THEMES.find((t) => t.id === exports.DEFAULT_THEME);
}
//# sourceMappingURL=themes.js.map