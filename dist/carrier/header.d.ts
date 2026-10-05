/** One nyml block that is part of the header. */
export interface HeaderBlock {
    /** Offset of `{{nyml`. */
    start: number;
    /** Offset just past `}}`. */
    end: number;
    /** The block's `kind` (`document` or, for a legacy header, `meta`). */
    kind: string;
}
/** The document header of a text (FC-18 §5). */
export interface Header {
    /** Offset of the first header block's `{{nyml`. */
    start: number;
    /** Offset just past the last header block's `}}` (both blocks of a legacy pair). */
    end: number;
    /** key → value, read by the flat nyml reader (`kind` excluded; for a legacy pair the document block's keys win). */
    fields: Record<string, string>;
    /** The keys of `fields`, in source order (legacy pair: the document block's keys, then the meta-only keys). */
    keys: string[];
    /** `null` for a format-1 header; `'meta'` for a lone legacy `kind: meta` block; `'meta+document'` for an adjacent pair. */
    legacy: null | 'meta' | 'meta+document';
    /** The header's line ending (its first line break, else the text's); `'\n'` when there is none. */
    lineEnding: '\n' | '\r\n' | '\r';
    /** The blocks the header is made of, in source order. */
    blocks: HeaderBlock[];
}
/** One lint finding. */
export interface Lint {
    level: 'error' | 'warning';
    /** Stable machine-readable code (see {@link lintHeader}). */
    code: string;
    message: string;
    key?: string;
}
/** The kinds of document (FC-18 §3). Declared here too to keep header.ts free of document.ts. */
type KindName = 'md' | 'slides' | 'paged';
/** Keys every kind accepts (FC-18 §5.1). */
export declare const COMMON_HEADER_KEYS: readonly string[];
/** Kind-specific keys (FC-18 §5.1), listed explicitly so lint catches misspellings. */
export declare const KIND_HEADER_KEYS: Readonly<Record<KindName, readonly string[]>>;
/** The key grammar writers use (FC-18 §5). */
export declare const WRITER_KEY: RegExp;
/** A valid `uid` (FC-18 §5.1, §10). */
export declare const UID_PATTERN: RegExp;
/**
 * Read the document header of a text (FC-18 §5).
 *
 * The header is the first nyml block (found by the token-based
 * `scanNymlBlocks`) when only an optional BOM and whitespace precede it and its
 * kind is `document`. Legacy files: a leading `kind: meta` block is the header,
 * and a `kind: meta` and a `kind: document` block that lead the text together
 * (either order, only whitespace between) are ONE header whose document keys
 * win. Returns `null` for a text without a header (any plain Markdown file).
 */
export declare function readHeader(text: string): Header | null;
/**
 * Set one header value (FC-18 §9). An existing key has its value replaced on
 * its own line (indentation, key spelling and separator kept; a `key: |`
 * value's continuation lines are replaced with it; with duplicate keys, the
 * last — the one that wins — is edited). A new key is inserted as
 * `key: value` just before the closing `}}` line, with the header's
 * indentation and line ending. A text without a header gets one at its start
 * (after a BOM): `{{nyml`, `kind: document`, `key: value`, `}}`, a blank line.
 * A legacy header is upgraded first: a meta+document pair is merged into one
 * `kind: document` block (the document block's lines, then the meta-only keys'
 * lines); a lone `kind: meta` block's kind line becomes `kind: document`.
 * Every other byte of the text is unchanged.
 *
 * Throws for a key outside `[a-z][a-z0-9_]*`, for `kind`, and for a value with
 * a line break (CR or LF), `}}` or U+0000. Values that the reader would trim or unquote
 * (leading/trailing spaces, surrounding quotes, a lone `|`) are written quoted
 * so they read back exactly.
 */
export declare function setHeaderValue(text: string, key: string, value: string): string;
/**
 * Remove a header key (FC-18 §9): its line goes (with a `key: |` value's
 * continuation lines, and every duplicate of the key, so the key is really
 * unset). Every other byte is unchanged. A text without the key is returned
 * as is; a legacy header holding it is upgraded first (as for
 * {@link setHeaderValue}). Throws for `kind`.
 */
export declare function removeHeaderKey(text: string, key: string): string;
/**
 * Lint the header of a text. `kind` selects the key registry; without it the
 * header's `carrier` key does, and without that every kind's keys are known.
 *
 * Codes: `legacy-header` (warning), `kind-not-first` (warning: the `kind`
 * line is not the first key, so renderers do not treat the block as the
 * header), `duplicate-key` (warning: the last one wins), `key-grammar`
 * (warning: not `[a-z][a-z0-9_]*` with an ASCII `:`), `unknown-key` (warning:
 * not `x_…` and not in the FC-18 §5.1 registry for the kind), `host-key`
 * (warning: an `x_` key not shaped `x_<name>_<key>`), `closer-in-value`
 * (error: `}}` in a value, or text after the closing `}}` on its line),
 * `bad-uid` (error), `bad-format` (error: not a positive integer),
 * `newer-format` (error: format above 1 — the file opens read-only),
 * `bad-carrier` (error), `carrier-mismatch` (warning). Text-level, with or
 * without a header: `nul` (error), `lone-surrogate` (error), `mixed-eol`
 * (warning: assembling normalizes to the first line break's style).
 */
export declare function lintHeader(text: string, kind?: KindName): Lint[];
/**
 * The header and its lint in one scan (for `readDocument`).
 * @internal Not part of the `orz-markdown/carrier` API.
 */
export declare function readHeaderAndLint(text: string, kind: KindName): {
    header: Header | null;
    lint: Lint[];
};
export {};
//# sourceMappingURL=header.d.ts.map