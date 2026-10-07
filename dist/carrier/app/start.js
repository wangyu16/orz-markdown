"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carrierGlobal = carrierGlobal;
exports.startCarrier = startCarrier;
/**
 * The bundle entry helper (spec/carrier-app.md §4): `startCarrier` sets the
 * standard bundle global `globalThis.OrzCarrier` (FC-19 §2) from a kind and,
 * when the page is an assembled file of that kind (an `#orz-src` island is
 * present), boots the standalone app. In the quiet update's sandbox and in an
 * app's page there is no island: only the global is set; nothing else is
 * touched (no storage, no network, no DOM).
 *
 * `OrzCarrier.mountEditor(element, options)` is the kind's `mountEditor`;
 * without `hooks.save`, in an assembled file, it mounts on the file's context
 * (saver, host, includes, opened bytes; FC-19 §4: a carrier never opens a
 * second host connection) and attaches the editor to the app until it is
 * destroyed.
 */
const read_js_1 = require("../read.js");
const app_js_1 = require("./app.js");
/** Build the FC-19 §2 global of a kind (`app`: the booted file, or a getter of it). */
function carrierGlobal(k, app = () => null) {
    const mountEditor = (element, options) => {
        const file = !options?.hooks?.save ? app() : null;
        const editor = k.mountEditor(element, options, file ? file.editorContext() : undefined);
        if (file) {
            // an editor of this file: the page's shortcuts, its leave warning and the update defer to it until it is destroyed
            const detach = file.attach(editor);
            const destroy = editor.destroy.bind(editor);
            editor.destroy = () => { detach(); destroy(); };
        }
        return editor;
    };
    return {
        kind: k.kind,
        version: k.version,
        formats: [...k.formats],
        assemble: (text, options) => {
            try {
                return Promise.resolve(k.assemble(text, options ?? {})).then(String);
            }
            catch (e) {
                return Promise.reject(e);
            }
        },
        extract: (html) => (k.extract ? k.extract(html) : (0, read_js_1.extract)(html)),
        readDocument: (text) => k.readDocument(text),
        mountEditor,
        ...(k.renderPreview ? { renderPreview: (text, o) => k.renderPreview(text, o) } : {}),
        get standalone() { return app(); },
    };
}
/**
 * Set `globalThis.OrzCarrier` and boot the standalone file. A file that
 * cannot boot says so in the console only (its text stays in the island).
 */
function startCarrier(k, options = {}) {
    let app = null;
    const carrier = carrierGlobal(k, () => app);
    if (options.global !== false)
        (options.global ?? globalThis).OrzCarrier = carrier;
    const win = options.window ?? globalThis.window;
    if (options.boot !== false && win && typeof win === 'object' && win.document) {
        try {
            app = (0, app_js_1.bootCarrierApp)(k, options);
        }
        catch (e) {
            try {
                console.error(`orz carrier (${k.kind}): the file could not start`, e);
            }
            catch { /* no console */ }
        }
    }
    return { carrier, app };
}
//# sourceMappingURL=start.js.map