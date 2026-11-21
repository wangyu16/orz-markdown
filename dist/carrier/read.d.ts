import type { Kind } from './document.js';
import { type TwinNaming } from './naming.js';
export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from '../html.js';
export { decodeText, eolStyle, hasMixedEol, hasLoneSurrogate } from './text.js';
export type { EolStyle } from './text.js';
export { twinNaming, readTwinNaming, sameTwinNaming, isTwinTemplate, twinHref, twinFileName, textNameOf, FAMILY_NAMING } from './naming.js';
export type { TwinNaming, TwinKind } from './naming.js';
/** A file's reader-copy setting: `notice` is the host's words, else the kit's default. */
export interface ReaderCopy {
    notice?: string;
}
/** Longest notice accepted, in UTF-16 code units (a sentence or two, not a document). */
export declare const READER_COPY_NOTICE_MAX = 300;
/**
 * Read a reader-copy setting without throwing: `{}` for `true` or `{}` (the
 * kit's words); `{ notice }` for an object whose only key is `notice`, a
 * string — runs of spaces, tabs and line breaks collapsed to one space and
 * trimmed, 1 to {@link READER_COPY_NOTICE_MAX} UTF-16 code units, at least
 * one visible character, no character {@link REFUSED} refuses; `null`
 * for none (`undefined`, `null`, `false`) and for anything invalid.
 */
export declare function readReaderCopy(value: unknown): ReaderCopy | null;
/** One neighbour of a page: where it is and what a reader reads. */
export interface SiteNavLink {
    href: string;
    label: string;
}
/** A page's place in a set of pages: the set's title, its home page, the page before and after it. */
export interface SiteNav {
    title: string;
    home: string;
    previous?: SiteNavLink;
    next?: SiteNavLink;
}
/** Longest title or label accepted, in UTF-16 code units. */
export declare const SITE_NAV_TEXT_MAX = 200;
/** Longest href accepted, in UTF-16 code units. */
export declare const SITE_NAV_HREF_MAX = 2048;
/** A title or label, normalized (spaces collapsed, trimmed), or null when it breaks the rule. */
export declare function readSiteNavText(value: unknown): string | null;
/**
 * An href, or null when it breaks the rule: 1 to {@link SITE_NAV_HREF_MAX}
 * code units, nothing {@link HREF_REFUSED} refuses, not network-path (`//…`);
 * either relative (no scheme) or an absolute `http:` / `https:` URL. Never
 * normalized: what is stored is what the host gave.
 */
export declare function readSiteNavHref(value: unknown): string | null;
/**
 * Read a site-navigation setting without throwing: the normalized record
 * (keys in the order `title`, `home`, `previous`, `next`; a link as `href`,
 * `label`) for an object with a valid `title` and `home` and, when present,
 * valid `previous` / `next` links and no other key; `null` for anything else.
 */
export declare function readSiteNav(value: unknown): SiteNav | null;
/** Two site-navigation settings say the same (both absent, or equal once read). */
export declare function sameSiteNav(a: unknown, b: unknown): boolean;
/** What {@link extract} reads back. */
export interface Extracted {
    /** The text, exactly as it was assembled. */
    text: string;
    kind: Kind;
    format: number;
    /** The shell version (`''` when the file has no `#orz-shell`). */
    shell: string;
    /** The delivery (`''` when the file has no `#orz-shell`). */
    delivery: string;
    /** The resolved includes stored in `#orz-includes`, when the file has them. */
    includes?: Record<string, string>;
    /**
     * (2.5.0) The twin-link naming stored in `#orz-shell` as `"links"` (FC-18
     * §8.2 `twinLinks`), normalized; absent for the family naming (no `"links"`,
     * or one that is not a valid naming).
     */
    twinLinks?: TwinNaming;
    /**
     * (2.9.0) The reader-copy setting stored in `#orz-shell` as `"readerCopy"`
     * (FC-18 §8.2), normalized (`{}` or `{ notice }`); absent when the file has
     * none or an invalid one.
     */
    readerCopy?: ReaderCopy;
    /**
     * (2.10.0) The site navigation stored in `#orz-shell` as `"siteNav"`
     * (FC-18 §8.2), normalized; absent when the file has none or an invalid one.
     */
    siteNav?: SiteNav;
}
/**
 * The npm package of each kind's carrier (its agent skill ships there; its
 * browser bundle and release manifest are `<package>-browser`). Hard-coded:
 * the update check derives its manifest URL from it, never from a document.
 */
export declare const KIND_PACKAGE: Readonly<Record<Kind, string>>;
/** Id of the source island. */
export declare const SOURCE_ISLAND_ID = "orz-src";
/** Id of the shell marker island. */
export declare const SHELL_ISLAND_ID = "orz-shell";
/** Id of the resolved-includes island. */
export declare const INCLUDES_ISLAND_ID = "orz-includes";
/** The DOM surface {@link readIslandFromDom} needs (a DOM `Element` satisfies it). */
export interface IslandElement {
    readonly textContent: string | null;
    getAttribute(name: string): string | null;
    hasAttribute(name: string): boolean;
}
/**
 * Read the text from the island element of a parsed page (`#orz-src`), with
 * the same restoration as {@link extract}: equal to `extract(html).text` for
 * the file the page was parsed from.
 */
export declare function readIslandFromDom(el: IslandElement): string;
/** The reserved id (`orz-src` / `orz-shell`) an element in `html` carries, if any (case-insensitive). */
export declare function reservedIdIn(html: string): string | null;
/**
 * Read the text back out of an assembled file (FC-18 §8.1): the content of
 * the first `<script id="orz-src">` (found tag by tag: attribute order,
 * quoting and case do not matter; comments and other raw-text elements are
 * skipped), unescaped with `unescapeScriptText`, its line endings and BOM
 * restored from `data-orz-eol` / `data-orz-bom`; kind, format, shell version
 * and delivery from `#orz-shell` (falling back to `data-orz-kind`,
 * `data-orz-format`, `md`, `1`, `''`); `includes` from `#orz-includes`;
 * (2.5.0) `twinLinks` from `#orz-shell` `"links"` when it is a valid naming
 * other than the family's; (2.9.0) `readerCopy` from `#orz-shell`
 * `"readerCopy"` when it is valid; (2.10.0) `siteNav` from `#orz-shell`
 * `"siteNav"` when it is valid.
 * `null` when there is no source island.
 * Experimental files (slides' `#orz-deck`) are not read.
 */
export declare function extract(html: string): Extracted | null;
//# sourceMappingURL=read.d.ts.map