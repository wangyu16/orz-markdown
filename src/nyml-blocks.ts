/**
 * Generic `{{nyml … }}` block scanner.
 *
 * Finds every nyml block in a source, parses its YAML-ish `key: value` body
 * (including `key: |` multiline blocks), reads the `kind:` discriminator, and
 * reports char offsets so a caller can splice the block out or replace it.
 *
 * Hoisted here from orz-paged (`src/doc/nyml.ts`, 2026-07-10) so that every
 * orz-family tool can read block metadata from a source without reimplementing
 * the grammar. orz-paged now imports it; `doc-meta.ts` builds on it. Values are
 * always strings: surrounding quotes are stripped, multiline `|` blocks are
 * dedented and joined with `\n`. Only the first `}}` terminates a block, so `}`
 * may appear inside the body.
 */

/** One scanned `{{nyml … }}` block: its kind, parsed fields, and char range. */
export interface NymlBlock {
  /** The `kind:` value (e.g. `'document'`, `'element'`), or `''` if absent. */
  kind: string;
  /** snake_case field → raw string value (multiline values preserved). */
  fields: Record<string, string>;
  /** Offset of the opening `{` of `{{nyml` in `source`. */
  start: number;
  /** Offset just past the closing `}}` (so `source.slice(start, end)` is the block). */
  end: number;
}

import * as indexModule from './index.js';
import { parseNymlBody } from './nyml-body.js';

const OPEN = '{{nyml';

/** Find the index of the `}}` that closes a `{{nyml` opened at/after `from`. */
function findClosing(source: string, from: number): number {
  for (let i = from; i < source.length - 1; i++) {
    if (source[i] === '}' && source[i + 1] === '}') return i;
  }
  return -1;
}

/** The body reader lives in nyml-body.ts (shared with the carrier header tools). */
function parseBody(inner: string): { kind: string; fields: Record<string, string> } {
  const { kind, fields } = parseNymlBody(inner);
  return { kind, fields };
}

/**
 * Scan a source for every `{{nyml … }}` block, in document order. Each result
 * carries its parsed `kind`, `fields`, and `[start, end)` char offsets.
 *
 * Blocks are located by PARSING the source with the configured renderer and
 * taking its `nyml` block tokens, so the scanner agrees with the renderer by
 * construction: a block inside code, a comment, raw HTML, a math block, another
 * directive's body, mid-paragraph, or escaped is not a block here either. (Three
 * rounds of regex rules each left a new disagreement class; see
 * notes/closed-loop.md, round 6.) Fields are read from the token's body, so a
 * block inside a blockquote or list item parses without its prefixes.
 *
 * `tokens`, when given, must be `md.parse(source, {})` of this very source (a
 * caller that already parsed it saves a second parse).
 */
export function scanNymlBlocks(source: string, tokens?: ReadonlyArray<{ type: string; info: string; map: [number, number] | null; content: string }>): NymlBlock[] {
  const out: NymlBlock[] = [];
  if (source.indexOf(OPEN) < 0) return out; // fast path: no candidate at all
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 10 || (c === 13 && source.charCodeAt(i + 1) !== 10)) lineStarts.push(i + 1);
  }
  for (const token of tokens ?? renderer().parse(source, {})) {
    if (token.type !== 'plugin_block' || token.info !== 'nyml' || !token.map) continue;
    const lineStart = lineStarts[token.map[0]] ?? 0;
    const open = source.indexOf(OPEN, lineStart);
    if (open < 0) continue;
    // The closer is searched after `[args]`, as the dispatcher does, so a `}}`
    // inside the args (`{{nyml[}}] …`) is not taken for the end.
    let bodyFrom = open + OPEN.length;
    if (source[bodyFrom] === '[') {
      const bracket = source.indexOf(']', bodyFrom);
      if (bracket >= 0) bodyFrom = bracket + 1;
    }
    const close = findClosing(source, bodyFrom);
    if (close < 0) continue;
    const raw = (token as { meta?: { rawBody?: string } | null }).meta?.rawBody;
    const { kind, fields } = parseBody(raw ?? token.content ?? '');
    out.push({ kind, fields, start: open, end: close + 2 });
  }
  return out;
}

/** The configured renderer, imported lazily (index.ts re-exports this module). */
function renderer(): { parse(src: string, env: object): Array<{ type: string; info: string; map: [number, number] | null; content: string }> } {
  return (indexModule as unknown as { md: ReturnType<typeof renderer> }).md;
}
