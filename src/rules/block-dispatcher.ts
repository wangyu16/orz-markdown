import type MarkdownIt from 'markdown-it';
import { hasBlock } from '../registry.js';

type StateBlock = MarkdownIt.StateBlock;

/**
 * The first line at or after `from` that contains `}}`, or -1. Computed once
 * per block-parse state (line ends never move; a blockquote only shifts line
 * starts past its `>` markers, which cannot hold `}}`).
 */
function nextClosingLine(state: StateBlock, from: number): number {
  const memo = state as unknown as { __orzNextClose?: Int32Array };
  let next = memo.__orzNextClose;
  if (!next) {
    const n = state.eMarks.length;
    next = new Int32Array(n + 1).fill(-1);
    for (let line = n - 1; line >= 0; line--) {
      const start = line === 0 ? 0 : state.eMarks[line - 1] + 1;
      const hit = state.src.slice(start, state.eMarks[line]).indexOf('}}') >= 0;
      next[line] = hit ? line : next[line + 1];
    }
    memo.__orzNextClose = next;
  }
  return from < next.length ? next[from] : -1;
}

/**
 * Block dispatcher rule for {{name[args] body}} constructs.
 * Registered after 'blockquote' so it runs before 'paragraph' but after 'fence'/'code_block'.
 */
export function blockDispatcher(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  // Skip if this line is at indented-code-block level
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }

  const src = state.src;
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const lineMax = state.eMarks[startLine];

  // Must start with {{
  if (pos + 1 >= lineMax || src[pos] !== '{' || src[pos + 1] !== '{') {
    return false;
  }

  // Extract plugin name: alphanumeric + hyphens
  let nameEnd = pos + 2;
  while (nameEnd < lineMax) {
    const ch = src[nameEnd];
    if (!/[a-zA-Z0-9-]/.test(ch)) break;
    nameEnd++;
  }
  const name = src.slice(pos + 2, nameEnd);

  if (!name || !hasBlock(name)) {
    return false;
  }

  // Extract optional [args] — only if '[' immediately follows name (no space)
  let args: string | null = null;
  let cursor = nameEnd;

  if (src[cursor] === '[') {
    const argsStart = cursor + 1;
    // Args never cross the line: search only this line (searching the whole
    // source made unclosed `{{nyml[x` lines quadratic, round 8 H6).
    const inLine = src.slice(argsStart, lineMax).indexOf(']');
    const bracketEnd = inLine < 0 ? -1 : argsStart + inLine;
    if (bracketEnd === -1) {
      return false; // unclosed [
    }
    args = src.slice(argsStart, bracketEnd);
    cursor = bracketEnd + 1;
  }

  // Skip horizontal whitespace before body
  while (cursor < lineMax && (src[cursor] === ' ' || src[cursor] === '\t')) {
    cursor++;
  }

  // Check for closing '}}' on the same line (compact / single-line form)
  const firstLineRest = src.slice(cursor, lineMax);
  const closingOnFirstLine = firstLineRest.indexOf('}}');

  let bodyContent: string;
  let nextLine: number;

  let trailing = '';
  // The body before trimming: `trim()` strips the first line's indentation
  // only, which scanners that read indentation need (nyml-blocks, round 14).
  let rawBody: string;
  if (closingOnFirstLine !== -1) {
    // Single-line form: {{name[args] body}}
    bodyContent = firstLineRest.slice(0, closingOnFirstLine).trim();
    rawBody = bodyContent;
    // Text after the closing braces ("{{smiles CCO}} is ethanol") is kept as a
    // paragraph after the block instead of being dropped.
    trailing = firstLineRest.slice(closingOnFirstLine + 2).trim();
    nextLine = startLine + 1;
  } else {
    // Multiline form: scan forward across lines for closing '}}'
    let found = false;
    let lastLine = startLine;
    let lastPos = -1;

    // An unclosed opener must fail in O(1): scanning every following line per
    // opener (and again per line, from the paragraph terminator check) made a
    // document of unclosed `{{nyml …` lines quadratic (round 7, H-5).
    const closeLine = nextClosingLine(state, startLine + 1);
    if (closeLine < 0 || closeLine >= endLine) return false;
    // An opener whose scan would stop at the same "leaves the container" line
    // as a previous failed scan fails at once: openers inside a list item with
    // a `}}` past the item's end each rescanned to that line (round 16, H2).
    const breaks = (state as unknown as { __orzBreaks?: Map<number, { from: number; to: number }> });
    const known = breaks.__orzBreaks?.get(state.blkIndent);
    if (known && startLine > known.from && startLine < known.to && closeLine > known.to) return false;

    for (let line = startLine + 1; line <= closeLine; line++) {
      const lineStart = state.bMarks[line];
      const lineEnd = state.eMarks[line];

      // A non-empty line with negative indent breaks the block
      if (
        lineStart < lineEnd &&
        state.tShift[line] < state.blkIndent
      ) {
        (breaks.__orzBreaks ??= new Map()).set(state.blkIndent, { from: startLine, to: line });
        break;
      }

      const lineContent = src.slice(lineStart, lineEnd);
      const closingIdx = lineContent.indexOf('}}');
      if (closingIdx !== -1) {
        lastLine = line;
        lastPos = lineStart + closingIdx;
        found = true;
        break;
      }
    }

    if (!found) {
      return false; // unclosed — leave as literal text
    }

    nextLine = lastLine + 1;
    // Body is: everything from cursor (on first line) through closing line, trimmed
    // First-line body part
    const firstLinePart = src.slice(cursor, lineMax);
    // Middle lines
    const middlePart =
      lastLine > startLine + 1
        ? state.getLines(startLine + 1, lastLine, state.tShift[startLine], true)
        : '';
    // Last-line body part (before the closing }})
    // The closing line keeps its indentation relative to the opener, like the
    // middle lines (stripping all of it lost a `|` value's last line and let a
    // nested key on it leak to the top level: round 15, M1).
    // The closing line is cut like the middle lines — by columns, relative to
    // the opener (tabs and spaces alike: round 16, L3) — up to its first `}}`.
    const closing = state.getLines(lastLine, lastLine + 1, state.tShift[startLine], false);
    const lastLinePart = closing.slice(0, closing.indexOf('}}'));

    rawBody = firstLinePart + '\n' + middlePart + lastLinePart;
    // The body is dedented by its common indentation before trimming: `trim()`
    // alone strips only the first line's (`{{yaml\n  a: 1\n  b: 2}}` became
    // invalid YAML: round 16, M2).
    // Only for a body that starts on the line after the opener: a first line on
    // the opener (`{{yaml server:` + indented children) is the base, and its
    // children's indentation is meaningful (round 17, M1). Not when tabs and
    // spaces are mixed (characters are not columns: round 17, L3). A loop, not
    // Math.min(...lines): one argument per line overflowed the stack on large
    // bodies (round 17, H1).
    const bodyLines = rawBody.split('\n');
    let common = -1;
    let sawTab = false, sawSpace = false;
    if (!bodyLines[0].trim()) {
      for (let k = 1; k < bodyLines.length; k++) {
        const line = bodyLines[k];
        if (!line.trim()) continue;
        const lead = (/^[ \t]*/.exec(line) ?? [''])[0];
        if (lead.includes('\t')) sawTab = true;
        if (lead.includes(' ')) sawSpace = true;
        if (common === -1 || lead.length < common) common = lead.length;
      }
    }
    if (common > 0 && !(sawTab && sawSpace)) {
      const out: string[] = [bodyLines[0]];
      for (let k = 1; k < bodyLines.length; k++) out.push(bodyLines[k].trim() ? bodyLines[k].slice(common) : '');
      bodyContent = out.join('\n').trim();
    } else {
      bodyContent = rawBody.trim();
    }
    trailing = src.slice(lastPos + 2, state.eMarks[lastLine]).trim();
  }

  if (silent) {
    return true;
  }

  const token = state.push('plugin_block', '', 0);
  token.info = name;
  token.meta = { args, rawBody };
  token.content = bodyContent;
  token.map = [startLine, nextLine];
  token.block = true;

  if (trailing) {
    const open = state.push('paragraph_open', 'p', 1);
    open.map = [startLine, nextLine];
    const inline = state.push('inline', '', 0);
    inline.content = trailing;
    inline.map = [startLine, nextLine];
    inline.children = [];
    state.push('paragraph_close', 'p', -1);
  }

  state.line = nextLine;
  return true;
}
