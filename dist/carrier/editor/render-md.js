"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMarkdownPreview = renderMarkdownPreview;
exports.renderMarkdownPreviewWithIncludes = renderMarkdownPreviewWithIncludes;
/**
 * The `md` kind's preview renderer (FC-18 §7.1, §8.3): the body without its
 * header, rendered by orz-markdown with twin links on (`env.orzTwinLinks`),
 * every block stamped with `data-src-line` — its 0-based line in the WHOLE
 * text (the header's lines counted) — so the editor's scroll sync can anchor
 * on it. The other kinds pass their own `render` to the shell.
 *
 * Renders with the shared `md` (what the document's readers see, plugins and
 * all); the tokens are stamped between parse and render, so the shared
 * instance is not changed.
 *
 * `renderMarkdownPreviewWithIncludes` first resolves URL includes
 * (`{{md https://…}}`) through the host's `fetchInclude` with
 * `prepareSources` (each URL fetched once per shell when the shell's
 * `ctx.cache` is passed), then renders the expanded text the same way.
 */
const index_js_1 = require("../../index.js");
const prepare_sources_js_1 = require("../../prepare-sources.js");
const header_js_1 = require("../header.js");
const links_js_1 = require("../links.js");
/** Block tokens without nesting that render their attributes. */
const STAMPED_LEAVES = new Set(['fence', 'code_block', 'hr']);
/** Render an `md` text for the editor preview (see the module comment). */
function renderMarkdownPreview(text, options = {}) {
    const { body, offset } = (0, header_js_1.withoutHeader)(text);
    return renderBody(body, linesIn(text.slice(0, offset)), options, null);
}
/**
 * Like {@link renderMarkdownPreview}, after resolving the body's URL includes
 * through `options.fetchInclude` (the host's trust policy; `prepareSources`
 * neutralises file includes and refuses unsafe splices). Without
 * `fetchInclude` it is `renderMarkdownPreview`. A fetched include is kept in
 * `options.cache` (the shell's `ctx.cache`) for the shell's life; a failed one
 * is fetched again next time. Anchor lines stay those of the text: lines
 * before the first include and after the last are exact, included content and
 * the text between two includes anchor at the first include's line.
 */
async function renderMarkdownPreviewWithIncludes(text, options = {}) {
    const fetchInclude = options.fetchInclude;
    if (typeof fetchInclude !== 'function')
        return renderMarkdownPreview(text, options);
    const cache = options.cache;
    const fetcher = (url) => {
        const key = `orz-include:${url}`;
        const hit = cache?.get(key);
        if (hit)
            return hit;
        const p = Promise.resolve().then(() => fetchInclude(url)).then((t) => (typeof t === 'string' ? t : null), () => null);
        cache?.set(key, p);
        void p.then((t) => { if (t === null && cache?.get(key) === p)
            cache.delete(key); });
        return p;
    };
    const { body, offset } = (0, header_js_1.withoutHeader)(text);
    const expanded = await (0, prepare_sources_js_1.prepareSources)(body, { fetcher });
    const lineOffset = linesIn(text.slice(0, offset));
    if (expanded === body)
        return renderBody(body, lineOffset, options, null);
    // expanded line → body line: the common head and tail are exact, the changed middle anchors at its start
    const a = body.split(/\r\n?|\n/);
    const b = expanded.split(/\r\n?|\n/);
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head])
        head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail])
        tail++;
    const shift = b.length - a.length;
    return renderBody(expanded, lineOffset, options, (l) => (l < head ? l : l >= b.length - tail ? l - shift : head));
}
/** Line breaks in a string (CR LF, CR and LF each count once). */
function linesIn(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 10)
            n++;
        else if (c === 13) {
            n++;
            if (s.charCodeAt(i + 1) === 10)
                i++;
        }
    }
    return n;
}
function renderBody(body, lineOffset, options, mapLine) {
    (0, links_js_1.registerTwinLinks)(index_js_1.md); // idempotent; links.ts registers it on load as well
    const env = { ...(options.env ?? {}), orzTwinLinks: options.twinLinks !== false };
    const tokens = index_js_1.md.parse(body, env);
    for (const t of tokens) {
        if (!t.map || !t.block)
            continue;
        if (t.nesting === 1 || STAMPED_LEAVES.has(t.type))
            t.attrSet('data-src-line', String((mapLine ? mapLine(t.map[0]) : t.map[0]) + lineOffset));
    }
    return index_js_1.md.renderer.render(tokens, index_js_1.md.options, env);
}
//# sourceMappingURL=render-md.js.map