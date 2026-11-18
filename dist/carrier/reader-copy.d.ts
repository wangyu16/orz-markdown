/**
 * Reader copy (FC-18 §8.2 `readerCopy`, orz-markdown 2.9.0): an assembled
 * file published for readers (a website's page) says so in `#orz-shell` as
 * `"readerCopy"`, so its in-file editor tells a reader at once that edits
 * cannot be saved back to the page's address and that "Download a copy"
 * keeps them (spec/carrier-app.md §4.5a).
 *
 * The value is DATA the file carries: `{}` (the kit's words) or
 * `{ "notice": "…" }` (the host's words — plain text, never markup).
 * Parser-free and import-free: `extract`, the envelope and the carrier app
 * use it without loading the Markdown parser.
 */
/** A file's reader-copy setting: `notice` is the host's words, else the kit's default. */
export interface ReaderCopy {
    notice?: string;
}
/** Longest notice accepted (a sentence or two, not a document). */
export declare const READER_COPY_NOTICE_MAX = 300;
/** The kit's words when a file has no notice of its own. */
export declare const READER_COPY_NOTICE = "You\u2019re editing your own copy. Changes can\u2019t be saved to this website \u2014 use \u201CDownload a copy\u201D to keep them.";
/**
 * Validate and normalize a reader-copy setting: `null` for none (`undefined`,
 * `null`, `false`); `{}` for `true` or `{}` (the kit's words); `{ notice }`
 * for an object with a notice — its runs of spaces, tabs and line breaks
 * collapsed to one space and trimmed, 1 to {@link READER_COPY_NOTICE_MAX}
 * characters, no other control character. Throws a `TypeError` for anything
 * else (an unknown key, a notice that is not such a string, another type).
 */
export declare function readerCopy(value: unknown): ReaderCopy | null;
/** Like {@link readerCopy}, but `null` for an invalid value instead of throwing: for values read from a file. */
export declare function readReaderCopy(value: unknown): ReaderCopy | null;
/** The words a reader sees for a (normalized or raw) setting: its notice, else the kit's. */
export declare function readerCopyNotice(value: ReaderCopy | null | undefined): string;
//# sourceMappingURL=reader-copy.d.ts.map