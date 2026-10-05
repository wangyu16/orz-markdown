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
    /** Header `theme`, when set. */
    theme?: string;
    /** Header `lang` (BCP 47), default `en`. */
    lang: string;
    /** The kind's own header keys that are set (FC-18 §5.1: `measure`; `ratio footer transition`; the paged keys). */
    settings: Record<string, string>;
    /** Host keys (`x_…`) of the header. */
    hostKeys: Record<string, string>;
    /** The derived `<title>` (FC-18 §8.1). */
    title: string;
    /** `lintHeader` findings for the kind. */
    lint: Lint[];
}
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
 * else `md`. title (FC-18 §8.1): the header `title`, else the first level-1
 * heading (token-based, plain text), else — for `paged` — the `title` (or
 * `text`) of the first title element (a nyml block whose kind ends in
 * `-title`), else `Untitled`.
 */
export declare function readDocument(text: string, opts?: {
    kind?: Kind;
    filename?: string;
}): DocumentInfo;
//# sourceMappingURL=document.d.ts.map