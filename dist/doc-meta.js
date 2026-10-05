"use strict";
/**
 * Document metadata for the orz-family self-contained formats.
 *
 * A `.md.html` / `.slides.html` / `.paged.html` travels alone — that is the
 * whole promise of the format. Until now it carried no author, no license and
 * no link home, so someone who downloaded one held a file that said nothing
 * about the terms under which they could reuse it.
 *
 * This module is the ONE place that knows how document metadata is written,
 * read and emitted. It lives in orz-markdown because that is the only package
 * all three tools already depend on; implementing it three times in three
 * copy-pasted `template.ts` files is how the brand SVG and chrome CSS drifted.
 *
 * Two channels, one precedence rule:
 *
 *   1. **In the source** — a `{{nyml kind: meta … }}` block that a lone author
 *      can type. The builder consumes and removes it, then emits the normalized
 *      metadata into the generated document's `<head>`.
 *   2. **Injected by a host** — the `metadata` build option.
 *
 * The **host wins, field by field**: a platform that knows the license
 * authoritatively must not be overridden by a stale block someone pasted in.
 * Fields the host leaves unset fall through to the source block.
 *
 * The builders emit `<meta>` / `<link rel="license">` tags plus a JSON island
 * into `<head>`. That placement is load-bearing: every tool's `serializeDoc()`
 * clones the whole `documentElement` and rewrites only the source island, so
 * head tags survive an in-file edit *and* a framework self-update. Metadata
 * written anywhere else would be silently dropped on save.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOC_META_ISLAND_TYPE = exports.DOC_META_ISLAND_ID = exports.DOC_META_KIND = void 0;
exports.docMetaFromFields = docMetaFromFields;
exports.extractDocMeta = extractDocMeta;
exports.mergeDocMeta = mergeDocMeta;
exports.renderDocMetaHead = renderDocMetaHead;
exports.renderDocMetaIsland = renderDocMetaIsland;
exports.parseDocMetaIsland = parseDocMetaIsland;
const ascii_js_1 = require("./ascii.js");
const nyml_blocks_js_1 = require("./nyml-blocks.js");
const html_js_1 = require("./html.js");
/** The `kind:` value that marks a metadata block. */
exports.DOC_META_KIND = 'meta';
/** The id of the emitted JSON island (a host's reliable read-back channel). */
exports.DOC_META_ISLAND_ID = 'orz-meta';
/** MIME type of the JSON island. Distinct from the `nyml-data` script. */
exports.DOC_META_ISLAND_TYPE = 'application/orz-meta+json';
function isEmpty(meta) {
    return (!meta.title &&
        !meta.author &&
        !meta.description &&
        !meta.source &&
        !meta.date &&
        !meta.uid &&
        !meta.license?.spdx &&
        !meta.license?.name &&
        !meta.license?.url &&
        !(meta.keywords && meta.keywords.length));
}
/** Split `a, b；c、d` into `['a','b','c','d']`, dropping blanks. Chinese
 *  separators `，` `、` `；` count like `,` and `;` (CLAIMS M.3). */
function splitList(value) {
    return value
        .split(/[,;\n\uFF0C\u3001\uFF1B]/)
        .map((s) => s.trim())
        .filter(Boolean);
}
/**
 * The DocMeta fields of a flat nyml field map (a `kind: meta` block, or a
 * format-1 document header, FC-18 §5.1): `title author description source
 * date keywords license license_name license_url`. Values are trimmed and
 * empty ones skipped;
 * `keywords` is split as {@link extractDocMeta} splits it. `uid` is NOT read
 * here (FC-03: a meta block's `uid` is host-only); the carrier kit adds it
 * for a format-1 header (FC-18 §10). Key order of the result is fixed.
 */
function docMetaFromFields(fields) {
    // Values are trimmed; one that is empty after trimming is absent (so the
    // head tags, the island and a derived title all agree).
    const f = (key) => {
        const v = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key].trim() : '';
        return v === '' ? undefined : v;
    };
    const license = {};
    if (f('license'))
        license.spdx = f('license');
    if (f('license_name'))
        license.name = f('license_name');
    // nyml keys are `[A-Za-z0-9_]+`, so `license-url` cannot be a key. Accept the
    // snake_case spelling the grammar actually permits.
    if (f('license_url'))
        license.url = f('license_url');
    const meta = {};
    if (f('title'))
        meta.title = f('title');
    if (f('author'))
        meta.author = f('author');
    if (f('description'))
        meta.description = f('description');
    if (f('source'))
        meta.source = f('source');
    if (f('date'))
        meta.date = f('date');
    const keywords = f('keywords');
    if (keywords)
        meta.keywords = splitList(keywords);
    if (license.spdx || license.name || license.url)
        meta.license = license;
    return meta;
}
/**
 * Read the FIRST `kind: meta` nyml block out of a source and remove it.
 *
 * Removal is not cosmetic. The nyml plugin renders every block to a
 * `<script type="application/json" id="nyml-data">` with a FIXED id — leaving a
 * meta block in the body would emit a second element with a duplicate id. And
 * metadata belongs in `<head>`, not in the rendered body.
 *
 * Returns the parsed metadata (empty when there is no such block) and the body
 * with the block spliced out. Any other nyml block is left untouched.
 */
function extractDocMeta(source) {
    // The FIRST meta block supplies the values; every meta block is removed, so
    // extracting again from the body finds nothing (idempotent across saves).
    const metaBlocks = (0, nyml_blocks_js_1.scanNymlBlocks)(source).filter((b) => b.kind === exports.DOC_META_KIND);
    const block = metaBlocks[0];
    if (!block)
        return { meta: {}, body: source };
    const meta = docMetaFromFields(block.fields);
    // Splice the block out, then collapse the blank lines it leaves behind so a
    // leading meta block does not push the document down by two lines.
    // Removing a block can expose a neighbour that was glued to it
    // (`{{nyml…}}{{nyml…}}`, or with spaces between) as a block of its own, so
    // extraction must also remove those to be idempotent (round 11, M1). They can
    // only appear where a block was cut out: look there, parsing only the small
    // block found at the cut (a full re-parse per pass was quadratic: round 14, H1).
    const parts = [];
    let from = 0;
    for (const b of metaBlocks) {
        parts.push(source.slice(from, b.start));
        from = b.end;
        // Glued followers: blanks, then `{{nyml…}}` on the same run.
        // The follower is parsed with its line's container prefix (`> `), so a
        // multi-line follower inside a quote parses as the renderer sees it, and
        // its closer is searched after `[args]` (round 15, L1).
        // Line start found by walking back over this line only (`\n` or `\r`: a
        // CR-only source has no `\n`, and `lastIndexOf('\n')` made every prefix the
        // whole source — round 16, H1). The prefix keeps its real container
        // markers (`10. `, `- `, `> `), so the follower parses where it stands (L2).
        let lineStart = b.start;
        while (lineStart > 0 && source[lineStart - 1] !== '\n' && source[lineStart - 1] !== '\r')
            lineStart--;
        const prefix = source.slice(lineStart, b.start);
        for (;;) {
            let p = from;
            while (source[p] === ' ' || source[p] === '\t')
                p++;
            if (!source.startsWith('{{nyml', p))
                break;
            let bodyFrom = p + 6;
            if (source[bodyFrom] === '[') {
                // Args never cross the line (round 18, H2: an unbounded search per block was quadratic).
                let br = bodyFrom + 1;
                while (br < source.length && source[br] !== ']' && source[br] !== '\n' && source[br] !== '\r')
                    br++;
                if (source[br] !== ']')
                    break;
                bodyFrom = br + 1;
            }
            const close = source.indexOf('}}', bodyFrom);
            if (close < 0)
                break;
            const next = (0, nyml_blocks_js_1.scanNymlBlocks)(prefix + source.slice(p, close + 2));
            if (next.length !== 1 || next[0].kind !== exports.DOC_META_KIND || next[0].start !== prefix.length)
                break;
            from = close + 2;
        }
    }
    parts.push(source.slice(from));
    const body = parts.join('').replace(/^\s*(?:\r\n?|\n)+/, '');
    return { meta, body };
}
/** A host value counts as "set" only if it carries information. */
function isSet(value) {
    if (value === undefined || value === null)
        return false;
    if (typeof value === 'string')
        return value.trim() !== '';
    if (Array.isArray(value))
        return value.length > 0;
    return true;
}
function setFields(obj) {
    if (!obj)
        return {};
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => isSet(v)));
}
/**
 * Merge source-declared metadata with host-injected metadata. The HOST wins,
 * field by field; host fields that are unset — `undefined`, `null`, an empty or
 * blank string, an empty array — fall through to the source, so a host that
 * fills a form with blanks never erases what the author wrote.
 */
function mergeDocMeta(fromSource, fromHost) {
    if (!fromHost)
        return fromSource;
    const { license: hostLicense, ...hostRest } = fromHost;
    const license = { ...setFields(fromSource.license), ...setFields(hostLicense) };
    const merged = { ...fromSource, ...setFields(hostRest) };
    // Assign in place (keeps the island's key order stable); drop an empty one.
    if (license.spdx || license.name || license.url)
        merged.license = license;
    else
        delete merged.license;
    return merged;
}
/**
 * `<head>` tags for the metadata. Emitted by each tool's `buildHtml`.
 *
 * `<link rel="license">` is the machine-readable channel search engines and
 * reuse tooling look for. Nothing here asserts a copyright — a document under a
 * public-domain dedication (CC0) must not carry a "©" claim, and this function
 * therefore never emits one. A visible notice, if a tool ever adds one, has to
 * make that distinction itself.
 */
function renderDocMetaHead(meta) {
    if (isEmpty(meta))
        return '';
    const tags = [];
    if (meta.author)
        tags.push(`<meta name="author" content="${(0, html_js_1.escapeAttr)(meta.author)}">`);
    if (meta.description) {
        tags.push(`<meta name="description" content="${(0, html_js_1.escapeAttr)(meta.description)}">`);
    }
    if (meta.keywords?.length) {
        tags.push(`<meta name="keywords" content="${(0, html_js_1.escapeAttr)(meta.keywords.join(', '))}">`);
    }
    if (meta.date)
        tags.push(`<meta name="dcterms.date" content="${(0, html_js_1.escapeAttr)(meta.date)}">`);
    if (meta.license?.url) {
        tags.push(`<link rel="license" href="${(0, html_js_1.escapeAttr)(meta.license.url)}">`);
    }
    if (meta.license?.spdx) {
        tags.push(`<meta name="dcterms.license" content="${(0, html_js_1.escapeAttr)(meta.license.spdx)}">`);
    }
    if (meta.source)
        tags.push(`<link rel="canonical" href="${(0, html_js_1.escapeAttr)(meta.source)}">`);
    return tags.join('\n');
}
/**
 * The full metadata as a JSON island, for a host or tool to read back.
 * `serializeDoc()` never touches it, so it survives in-file edits.
 */
function renderDocMetaIsland(meta) {
    if (isEmpty(meta))
        return '';
    return `<script type="${exports.DOC_META_ISLAND_TYPE}" id="${exports.DOC_META_ISLAND_ID}">\n${(0, html_js_1.jsonForScript)(meta, 2)}\n</script>`;
}
/**
 * Read the island back out of a built document (host-side helper).
 *
 * Only the document head is searched: carriers write the island there, and the
 * body holds author content, where a raw-HTML `<script id="orz-meta">` must not
 * pass for the document's metadata (a spoofed `uid`). The `id` must be the
 * attribute itself, not a suffix of another (`data-id="orz-meta"`).
 */
function parseDocMetaIsland(html) {
    const headEnd = html.search(/<\/head\s*>|<body[\s>]/i);
    // Without a head, only an island the document STARTS with counts (a fragment
    // that is just the island); one after other content is body content (round 19, L2).
    const head = headEnd < 0 ? html : html.slice(0, headEnd);
    // Tag by tag with indexOf: a backtracking pattern from every "<script" to the
    // end of the head was quadratic (also 1.6.3; round 19, H2).
    const lower = (0, ascii_js_1.asciiLower)(head); // same length as head: offsets carry over
    // Each character is looked at once: the next '<script' is searched from the
    // end of this tag (round 20, B-H1: from the next character was quadratic).
    for (let at = lower.indexOf('<script'), end = 0; at >= 0; at = lower.indexOf('<script', Math.max(at + 7, end))) {
        end = head.indexOf('>', at);
        if (end < 0)
            return null;
        const attrs = head.slice(at + 7, end);
        if (!/\s/.test(attrs.charAt(0) || ' '))
            continue;
        const hasType = new RegExp(`\\stype="${exports.DOC_META_ISLAND_TYPE.replace(/[+.]/g, '\\$&')}"`, 'i').test(attrs);
        const hasId = new RegExp(`\\sid="${exports.DOC_META_ISLAND_ID}"`, 'i').test(attrs);
        if (!hasType || !hasId)
            continue;
        if (headEnd < 0 && head.slice(0, at).replace(/<!doctype[^>]*>/i, '').trim() !== '')
            return null;
        const close = lower.indexOf('</script', end);
        if (close < 0)
            return null;
        try {
            return JSON.parse(head.slice(end + 1, close));
        }
        catch {
            return null;
        }
    }
    return null;
}
//# sourceMappingURL=doc-meta.js.map