/**
 * Site navigation (FC-18 §8.2 `siteNav`, orz-markdown 2.10.0): an assembled
 * file that is one page of a set of pages (a website's) can carry its place
 * in that set — the set's title, its home page, the page before and the page
 * after it — in `#orz-shell` as `"siteNav"`. The file's runtime draws it as a
 * slim bar outside the document text (spec/carrier-app.md §4.5b); the text,
 * the island and `extract().text` do not change.
 *
 * The value is DATA the file carries: plain-text title and labels (never
 * markup) and hrefs that are relative or absolute `http(s)` URLs. The rule
 * itself is `readSiteNav` in `read.ts` (small and message-free); this module
 * adds the assembly side — `siteNav`, which throws with a reason — and
 * `siteNavFrom`, which resolves the hrefs against a page's address (a copy
 * written from a website keeps links that lead back to it). Parser-free.
 */
import { type SiteNav, type SiteNavLink } from './read.js';
export { readSiteNav, sameSiteNav, SITE_NAV_HREF_MAX, SITE_NAV_TEXT_MAX } from './read.js';
export type { SiteNav, SiteNavLink };
/**
 * Validate and normalize a site-navigation setting for assembly: `null` for
 * none (`undefined`, `null`, `false`); otherwise exactly what `readSiteNav`
 * reads — `{ title, home, previous?, next? }`, a link `{ href, label }`;
 * title and labels plain text (runs of spaces, tabs and line breaks
 * collapsed and trimmed, 1 to {@link SITE_NAV_TEXT_MAX} UTF-16 code units, at
 * least one visible character, no control or format character but the
 * zero-width (non-)joiner); hrefs relative (no scheme) or absolute
 * `http:`/`https:`, 1 to {@link SITE_NAV_HREF_MAX} code units, no whitespace,
 * backslash or control character, not `//…`. Throws a `TypeError` with the
 * reason for anything else.
 */
export declare function siteNav(value: unknown): SiteNav | null;
/**
 * The setting with its hrefs resolved against a page's address (`base`, an
 * absolute `http:`/`https:` URL): what a copy written from that page carries,
 * so its links still lead to the website. Absolute hrefs stay as they are; a
 * `base` that is not `http(s)` (a `file:` page) returns the setting
 * unchanged, as does an href that cannot be resolved to a valid one.
 */
export declare function siteNavFrom(nav: SiteNav, base: string): SiteNav;
//# sourceMappingURL=site-nav.d.ts.map