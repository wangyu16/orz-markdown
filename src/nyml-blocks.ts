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

const OPEN = '{{nyml';

/** Find the index of the `}}` that closes a `{{nyml` opened at/after `from`. */
function findClosing(source: string, from: number): number {
  for (let i = from; i < source.length - 1; i++) {
    if (source[i] === '}' && source[i + 1] === '}') return i;
  }
  return -1;
}

/** Strip a single pair of matching surrounding quotes, if present. */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * Parse a nyml body into a flat `key: value` map plus its `kind`. Supports
 * `key: |` multiline blocks: subsequent lines indented more than the key are
 * dedented (block style) and joined with `\n`. The `kind:` line populates
 * `kind` rather than `fields`.
 */
function parseBody(inner: string): { kind: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  let kind = '';
  const lines = inner.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^(\s*)([A-Za-z0-9_]+)\s*:\s?(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }

    const indent = m[1].length;
    const key = m[2];
    const value = m[3];

    if (value.trim() === '|') {
      // Multiline block: gather following lines indented more than this key.
      const collected: string[] = [];
      let blockIndent = -1;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === '') {
          collected.push('');
          i++;
          continue;
        }
        const nextIndent = next.match(/^[ \t]*/)?.[0].length ?? 0;
        if (nextIndent <= indent) break;
        if (blockIndent === -1) blockIndent = nextIndent;
        collected.push(next.slice(Math.min(blockIndent, nextIndent)));
        i++;
      }
      while (collected.length && collected[collected.length - 1] === '') {
        collected.pop();
      }
      const joined = collected.join('\n');
      if (key === 'kind') kind = joined.trim();
      else fields[key] = joined;
      continue;
    }

    const v = stripQuotes(value.trim());
    if (key === 'kind') kind = v;
    else fields[key] = v;
    i++;
  }

  return { kind, fields };
}

/** Char ranges `[start, end)` covered by HTML comments `<!-- … -->`. */
function commentRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (true) {
    const open = source.indexOf('<!--', i);
    if (open === -1) break;
    const close = source.indexOf('-->', open + 4);
    if (close === -1) { ranges.push([open, source.length]); break; } // unclosed → to end
    ranges.push([open, close + 3]);
    i = close + 3;
  }
  return ranges;
}

/**
 * Scan a source for every `{{nyml … }}` block, in document order. Each result
 * carries its parsed `kind`, `fields`, and `[start, end)` char offsets. Blocks
 * inside an HTML comment (`<!-- … -->`) are skipped — so a commented-out element
 * (e.g. content the editor's template picker preserves) does not render.
 */
export function scanNymlBlocks(source: string): NymlBlock[] {
  const out: NymlBlock[] = [];
  const comments = commentRanges(source);
  const inComment = (pos: number) => comments.some(([a, b]) => pos >= a && pos < b);
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const open = source.indexOf(OPEN, searchFrom);
    if (open === -1) break;

    const close = findClosing(source, open + OPEN.length);
    if (close === -1) break;

    if (!inComment(open)) {
      const inner = source.slice(open + OPEN.length, close);
      const { kind, fields } = parseBody(inner);
      out.push({ kind, fields, start: open, end: close + 2 });
    }

    searchFrom = close + 2;
  }

  return out;
}
