"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.includeRecordEnv = includeRecordEnv;
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
 * Includes (FC-18 §8.3, D4): an assembled file carries the includes its last
 * assembly resolved in `#orz-includes` — file includes under the path written
 * in the directive, URL includes under the URL. A page cannot read local
 * files or (standalone) fetch URLs, so `includes` (that record) is read here:
 * file includes through the parser's host-supplied reader
 * (`includeRecordEnv`: `readFile` on a virtual root `/`), URL includes by
 * `renderMarkdownPreviewWithIncludes` (the host's `fetchInclude` first —
 * fresher, and the host owns the trust policy — then the record).
 *
 * `renderMarkdownPreviewWithIncludes` resolves URL includes with
 * `prepareSources` (each URL fetched once per shell when the shell's
 * `ctx.cache` is passed), passing the render env as `includeEnv` so a
 * document that also has file includes gets its URL includes too, then
 * renders the expanded text the same way.
 */
const index_js_1 = require("../../index.js");
const prepare_sources_js_1 = require("../../prepare-sources.js");
const header_js_1 = require("../header.js");
const links_js_1 = require("../links.js");
const isUrl = (t) => /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
/** A relative include target on the virtual root `/` (POSIX; a Windows drive and backslashes read as `/`). */
function rootPath(target) {
    const out = [];
    for (const seg of target.replace(/^[A-Za-z]:/, '').split(/[\\/]/)) {
        if (!seg || seg === '.')
            continue;
        if (seg === '..')
            out.pop();
        else
            out.push(seg);
    }
    return `/${out.join('/')}`;
}
/**
 * The parser env that reads file includes from an `#orz-includes` record (FC-18
 * §8.3): `markdownBasePath` `/` and a `readFile` answering each file target of
 * the record (its path as written, resolved on the virtual root `/`). URL
 * entries are not files. An include the record lacks renders nothing, as in
 * any page. Always an env — also for an empty record — so `prepareSources`
 * can judge URL includes next to file includes (`includeEnv`).
 */
function includeRecordEnv(includes) {
    const files = new Map();
    if (includes && typeof includes === 'object') {
        for (const key of Object.keys(includes)) {
            const v = includes[key];
            if (!isUrl(key) && typeof v === 'string')
                files.set(rootPath(key), v);
        }
    }
    return { markdownBasePath: '/', readFile: (abs) => files.get(rootPath(abs)) ?? null };
}
/** The render env: the record's reader (when `includes` is given) under the caller's own `env`. */
function renderEnv(options) {
    if (options.includes === undefined)
        return options.env;
    return { ...includeRecordEnv(options.includes), ...(options.env ?? {}) };
}
/** Block tokens without nesting that render their attributes. */
const STAMPED_LEAVES = new Set(['fence', 'code_block', 'hr']);
/** Render an `md` text for the editor preview (see the module comment). */
function renderMarkdownPreview(text, options = {}) {
    const { body, offset } = (0, header_js_1.withoutHeader)(text);
    return renderBody(body, linesIn(text.slice(0, offset)), renderEnv(options), options, null);
}
/**
 * Like {@link renderMarkdownPreview}, after resolving the body's URL includes
 * with `prepareSources`: through `options.fetchInclude` (the host's trust
 * policy) and, for a URL it does not answer, the `includes` record. Without
 * either it is `renderMarkdownPreview`. The render env (the record's reader,
 * `options.env`) is passed to `prepareSources` as `includeEnv`, so a
 * document with file includes gets its URL includes too (without it,
 * `prepareSources` keeps every URL directive of such a document). A fetched
 * include is kept in `options.cache` (the shell's `ctx.cache`) for the
 * shell's life; a failed one is fetched again next time. Anchor lines stay
 * those of the text: lines before the first include and after the last are
 * exact, included content and the text between two includes anchor at the
 * first include's line.
 */
async function renderMarkdownPreviewWithIncludes(text, options = {}) {
    const host = typeof options.fetchInclude === 'function' ? options.fetchInclude : undefined;
    const rec = options.includes;
    const recorded = rec && typeof rec === 'object' ? Object.keys(rec).filter((k) => isUrl(k) && typeof rec[k] === 'string') : [];
    if (!host && recorded.length === 0)
        return renderMarkdownPreview(text, options);
    const fromRecord = (url) => (rec && Object.prototype.hasOwnProperty.call(rec, url) && typeof rec[url] === 'string' ? rec[url] : null);
    const resolve = async (url) => {
        if (host) {
            try {
                const t = await host(url);
                if (typeof t === 'string')
                    return t;
            }
            catch { /* the record, if any */ }
        }
        return fromRecord(url);
    };
    const cache = options.cache;
    const fetcher = (url) => {
        const key = `orz-include:${url}`;
        const hit = cache?.get(key);
        if (hit)
            return hit;
        const p = Promise.resolve().then(() => resolve(url)).then((t) => (typeof t === 'string' ? t : null), () => null);
        cache?.set(key, p);
        void p.then((t) => { if (t === null && cache?.get(key) === p)
            cache.delete(key); });
        return p;
    };
    const env = renderEnv(options);
    const includeEnv = env && (typeof env['readFile'] === 'function' || typeof env['markdownBasePath'] === 'string') ? env : undefined;
    const { body, offset } = (0, header_js_1.withoutHeader)(text);
    const expanded = await (0, prepare_sources_js_1.prepareSources)(body, { fetcher, ...(includeEnv ? { includeEnv } : {}) });
    const lineOffset = linesIn(text.slice(0, offset));
    if (expanded === body)
        return renderBody(body, lineOffset, env, options, null);
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
    return renderBody(expanded, lineOffset, env, options, (l) => (l < head ? l : l >= b.length - tail ? l - shift : head));
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
function renderBody(body, lineOffset, baseEnv, options, mapLine) {
    (0, links_js_1.registerTwinLinks)(index_js_1.md); // idempotent; links.ts registers it on load as well
    const env = { ...(baseEnv ?? {}), orzTwinLinks: options.twinLinks !== false };
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