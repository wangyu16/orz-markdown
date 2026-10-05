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

export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from '../html.js';
export { decodeText, eolStyle, hasMixedEol, hasLoneSurrogate } from './text.js';
export type { EolStyle } from './text.js';

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
 * `data-orz-format`, `md`, `1`, `''`); `includes` from `#orz-includes`.
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
