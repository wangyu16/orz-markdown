/**
 * The baseline grid on screen (2.3.0, claim M.31; owner 2026-10-12: "the
 * playful-1 theme for orz-markdown and in orz-mdhtml should have the same
 * features [as orz-paged's print version]: all elements either 'write'
 * directly on the lines or in a container attached on top of the paper with
 * the ruled lines").
 *
 * A theme opts in by setting `--orz-grid` on the article (`.markdown-body`):
 * the line pitch, an absolute length equal to the body line height (only
 * `light-playful-1` does, inside `@media screen`). The theme draws the ruling
 * itself, as the article's background, from the content box top at that
 * pitch, and sets everything written on the lines in whole lines (pure CSS);
 * this pass supplies what CSS cannot know, for blocks of variable height:
 *
 * 1. `--orz-rule-at` on the article — where a body line's baseline falls in
 *    its line box, plus a small drop (the rule runs just under the letters),
 *    measured on a probe paragraph; `--orz-sh-<k>` / `--orz-mb-<k>` for the
 *    lined kinds (`h1`…`h6`, `fn` = the footnotes): the relative shift that
 *    puts a heading's baseline on a rule and the margin that ends it at the
 *    end of its last line (the theme's CSS applies them).
 * 2. Every top-level block of the article, in order, is one of four kinds
 *    (the same model as orz-paged's print handler, src/paged/baseline-grid.ts
 *    there): **text** (paragraphs, lists, the TOC, `::: center`/`right`) and
 *    **lined** (headings, rules, footnotes) start on a grid line; **math** (a
 *    display formula) starts on a grid line, its baseline is moved onto a rule
 *    and its height rounded up to whole lines; a **box** (anything else: a
 *    table, code, a callout, a quote, a picture, a diagram, columns, tabs, a
 *    spoiler, a QR block) is a sheet on top of the paper: it starts on a rule
 *    one blank line below the text above and is grown to end on a rule (the
 *    text after it back on the lines after one blank line). A written block
 *    whose height is still not a whole number of lines gets the class
 *    `orz-off-grid` (the theme hides the ruling behind it).
 *
 * How: one read of every block's layout box (transforms neutralised), then
 * one write of the margins and paddings that put them on the grid (positions
 * shift by what was added above), then one check; a document the arithmetic
 * does not predict (floats, clearance) is done again block by block. Every
 * inline style it sets is recorded and restored before the next run, so a run
 * is idempotent; `watch(root)` re-runs it (once per frame at most) when the
 * article's size changes (images, diagrams, tabs, a resize, a theme switch)
 * and when webfonts finish loading, and undoes it while the page prints. For an article whose theme
 * sets no `--orz-grid` a run reads one custom property and stops.
 *
 * ONE source for both places it runs: the preview frame (an inline script in
 * `getPreviewFrameAssets().bodyScripts()`, run by `__orzEnhance`) and a page
 * (`enhanceDocument` injects it once per window). Plain ES5 syntax in a
 * `String.raw` template: no backticks or `${` inside it.
 */
/** The class a written block gets when its lines are off the grid (the theme hides the ruling behind it). */
export declare const GRID_OFF_CLASS = "orz-off-grid";
/** The class a paragraph holding only a picture (an image, a QR code) gets: the theme sets it as a sheet. */
export declare const GRID_PICTURE_CLASS = "orz-picture";
/** The attribute an article carries while the grid is applied (its value: the pitch in CSS px). */
export declare const GRID_ATTRIBUTE = "data-orz-grid";
/**
 * The browser script that defines `window.OrzBaselineGrid` once per window:
 * `{ align(root), watch(root), release(root), stats(root) }`. `align` runs
 * the pass once (returns its stats, or `null` when the theme has no grid);
 * `watch` aligns and keeps the article aligned; `release` undoes it and
 * stops watching.
 */
export declare const BASELINE_GRID_SCRIPT: string;
//# sourceMappingURL=baseline-grid.d.ts.map