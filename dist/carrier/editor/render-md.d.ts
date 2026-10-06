export interface MarkdownPreviewOptions {
    /** Rewrite links to text twins (`x.md` → `x.md.html`), as an assembled file does. Default `true`. */
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
}
/** Render an `md` text for the editor preview (see the module comment). */
export declare function renderMarkdownPreview(text: string, options?: MarkdownPreviewOptions): string;
//# sourceMappingURL=render-md.d.ts.map