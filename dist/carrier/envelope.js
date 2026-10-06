"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasLoneSurrogate = exports.hasMixedEol = exports.eolStyle = exports.INCLUDES_ISLAND_ID = exports.SHELL_ISLAND_ID = exports.SOURCE_ISLAND_ID = exports.KIND_PACKAGE = exports.readIslandFromDom = exports.extract = void 0;
exports.skillUrl = skillUrl;
exports.assembleEnvelope = assembleEnvelope;
/**
 * The assembled file (FC-18 §8): `assembleEnvelope` wraps a text in the HTML
 * envelope, `extract` takes the text back out — exactly.
 *
 * Laws (FC-18 §2), tested on the golden corpus and on random text:
 *   1. `extract(assembleEnvelope(T, p)).text === T` for every text T with
 *      consistent line endings and no NUL or lone surrogate.
 *   2. `assembleEnvelope(T, p)` is a pure function: no clock, no randomness, no
 *      environment, no locale.
 *   3. `assembleEnvelope(extract(F).text, p) === F` for F made with parts p.
 *
 * The text is stored in ONE island, `<script type="text/markdown" id="orz-src">`.
 * An HTML parser turns CR and CR LF into LF and drops nothing else from script
 * data, so the island holds the text with LF line endings and no leading BOM;
 * `data-orz-eol` (`lf` / `crlf` / `cr`) and `data-orz-bom` record what to
 * restore, and a DOM read ({@link readIslandFromDom}) equals `extract`. The
 * body is escaped with `escapeScriptText`: every `<script` and `</script` (any
 * case) gains a backslash after its `<`, so the island never contains
 * `</script` and ends at the first `</script` after it — unambiguously.
 *
 * Browser-clean: no Node built-ins.
 */
const html_js_1 = require("../html.js");
const doc_meta_js_1 = require("../doc-meta.js");
const document_js_1 = require("./document.js");
const text_js_1 = require("./text.js");
const read_js_1 = require("./read.js");
var read_js_2 = require("./read.js");
Object.defineProperty(exports, "extract", { enumerable: true, get: function () { return read_js_2.extract; } });
Object.defineProperty(exports, "readIslandFromDom", { enumerable: true, get: function () { return read_js_2.readIslandFromDom; } });
Object.defineProperty(exports, "KIND_PACKAGE", { enumerable: true, get: function () { return read_js_2.KIND_PACKAGE; } });
Object.defineProperty(exports, "SOURCE_ISLAND_ID", { enumerable: true, get: function () { return read_js_2.SOURCE_ISLAND_ID; } });
Object.defineProperty(exports, "SHELL_ISLAND_ID", { enumerable: true, get: function () { return read_js_2.SHELL_ISLAND_ID; } });
Object.defineProperty(exports, "INCLUDES_ISLAND_ID", { enumerable: true, get: function () { return read_js_2.INCLUDES_ISLAND_ID; } });
var text_js_2 = require("./text.js");
Object.defineProperty(exports, "eolStyle", { enumerable: true, get: function () { return text_js_2.eolStyle; } });
Object.defineProperty(exports, "hasMixedEol", { enumerable: true, get: function () { return text_js_2.hasMixedEol; } });
Object.defineProperty(exports, "hasLoneSurrogate", { enumerable: true, get: function () { return text_js_2.hasLoneSurrogate; } });
/** The agent skill URL of a kind's carrier. */
function skillUrl(kind) {
    const pkg = read_js_1.KIND_PACKAGE[kind];
    return `https://cdn.jsdelivr.net/npm/${pkg}/${pkg}-skills/SKILL.md`;
}
/** The agent banner (an HTML comment; holds no tag-like text and no `--`). */
function banner(kind, format) {
    return [
        `<!-- orz ${kind} document, text format ${format}. For AI agents and tools:`,
        `  The complete, editable source of this file is the text/markdown island with id "${read_js_1.SOURCE_ISLAND_ID}" below.`,
        '  Read it with extract() from orz-markdown/carrier, or by hand: take the island content, remove one',
        '  backslash after each "<" that is followed by backslashes and then "script" or "/script" (any case),',
        '  turn its line breaks into the style named by data-orz-eol, and prefix U+FEFF if data-orz-bom is set.',
        '  Edit that text only, then assemble again; everything else in this file is a regenerable shell.',
        `  Skill: ${skillUrl(kind)}`,
        '-->',
    ].join('\n');
}
/** JSON object with keys in code-unit order (integer-like keys included). */
function sortedJson(record) {
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${(0, html_js_1.jsonForScript)(k)}:${(0, html_js_1.jsonForScript)(record[k])}`).join(',')}}`;
}
/**
 * Assemble the HTML file for a text (FC-18 §8.1): doctype; `<html lang
 * data-orz-kind>`; charset; generator `orz-<kind> <shellVersion>`; `<title>`
 * (derived, FC-18 §8.1); head metadata and `#orz-meta` from the header's
 * DocMeta; `#orz-shell` `{kind, format, shell, delivery}`; the shell's head;
 * then in `<body>` the agent banner, the source island (`data-orz-format`,
 * `data-orz-eol`, `data-orz-bom` when the text starts with U+FEFF), `#orz-includes`
 * when there are includes, and the shell's body. Deterministic.
 *
 * A text with mixed line endings is stored with its first style throughout
 * (lint `mixed-eol`). Throws for a text holding NUL or a lone surrogate, for a
 * header `format` above 1 (FC-18 §8.4: a format-1 shell never writes a newer
 * format), and for shell parts holding an element with id `orz-src` or
 * `orz-shell`.
 */
function assembleEnvelope(text, parts) {
    if (text.includes('\u0000'))
        throw new Error('orz carrier: text format 1 cannot hold U+0000 (NUL); an HTML file cannot carry it');
    if ((0, text_js_1.hasLoneSurrogate)(text))
        throw new Error('orz carrier: the text holds a lone surrogate, which a UTF-8 file cannot represent');
    for (const [name, html] of [['headHtml', parts.headHtml], ['bodyHtml', parts.bodyHtml]]) {
        const bad = (0, read_js_1.reservedIdIn)(html ?? '');
        if (bad)
            throw new Error(`orz carrier: parts.${name} holds an element with id "${bad}", which the envelope reserves`);
    }
    const doc = (0, document_js_1.readDocument)(text, { kind: parts.kind });
    if (doc.format > 1)
        throw new Error(`orz carrier: the text is format ${doc.format}; this shell writes format 1 only`);
    const kind = parts.kind;
    const bom = text.charCodeAt(0) === 0xfeff;
    const body = (bom ? text.slice(1) : text).replace(/\r\n?/g, '\n');
    const eol = (0, text_js_1.eolStyle)(bom ? text.slice(1) : text);
    const shell = (0, html_js_1.jsonForScript)({ kind, format: doc.format, shell: parts.shellVersion, delivery: parts.delivery ?? 'inline' });
    const out = [
        '<!doctype html>',
        `<html lang="${(0, html_js_1.escapeAttr)(doc.lang)}" data-orz-kind="${(0, html_js_1.escapeAttr)(kind)}">`,
        '<head>',
        '<meta charset="utf-8">',
        `<meta name="generator" content="${(0, html_js_1.escapeAttr)(`orz-${kind} ${parts.shellVersion}`)}">`,
        `<title>${(0, html_js_1.escapeHtml)(doc.title)}</title>`,
    ];
    const metaHead = (0, doc_meta_js_1.renderDocMetaHead)(doc.meta);
    if (metaHead)
        out.push(metaHead);
    const metaIsland = (0, doc_meta_js_1.renderDocMetaIsland)(doc.meta);
    if (metaIsland)
        out.push(metaIsland);
    out.push(`<script type="application/json" id="${read_js_1.SHELL_ISLAND_ID}">${shell}</script>`);
    if (parts.headHtml)
        out.push(parts.headHtml);
    out.push('</head>', '<body>', banner(kind, doc.format));
    out.push(`<script type="text/markdown" id="${read_js_1.SOURCE_ISLAND_ID}" data-orz-format="${doc.format}" data-orz-eol="${eol}"${bom ? ' data-orz-bom' : ''}>${(0, html_js_1.escapeScriptText)(body)}</script>`);
    if (parts.includes && Object.keys(parts.includes).length > 0) {
        out.push(`<script type="application/json" id="${read_js_1.INCLUDES_ISLAND_ID}">${sortedJson(parts.includes)}</script>`);
    }
    if (parts.bodyHtml)
        out.push(parts.bodyHtml);
    out.push('</body>', '</html>', '');
    return out.join('\n');
}
//# sourceMappingURL=envelope.js.map