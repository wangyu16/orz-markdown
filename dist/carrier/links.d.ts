/**
 * Twin links (FC-18 §8.3): in an assembled file, a relative link to a text twin
 * (`week2.slides.md`, `notes.md#part`) points at the assembled twin
 * (`week2.slides.html`, `notes.md.html#part`). The text keeps its `.md` links,
 * so they also work on GitHub.
 *
 * The rewrite is a markdown-it core rule on the shared `md`, inert unless the
 * render's env carries `orzTwinLinks: true`. It is registered when this module
 * is loaded (by `orz-markdown/carrier`), never by the parser entry.
 */
import type MarkdownIt from 'markdown-it';
/** Name of the core rule on the shared `md`. */
export declare const TWIN_LINKS_RULE = "orz_twin_links";
/**
 * The assembled-twin href of a link href, or the href unchanged.
 *
 * Rewritten: a relative path (also `./`, `../`, or root-relative `/…`) whose
 * last segment ends in `.md`, `.slides.md` or `.paged.md` (lower case), with
 * an optional `?query` and/or `#fragment`, which are kept. Untouched: absolute
 * URLs (any `scheme:`, so `https:`, `mailto:`, `data:`), protocol-relative
 * `//host/…`, fragment- or query-only hrefs, and every other path.
 */
export declare function twinHref(href: string): string;
/** Register the twin-link rule on a markdown-it instance (idempotent). */
export declare function registerTwinLinks(target: MarkdownIt): void;
//# sourceMappingURL=links.d.ts.map