import type { Kind } from './document.js';
/** HTML is recognised by its start: an optional BOM and whitespace, then `<!doctype html` or `<html` (in the first 1024 characters). */
export declare function looksHtml(s: string): boolean;
/** A file name as a POSIX shell word for advice: as is when it holds only safe characters, else single-quoted. */
export declare function shellWord(name: string): string;
/** A `<script>` element found by its id: its start tag's attributes and its content's bounds. */
export interface ScriptElementInfo {
    attrs: string;
    start: number;
    /** Offset of the first `</script` after it (raw text), or null when the file is cut before one. */
    end: number | null;
}
/** The first `<script …>` start tag with this id, with its content's bounds (raw text: up to the first `</script`). */
export declare function scriptElement(html: string, id: string): ScriptElementInfo | null;
/**
 * An assembled file's structure (FC-18 §8): whether the `#orz-src` island and
 * the document (`</html>`) are closed, and the engine — `same` (the inline
 * engine is this release's bundle, byte for byte), `different` (it is not:
 * altered or cut), `unverified` (another shell version, or no reference
 * bundle given), `cdn` (loaded from jsDelivr: the `src` is checked instead),
 * `missing` (no `#orz-engine`).
 */
export interface AssembledStructure {
    island: 'closed' | 'unclosed';
    end: 'closed' | 'unclosed';
    engine: 'same' | 'different' | 'unverified' | 'cdn' | 'missing';
}
/** What {@link assembledStructure} compares an assembled file with. */
export interface StructureOptions {
    /** The file's shell version (`extract(html).shell`). */
    shell: string;
    /** The file's delivery (`extract(html).delivery`). */
    delivery: string;
    /** This tool's version: an inline engine is compared only for a file of this shell version. */
    version: string;
    /** The release's jsDelivr bundle URL of a shell version (a cdn file's `src` must be it). */
    bundleUrl(shellVersion: string): string;
    /** This release's browser bundle (the exact text an inline file of this version holds). */
    engineSource?: string;
}
/** The structural checks of an assembled file (see {@link AssembledStructure}). */
export declare function assembledStructure(html: string, o: StructureOptions): AssembledStructure;
/**
 * A text as an assembled file stores it (FC-18 §8.1): mixed line endings in
 * the style of the first line break (lint `mixed-eol`); anything else
 * exactly. A text the envelope refuses (NUL, a lone surrogate, a newer
 * format) is returned as is. Compare a text twin with the text a file holds
 * through this.
 */
export declare function storedText(text: string, kind?: Kind): string;
/** A carrier's legacy reader, as {@link heldText} and {@link twinCheck} use it (the text of its 0.x file, or null). */
export type LegacyTextReader = (html: string) => {
    text: string;
} | null;
/** The orz text an HTML file holds — a carrier's 0.x file's source (`readLegacy`), else a format-1 file's text — or null (not an orz file, or not HTML). */
export declare function heldText(html: string, readLegacy?: LegacyTextReader): string | null;
/** How the CLI found a file's text to be an earlier state of the text twin. */
export type EarlierState = 'git-head' | 'git-index' | 'git-log' | 'cache';
/** The sibling twin as the caller read it (this module reads no files). */
export interface TwinInput {
    /** Its path, as the input was named. */
    name: string;
    /** Its content. */
    content: string;
    /** Which of the two was modified last. */
    newer?: 'input' | 'twin' | 'same-time' | 'unknown';
    /** The CLI found the assembled file's text to be an earlier state of the text twin. */
    earlier?: EarlierState | null;
}
/** The twin check's result. */
export interface TwinReport {
    name: string;
    /** `same` (the same text, compared as a file stores it), `different`, or `none` (no orz text where one was expected). */
    holds: 'same' | 'different' | 'none';
    newer: 'input' | 'twin' | 'same-time' | 'unknown';
    /** The SHA-256 of the text the twin holds (null for `none`): the `--replaces` token for it. */
    sha256: string | null;
    /** Set by the carrier when `holds` is `different` and the twin input said `earlier`. */
    earlier?: EarlierState;
}
/**
 * Compare an input with its sibling twin (FC-18 §3): for a text input the twin
 * is its assembled file (`holds: none` when it holds no orz text), for an
 * assembled (or legacy) input the twin is its text (`none` when it is an orz
 * file itself). Texts are compared as a file stores them ({@link storedText}).
 */
export declare function twinCheck(input: 'text' | 'assembled', text: string, twin: TwinInput, o?: {
    kind?: Kind;
    readLegacy?: LegacyTextReader;
}): TwinReport;
//# sourceMappingURL=inspect.d.ts.map