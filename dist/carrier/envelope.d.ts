import { type Kind } from './document.js';
export { extract, readIslandFromDom, KIND_PACKAGE, SOURCE_ISLAND_ID, SHELL_ISLAND_ID, INCLUDES_ISLAND_ID } from './read.js';
export type { Extracted, IslandElement } from './read.js';
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
//# sourceMappingURL=envelope.d.ts.map