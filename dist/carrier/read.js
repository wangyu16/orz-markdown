"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INCLUDES_ISLAND_ID = exports.SHELL_ISLAND_ID = exports.SOURCE_ISLAND_ID = exports.KIND_PACKAGE = exports.FAMILY_NAMING = exports.textNameOf = exports.twinFileName = exports.twinHref = exports.isTwinTemplate = exports.sameTwinNaming = exports.readTwinNaming = exports.twinNaming = exports.hasLoneSurrogate = exports.hasMixedEol = exports.eolStyle = exports.decodeText = exports.unescapeScriptText = exports.escapeScriptText = exports.jsonForScript = exports.escapeAttr = exports.escapeHtml = void 0;
exports.readIslandFromDom = readIslandFromDom;
exports.reservedIdIn = reservedIdIn;
exports.extract = extract;
/**
 * Reading assembled files without the parser (FC-18 §8.1): `extract`,
 * `readIslandFromDom`, `decodeText`, the escaping helpers. Exported as
 * `orz-markdown/carrier/read` — a small, parser-free entry for viewers,
 * indexers and hosts that only read files — and also from
 * `orz-markdown/carrier`. Nothing here imports the Markdown parser.
 *
 * Browser-clean: no Node built-ins.
 */
const ascii_js_1 = require("../ascii.js");
const html_js_1 = require("../html.js");
const naming_js_1 = require("./naming.js");
var html_js_2 = require("../html.js");
Object.defineProperty(exports, "escapeHtml", { enumerable: true, get: function () { return html_js_2.escapeHtml; } });
Object.defineProperty(exports, "escapeAttr", { enumerable: true, get: function () { return html_js_2.escapeAttr; } });
Object.defineProperty(exports, "jsonForScript", { enumerable: true, get: function () { return html_js_2.jsonForScript; } });
Object.defineProperty(exports, "escapeScriptText", { enumerable: true, get: function () { return html_js_2.escapeScriptText; } });
Object.defineProperty(exports, "unescapeScriptText", { enumerable: true, get: function () { return html_js_2.unescapeScriptText; } });
var text_js_1 = require("./text.js");
Object.defineProperty(exports, "decodeText", { enumerable: true, get: function () { return text_js_1.decodeText; } });
Object.defineProperty(exports, "eolStyle", { enumerable: true, get: function () { return text_js_1.eolStyle; } });
Object.defineProperty(exports, "hasMixedEol", { enumerable: true, get: function () { return text_js_1.hasMixedEol; } });
Object.defineProperty(exports, "hasLoneSurrogate", { enumerable: true, get: function () { return text_js_1.hasLoneSurrogate; } });
var naming_js_2 = require("./naming.js");
Object.defineProperty(exports, "twinNaming", { enumerable: true, get: function () { return naming_js_2.twinNaming; } });
Object.defineProperty(exports, "readTwinNaming", { enumerable: true, get: function () { return naming_js_2.readTwinNaming; } });
Object.defineProperty(exports, "sameTwinNaming", { enumerable: true, get: function () { return naming_js_2.sameTwinNaming; } });
Object.defineProperty(exports, "isTwinTemplate", { enumerable: true, get: function () { return naming_js_2.isTwinTemplate; } });
Object.defineProperty(exports, "twinHref", { enumerable: true, get: function () { return naming_js_2.twinHref; } });
Object.defineProperty(exports, "twinFileName", { enumerable: true, get: function () { return naming_js_2.twinFileName; } });
Object.defineProperty(exports, "textNameOf", { enumerable: true, get: function () { return naming_js_2.textNameOf; } });
Object.defineProperty(exports, "FAMILY_NAMING", { enumerable: true, get: function () { return naming_js_2.FAMILY_NAMING; } });
/**
 * The npm package of each kind's carrier (its agent skill ships there; its
 * browser bundle and release manifest are `<package>-browser`). Hard-coded:
 * the update check derives its manifest URL from it, never from a document.
 */
exports.KIND_PACKAGE = {
    md: 'orz-mdhtml',
    slides: 'orz-slides',
    paged: 'orz-paged',
};
/** Id of the source island. */
exports.SOURCE_ISLAND_ID = 'orz-src';
/** Id of the shell marker island. */
exports.SHELL_ISLAND_ID = 'orz-shell';
/** Id of the resolved-includes island. */
exports.INCLUDES_ISLAND_ID = 'orz-includes';
/** Undo the island storage: unescape, restore the line-ending style and the BOM. */
function restore(stored, eol, bom) {
    // The island holds LF only; a file whose line endings were converted after
    // assembly (git autocrlf, a Windows editor) is read as an HTML parser reads it.
    let text = (0, html_js_1.unescapeScriptText)(stored.replace(/\r\n?/g, '\n'));
    if (eol === 'crlf')
        text = text.replace(/\n/g, '\r\n');
    else if (eol === 'cr')
        text = text.replace(/\n/g, '\r');
    return bom ? `\uFEFF${text}` : text;
}
/**
 * Read the text from the island element of a parsed page (`#orz-src`), with
 * the same restoration as {@link extract}: equal to `extract(html).text` for
 * the file the page was parsed from.
 */
function readIslandFromDom(el) {
    return restore(el.textContent ?? '', el.getAttribute('data-orz-eol'), el.hasAttribute('data-orz-bom'));
}
/** Elements whose content is raw text: skipped whole while looking for tags. */
const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes']);
/** Parse a start tag at `at` (`html[at] === '<'`), or null when it is none. */
function readStartTag(html, at) {
    const nm = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(html.slice(at, at + 64));
    if (!nm)
        return null;
    const name = (0, ascii_js_1.asciiLower)(nm[1]);
    const attrs = {};
    let i = at + nm[0].length;
    const n = html.length;
    for (;;) {
        while (i < n && /[\s/]/.test(html[i]))
            i++;
        if (i >= n)
            return null;
        if (html[i] === '>')
            return { name, attrs, end: i + 1 };
        let j = i;
        while (j < n && !/[\s/>=]/.test(html[j]))
            j++;
        if (j === i)
            j++; // a stray character: skip it
        const attr = (0, ascii_js_1.asciiLower)(html.slice(i, j));
        i = j;
        while (i < n && /\s/.test(html[i]))
            i++;
        let value = '';
        if (html[i] === '=') {
            i++;
            while (i < n && /\s/.test(html[i]))
                i++;
            const q = html[i];
            if (q === '"' || q === "'") {
                const close = html.indexOf(q, i + 1);
                if (close < 0)
                    return null;
                value = html.slice(i + 1, close);
                i = close + 1;
            }
            else {
                let k = i;
                while (k < n && !/[\s>]/.test(html[k]))
                    k++;
                value = html.slice(i, k);
                i = k;
            }
        }
        if (!Object.prototype.hasOwnProperty.call(attrs, attr))
            attrs[attr] = value;
    }
}
/**
 * Walk the start tags of `html` in document order — comments and raw-text
 * content skipped, as an HTML parser skips them — until `visit` returns true.
 */
function walkStartTags(html, visit, stopAt = Infinity, rawText = RAW_TEXT, startAt = 0) {
    const lower = (0, ascii_js_1.asciiLower)(html); // same length as html: offsets carry over
    let i = startAt;
    while (i < html.length && i < stopAt) {
        const lt = html.indexOf('<', i);
        if (lt < 0 || lt >= stopAt)
            return null;
        if (html.startsWith('<!--', lt)) {
            // As the HTML tokenizer: `<!-->` and `<!--->` are whole (empty)
            // comments; otherwise the comment ends at the first `-->` or `--!>`.
            if (html.startsWith('<!-->', lt)) {
                i = lt + 5;
                continue;
            }
            if (html.startsWith('<!--->', lt)) {
                i = lt + 6;
                continue;
            }
            const a = html.indexOf('-->', lt + 4);
            const b = html.indexOf('--!>', lt + 4);
            if (a < 0 && b < 0)
                return null;
            i = a >= 0 && (b < 0 || a < b) ? a + 3 : b + 4;
            continue;
        }
        const next = html.charAt(lt + 1);
        if (next === '!' || next === '?') {
            // `<!DOCTYPE …>`, `<![CDATA[…`, `<!x…>`, `<?…>`: up to the next `>` (a
            // bogus comment, as the tokenizer reads it outside foreign content).
            const gt = html.indexOf('>', lt + 2);
            if (gt < 0)
                return null;
            i = gt + 1;
            continue;
        }
        if (next === '/') {
            // An end tag (its "attributes" are ignored), `</>`, or a bogus comment.
            const gt = html.indexOf('>', lt + 2);
            if (gt < 0)
                return null;
            i = gt + 1;
            continue;
        }
        const tag = readStartTag(html, lt);
        if (!tag) {
            i = lt + 1;
            continue;
        }
        let el = { tag, content: [tag.end, tag.end] };
        if (rawText.has(tag.name)) {
            const close = endTagAt(lower, tag.name, tag.end);
            el = { tag, content: [tag.end, close < 0 ? html.length : close] };
            const gt = close < 0 ? -1 : html.indexOf('>', close + 2 + tag.name.length);
            i = gt < 0 ? html.length : gt + 1;
        }
        else {
            i = tag.end;
        }
        if (visit(el))
            return el;
    }
    return null;
}
/**
 * Offset of the end tag that closes a raw-text element: `</name` followed by
 * whitespace, `/` or `>` (so `</scripts>` does not close a script). -1 if none.
 */
function endTagAt(lower, name, from) {
    const needle = `</${name}`;
    for (let at = lower.indexOf(needle, from); at >= 0; at = lower.indexOf(needle, at + 1)) {
        const c = lower.charAt(at + needle.length);
        if (c === '' || c === '>' || c === '/' || c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r')
            return at;
    }
    return -1;
}
/** The first `<script>` whose `id` is `id`. */
function findScript(html, id, stopAt = Infinity, startAt = 0) {
    return walkStartTags(html, (el) => el.tag.name === 'script' && el.tag.attrs['id'] === id, stopAt, RAW_TEXT, startAt);
}
/** Only these are skipped when checking shell parts for reserved ids (conservative: a lenient parser may read textarea or title content as markup). */
const SCRIPT_STYLE = new Set(['script', 'style']);
/** The reserved id (`orz-src` / `orz-shell`) an element in `html` carries, if any (case-insensitive). */
function reservedIdIn(html) {
    if (!/orz-s(rc|hell)/i.test(html))
        return null;
    const el = walkStartTags(html, (e) => {
        const id = Object.prototype.hasOwnProperty.call(e.tag.attrs, 'id') ? (0, ascii_js_1.asciiLower)(e.tag.attrs['id'].trim()) : '';
        return id === exports.SOURCE_ISLAND_ID || id === exports.SHELL_ISLAND_ID;
    }, Infinity, SCRIPT_STYLE);
    return el ? el.tag.attrs['id'] : null;
}
function isKind(v) {
    return v === 'md' || v === 'slides' || v === 'paged';
}
/**
 * Read the text back out of an assembled file (FC-18 §8.1): the content of
 * the first `<script id="orz-src">` (found tag by tag: attribute order,
 * quoting and case do not matter; comments and other raw-text elements are
 * skipped), unescaped with `unescapeScriptText`, its line endings and BOM
 * restored from `data-orz-eol` / `data-orz-bom`; kind, format, shell version
 * and delivery from `#orz-shell` (falling back to `data-orz-kind`,
 * `data-orz-format`, `md`, `1`, `''`); `includes` from `#orz-includes`;
 * (2.5.0) `twinLinks` from `#orz-shell` `"links"` when it is a valid naming
 * other than the family's.
 * `null` when there is no source island.
 * Experimental files (slides' `#orz-deck`) are not read.
 */
function extract(html) {
    const island = findScript(html, exports.SOURCE_ISLAND_ID);
    if (!island)
        return null;
    const a = island.tag.attrs;
    const text = restore(html.slice(island.content[0], island.content[1]), a['data-orz-eol'] ?? null, Object.prototype.hasOwnProperty.call(a, 'data-orz-bom'));
    let shellData = {};
    const shellEl = findScript(html, exports.SHELL_ISLAND_ID, island.tag.end);
    if (shellEl) {
        try {
            const parsed = JSON.parse(html.slice(shellEl.content[0], shellEl.content[1]));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                shellData = parsed;
        }
        catch {
            shellData = {};
        }
    }
    const htmlAt = html.search(/<html[\s>]/i);
    const htmlTag = htmlAt >= 0 ? readStartTag(html, htmlAt) : null;
    const kind = isKind(shellData['kind']) ? shellData['kind'] : isKind(htmlTag?.attrs['data-orz-kind']) ? htmlTag.attrs['data-orz-kind'] : 'md';
    const islandFormat = a['data-orz-format'];
    const format = typeof shellData['format'] === 'number' && Number.isInteger(shellData['format']) ? shellData['format']
        : islandFormat && /^[1-9][0-9]*$/.test(islandFormat) ? Number(islandFormat) : 1;
    const result = {
        text,
        kind,
        format,
        shell: typeof shellData['shell'] === 'string' ? shellData['shell'] : '',
        delivery: typeof shellData['delivery'] === 'string' ? shellData['delivery'] : '',
    };
    const links = (0, naming_js_1.readTwinNaming)(shellData['links']);
    if (links)
        result.twinLinks = links;
    // The includes island follows the source island (shell markup before it is not consulted).
    const inc = findScript(html, exports.INCLUDES_ISLAND_ID, Infinity, island.content[1]);
    if (inc) {
        try {
            const parsed = JSON.parse(html.slice(inc.content[0], inc.content[1]));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const includes = {};
                // defineProperty: a `__proto__` key is data, not the prototype.
                for (const [k, v] of Object.entries(parsed)) {
                    if (typeof v === 'string')
                        Object.defineProperty(includes, k, { value: v, enumerable: true, writable: true, configurable: true });
                }
                result.includes = includes;
            }
        }
        catch {
            // a malformed includes island is ignored
        }
    }
    return result;
}
//# sourceMappingURL=read.js.map