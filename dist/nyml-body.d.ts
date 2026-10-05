/**
 * The flat nyml body reader shared by `scanNymlBlocks` (src/nyml-blocks.ts)
 * and the carrier header tools (src/carrier/header.ts).
 *
 * Not re-exported by the parser entry: it is an internal module. It lives
 * apart from nyml-blocks.ts so the carrier kit can read a block's key lines
 * (their positions, for in-place header edits, FC-18 §9) with exactly the
 * reader that produces the block's fields.
 */
/** Indentation width with tabs expanded to the next multiple of 4. */
export declare function indentWidth(ws: string): number;
/** Strip a single pair of matching surrounding quotes, if present. */
export declare function stripQuotes(s: string): string;
/** One top-level `key: value` entry of a body, by line index. */
export interface NymlBodyEntry {
    /** The key as written (`kind` included). */
    key: string;
    /** Index of the key's line in the body's lines (split on CR LF, CR, LF). */
    line: number;
    /**
     * Index of the entry's last line: the key line plus every following line
     * indented deeper than the key (a `|` value's content, or nested lines the
     * flat reader ignores), up to the last non-blank one.
     */
    endLine: number;
    /** True for a `key: |` value. */
    multiline: boolean;
}
/** The pattern of a key line; group 1 indentation, 2 key, 3 value. */
export declare const NYML_KEY_LINE: RegExp;
/**
 * Parse a nyml body into a flat `key: value` map plus its `kind`. Supports
 * `key: |` multiline blocks: subsequent lines indented more than the key are
 * dedented (block style) and joined with `\n`. The `kind:` line populates
 * `kind` rather than `fields`. `entries` lists every top-level key line in
 * source order (duplicates and `kind` included).
 */
export declare function parseNymlBody(inner: string): {
    kind: string;
    fields: Record<string, string>;
    entries: NymlBodyEntry[];
};
//# sourceMappingURL=nyml-body.d.ts.map