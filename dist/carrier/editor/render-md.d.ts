export interface MarkdownPreviewOptions {
    /** Rewrite links to text twins (`x.md` → `x.md.html`), as an assembled file does. Default `true`. */
    twinLinks?: boolean;
    /** Extra render env (e.g. a host's include resolution). */
    env?: Record<string, unknown>;
}
/** Render an `md` text for the editor preview (see the module comment). */
export declare function renderMarkdownPreview(text: string, options?: MarkdownPreviewOptions): string;
//# sourceMappingURL=render-md.d.ts.map