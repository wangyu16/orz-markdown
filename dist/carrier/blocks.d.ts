import { type Kind } from './document.js';
/** What a block is (`TextBlock.type`). */
export type BlockType = 
/** The FC-18 document header (a legacy `kind: meta` pair included) and the blank lines after it. */
'header'
/** Section/slide unit: the blocks before the first section heading or slide marker. */
 | 'preamble'
/** Section unit: a heading of level ≤ `depth` and everything up to the next one. */
 | 'section'
/** Slides' section unit: a slide marker and everything up to the next one. */
 | 'slide' | 'heading' | 'paragraph'
/** One top-level list (all its items). */
 | 'list' | 'table' | 'blockquote'
/** A `::: name` container (columns, callouts, tabs, …) as one block; `name` is its name. */
 | 'container'
/** Fenced or indented code; `name` is the fence's language (e.g. `js`, `mermaid`), absent for indented code. */
 | 'code'
/** A `$$ … $$` math block. */
 | 'math'
/** A block directive `{{name …}}` (mermaid, chart, nyml, …); `name` is the directive. */
 | 'directive'
/** paged: an element block `{{nyml kind: <element>}}`; `name` is the element kind. */
 | 'element'
/** Raw HTML (an HTML comment included). */
 | 'html'
/** slides: a slide marker (`name: 'slide'`) or a region marker (`name`: the region) — in the `block` unit. */
 | 'marker'
/** A thematic break. */
 | 'rule'
/** Reference-link and footnote definitions (the parser keeps no block for them). */
 | 'definition'
/** A text of blank lines only. */
 | 'blank'
/** A top-level construct of a registered plugin this module does not know; `name` is its token type. */
 | 'other';
/** One block of a text (`splitBlocks`). */
export interface TextBlock {
    type: BlockType;
    /** Container name, directive name, element kind, code language, marker name, or the token type of `other`. */
    name?: string;
    /**
     * The block's stable block id (FC-02, `blk-` + ≥ 8 base36) when it has one,
     * else `null`: a heading's `{{attrs[#blk-…]}}`; for a section, its heading's;
     * for a slide, an `id=blk-…` slide option, else the id of the slide's first
     * heading that has one.
     */
    id: string | null;
    /** Offset of the block's first character in the text. */
    start: number;
    /** Offset just past the block (its trailing blank lines included). */
    end: number;
    /** 1-based line of the text where the block starts. */
    line: number;
    /** `blockFingerprint` of the block's text. */
    fingerprint: string;
}
/** How a text is cut (`SplitOptions.unit`). */
export type BlockUnit = 'block' | 'section';
/** Options of {@link splitBlocks} and {@link canonicalize}. */
export interface BlockOptions {
    /** The text's kind; else the file name's kind, else the header's `carrier`, else `md` (as `readDocument`). */
    kind?: Kind;
    filename?: string;
}
/** Options of {@link splitBlocks}. */
export interface SplitOptions extends BlockOptions {
    /**
     * `block`: one block per top-level construct (slides: slide and region
     * markers are `marker` blocks). `section`: md and paged are cut at every
     * top-level heading of level ≤ `depth`; slides are cut at every slide
     * marker. Default: `section` for slides, `block` for md and paged.
     */
    unit?: BlockUnit;
    /** Section unit, md and paged: the deepest heading level that starts a section (1–6, default 2). */
    depth?: number;
}
/**
 * A block's fingerprint: the first 16 hex digits of the SHA-256 of its text
 * with line endings read as LF and the blank lines before and after it (the
 * separator) left out. Two blocks that differ only in line endings or in the
 * blank lines around them have the same fingerprint; any other difference —
 * a trailing space included — gives another one. For whitespace-insensitive
 * comparison, fingerprint the blocks of `canonicalize(text)`.
 */
export declare function blockFingerprint(blockText: string): string;
/**
 * Cut a text into blocks (see the module comment). `opts` is the kind, or
 * `{ kind?, filename?, unit?, depth? }`. The blocks tile the text exactly:
 * `blocks.map((b) => text.slice(b.start, b.end)).join('') === text`. An empty
 * text has no blocks; a text of blank lines is one `blank` block.
 *
 * Stability: a block starts where the parser starts a top-level construct,
 * so an edit inside one block leaves every other block's offsets-relative
 * text, `id`, `type` and `fingerprint` unchanged, unless the edit changes
 * where the parser starts constructs (joining two paragraphs by deleting the
 * blank line between them, opening a fence that is never closed, …).
 */
export declare function splitBlocks(text: string, opts?: Kind | SplitOptions): TextBlock[];
/**
 * The canonical form of a text (see the module comment): the text with LF
 * line endings; the header byte for byte, then one blank line; top-level
 * blocks separated by exactly one blank line, without blank-line runs inside
 * them; no trailing spaces except a two-space hard break; paragraph lines
 * without leading spaces; ATX headings `## Title` (a one-line setext heading
 * too); rules `---`; bullets `-`; ordered markers `1.`; emphasis `*a*` and
 * `**a**`; tables `| a | b |` with `---` / `:---` / `---:` / `:---:`
 * delimiters; one final line break. Code, math, raw HTML and directive
 * blocks keep their bytes. A change that would alter the rendered HTML is not
 * made, so `render(body(canonicalize(x))) === render(body(x))`, and
 * `canonicalize(canonicalize(x)) === canonicalize(x)`.
 */
export declare function canonicalize(text: string, opts?: Kind | BlockOptions): string;
//# sourceMappingURL=blocks.d.ts.map