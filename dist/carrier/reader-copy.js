"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READER_COPY_NOTICE = exports.READER_COPY_NOTICE_MAX = exports.readReaderCopy = void 0;
exports.readerCopy = readerCopy;
exports.readerCopyNotice = readerCopyNotice;
/**
 * Reader copy (FC-18 §8.2 `readerCopy`, orz-markdown 2.9.0): an assembled
 * file published for readers (a website's page) says so in `#orz-shell` as
 * `"readerCopy"`, so its in-file editor tells a reader at once that edits
 * cannot be saved back to the page's address and that "Download a copy"
 * keeps them (spec/carrier-app.md §4.5a).
 *
 * The value is DATA the file carries: `{}` (the kit's words) or
 * `{ "notice": "…" }` (the host's words — plain text, never markup).
 * The rule itself is `readReaderCopy` in `read.ts` (small and message-free,
 * so the parser-free reader, the update and the shell carry only it); this
 * module adds the assembly side — `readerCopy`, which throws with a reason —
 * and the kit's words. Parser-free.
 */
const read_js_1 = require("./read.js");
Object.defineProperty(exports, "readReaderCopy", { enumerable: true, get: function () { return read_js_1.readReaderCopy; } });
Object.defineProperty(exports, "READER_COPY_NOTICE_MAX", { enumerable: true, get: function () { return read_js_1.READER_COPY_NOTICE_MAX; } });
/** The kit's words when a file has no notice of its own. */
exports.READER_COPY_NOTICE = 'You’re editing your own copy. Changes can’t be saved to this website — use “Download a copy” to keep them.';
/**
 * Validate and normalize a reader-copy setting for assembly: `null` for none
 * (`undefined`, `null`, `false`); otherwise exactly what `readReaderCopy`
 * reads (`{}` for `true` or `{}`; `{ notice }` with its runs of spaces, tabs
 * and line breaks collapsed and trimmed, 1 to {@link READER_COPY_NOTICE_MAX}
 * UTF-16 code units, at least one visible character, no control, format —
 * but the zero-width (non-)joiner — or unpaired surrogate character). Throws
 * a `TypeError` with the reason for anything else.
 */
function readerCopy(value) {
    if (value === undefined || value === null || value === false)
        return null;
    const ok = (0, read_js_1.readReaderCopy)(value);
    if (ok)
        return ok;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`orz carrier: readerCopy is true, false or { notice }, not ${Array.isArray(value) ? 'an array' : typeof value}`);
    }
    const key = Object.keys(value).find((k) => k !== 'notice');
    if (key !== undefined)
        throw new TypeError(`orz carrier: unknown key "${key}" in readerCopy (only "notice")`);
    const raw = value.notice;
    if (typeof raw !== 'string')
        throw new TypeError('orz carrier: readerCopy.notice must be a string');
    const notice = raw.replace(/[\t\n\r ]+/g, ' ').trim();
    if (notice === '')
        throw new TypeError('orz carrier: readerCopy.notice is empty (leave it out for the default words)');
    if (notice.length > read_js_1.READER_COPY_NOTICE_MAX)
        throw new TypeError(`orz carrier: readerCopy.notice is longer than ${read_js_1.READER_COPY_NOTICE_MAX} characters (UTF-16 code units)`);
    throw new TypeError('orz carrier: readerCopy.notice holds a control or format character, or nothing visible');
}
/** The words a reader sees for a (normalized or raw) setting: its notice, else the kit's. */
function readerCopyNotice(value) {
    return value?.notice ?? exports.READER_COPY_NOTICE;
}
//# sourceMappingURL=reader-copy.js.map