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

/** The kinds, in the order a normalized naming lists them. */
const KINDS: readonly TwinKind[] = ['md', 'slides', 'paged'];

/** The family naming as templates (FC-18 §3). */
export const FAMILY_NAMING: Readonly<Required<TwinNaming>> = Object.freeze({
  md: '{stem}.md.html',
  slides: '{stem}.slides.html',
  paged: '{stem}.paged.html',
});

/** The text extension of each kind (lower case only, as the twin-link rule). */
const TEXT_EXT: Readonly<Record<TwinKind, string>> = { md: '.md', slides: '.slides.md', paged: '.paged.md' };

/** Longest template accepted (a file name, not a document). */
const MAX_TEMPLATE = 200;

/** True when `t` is a valid file-name template (see the module comment). */
export function isTwinTemplate(t: unknown): t is string {
  if (typeof t !== 'string' || t.length > MAX_TEMPLATE) return false;
  const at = t.indexOf('{stem}');
  if (at < 0 || t.indexOf('{stem}', at + 1) >= 0) return false;
  const rest = t.slice(0, at) + t.slice(at + 6);
  return /^[A-Za-z0-9._-]*$/.test(rest) && t.endsWith('.html');
}

/**
 * Validate and normalize a naming: the kinds whose template differs from the
 * family's, in the order `md`, `slides`, `paged` — or `null` for the family
 * naming (`undefined`, `null`, `"family"`, `true`, `{}`, or only family
 * templates). Throws a `TypeError` for anything else: an unknown key, a
 * value that is not a valid template, an array or another type. Two namings
 * that name every file alike normalize to equal objects (so `#orz-shell`
 * bytes depend only on the names, FC-18 law 2).
 */
export function twinNaming(value: unknown): TwinNaming | null {
  if (value === undefined || value === null || value === 'family' || value === true) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`orz carrier: a twin-link naming is "family" or an object of per-kind templates, not ${Array.isArray(value) ? 'an array' : typeof value}`);
  }
  const src = value as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!KINDS.includes(key as TwinKind)) throw new TypeError(`orz carrier: unknown kind "${key}" in a twin-link naming (md, slides, paged)`);
  }
  const out: TwinNaming = {};
  for (const kind of KINDS) {
    if (!Object.prototype.hasOwnProperty.call(src, kind) || src[kind] === undefined) continue;
    const t = src[kind];
    if (!isTwinTemplate(t)) {
      throw new TypeError(`orz carrier: the ${kind} template of a twin-link naming must hold {stem} once, otherwise only A-Z a-z 0-9 . _ -, and end in .html (got ${JSON.stringify(t)})`);
    }
    if (t !== FAMILY_NAMING[kind]) out[kind] = t;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Like {@link twinNaming}, but `null` (the family naming) for an invalid value instead of throwing: for values read from a file. */
export function readTwinNaming(value: unknown): TwinNaming | null {
  try { return twinNaming(value); } catch { return null; }
}

/** Two namings name every file alike (both normalized; absent = family). */
export function sameTwinNaming(a: unknown, b: unknown): boolean {
  const x = readTwinNaming(a);
  const y = readTwinNaming(b);
  if (!x || !y) return !x && !y;
  return KINDS.every((k) => x[k] === y[k]);
}

/** The template of a kind under a (normalized or raw) naming. */
function templateOf(kind: TwinKind, naming: TwinNaming | null): string {
  return naming?.[kind] ?? FAMILY_NAMING[kind];
}

/**
 * The published file name of a text's file name (no folder): `week1.slides.md`
 * → `week1.slides.html` (family) or the kind's template with `{stem}`
 * replaced. `null` when the name is not a text twin (lower-case extensions
 * only). The kind comes from the extension, as for links.
 */
export function twinFileName(name: string, naming?: TwinNaming | 'family' | null): string | null {
  const n = twinNaming(naming ?? null);
  let m: RegExpExecArray | null;
  if ((m = /^(.+)\.(slides|paged)\.md$/.exec(name))) return templateOf(m[2] as TwinKind, n).replace('{stem}', () => m![1]);
  if ((m = /^(.+)\.md$/.exec(name))) return templateOf('md', n).replace('{stem}', () => m![1]);
  return null;
}

/**
 * The text twin's file name of a published file name of `kind` under a
 * naming — the inverse of {@link twinFileName}: `week1.html` with `{ md:
 * '{stem}.html' }` → `week1.md`; a family name (`week1.md.html`) is read
 * under every naming. `null` when the name matches neither. Used for the
 * name a page offers when it is saved or downloaded (carrier-app §2): the
 * dual name (`week1.md.html`) keeps a downloaded copy recognisable.
 */
export function textNameOf(name: string, kind: TwinKind, naming?: TwinNaming | 'family' | null): string | null {
  const n = twinNaming(naming ?? null);
  for (const t of n?.[kind] ? [FAMILY_NAMING[kind], n[kind]!] : [FAMILY_NAMING[kind]]) {
    const at = t.indexOf('{stem}');
    const head = t.slice(0, at);
    const tail = t.slice(at + 6);
    if (name.length > head.length + tail.length && name.startsWith(head) && name.endsWith(tail)) {
      return `${name.slice(head.length, name.length - tail.length)}${TEXT_EXT[kind]}`;
    }
  }
  return null;
}

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
export function twinHref(href: string, naming?: TwinNaming | 'family' | null): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const path = cut >= 0 ? href.slice(0, cut) : href;
  const rest = cut >= 0 ? href.slice(cut) : '';
  const seg = path.slice(path.lastIndexOf('/') + 1);
  const name = twinFileName(seg, naming);
  return name === null ? href : `${path.slice(0, path.length - seg.length)}${name}${rest}`;
}
