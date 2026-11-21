/**
 * Reading assembled files without the parser (FC-18 §8.1): `extract`,
 * `readIslandFromDom`, `decodeText`, the escaping helpers. Exported as
 * `orz-markdown/carrier/read` — a small, parser-free entry for viewers,
 * indexers and hosts that only read files — and also from
 * `orz-markdown/carrier`. Nothing here imports the Markdown parser.
 *
 * Browser-clean: no Node built-ins.
 */
import { asciiLower } from '../ascii.js';
import { unescapeScriptText } from '../html.js';
import type { Kind } from './document.js';
import { readTwinNaming, type TwinNaming } from './naming.js';

export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from '../html.js';
export { decodeText, eolStyle, hasMixedEol, hasLoneSurrogate } from './text.js';
export type { EolStyle } from './text.js';
export { twinNaming, readTwinNaming, sameTwinNaming, isTwinTemplate, twinHref, twinFileName, textNameOf, FAMILY_NAMING } from './naming.js';
export type { TwinNaming, TwinKind } from './naming.js';

// ── reader copy (FC-18 §8.2 `readerCopy`, 2.9.0) ────────────────────────────
// The rule lives here, small and message-free, so `extract` (and the update and
// shell bundles that load this module) need no more; `reader-copy.ts` adds the
// throwing `readerCopy` with its messages and the kit's words.

/** A file's reader-copy setting: `notice` is the host's words, else the kit's default. */
export interface ReaderCopy {
  notice?: string;
}

/** Longest notice accepted, in UTF-16 code units (a sentence or two, not a document). */
export const READER_COPY_NOTICE_MAX = 300;

/**
 * What a notice may not hold: control characters (C0, DEL, C1), the line and
 * paragraph separators, unpaired surrogates and format characters (`\p{Cf}`:
 * bidi overrides, zero-width spaces, BOM, soft hyphen) — except the
 * zero-width (non-)joiner, which some scripts and emoji need.
 */
const REFUSED = /[\p{Cc}\p{Cs}\u2028\u2029]|(?![\u200c\u200d])\p{Cf}/u;
/** A visible character: anything but a separator, control, format, unassigned or combining mark. */
const VISIBLE = /[^\p{Z}\p{C}\p{M}]/u;

/**
 * Read a reader-copy setting without throwing: `{}` for `true` or `{}` (the
 * kit's words); `{ notice }` for an object whose only key is `notice`, a
 * string — runs of spaces, tabs and line breaks collapsed to one space and
 * trimmed, 1 to {@link READER_COPY_NOTICE_MAX} UTF-16 code units, at least
 * one visible character, no character {@link REFUSED} refuses; `null`
 * for none (`undefined`, `null`, `false`) and for anything invalid.
 */
export function readReaderCopy(value: unknown): ReaderCopy | null {
  if (value === true) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((k) => k !== 'notice')) return null;
  const raw = (value as { notice?: unknown }).notice;
  if (raw === undefined) return {};
  if (typeof raw !== 'string') return null;
  const notice = raw.replace(/[\t\n\r ]+/g, ' ').trim();
  return notice.length <= READER_COPY_NOTICE_MAX && VISIBLE.test(notice) && !REFUSED.test(notice) ? { notice } : null;
}

// ── site navigation (FC-18 §8.2 `siteNav`, 2.10.0) ─────────────────────────
// A page's place in a set of pages (a website's): the set's title, its home
// page and the previous / next page. The rule lives here, small and
// message-free, as the reader copy's does; `site-nav.ts` adds the throwing
// `siteNav` with its messages and `siteNavFrom` (links made absolute).

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
export const SITE_NAV_TEXT_MAX = 200;
/** Longest href accepted, in UTF-16 code units. */
export const SITE_NAV_HREF_MAX = 2048;

/** What an href may not hold: whitespace, a backslash (browsers read it as `/`), control, format or separator characters. */
const HREF_REFUSED = /[\s\\\p{Cc}\p{Cf}\p{Cs}\p{Z}]/u;
/** A URL scheme at the start. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** A title or label, normalized (spaces collapsed, trimmed), or null when it breaks the rule. */
export function readSiteNavText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\t\n\r ]+/g, ' ').trim();
  return t.length <= SITE_NAV_TEXT_MAX && VISIBLE.test(t) && !REFUSED.test(t) ? t : null;
}

/**
 * An href, or null when it breaks the rule: 1 to {@link SITE_NAV_HREF_MAX}
 * code units, nothing {@link HREF_REFUSED} refuses, not network-path (`//…`);
 * either relative (no scheme) or an absolute `http:` / `https:` URL. Never
 * normalized: what is stored is what the host gave.
 */
export function readSiteNavHref(value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || value.length > SITE_NAV_HREF_MAX) return null;
  if (HREF_REFUSED.test(value) || value.startsWith('//')) return null;
  if (SCHEME.test(value) && !/^https?:\/\/[^/?#]/i.test(value)) return null;
  return value;
}

/** An object whose keys are all in `keys`, else null. */
const only = (value: unknown, keys: readonly string[]): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((k) => keys.includes(k)) ? (value as Record<string, unknown>) : null;

/**
 * Read a site-navigation setting without throwing: the normalized record
 * (keys in the order `title`, `home`, `previous`, `next`; a link as `href`,
 * `label`) for an object with a valid `title` and `home` and, when present,
 * valid `previous` / `next` links and no other key; `null` for anything else.
 */
export function readSiteNav(value: unknown): SiteNav | null {
  const v = only(value, ['title', 'home', 'previous', 'next']);
  const title = v && readSiteNavText(v.title);
  const home = v && readSiteNavHref(v.home);
  if (!v || title === null || home === null) return null;
  const out: SiteNav = { title, home };
  for (const key of ['previous', 'next'] as const) {
    if (v[key] === undefined) continue;
    const l = only(v[key], ['href', 'label']);
    const href = l && readSiteNavHref(l.href);
    const label = l && readSiteNavText(l.label);
    if (href === null || label === null) return null;
    out[key] = { href, label };
  }
  return out;
}

/** Two site-navigation settings say the same (both absent, or equal once read). */
export function sameSiteNav(a: unknown, b: unknown): boolean {
  const x = a === undefined || a === null ? null : readSiteNav(a);
  const y = b === undefined || b === null ? null : readSiteNav(b);
  return JSON.stringify(x) === JSON.stringify(y);
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
export const KIND_PACKAGE: Readonly<Record<Kind, string>> = {
  md: 'orz-mdhtml',
  slides: 'orz-slides',
  paged: 'orz-paged',
};

/** Id of the source island. */
export const SOURCE_ISLAND_ID = 'orz-src';
/** Id of the shell marker island. */
export const SHELL_ISLAND_ID = 'orz-shell';
/** Id of the resolved-includes island. */
export const INCLUDES_ISLAND_ID = 'orz-includes';

/** Undo the island storage: unescape, restore the line-ending style and the BOM. */
function restore(stored: string, eol: string | null, bom: boolean): string {
  // The island holds LF only; a file whose line endings were converted after
  // assembly (git autocrlf, a Windows editor) is read as an HTML parser reads it.
  let text = unescapeScriptText(stored.replace(/\r\n?/g, '\n'));
  if (eol === 'crlf') text = text.replace(/\n/g, '\r\n');
  else if (eol === 'cr') text = text.replace(/\n/g, '\r');
  return bom ? `\uFEFF${text}` : text;
}

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
export function readIslandFromDom(el: IslandElement): string {
  return restore(el.textContent ?? '', el.getAttribute('data-orz-eol'), el.hasAttribute('data-orz-bom'));
}

// ── scanning HTML ──────────────────────────────────────────────────────────

interface Tag {
  name: string;
  attrs: Record<string, string>;
  /** Offset just past the tag's `>`. */
  end: number;
}

/** Elements whose content is raw text: skipped whole while looking for tags. */
const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes']);

/** Parse a start tag at `at` (`html[at] === '<'`), or null when it is none. */
function readStartTag(html: string, at: number): Tag | null {
  const nm = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(html.slice(at, at + 64));
  if (!nm) return null;
  const name = asciiLower(nm[1]);
  const attrs: Record<string, string> = {};
  let i = at + nm[0].length;
  const n = html.length;
  for (;;) {
    while (i < n && /[\s/]/.test(html[i])) i++;
    if (i >= n) return null;
    if (html[i] === '>') return { name, attrs, end: i + 1 };
    let j = i;
    while (j < n && !/[\s/>=]/.test(html[j])) j++;
    if (j === i) j++; // a stray character: skip it
    const attr = asciiLower(html.slice(i, j));
    i = j;
    while (i < n && /\s/.test(html[i])) i++;
    let value = '';
    if (html[i] === '=') {
      i++;
      while (i < n && /\s/.test(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1);
        if (close < 0) return null;
        value = html.slice(i + 1, close);
        i = close + 1;
      } else {
        let k = i;
        while (k < n && !/[\s>]/.test(html[k])) k++;
        value = html.slice(i, k);
        i = k;
      }
    }
    if (!Object.prototype.hasOwnProperty.call(attrs, attr)) attrs[attr] = value;
  }
}

interface Element {
  tag: Tag;
  /** [start, end) of the element's raw content (raw-text elements only). */
  content: [number, number];
}

/**
 * Walk the start tags of `html` in document order — comments and raw-text
 * content skipped, as an HTML parser skips them — until `visit` returns true.
 */
function walkStartTags(html: string, visit: (el: Element) => boolean, stopAt = Infinity, rawText: ReadonlySet<string> = RAW_TEXT, startAt = 0): Element | null {
  const lower = asciiLower(html); // same length as html: offsets carry over
  let i = startAt;
  while (i < html.length && i < stopAt) {
    const lt = html.indexOf('<', i);
    if (lt < 0 || lt >= stopAt) return null;
    if (html.startsWith('<!--', lt)) {
      // As the HTML tokenizer: `<!-->` and `<!--->` are whole (empty)
      // comments; otherwise the comment ends at the first `-->` or `--!>`.
      if (html.startsWith('<!-->', lt)) { i = lt + 5; continue; }
      if (html.startsWith('<!--->', lt)) { i = lt + 6; continue; }
      const a = html.indexOf('-->', lt + 4);
      const b = html.indexOf('--!>', lt + 4);
      if (a < 0 && b < 0) return null;
      i = a >= 0 && (b < 0 || a < b) ? a + 3 : b + 4;
      continue;
    }
    const next = html.charAt(lt + 1);
    if (next === '!' || next === '?') {
      // `<!DOCTYPE …>`, `<![CDATA[…`, `<!x…>`, `<?…>`: up to the next `>` (a
      // bogus comment, as the tokenizer reads it outside foreign content).
      const gt = html.indexOf('>', lt + 2);
      if (gt < 0) return null;
      i = gt + 1;
      continue;
    }
    if (next === '/') {
      // An end tag (its "attributes" are ignored), `</>`, or a bogus comment.
      const gt = html.indexOf('>', lt + 2);
      if (gt < 0) return null;
      i = gt + 1;
      continue;
    }
    const tag = readStartTag(html, lt);
    if (!tag) { i = lt + 1; continue; }
    let el: Element = { tag, content: [tag.end, tag.end] };
    if (rawText.has(tag.name)) {
      const close = endTagAt(lower, tag.name, tag.end);
      el = { tag, content: [tag.end, close < 0 ? html.length : close] };
      const gt = close < 0 ? -1 : html.indexOf('>', close + 2 + tag.name.length);
      i = gt < 0 ? html.length : gt + 1;
    } else {
      i = tag.end;
    }
    if (visit(el)) return el;
  }
  return null;
}

/**
 * Offset of the end tag that closes a raw-text element: `</name` followed by
 * whitespace, `/` or `>` (so `</scripts>` does not close a script). -1 if none.
 */
function endTagAt(lower: string, name: string, from: number): number {
  const needle = `</${name}`;
  for (let at = lower.indexOf(needle, from); at >= 0; at = lower.indexOf(needle, at + 1)) {
    const c = lower.charAt(at + needle.length);
    if (c === '' || c === '>' || c === '/' || c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r') return at;
  }
  return -1;
}

/** The first `<script>` whose `id` is `id`. */
function findScript(html: string, id: string, stopAt = Infinity, startAt = 0): Element | null {
  return walkStartTags(html, (el) => el.tag.name === 'script' && el.tag.attrs['id'] === id, stopAt, RAW_TEXT, startAt);
}

/** Only these are skipped when checking shell parts for reserved ids (conservative: a lenient parser may read textarea or title content as markup). */
const SCRIPT_STYLE = new Set(['script', 'style']);

/** The reserved id (`orz-src` / `orz-shell`) an element in `html` carries, if any (case-insensitive). */
export function reservedIdIn(html: string): string | null {
  if (!/orz-s(rc|hell)/i.test(html)) return null;
  const el = walkStartTags(html, (e) => {
    const id = Object.prototype.hasOwnProperty.call(e.tag.attrs, 'id') ? asciiLower(e.tag.attrs['id'].trim()) : '';
    return id === SOURCE_ISLAND_ID || id === SHELL_ISLAND_ID;
  }, Infinity, SCRIPT_STYLE);
  return el ? el.tag.attrs['id'] : null;
}

function isKind(v: unknown): v is Kind {
  return v === 'md' || v === 'slides' || v === 'paged';
}

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
export function extract(html: string): Extracted | null {
  const island = findScript(html, SOURCE_ISLAND_ID);
  if (!island) return null;
  const a = island.tag.attrs;
  const text = restore(html.slice(island.content[0], island.content[1]), a['data-orz-eol'] ?? null, Object.prototype.hasOwnProperty.call(a, 'data-orz-bom'));
  let shellData: Record<string, unknown> = {};
  const shellEl = findScript(html, SHELL_ISLAND_ID, island.tag.end);
  if (shellEl) {
    try {
      const parsed = JSON.parse(html.slice(shellEl.content[0], shellEl.content[1])) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) shellData = parsed as Record<string, unknown>;
    } catch {
      shellData = {};
    }
  }
  const htmlAt = html.search(/<html[\s>]/i);
  const htmlTag = htmlAt >= 0 ? readStartTag(html, htmlAt) : null;
  const kind: Kind = isKind(shellData['kind']) ? shellData['kind'] : isKind(htmlTag?.attrs['data-orz-kind']) ? (htmlTag!.attrs['data-orz-kind'] as Kind) : 'md';
  const islandFormat = a['data-orz-format'];
  const format =
    typeof shellData['format'] === 'number' && Number.isInteger(shellData['format']) ? (shellData['format'] as number)
      : islandFormat && /^[1-9][0-9]*$/.test(islandFormat) ? Number(islandFormat) : 1;
  const result: Extracted = {
    text,
    kind,
    format,
    shell: typeof shellData['shell'] === 'string' ? (shellData['shell'] as string) : '',
    delivery: typeof shellData['delivery'] === 'string' ? (shellData['delivery'] as string) : '',
  };
  const links = readTwinNaming(shellData['links']);
  if (links) result.twinLinks = links;
  const reader = readReaderCopy(shellData['readerCopy']);
  if (reader) result.readerCopy = reader;
  const nav = readSiteNav(shellData['siteNav']);
  if (nav) result.siteNav = nav;
  // The includes island follows the source island (shell markup before it is not consulted).
  const inc = findScript(html, INCLUDES_ISLAND_ID, Infinity, island.content[1]);
  if (inc) {
    try {
      const parsed = JSON.parse(html.slice(inc.content[0], inc.content[1])) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const includes: Record<string, string> = {};
        // defineProperty: a `__proto__` key is data, not the prototype.
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string') Object.defineProperty(includes, k, { value: v, enumerable: true, writable: true, configurable: true });
        }
        result.includes = includes;
      }
    } catch {
      // a malformed includes island is ignored
    }
  }
  return result;
}
