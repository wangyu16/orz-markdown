/**
 * Twin-link naming (FC-18 §8.2, §8.3; orz-markdown 2.5.0, K1 of the orz-site
 * design): which file name the assembled twin of a text has where the file is
 * published. The family naming swaps the last extension (`x.md` →
 * `x.md.html`, `x.slides.md` → `x.slides.html`, `x.paged.md` →
 * `x.paged.html`); a host that publishes under other names (a site with
 * `x.html`) gives per-kind file-name templates:
 *
 * ```ts
 * { md: '{stem}.html' }          // x.md → x.html; slides and paged keep the family names
 * ```
 *
 * A template holds `{stem}` exactly once (the file name without its text
 * extension: `week1` for `week1.slides.md`), otherwise only
 * `[A-Za-z0-9._-]`, ends in `.html` and has no `/`: the page stays in its
 * text's folder, so the document's relative asset links still resolve.
 *
 * A naming is DATA, not a function, because an assembled file carries it
 * (`#orz-shell` `"links"`) to the reader's browser, its saves, its quiet
 * update and verify.html. Parser-free and import-free: `extract`
 * (`orz-markdown/carrier/read`), the shell runtime and the carrier app use
 * it without loading the Markdown parser.
 */
/** The kinds a naming names (FC-18 §3). */
export type TwinKind = 'md' | 'slides' | 'paged';
/**
 * A twin-link naming: per-kind file-name templates. A kind left out keeps
 * the family name. `{}` (and every template equal to the family's) is the
 * family naming.
 */
export interface TwinNaming {
    md?: string;
    slides?: string;
    paged?: string;
}
/** The family naming as templates (FC-18 §3). */
export declare const FAMILY_NAMING: Readonly<Required<TwinNaming>>;
/** True when `t` is a valid file-name template (see the module comment). */
export declare function isTwinTemplate(t: unknown): t is string;
/**
 * Validate and normalize a naming: the kinds whose template differs from the
 * family's, in the order `md`, `slides`, `paged` — or `null` for the family
 * naming (`undefined`, `null`, `"family"`, `true`, `{}`, or only family
 * templates). Throws a `TypeError` for anything else: an unknown key, a
 * value that is not a valid template, an array or another type. Two namings
 * that name every file alike normalize to equal objects (so `#orz-shell`
 * bytes depend only on the names, FC-18 law 2).
 */
export declare function twinNaming(value: unknown): TwinNaming | null;
/** Like {@link twinNaming}, but `null` (the family naming) for an invalid value instead of throwing: for values read from a file. */
export declare function readTwinNaming(value: unknown): TwinNaming | null;
/** Two namings name every file alike (both normalized; absent = family). */
export declare function sameTwinNaming(a: unknown, b: unknown): boolean;
/**
 * The published file name of a text's file name (no folder): `week1.slides.md`
 * → `week1.slides.html` (family) or the kind's template with `{stem}`
 * replaced. `null` when the name is not a text twin (lower-case extensions
 * only). The kind comes from the extension, as for links.
 */
export declare function twinFileName(name: string, naming?: TwinNaming | 'family' | null): string | null;
/**
 * The text twin's file name of a published file name of `kind` under a
 * naming — the inverse of {@link twinFileName}: `week1.html` with `{ md:
 * '{stem}.html' }` → `week1.md`; a family name (`week1.md.html`) is read
 * under every naming. `null` when the name matches neither. Used for the
 * name a page offers when it is saved or downloaded (carrier-app §2): the
 * dual name (`week1.md.html`) keeps a downloaded copy recognisable.
 */
export declare function textNameOf(name: string, kind: TwinKind, naming?: TwinNaming | 'family' | null): string | null;
/**
 * The assembled-twin href of a link href, or the href unchanged (FC-18 §8.3).
 *
 * Rewritten: a relative path (also `./`, `../`, or root-relative `/…`) whose
 * last segment ends in `.md`, `.slides.md` or `.paged.md` (lower case), with
 * an optional `?query` and/or `#fragment`, which are kept. Untouched: absolute
 * URLs (any `scheme:`, so `https:`, `mailto:`, `data:`), protocol-relative
 * `//host/…`, fragment- or query-only hrefs, and every other path.
 *
 * `naming` (2.5.0): the published names (FC-18 §8.2 `twinLinks`); absent,
 * `"family"` or `null` = the family names. Throws a `TypeError` for an
 * invalid naming (as {@link twinNaming}).
 */
export declare function twinHref(href: string, naming?: TwinNaming | 'family' | null): string;
//# sourceMappingURL=naming.d.ts.map