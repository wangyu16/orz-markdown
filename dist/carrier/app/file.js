"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceIsland = sourceIsland;
exports.shellDelivery = shellDelivery;
exports.shellIncludes = shellIncludes;
exports.openedFileName = openedFileName;
exports.copyName = copyName;
exports.readOpenedFile = readOpenedFile;
/**
 * The opened file (spec/carrier-app.md §2): what the page knows about the
 * assembled file it was opened from — read from its own DOM at boot, never
 * from anything the document's content could forge after load (the
 * envelope's islands are written before any shell markup, FC-18 §8.1):
 *
 * - the text (`readIslandFromDom(#orz-src)`: exact, line endings and BOM
 *   restored) and its header facts (uid, format);
 * - the shell (`#orz-shell`): its delivery (kept by every save, B#7);
 * - the resolved includes (`#orz-includes`, D4: a page cannot resolve them again);
 * - the engine (`#orz-engine` without `src`: the inline bundle's exact text);
 * - the file name (the page's last path segment when it names a file of this kind).
 */
const read_js_1 = require("../read.js");
const header_js_1 = require("../header.js");
const protocol_js_1 = require("../shell/protocol.js");
/** The source island, or null when the page is not an assembled file (an app page, the update sandbox). */
function sourceIsland(doc) {
    const el = doc.getElementById('orz-src');
    return el && String(el.tagName).toUpperCase() === 'SCRIPT' && el.getAttribute('type') === 'text/markdown' ? el : null;
}
function islandJson(doc, id) {
    const el = doc.getElementById(id);
    if (!el || String(el.tagName).toUpperCase() !== 'SCRIPT')
        return undefined;
    try {
        return JSON.parse(el.textContent ?? '');
    }
    catch {
        return undefined;
    }
}
/** The file's delivery (`#orz-shell`); `inline` unless it says `cdn`. */
function shellDelivery(doc) {
    const shell = islandJson(doc, 'orz-shell');
    return shell && typeof shell === 'object' && shell.delivery === 'cdn' ? 'cdn' : 'inline';
}
/** `#orz-includes` read as `extract` reads it (string values of own keys only); undefined when empty or absent. */
function shellIncludes(doc) {
    const parsed = islandJson(doc, 'orz-includes');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return undefined;
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string')
            Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
    }
    return Object.keys(out).length ? out : undefined;
}
/** The opened file's name when the page's URL names a file of this kind, else `document` + the kind's extension. */
function openedFileName(loc, kind) {
    const ext = protocol_js_1.KIND_EXTENSIONS[kind];
    try {
        const last = decodeURIComponent((loc?.pathname ?? '').split('/').pop() ?? '');
        if (last.length > ext.length && last.endsWith(ext))
            return last;
    }
    catch { /* a malformed path */ }
    return `document${ext}`;
}
/** The name a new copy of a file is offered under: `notes.md.html` → `notes copy.md.html`. */
function copyName(fileName, kind) {
    const ext = protocol_js_1.KIND_EXTENSIONS[kind];
    const base = fileName.endsWith(ext) ? fileName.slice(0, -ext.length) : fileName;
    return `${base} copy${ext}`;
}
/** Read the opened file from the page (null when the page is not an assembled file). */
function readOpenedFile(doc, kind) {
    const island = sourceIsland(doc);
    if (!island)
        return null;
    const text = (0, read_js_1.readIslandFromDom)(island);
    const fields = (0, header_js_1.readHeader)(text)?.fields ?? {};
    const uid = fields['uid']?.trim();
    const f = fields['format']?.trim();
    const engineEl = doc.getElementById('orz-engine');
    const engine = engineEl && String(engineEl.tagName).toUpperCase() === 'SCRIPT' && !engineEl.hasAttribute('src') ? engineEl.textContent : null;
    const includes = shellIncludes(doc);
    return {
        text,
        ...(uid && header_js_1.UID_PATTERN.test(uid) ? { uid } : {}),
        format: f && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1,
        delivery: shellDelivery(doc),
        ...(includes ? { includes } : {}),
        engine: engine || null,
        fileName: openedFileName(doc.defaultView?.location, kind),
    };
}
//# sourceMappingURL=file.js.map