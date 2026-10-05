import { type Kind } from './document.js';
export { eolStyle, hasMixedEol, hasLoneSurrogate } from './text.js';
export type { EolStyle } from './text.js';
/** The shell's contribution to an assembled file. */
export interface ShellParts {
    /** The shell's kind; it names the file kind in `data-orz-kind`, the generator and `#orz-shell`. */
    kind: Kind;
    /** The shell version written to the generator meta and `#orz-shell`. */
    shellVersion: string;
    /** FC-18 §8.2: `inline` (the default) or `cdn`. Recorded in `#orz-shell`. */
    delivery?: 'inline' | 'cdn';
    /** Shell assets for `<head>` (styles, scripts), written after `#orz-shell`. Must not hold an element with id `orz-src` or `orz-shell`. */
    headHtml: string;
    /** Shell markup for `<body>`, written after the source island (and `#orz-includes`). Same id rule. */
    bodyHtml: string;
    /** Resolved includes (FC-18 §8.3, D4): target → text, stored in `#orz-includes` with sorted keys. */
    includes?: Record<string, string>;
}
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
}
/** Id of the source island. */
export declare const SOURCE_ISLAND_ID = "orz-src";
/** Id of the shell marker island. */
export declare const SHELL_ISLAND_ID = "orz-shell";
/** Id of the resolved-includes island. */
export declare const INCLUDES_ISLAND_ID = "orz-includes";
/** The npm package of each kind's carrier (its agent skill ships there). */
export declare const KIND_PACKAGE: Readonly<Record<Kind, string>>;
/** The agent skill URL of a kind's carrier. */
export declare function skillUrl(kind: Kind): string;
/**
 * Assemble the HTML file for a text (FC-18 §8.1): doctype; `<html lang
 * data-orz-kind>`; charset; generator `orz-<kind> <shellVersion>`; `<title>`
 * (derived, FC-18 §8.1); head metadata and `#orz-meta` from the header's
 * DocMeta; `#orz-shell` `{kind, format, shell, delivery}`; the shell's head;
 * then in `<body>` the agent banner, the source island (`data-orz-format`,
 * `data-orz-eol`, `data-orz-bom` when the text starts with U+FEFF), `#orz-includes`
 * when there are includes, and the shell's body. Deterministic.
 *
 * A text with mixed line endings is stored with its first style throughout
 * (lint `mixed-eol`). Throws for a text holding NUL or a lone surrogate, for a
 * header `format` above 1 (FC-18 §8.4: a format-1 shell never writes a newer
 * format), and for shell parts holding an element with id `orz-src` or
 * `orz-shell`.
 */
export declare function assembleEnvelope(text: string, parts: ShellParts): string;
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
/**
 * Read the text back out of an assembled file (FC-18 §8.1): the content of
 * the first `<script id="orz-src">` (found tag by tag: attribute order,
 * quoting and case do not matter; comments and other raw-text elements are
 * skipped), unescaped with `unescapeScriptText`, its line endings and BOM
 * restored from `data-orz-eol` / `data-orz-bom`; kind, format, shell version
 * and delivery from `#orz-shell` (falling back to `data-orz-kind`,
 * `data-orz-format`, `md`, `1`, `''`); `includes` from `#orz-includes`.
 * `null` when there is no source island.
 * Experimental files (slides' `#orz-deck`) are not read.
 */
export declare function extract(html: string): Extracted | null;
//# sourceMappingURL=envelope.d.ts.map