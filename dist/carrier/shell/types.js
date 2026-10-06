"use strict";
/**
 * Structural slices of the browser APIs the shell runtime uses. The package
 * compiles without the DOM lib, and tests pass fakes; a real `Window`,
 * `HTMLIFrameElement`, `Storage` or `IDBFactory` satisfies these types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalWindow = globalWindow;
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
//# sourceMappingURL=types.js.map