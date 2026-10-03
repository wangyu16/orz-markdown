/**
 * Pre-processes a markdown source string by resolving URL-based markdown
 * includes BEFORE rendering. markdown-it rendering is synchronous, so a URL
 * fetch cannot happen inside a render rule; this async pre-pass inlines the
 * referenced markdown up front, and the result renders normally.
 *
 * Directive syntax (anywhere in live text — not in code, not escaped, not in a
 * link destination):
 *
 *     {{markdown https://host/path.md}}
 *     {{md-include https://host/path.md}}
 *
 * Each directive is replaced by the fetched markdown (which may itself contain
 * includes — resolved recursively up to `maxDepth`, with an ancestor-chain
 * cycle guard). The fetched text is block content: it is placed as its own
 * blocks, so a directive in the middle of a paragraph splits the paragraph
 * there, and a directive inside a blockquote or list item keeps its content in
 * that container.
 *
 * A directive is LEFT IN PLACE (never a hard error) when its fetch fails, its
 * host is not allowed, it would exceed `maxSize`, or splicing it would change
 * how the host document around it parses (see "Splice safety" below).
 *
 * Directives are located from the renderer's own tokens, so a directive inside
 * code, an HTML comment, a raw HTML block, a math block or another directive's
 * body is inert here exactly as it is when rendering.
 *
 * Splice safety. Includes come from trusted sources (CLAIMS M.21); these checks
 * are defence in depth against accidents and a compromised host. Fetched text
 * can never make the host read
 * local files (every file-include spelling in it is neutralized), and it can
 * never change the host document around it: the spliced document is parsed
 * once more against a reference in which each include is an opaque
 * placeholder paragraph, and every host token — before, around and after the
 * includes, with inline content and link targets — must come out the same. An
 * include that would flip a later code example live, swallow the following
 * text into a list item or footnote, close the host's container, or redefine
 * the host's link references is refused. An unclosed code fence at the end of
 * fetched text (the common authoring slip) is closed first, and raw HTML
 * outside the allowlist is removed block by block (M.20).
 *
 * The network transport is INJECTABLE (`opts.fetcher`) and can be restricted to
 * an allowlist of hosts (`opts.allowedHosts`) — important when resolving
 * host-authored content server-side, where an unrestricted fetch is an SSRF
 * vector. Outside a browser nothing is fetched without `allowedHosts` or a
 * `fetcher`; in a page, an empty list allows every host (M.21).
 */
export interface PrepareSourcesOptions {
    /**
     * Fetch a URL's markdown text. Injectable so a host controls transport and
     * auth; defaults to the global `fetch`. Return `null` to leave the directive
     * unresolved (e.g. a non-200, or a URL the host declines). A custom fetcher
     * owns redirect handling and timeouts: re-check `allowedHosts` on every hop
     * (the default fetcher does).
     */
    fetcher?: (url: string) => Promise<string | null>;
    /**
     * The hosts whose text this document may include: ONLY URLs whose host is
     * in this list are fetched; any other directive is left in place.
     * Case-insensitive exact host match (host = `example.com` or
     * `example.com:8443`). Includes are content from sources you trust, not a
     * sandbox for hostile text. Outside a browser (Node, Deno, Bun, a worker
     * without `document`), nothing is fetched unless this list is non-empty or
     * a `fetcher` is given — the fetcher then owns the trust decision. In a
     * page, the author who writes the URL makes that choice; an empty list
     * there allows every host.
     */
    allowedHosts?: string[];
    /** Max recursion depth for includes that themselves include (default 3). */
    maxDepth?: number;
    /**
     * Max total length of the expanded source, in characters (default
     * 5,000,000). An include that would push past it is left in place, so a
     * source cannot blow up through repeated or nested includes.
     */
    maxSize?: number;
    /** Default fetcher only: give up on a URL after this many ms (default 15,000). */
    timeoutMs?: number;
    /**
     * The file-include settings the document will be rendered with
     * (`markdownBasePath`, `markdownIncludeRoot`, `readFile`). Whether an include
     * changes the host is judged on what the host renders — its own `{{md
     * ./file}}` content included. A document with a live file include and no
     * `includeEnv` keeps its URL directives: that content is invisible here.
     */
    includeEnv?: IncludeEnv;
}
import type { IncludeEnv } from './plugins/markdown-include.js';
export declare function prepareSources(src: string, opts?: PrepareSourcesOptions): Promise<string>;
//# sourceMappingURL=prepare-sources.d.ts.map