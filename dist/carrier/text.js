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
//# sourceMappingURL=text.js.map