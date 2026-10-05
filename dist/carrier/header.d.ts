/**
 * The format-1 document header (FC-18 §5): reading, in-place editing (§9) and
 * lint.
 *
 * The header is located with the token-based scanner (`scanNymlBlocks`), run
 * on the leading header candidates only (cost O(header), not O(document)), so
 * a header-looking block inside code or a directive is never taken for it, and
 * its values are read with the same flat nyml reader that gives every block its
 * fields. Edits touch exactly the edited lines: the header is never
 * re-serialized, so unknown keys, host keys, comments-by-convention and
 * formatting survive.
 *
 * Browser-clean: no Node built-ins, no clock, no randomness.
 */
import { type NymlBlock } from '../nyml-blocks.js';
/** One nyml block that is part of the header. */
export interface HeaderBlock {
    /** Offset of `{{nyml`. */
    start: number;
    /** Offset just past `}}`. */
    end: number;
    /** The block's `kind` (`document` or, for a legacy header, `meta`). */
    kind: string;
}
/** Where one `key: value` entry of the header sits in the text. */
export interface HeaderEntry {
    key: string;
    /** Offset of the key's first character. */
    keyFrom: number;
    /** Offset of the value's first character (after the separator and its spaces). */
    valueFrom: number;
    /** Offset of the end of the entry (its last line's end, nested and `|` lines included; or the closing `}}`). */
    to: number;
    /** 1-based line number of the key. */
    line: number;
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
    /** Every key line (duplicates included, `kind` excluded) in source order, with its position. */
    entries: HeaderEntry[];
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
    /** 1-based line of the finding, when it concerns a line. */
    line?: number;
    /** Offsets of the text the finding concerns, when it concerns a line. */
    from?: number;
    to?: number;
}
/** One change for {@link editHeader}: a single-line value, `null` to remove, or a `key: |` value. */
export type HeaderChange = string | null | {
    multiline: string;
};
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
 * Cost: O(header) — the body is not parsed.
 */
export declare function readHeader(text: string): Header | null;
/**
 * The text without its header, for a carrier that renders the body: `body` is
 * `text.slice(offset)`, where `offset` is the end of the header (legacy blocks
 * included; a BOM before the header goes with it). A text without a header is
 * returned whole (`offset` 0). Renderers must render this body: the shared
 * `md` hides a `kind: document` block but renders a legacy `kind: meta`
 * block as a data island.
 */
export declare function withoutHeader(text: string): {
    body: string;
    offset: number;
};
/**
 * Apply several header changes in one pass (FC-18 §9): `string` sets a
 * single-line value, `{ multiline }` writes a `key: |` value, `null` removes
 * the key. Changes apply in the object's key order (insertions too).
 *
 * - An existing key has only its value part replaced (indentation, key
 *   spelling and separator kept); with duplicates the last one (the one that
 *   wins) is edited; the replaced part includes the entry's nested and `|`
 *   lines. If the entry ends on the closing `}}` line, the header's line
 *   ending is written before `}}`.
 * - A new key is inserted just before the closing `}}` line with the
 *   indentation of the header's keys and the header's line ending.
 * - A removed key loses its line, its nested lines and every duplicate.
 * - A multi-line value is written as `key: |` and its lines, each indented by
 *   the key's indentation plus two spaces, in the header's line ending.
 * - A text without a header gets one at its start (after a BOM) for the sets.
 * - A legacy header is upgraded first (pair merged; lone meta → document).
 *
 * Throws (and changes nothing) for `kind`, a set key outside
 * `[a-z][a-z0-9_]*`, a value with `}}` or U+0000, a single-line value with a
 * line break, and a multi-line value that would not read back exactly (CR,
 * whitespace-only lines, a trailing empty line, an indented first line, tab
 * indentation). Every byte outside the edited entries is unchanged; removing
 * absent keys returns the text as is.
 */
export declare function editHeader(text: string, changes: Readonly<Record<string, HeaderChange>>): string;
/**
 * Set one header value (FC-18 §9): `editHeader(text, { [key]: value })` — the
 * value's line is edited in place, or `key: value` is inserted before the
 * closing `}}` line, or a header is created; a legacy header is upgraded
 * first. Throws for a key outside `[a-z][a-z0-9_]*`, `kind`, and a value with
 * a line break (CR or LF), `}}` or U+0000. Values the reader would trim or
 * unquote are written quoted so they read back exactly.
 */
export declare function setHeaderValue(text: string, key: string, value: string): string;
/**
 * Remove a header key (FC-18 §9): `editHeader(text, { [key]: null })` — its
 * line goes with its nested and `|` lines and every duplicate. A text without
 * the key is returned as is. Throws for `kind`.
 */
export declare function removeHeaderKey(text: string, key: string): string;
/**
 * Lint the header of a text. `kind` selects the key registry; without it the
 * header's `carrier` key does, and without that every kind's keys are known.
 * Findings that concern a line carry `line` (1-based), `from` and `to`.
 *
 * Header codes: `legacy-header` (warning), `kind-not-first` (warning),
 * `opener-not-alone` (warning: keys on the `{{nyml` line), `closer-not-alone`
 * (warning: a compact `key: value}}` closing line), `closer-in-value` (error:
 * the header ended at a `}}` inside a value — the closing line holds non-key
 * text, or a lone `}}` line or key lines follow the header before the first
 * blank line, or text follows `}}`), `ignored-line` (warning: lines indented
 * under a scalar key, which the flat reader ignores), `kind-case` (warning:
 * `Kind:` / `kind: Document` — not read as the header), `duplicate-key`
 * (warning), `key-grammar` (warning), `unknown-key` (warning), `host-key`
 * (warning), `bad-uid` (error), `bad-format` (error), `newer-format` (error),
 * `bad-carrier` (error), `carrier-mismatch` (warning), `bad-lang`, `bad-measure`,
 * `bad-ratio` (warnings: value shapes). Text codes, with or without a header:
 * `nul` (error), `lone-surrogate` (error), `mixed-eol` (warning),
 * `front-matter` (warning: a leading `---`/`+++` front matter, which a header
 * inserted by a tool would precede), `stray-document-block` (warning: a
 * `kind: document` block that is not the header; it renders nothing).
 */
export declare function lintHeader(text: string, kind?: KindName): Lint[];
/**
 * The header and its lint in one scan (for `readDocument`). `blocks`, when
 * given, returns `scanNymlBlocks(text)` (so a caller that parses the text
 * anyway shares the parse).
 * @internal Not part of the `orz-markdown/carrier` API.
 */
export declare function readHeaderAndLint(text: string, kind: KindName, blocks?: () => NymlBlock[]): {
    header: Header | null;
    lint: Lint[];
};
export {};
//# sourceMappingURL=header.d.ts.map