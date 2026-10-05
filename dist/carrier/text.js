"use strict";
/**
 * Text-level facts that decide whether a text round-trips through an HTML
 * file exactly (FC-18 §2 law 1): its line-ending style, mixed line endings,
 * lone surrogates. Browser-clean, deterministic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.eolStyle = eolStyle;
exports.hasMixedEol = hasMixedEol;
exports.hasLoneSurrogate = hasLoneSurrogate;
exports.decodeText = decodeText;
/** The style of a text's FIRST line break (`lf` when it has none). */
function eolStyle(text) {
    const m = /\r\n|\r|\n/.exec(text);
    return !m || m[0] === '\n' ? 'lf' : m[0] === '\r\n' ? 'crlf' : 'cr';
}
/** True when the text uses more than one line-ending style (it cannot round-trip exactly). */
function hasMixedEol(text) {
    const crlf = text.includes('\r\n');
    const cr = /\r(?!\n)/.test(text);
    const lf = /(^|[^\r])\n/.test(text);
    return Number(crlf) + Number(cr) + Number(lf) > 1;
}
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** True when the text holds an unpaired UTF-16 surrogate (not representable in a UTF-8 file). */
function hasLoneSurrogate(text) {
    return LONE_SURROGATE.test(text);
}
/**
 * Decode a file's bytes as UTF-8 text EXACTLY: a leading BOM is kept (as
 * U+FEFF), which `File.text()`, `Blob.text()`, `Response.text()` and a default
 * `TextDecoder` all strip. Invalid UTF-8 becomes U+FFFD, or — with
 * `{ fatal: true }` — throws (a tool that must not save a damaged text back
 * uses it). Use this (with `file.arrayBuffer()`) to read a text twin.
 */
function decodeText(bytes, options) {
    const Ctor = globalThis.TextDecoder;
    if (!Ctor)
        throw new Error('orz carrier: decodeText needs TextDecoder');
    return new Ctor('utf-8', { ignoreBOM: true, fatal: options?.fatal === true }).decode(bytes);
}
//# sourceMappingURL=text.js.map