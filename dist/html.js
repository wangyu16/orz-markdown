"use strict";
/**
 * HTML escaping helpers — the ONE implementation used by every plugin, the
 * metadata emitter, and (via `orz-markdown/carrier`) the orz-family carriers.
 *
 * Plugins previously each carried a private copy, and several emitted
 * author-controlled values into attributes without escaping at all (a `"` in a
 * tab label or a span class produced broken markup). Everything that writes an
 * attribute or a text node goes through here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.escapeAttr = escapeAttr;
exports.jsonForScript = jsonForScript;
exports.escapeScriptText = escapeScriptText;
exports.unescapeScriptText = unescapeScriptText;
/** Escape text for an HTML text node. */
function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/**
 * Escape a value for a double-quoted HTML attribute. Newlines are kept as
 * `&#10;` so multi-line source (e.g. a `data-md` breadcrumb) survives verbatim.
 */
function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}
/**
 * Serialize a value as JSON that is safe inside `<script type="…json">`.
 *
 * Escaping only `</script` is not enough: inside script data, `<!--` followed
 * by `<script` switches the tokenizer into the double-escaped state where the
 * real `</script>` no longer terminates the element, swallowing the rest of the
 * document. Every hazard starts with `<`, so writing each `<` as the JSON escape
 * `\u003c` removes them all and still parses to exactly the same value.
 */
function jsonForScript(value, space) {
    return JSON.stringify(value, null, space)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
/**
 * Escape raw text (Markdown source) for a `<script type="text/…">` island,
 * reversibly. `</script` and `<script` get one extra backslash after the `<`
 * (an existing backslash run grows by one, so the transform is injective and
 * {@link unescapeScriptText} is its exact inverse). `<!--` is left alone so
 * HTML comments in the source stay legible.
 *
 * Files written by the earlier one-way escape (`</script` → `<\/script`)
 * unescape to their original text, with one exception: such a file whose
 * source already contained the JavaScript idiom `<\/script` (inside a code
 * sample) reads back as `</script` there — the old escape had made the two
 * spellings indistinguishable.
 */
function escapeScriptText(text) {
    return text.replace(/<(\\*)(\/script|script)/gi, (_m, slashes, keyword) => `<${slashes}\\${keyword}`);
}
/** Exact inverse of {@link escapeScriptText}. */
function unescapeScriptText(text) {
    return text.replace(/<(\\+)(\/script|script)/gi, (_m, slashes, keyword) => `<${slashes.slice(1)}${keyword}`);
}
//# sourceMappingURL=html.js.map