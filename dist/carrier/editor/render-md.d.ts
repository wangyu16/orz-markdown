export interface MarkdownPreviewOptions {
    /**
     * Rewrite links to text twins (`x.md` → `x.md.html`), as an assembled file
     * does. Default `true`; the shell passes `false` when the host resolves
     * links itself (`hooks.resolveLink` then gets the source href).
     */
    twinLinks?: boolean;
    /** Extra render env (e.g. a host's include resolution). */
    env?: Record<string, unknown>;
    /**
     * The editor shell's render context (`render(text, ctx)`), accepted so this
     * function can be passed as `render` directly. Not used here: the shell
     * applies `resolveAsset` to the rendered HTML itself, and includes need an
     * asynchronous pre-pass (`prepareSources`) before rendering.
     */
    fetchInclude?(target: string): Promise<string | null>;
    resolveAsset?(path: string): string;
    /** The shell's per-instance scratch map (`ctx.cache`): fetched includes are kept there. */
    cache?: Map<string, unknown>;
}
/** Render an `md` text for the editor preview (see the module comment). */
export declare function renderMarkdownPreview(text: string, options?: MarkdownPreviewOptions): string;
/**
 * Like {@link renderMarkdownPreview}, after resolving the body's URL includes
 * through `options.fetchInclude` (the host's trust policy; `prepareSources`
 * neutralises file includes and refuses unsafe splices). Without
 * `fetchInclude` it is `renderMarkdownPreview`. A fetched include is kept in
 * `options.cache` (the shell's `ctx.cache`) for the shell's life; a failed one
 * is fetched again next time. Anchor lines stay those of the text: lines
 * before the first include and after the last are exact, included content and
 * the text between two includes anchor at the first include's line.
 */
export declare function renderMarkdownPreviewWithIncludes(text: string, options?: MarkdownPreviewOptions): Promise<string>;
//# sourceMappingURL=render-md.d.ts.map