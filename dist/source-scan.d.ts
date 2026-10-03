/**
 * Source pre-scanning helpers shared by every tool that looks for orz
 * directives in raw Markdown *before* rendering (metadata extraction, URL
 * include resolution, poster include discovery, …).
 *
 * A directive inside a fenced or indented code block, an inline code span, an
 * HTML comment, or a raw HTML block is inert: markdown-it never runs the plugin
 * there. A raw-text scanner that ignores this treats a documentation example
 * — "write `{{nyml kind: meta …}}` at the top" — as a live directive, strips it
 * from the page, or fetches the URL it mentions. Scanning the masked text
 * instead keeps pre-scans in agreement with the renderer.
 *
 * Hoisted from orz-poster (`src/contracts/include-scan.ts`, FA-35), where it was
 * proven against the renderer, so the whole family shares one definition.
 */
/**
 * Blank inline code spans (matching backtick runs), keeping newlines.
 *
 * Linear: each run is paired with the NEXT run of the same length (CommonMark),
 * found through a precomputed `nextSame` table, and only inside one paragraph —
 * a code span never crosses a blank line, so a stray backtick cannot pair with
 * one paragraphs away and blank out live directives in between.
 */
export declare function maskInlineCode(source: string, starts?: boolean[]): string;
export interface MarkdownMaskOptions {
    /** Blank HTML comments `<!-- … -->` (default true). */
    comments?: boolean;
    /** Blank raw HTML blocks (default true). */
    htmlBlocks?: boolean;
    /** Blank indented (4+ spaces) code blocks (default true). Turn off when the
     *  caller cannot tell list continuations from code. */
    indentedCode?: boolean;
}
/**
 * Return `source` with every region where orz directives are inert replaced by
 * spaces: fenced and indented code blocks, inline code spans, HTML comments and
 * raw HTML blocks. Length, offsets and line breaks are preserved exactly, so an
 * index found in the masked text is valid in the original.
 */
export declare function maskInertMarkdown(source: string, options?: MarkdownMaskOptions): string;
//# sourceMappingURL=source-scan.d.ts.map