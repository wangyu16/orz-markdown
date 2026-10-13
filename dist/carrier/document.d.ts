import { type DocMeta } from '../doc-meta.js';
import { type Header, type Lint } from './header.js';
export { mintUid } from './uid.js';
/** The kinds of document (FC-18 §3). */
export type Kind = 'md' | 'slides' | 'paged';
/** Everything a host needs to index a document (FC-19 §2 `readDocument`). */
export interface DocumentInfo {
    kind: Kind;
    /** Text format version (header `format`, default 1). */
    format: number;
    /** The header, or `null` for a text without one. */
    header: Header | null;
    /** DocMeta (FC-03) from the header, `uid` included (FC-18 §10). */
    meta: DocMeta;
    /** Header `theme`, when set (the default theme is the carrier's). */
    theme?: string;
    /** Header `lang` (BCP 47), default `en`. */
    lang: string;
    /**
     * The kind's own header keys (FC-18 §5.1) that are set, plus the registry
     * defaults that apply: `measure` (`normal`) for md, `ratio` (`16:9`) and
     * (2.4.0) `slide_numbers` / `progress` (`yes`) for slides.
     */
    settings: Record<string, string>;
    /** Host keys (`x_…`) of the header. */
    hostKeys: Record<string, string>;
    /** The derived `<title>` (FC-18 §8.1). */
    title: string;
    /** `lintHeader` findings for the kind. */
    lint: Lint[];
}
/** Registry defaults that `readDocument` resolves into `settings` (FC-18 §5.1). */
export declare const SETTING_DEFAULTS: Readonly<Record<Kind, Readonly<Record<string, string>>>>;
/**
 * The kind a file name gives (FC-18 §3): `*.slides.md` / `*.slides.html` →
 * `slides`, `*.paged.md` / `*.paged.html` → `paged`, `*.md` / `*.md.html` →
 * `md`; `null` for any other name. Directories in the name are ignored;
 * extensions are matched in lower case only.
 */
export declare function kindFromFilename(name: string): Kind | null;
/**
 * The twin of a file name (FC-18 §3): `x.md` ↔ `x.md.html`,
 * `x.slides.md` ↔ `x.slides.html`, `x.paged.md` ↔ `x.paged.html`; `null`
 * otherwise. Directories are kept. `x.slides.md.html` and `x.paged.md.html`
 * give `null`, so `twinName(twinName(n)) === n` whenever both are non-null.
 */
export declare function twinName(name: string): string | null;
/**
 * Read a document's facts from its text, without rendering (FC-19 §2).
 *
 * kind: `opts.kind`, else the file name's kind, else the header's `carrier`,
 * else `md`. title (FC-18 §8.1): the header `title`, else the first top-level
 * level-1 heading (plain text; for slides only after the first slide marker),
 * else — for `paged` — the `title` (or `text`) of the first title element
 * (the first nyml block whose kind ends in `-title`), else `Untitled`.
 * `opts.themes` (2.3.0): the kind's theme ids, passed to the lint
 * (`lintHeader`'s `themes`: a header `theme` not among them is `unknown-theme`).
 * `opts.tokens` / `opts.lint` (2.4.0): a carrier's parse shared, its own lints added.
 */
/**
 * A token of the kit's parser (2.4.0): markdown-it's `Token`, its data fields
 * (no methods), so `kitParser().parse(text, {})` gives `KitToken[]` and a
 * carrier's block scanner can read every field — `nesting` (1 open, 0 self,
 * -1 close), `level`, `map`, `block`, `hidden` … (K.32).
 */
export interface KitToken {
    /** e.g. `html_block`, `heading_open`, `inline`. */
    type: string;
    tag: string;
    attrs: Array<[string, string]> | null;
    /** Source lines `[begin, end)`, 0-based, for block tokens. */
    map: [number, number] | null;
    /** 1 an opening tag, 0 a self-contained token, -1 a closing tag. */
    nesting: 1 | 0 | -1;
    /** Nesting depth (0 = top level). */
    level: number;
    children: KitToken[] | null;
    content: string;
    markup: string;
    info: string;
    meta: unknown;
    block: boolean;
    hidden: boolean;
}
/** Options of {@link readDocument}. */
export interface ReadDocumentOptions {
    kind?: Kind;
    filename?: string;
    /** The kind's theme ids (2.3.0): a header `theme` not among them is `unknown-theme`. */
    themes?: readonly string[];
    /**
     * (2.4.0) The text's tokens from `kitParser().parse(text, {})`, when the
     * carrier parsed it already (its own grammar pass, e.g. slides'
     * `parseDeck`): used instead of parsing again. They must be the tokens of
     * exactly this text from the kit's parser.
     */
    tokens?: readonly KitToken[];
    /**
     * (2.4.0) A carrier's own lints, added after the kit's: called with the
     * text's tokens (shared, parsed at most once) and the header. Value lints
     * of the carrier's keys and its grammar lints go here, so `inspect`,
     * `assemble` and the editor report one list (FC-18 §5.1: warnings and
     * errors of its own codes, never a kit code).
     */
    lint?: (ctx: {
        text: string;
        tokens: readonly KitToken[];
        header: Header | null;
    }) => readonly Lint[];
}
export declare function readDocument(text: string, opts?: ReadDocumentOptions): DocumentInfo;
//# sourceMappingURL=document.d.ts.map