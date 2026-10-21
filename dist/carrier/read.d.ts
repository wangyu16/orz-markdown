import type { Kind } from './document.js';
import { type TwinNaming } from './naming.js';
export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from '../html.js';
export { decodeText, eolStyle, hasMixedEol, hasLoneSurrogate } from './text.js';
export type { EolStyle } from './text.js';
export { twinNaming, readTwinNaming, sameTwinNaming, isTwinTemplate, twinHref, twinFileName, textNameOf, FAMILY_NAMING } from './naming.js';
export type { TwinNaming, TwinKind } from './naming.js';
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
 * other than the family's.
 * `null` when there is no source island.
 * Experimental files (slides' `#orz-deck`) are not read.
 */
export declare function extract(html: string): Extracted | null;
//# sourceMappingURL=read.d.ts.map