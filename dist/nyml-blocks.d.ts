/**
 * Generic `{{nyml … }}` block scanner.
 *
 * Finds every nyml block in a source, parses its YAML-ish `key: value` body
 * (including `key: |` multiline blocks), reads the `kind:` discriminator, and
 * reports char offsets so a caller can splice the block out or replace it.
 *
 * Hoisted here from orz-paged (`src/doc/nyml.ts`, 2026-07-10) so that every
 * orz-family tool can read block metadata from a source without reimplementing
 * the grammar. orz-paged now imports it; `doc-meta.ts` builds on it. Values are
 * always strings: surrounding quotes are stripped, multiline `|` blocks are
 * dedented and joined with `\n`. Only the first `}}` terminates a block, so `}`
 * may appear inside the body.
 */
/** One scanned `{{nyml … }}` block: its kind, parsed fields, and char range. */
export interface NymlBlock {
    /** The `kind:` value (e.g. `'document'`, `'element'`), or `''` if absent. */
    kind: string;
    /** snake_case field → raw string value (multiline values preserved). */
    fields: Record<string, string>;
    /** Offset of the opening `{` of `{{nyml` in `source`. */
    start: number;
    /** Offset just past the closing `}}` (so `source.slice(start, end)` is the block). */
    end: number;
}
/**
 * Scan a source for every `{{nyml … }}` block, in document order. Each result
 * carries its parsed `kind`, `fields`, and `[start, end)` char offsets. Blocks
 * inside an HTML comment (`<!-- … -->`) are skipped — so a commented-out element
 * (e.g. content the editor's template picker preserves) does not render.
 */
export declare function scanNymlBlocks(source: string): NymlBlock[];
//# sourceMappingURL=nyml-blocks.d.ts.map