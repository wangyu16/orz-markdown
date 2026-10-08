"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureEngineSource = captureEngineSource;
/**
 * The exact text of a carrier's browser bundle, which an inline assembly
 * (FC-19 §2 `engineSource`) writes into `<script id="orz-engine">`
 * (spec/carrier-app.md §6).
 *
 * - Inline (an inline-delivery file, the update sandbox): the bundle's own
 *   `<script>` text, captured when the bundle starts (`captureEngineSource`,
 *   called synchronously by the bundle's entry; the update sandbox inlines
 *   the verified bundle with nothing after it, U.6, so it is exact).
 * - Loaded by URL (a cdn-delivery file, an app's `<script src>`): fetched
 *   once from that URL, else from the release's jsDelivr URL — the same
 *   bytes — and required to be script-safe (the bundle rule).
 * - ESM (an app bundled it): fetched from the release's jsDelivr URL.
 *
 * Only the CARRIER'S bundle is taken (2.2.0, round 1): a script loaded by URL
 * counts when its file name is the bundle's (`bundle`, default any
 * `orz-<x>.browser.js`), an inline one when it is the file's `#orz-engine` or
 * the update sandbox's bundle — an app's own script that bundles the IIFE
 * (`app.js`, an inline app script) is not the engine, and the release's
 * jsDelivr URL is used instead. With `integrity` (the release's, when known)
 * an inline text must also match it.
 *
 * No state at module load: each capture is its own object.
 */
const update_js_1 = require("../shell/update.js");
const DEFAULT_BUNDLE = /^orz-[a-z0-9-]+\.browser\.js$/;
/** The last path segment of a URL, decoded (no query or fragment). */
function fileNameOf(url) {
    const path = url.replace(/[?#].*$/s, '');
    const last = path.slice(path.lastIndexOf('/') + 1);
    try {
        return decodeURIComponent(last);
    }
    catch {
        return last;
    }
}
/** SHA-384 of a text's UTF-8 bytes as an SRI value, or null without SubtleCrypto. */
async function sriOf(text) {
    try {
        const g = globalThis;
        if (!g.crypto?.subtle || !g.TextEncoder || !g.btoa)
            return null;
        const d = new Uint8Array(await g.crypto.subtle.digest('SHA-384', new g.TextEncoder().encode(text)));
        let bin = '';
        for (const b of d)
            bin += String.fromCharCode(b);
        return `sha384-${g.btoa(bin)}`;
    }
    catch {
        return null;
    }
}
/**
 * Capture the running bundle's own script. Call once, synchronously, when the
 * bundle starts (`document.currentScript` is set only then).
 */
function captureEngineSource(doc, options = {}) {
    let inline = null;
    let url = null;
    const isBundleName = (name) => (options.bundle ? name === options.bundle : DEFAULT_BUNDLE.test(name));
    try {
        const d = doc ?? globalThis.document;
        const s = (d?.currentScript ?? null);
        if (s && typeof s.src === 'string' && s.src) {
            if (isBundleName(fileNameOf(s.src)))
                url = s.src;
        }
        else if (s && typeof s.textContent === 'string' && s.textContent) {
            // the file's engine, or the update sandbox's bundle (a page with no island, `sandboxDocument`)
            const sandbox = d?.title === 'orz update' && !(typeof d.getElementById === 'function' && d.getElementById('orz-src'));
            if (s.id === 'orz-engine' || sandbox)
                inline = s.textContent;
        }
    }
    catch { /* no document (a worker) */ }
    let fetched = null;
    let checked = null;
    /** The inline text when it is the bundle (matching `integrity` when given), else null. */
    const inlineChecked = () => (checked ?? (checked = (async () => {
        if (inline === null)
            return null;
        if (!options.integrity)
            return inline;
        const sri = await sriOf(inline);
        return sri !== null && sri === options.integrity ? inline : null;
    })()));
    return {
        inline,
        url,
        async get(fallbackUrl) {
            const own = await inlineChecked();
            if (own !== null)
                return own;
            return fetchOnce(fallbackUrl);
        },
    };
    function fetchOnce(fallbackUrl) {
        {
            fetched ?? (fetched = (async () => {
                const urls = [...new Set([url, fallbackUrl].filter((u) => !!u))];
                let last = null;
                const fetchFn = globalThis.fetch;
                for (const u of urls) {
                    try {
                        if (typeof fetchFn !== 'function')
                            throw new Error('no fetch');
                        const res = await fetchFn(u, { credentials: 'omit' });
                        if (!res.ok)
                            throw new Error(`HTTP ${res.status} for ${u}`);
                        const text = await res.text();
                        if (!(0, update_js_1.isScriptSafe)(text))
                            throw new Error(`the engine at ${u} is not script-safe`);
                        return text;
                    }
                    catch (e) {
                        last = e;
                    }
                }
                throw new Error(`orz carrier: the engine source for an inline file could not be loaded (${last instanceof Error ? last.message : String(last)}); pass engineSource or assemble with delivery "cdn"`);
            })());
            fetched.catch(() => { fetched = null; });
            return fetched;
        }
    }
}
//# sourceMappingURL=engine-source.js.map