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
import { escapeAttr, escapeHtml, escapeScriptText, jsonForScript } from '../html.js';
import { renderDocMetaHead, renderDocMetaIsland } from '../doc-meta.js';
import { readDocument, type Kind } from './document.js';
import { eolStyle, hasLoneSurrogate } from './text.js';
import { reservedIdIn, SOURCE_ISLAND_ID, SHELL_ISLAND_ID, INCLUDES_ISLAND_ID } from './read.js';

export { extract, readIslandFromDom, SOURCE_ISLAND_ID, SHELL_ISLAND_ID, INCLUDES_ISLAND_ID } from './read.js';
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

