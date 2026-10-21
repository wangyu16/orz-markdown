/** The include targets of a text's body, as written, in order, without repeats (`directives`: the include directive names, default the kit's `md`, `markdown`, `md-include`). */
export declare function includeTargets(text: string, directives?: readonly string[]): string[];
/** One link of a text (`linkTargets`). */
export interface LinkTarget {
    /**
     * The target as the renderer writes it: a Markdown link's or image's
     * destination after the parser's normalization (percent-encoded: `my%20file.md`;
     * decode it to resolve a path), or a raw `<a href>` value as written.
     */
    href: string;
    /** 1-based line of the WHOLE text (header lines counted) where the link is. */
    line: number;
    /**
     * `twin`: a relative link to a text twin (the twin-link rule rewrites it,
     * FC-18 §8.3; a raw `<a>` to a text is `twin` too, though it is not
     * rewritten); `asset`: any other relative or root-relative path (an image
     * is never `twin`); `other`: an absolute URL (`scheme:`), `//host`, or a
     * fragment- or query-only href.
     */
    kind: 'twin' | 'asset' | 'other';
    /** A Markdown image (`![…](…)`): its `src`. */
    image: boolean;
    /** A raw-HTML `<a href>` (inline or block HTML): the renderer leaves it as written. */
    raw: boolean;
}
/**
 * The links of a text, in order: Markdown links (`[…](…)`, reference links,
 * autolinks) and images as the kit's parser reads the body (the header
 * skipped; never in code, comments or a directive's body — the inline body of
 * `{{sp …}}` / `{{span …}}` is read, as the renderer renders it), plus raw-HTML
 * `<a href>` tags (`raw: true`). For a site builder's link check: `kind`
 * says which ones the twin-link rule rewrites. Every occurrence is listed
 * (no de-duplication). Links an include directive brings in are the
 * included text's, not this one's.
 */
export declare function linkTargets(text: string): LinkTarget[];
//# sourceMappingURL=targets.d.ts.map