/**
 * Pre-processes a markdown source string by fetching any URL-based markdown includes.
 *
 * Scans for `{{markdown https://...}}` or `{{md-include https://...}}` patterns,
 * fetches each URL, and replaces the directive with the fetched markdown content.
 *
 * Call this before `md.render(src)` when URL includes may be present.
 */
export declare function prepareSources(src: string): Promise<string>;
//# sourceMappingURL=prepare-sources.d.ts.map