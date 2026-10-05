/**
 * Document facts read from a format-1 text without rendering it (FC-18 §3,
 * §5, §8.1; FC-19 `readDocument`).
 *
 * Browser-clean and deterministic (the random `mintUid` lives in uid.ts).
 */
import { md } from '../index.js';
import { docMetaFromFields, type DocMeta } from '../doc-meta.js';
import { scanNymlBlocks } from '../nyml-blocks.js';
import { readHeader, readHeaderAndLint, KIND_HEADER_KEYS, type Header, type Lint } from './header.js';

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

function isKind(v: unknown): v is Kind {
  return v === 'md' || v === 'slides' || v === 'paged';
}

function basename(name: string): string {
  const cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return cut >= 0 ? name.slice(cut + 1) : name;
}

/**
 * The kind a file name gives (FC-18 §3): `*.slides.md` / `*.slides.html` →
 * `slides`, `*.paged.md` / `*.paged.html` → `paged`, `*.md` / `*.md.html` →
 * `md`; `null` for any other name. Directories in the name are ignored;
 * extensions are matched in lower case only.
 */
export function kindFromFilename(name: string): Kind | null {
  const base = basename(name);
  if (/.\.slides\.(md|html)$/.test(base)) return 'slides';
  if (/.\.paged\.(md|html)$/.test(base)) return 'paged';
  if (/.\.md(\.html)?$/.test(base)) return 'md';
  return null;
}

/**
 * The twin of a file name (FC-18 §3): `x.md` ↔ `x.md.html`,
 * `x.slides.md` ↔ `x.slides.html`, `x.paged.md` ↔ `x.paged.html`; `null`
 * otherwise. Directories are kept. `x.slides.md.html` and `x.paged.md.html`
 * give `null`, so `twinName(twinName(n)) === n` whenever both are non-null.
 */
export function twinName(name: string): string | null {
  const base = basename(name);
  const dir = name.slice(0, name.length - base.length);
  let m: RegExpExecArray | null;
  if ((m = /^(.+)\.(slides|paged)\.md$/.exec(base))) return `${dir}${m[1]}.${m[2]}.html`;
  if ((m = /^(.+)\.(slides|paged)\.html$/.exec(base))) return `${dir}${m[1]}.${m[2]}.md`;
  if (/\.(slides|paged)\.md\.html$/.test(base)) return null;
  if ((m = /^(.+)\.md\.html$/.exec(base))) return `${dir}${m[1]}.md`;
  if ((m = /^(.+)\.md$/.exec(base))) return `${dir}${m[1]}.md.html`;
  return null;
}

type Tok = { type: string; tag: string; content: string; children: Tok[] | null };

/** Plain text of a heading's inline children (text, code, math, image alt). */
function inlineText(children: Tok[] | null, fallback: string): string {
  if (!children) return fallback;
  let s = '';
  for (const c of children) {
    if (c.type === 'text' || c.type === 'code_inline' || c.type === 'math_inline') s += c.content;
    else if (c.type === 'softbreak' || c.type === 'hardbreak') s += ' ';
    else if (c.type === 'image') s += inlineText(c.children, c.content);
  }
  return s;
}

function firstH1(text: string): string | null {
  const tokens = md.parse(text, {}) as unknown as Tok[];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') {
      const t = inlineText(tokens[i + 1].children, tokens[i + 1].content).replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
  }
  return null;
}

function pagedTitle(text: string, header: Header | null): string | null {
  for (const b of scanNymlBlocks(text)) {
    if (header && b.start < header.end) continue;
    // A title element is a block whose kind ends in `-title` (article-title,
    // report-title, exam-title, …); cv-header and letterhead are not.
    if (!b.kind.endsWith('-title')) continue;
    const own = (k: string): string => (Object.prototype.hasOwnProperty.call(b.fields, k) ? b.fields[k].trim() : '');
    const t = own('title') || own('text');
    if (t) return t;
  }
  return null;
}

/**
 * Read a document's facts from its text, without rendering (FC-19 §2).
 *
 * kind: `opts.kind`, else the file name's kind, else the header's `carrier`,
 * else `md`. title (FC-18 §8.1): the header `title`, else the first level-1
 * heading (token-based, plain text), else — for `paged` — the `title` (or
 * `text`) of the first title element (a nyml block whose kind ends in
 * `-title`), else `Untitled`.
 */
export function readDocument(text: string, opts?: { kind?: Kind; filename?: string }): DocumentInfo {
  const named = opts?.kind ?? (opts?.filename ? kindFromFilename(opts.filename) : null);
  const peek = named ? null : readHeader(text);
  const carrier = peek && Object.prototype.hasOwnProperty.call(peek.fields, 'carrier') ? peek.fields['carrier'] : undefined;
  const kind: Kind = named ?? (isKind(carrier) ? carrier : null) ?? 'md';
  const { header, lint } = readHeaderAndLint(text, kind);
  const fields: Record<string, string> = header ? header.fields : {};
  const get = (k: string): string | undefined => (Object.prototype.hasOwnProperty.call(fields, k) ? fields[k] : undefined);
  const fmt = get('format');
  const format = fmt !== undefined && /^[1-9][0-9]*$/.test(fmt) ? Number(fmt) : 1;
  const meta: DocMeta = docMetaFromFields(fields);
  const uid = get('uid');
  if (uid) meta.uid = uid;
  const settings: Record<string, string> = {};
  const hostKeys: Record<string, string> = {};
  for (const key of header ? header.keys : []) {
    if (KIND_HEADER_KEYS[kind].includes(key)) settings[key] = fields[key];
    else if (key.startsWith('x_')) hostKeys[key] = fields[key];
  }
  const headerTitle = (get('title') ?? '').trim();
  const title = headerTitle || firstH1(text) || (kind === 'paged' ? pagedTitle(text, header) : null) || 'Untitled';
  const info: DocumentInfo = {
    kind,
    format,
    header,
    meta,
    lang: (get('lang') ?? '').trim() || 'en',
    settings,
    hostKeys,
    title,
    lint,
  };
  const theme = (get('theme') ?? '').trim();
  if (theme) info.theme = theme;
  return info;
}
