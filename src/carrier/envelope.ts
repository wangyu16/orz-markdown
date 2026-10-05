/**
 * The assembled file (FC-18 §8): `assembleEnvelope` wraps a text in the HTML
 * envelope, `extract` takes the text back out — exactly.
 *
 * Laws (FC-18 §2), tested on the golden corpus and on random text:
 *   1. `extract(assembleEnvelope(T, p)).text === T` for every text T with
 *      consistent line endings and no NUL or lone surrogate.
 *   2. `assembleEnvelope(T, p)` is a pure function: no clock, no randomness, no
 *      environment, no locale.
 *   3. `assembleEnvelope(extract(F).text, p) === F` for F made with parts p.
 *
 * The text is stored in ONE island, `<script type="text/markdown" id="orz-src">`.
 * An HTML parser turns CR and CR LF into LF and drops nothing else from script
 * data, so the island holds the text with LF line endings and no leading BOM;
 * `data-orz-eol` (`lf` / `crlf` / `cr`) and `data-orz-bom` record what to
 * restore, and a DOM read ({@link readIslandFromDom}) equals `extract`. The
 * body is escaped with `escapeScriptText`: every `<script` and `</script` (any
 * case) gains a backslash after its `<`, so the island never contains
 * `</script` and ends at the first `</script` after it — unambiguously.
 *
 * Browser-clean: no Node built-ins.
 */
import { asciiLower } from '../ascii.js';
import { escapeAttr, escapeHtml, escapeScriptText, jsonForScript, unescapeScriptText } from '../html.js';
import { renderDocMetaHead, renderDocMetaIsland } from '../doc-meta.js';
import { readDocument, type Kind } from './document.js';
import { eolStyle, hasLoneSurrogate } from './text.js';

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
export const SOURCE_ISLAND_ID = 'orz-src';
/** Id of the shell marker island. */
export const SHELL_ISLAND_ID = 'orz-shell';
/** Id of the resolved-includes island. */
export const INCLUDES_ISLAND_ID = 'orz-includes';

/** The npm package of each kind's carrier (its agent skill ships there). */
export const KIND_PACKAGE: Readonly<Record<Kind, string>> = {
  md: 'orz-mdhtml',
  slides: 'orz-slides',
  paged: 'orz-paged',
};

/** The agent skill URL of a kind's carrier. */
export function skillUrl(kind: Kind): string {
  const pkg = KIND_PACKAGE[kind];
  return `https://cdn.jsdelivr.net/npm/${pkg}/${pkg}-skills/SKILL.md`;
}

/** The agent banner (an HTML comment; holds no tag-like text and no `--`). */
function banner(kind: Kind, format: number): string {
  return [
    `<!-- orz ${kind} document, text format ${format}. For AI agents and tools:`,
    `  The complete, editable source of this file is the text/markdown island with id "${SOURCE_ISLAND_ID}" below.`,
    '  Read it with extract() from orz-markdown/carrier, or by hand: take the island content, remove one',
    '  backslash after each "<" that is followed by backslashes and then "script" or "/script" (any case),',
    '  turn its line breaks into the style named by data-orz-eol, and prefix U+FEFF if data-orz-bom is set.',
    '  Edit that text only, then assemble again; everything else in this file is a regenerable shell.',
    `  Skill: ${skillUrl(kind)}`,
    '-->',
  ].join('\n');
}

/** JSON object with keys in code-unit order (integer-like keys included). */
function sortedJson(record: Record<string, string>): string {
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${jsonForScript(k)}:${jsonForScript(record[k])}`).join(',')}}`;
}

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
export function assembleEnvelope(text: string, parts: ShellParts): string {
  if (text.includes('\u0000')) throw new Error('orz carrier: text format 1 cannot hold U+0000 (NUL); an HTML file cannot carry it');
  if (hasLoneSurrogate(text)) throw new Error('orz carrier: the text holds a lone surrogate, which a UTF-8 file cannot represent');
  for (const [name, html] of [['headHtml', parts.headHtml], ['bodyHtml', parts.bodyHtml]] as const) {
    const bad = reservedIdIn(html ?? '');
    if (bad) throw new Error(`orz carrier: parts.${name} holds an element with id "${bad}", which the envelope reserves`);
  }
  const doc = readDocument(text, { kind: parts.kind });
  if (doc.format > 1) throw new Error(`orz carrier: the text is format ${doc.format}; this shell writes format 1 only`);
  const kind = parts.kind;
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = (bom ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  const eol = eolStyle(bom ? text.slice(1) : text);
  const shell = jsonForScript({ kind, format: doc.format, shell: parts.shellVersion, delivery: parts.delivery ?? 'inline' });
  const out: string[] = [
    '<!doctype html>',
    `<html lang="${escapeAttr(doc.lang)}" data-orz-kind="${escapeAttr(kind)}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta name="generator" content="${escapeAttr(`orz-${kind} ${parts.shellVersion}`)}">`,
    `<title>${escapeHtml(doc.title)}</title>`,
  ];
  const metaHead = renderDocMetaHead(doc.meta);
  if (metaHead) out.push(metaHead);
  const metaIsland = renderDocMetaIsland(doc.meta);
  if (metaIsland) out.push(metaIsland);
  out.push(`<script type="application/json" id="${SHELL_ISLAND_ID}">${shell}</script>`);
  if (parts.headHtml) out.push(parts.headHtml);
  out.push('</head>', '<body>', banner(kind, doc.format));
  out.push(
    `<script type="text/markdown" id="${SOURCE_ISLAND_ID}" data-orz-format="${doc.format}" data-orz-eol="${eol}"${bom ? ' data-orz-bom' : ''}>${escapeScriptText(body)}</script>`,
  );
  if (parts.includes && Object.keys(parts.includes).length > 0) {
    out.push(`<script type="application/json" id="${INCLUDES_ISLAND_ID}">${sortedJson(parts.includes)}</script>`);
  }
  if (parts.bodyHtml) out.push(parts.bodyHtml);
  out.push('</body>', '</html>', '');
  return out.join('\n');
}

/** Undo the island storage: unescape, restore the line-ending style and the BOM. */
function restore(stored: string, eol: string | null, bom: boolean): string {
  let text = unescapeScriptText(stored);
  if (eol === 'crlf') text = text.replace(/\n/g, '\r\n');
  else if (eol === 'cr') text = text.replace(/\n/g, '\r');
  return bom ? `﻿${text}` : text;
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
    const tag = readStartTag(html, lt);
    if (!tag) { i = lt + 1; continue; }
    let el: Element = { tag, content: [tag.end, tag.end] };
    if (rawText.has(tag.name)) {
      const close = endTagAt(lower, tag.name, tag.end);
      el = { tag, content: [tag.end, close < 0 ? html.length : close] };
      i = close < 0 ? html.length : close + 2 + tag.name.length;
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
function reservedIdIn(html: string): string | null {
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
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') includes[k] = v;
        result.includes = includes;
      }
    } catch {
      // a malformed includes island is ignored
    }
  }
  return result;
}
