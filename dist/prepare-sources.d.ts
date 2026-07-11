/**
 * Pre-processes a markdown source string by resolving URL-based markdown
 * includes BEFORE rendering. markdown-it rendering is synchronous, so a URL
 * fetch cannot happen inside a render rule; this async pre-pass inlines the
 * referenced markdown up front, and the result renders normally.
 *
 * Directive syntax (anywhere in the source):
 *
 *     {{markdown https://host/path.md}}
 *     {{md-include https://host/path.md}}
 *
 * Each directive is replaced by the fetched markdown (which may itself contain
 * includes — resolved recursively up to `maxDepth`, with an ancestor-chain
 * cycle guard). A directive whose fetch fails or whose host is not allowed is
 * LEFT IN PLACE (unresolved, never a hard error).
 *
 * The network transport is INJECTABLE (`opts.fetcher`) and can be restricted to
 * an allowlist of hosts (`opts.allowedHosts`) — important when resolving
 * host-authored content server-side, where an unrestricted fetch is an SSRF
 * vector. With no options it behaves as before: the global `fetch`, any host.
 */
export interface PrepareSourcesOptions {
    /**
     * Fetch a URL's markdown text. Injectable so a host controls transport and
     * auth; defaults to the global `fetch`. Return `null` to leave the directive
     * unresolved (e.g. a non-200, or a URL the host declines).
     */
    fetcher?: (url: string) => Promise<string | null>;
    /**
     * If non-empty, ONLY URLs whose host is in this list are fetched; any other
     * directive is left in place. Case-insensitive exact host match (host =
     * `example.com` or `example.com:8443`). The SSRF guard for server-side use.
     */
    allowedHosts?: string[];
    /** Max recursion depth for includes that themselves include (default 3). */
    maxDepth?: number;
}
export declare function prepareSources(src: string, opts?: PrepareSourcesOptions): Promise<string>;
//# sourceMappingURL=prepare-sources.d.ts.map