"use strict";
/**
 * Structural slices of the browser APIs the shell runtime uses. The package
 * compiles without the DOM lib, and tests pass fakes; a real `Window`,
 * `HTMLIFrameElement`, `Storage` or `IDBFactory` satisfies these types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalWindow = globalWindow;
exports.pageLocation = pageLocation;
exports.openedFileName = openedFileName;
/** Reach the current global window lazily (never at module load). */
function globalWindow() {
    try {
        const w = globalThis.window;
        return (typeof w === 'object' && w !== null ? w : undefined);
    }
    catch {
        return undefined;
    }
}
/**
 * The page location a remembered file handle belongs to: the URL without its
 * query and fragment (for a `file:` page, the file's own path). `undefined`
 * when the page has no readable location.
 */
function pageLocation(loc) {
    const href = loc?.href;
    return typeof href === 'string' && href ? href.replace(/[?#].*$/s, '') : undefined;
}
/** The file name a `file:` page was opened from; `undefined` for any other page. */
function openedFileName(loc) {
    if (!loc || loc.protocol !== 'file:' || typeof loc.pathname !== 'string')
        return undefined;
    const last = loc.pathname.split('/').pop();
    if (!last)
        return undefined;
    try {
        return decodeURIComponent(last);
    }
    catch {
        return last;
    }
}
//# sourceMappingURL=types.js.map