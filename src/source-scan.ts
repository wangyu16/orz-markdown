/**
 * Source pre-scanning helpers shared by every tool that looks for orz
 * directives in raw Markdown *before* rendering (metadata extraction, URL
 * include resolution, poster include discovery, …).
 *
 * A directive inside a fenced or indented code block, an inline code span, an
 * HTML comment, or a raw HTML block is inert: markdown-it never runs the plugin
 * there. A raw-text scanner that ignores this treats a documentation example
 * — "write `{{nyml kind: meta …}}` at the top" — as a live directive, strips it
 * from the page, or fetches the URL it mentions. Scanning the masked text
 * instead keeps pre-scans in agreement with the renderer.
 *
 * Hoisted from orz-poster (`src/contracts/include-scan.ts`, FA-35), where it was
 * proven against the renderer, so the whole family shares one definition.
 */

const HTML_BLOCK_TAG = /^(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)$/i;

/** CommonMark HTML-block start → how that block ends (a regex or a blank line). */
function htmlBlockTerminator(logical: string): RegExp | 'blank' | 'blank7' | undefined {
  const rawTag = /^<(script|pre|style|textarea)(?:\s|>|$)/i.exec(logical)?.[1];
  if (rawTag) return new RegExp(`<\\/${rawTag}\\s*>`, 'i');
  if (/^<\?/.test(logical)) return /\?>/;
  if (/^<!\[CDATA\[/.test(logical)) return /\]\]>/;
  if (/^<![A-Z]/.test(logical)) return />/;
  const tag = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|\/?>|$)/.exec(logical)?.[1];
  if (tag && HTML_BLOCK_TAG.test(tag)) return 'blank';
  // Type 7 (any other complete tag alone on the line) cannot interrupt a paragraph.
  if (/^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:[^ "'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>\s*$/.test(logical)) return 'blank7';
  return undefined;
}

/**
 * Blank inline code spans (matching backtick runs), keeping newlines.
 *
 * Linear: each run is paired with the NEXT run of the same length (CommonMark),
 * found through a precomputed `nextSame` table, and only inside one paragraph —
 * a code span never crosses a blank line, so a stray backtick cannot pair with
 * one paragraphs away and blank out live directives in between.
 */
export function maskInlineCode(source: string, starts?: boolean[]): string {
  const runs: Array<{ start: number; length: number; block: number }> = [];
  let block = 0;
  let lineNo = 0;
  let lineStart = 0; // tracked incrementally: a per-run lastIndexOf would be quadratic on long lines
  for (let index = 0; index < source.length;) {
    const ch = source[index];
    if (ch === '\r') { lineStart = index + 1; index += 1; continue; }
    if (ch === '\n') {
      lineStart = index + 1;
      lineNo += 1;
      // A blank (whitespace-only) line starts a new block, and so does a line
      // that starts a block construct (a heading, a directive, a list item…):
      // a code span cannot cross either.
      let k = index + 1;
      while (k < source.length && (source[k] === ' ' || source[k] === '\t' || source[k] === '\r')) k += 1;
      if (source[k] === '\n' || (starts && starts[lineNo])) block += 1;
      index += 1;
      continue;
    }
    if (ch !== '`') { index += 1; continue; }
    let end = index + 1;
    while (source[end] === '`') end += 1;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) backslashes += 1;
    if (backslashes % 2 === 1) { index = end; continue; }
    // A run of 3+ backticks at the start of a line is a fence, handled by the line pass.
    const atLineStart = index - lineStart <= 3 && /^[ \t]*$/.test(source.slice(lineStart, index));
    if (!(end - index >= 3 && atLineStart)) runs.push({ start: index, length: end - index, block });
    index = end;
  }
  const nextSame = new Array<number>(runs.length).fill(-1);
  const lastByLength = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    nextSame[i] = lastByLength.get(runs[i].length) ?? -1;
    lastByLength.set(runs[i].length, i);
  }
  const parts: string[] = [];
  let copied = 0;
  for (let i = 0; i < runs.length;) {
    const j = nextSame[i];
    if (j < 0 || runs[j].block !== runs[i].block) { i += 1; continue; }
    const from = runs[i].start;
    const to = runs[j].start + runs[j].length;
    parts.push(source.slice(copied, from), source.slice(from, to).replace(/[^\r\n]/g, ' '));
    copied = to;
    i = j + 1;
  }
  parts.push(source.slice(copied));
  return parts.join('');
}

export interface MarkdownMaskOptions {
  /** Blank HTML comments `<!-- … -->` (default true). */
  comments?: boolean;
  /** Blank raw HTML blocks (default true). */
  htmlBlocks?: boolean;
  /** Blank indented (4+ spaces) code blocks (default true). Turn off when the
   *  caller cannot tell list continuations from code. */
  indentedCode?: boolean;
}

/**
 * Return `source` with every region where orz directives are inert replaced by
 * spaces: fenced and indented code blocks, inline code spans, HTML comments and
 * raw HTML blocks. Length, offsets and line breaks are preserved exactly, so an
 * index found in the masked text is valid in the original.
 */
export function maskInertMarkdown(source: string, options: MarkdownMaskOptions = {}): string {
  const maskComments = options.comments ?? true;
  const maskHtmlBlocks = options.htmlBlocks ?? true;
  const maskIndented = options.indentedCode ?? true;
  const lines = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  // starts[i]: line i begins a new block (or follows a single-line one), so no
  // code span or inline comment continues across it. Lines are compared after
  // blockquote markers, which the renderer strips before parsing.
  const bodies = lines.map((l) => l.replace(/(?:\r\n|\n|\r)$/, '').replace(/^(?: {0,3}>[ \t]?)+/, ''));
  const starts = new Array<boolean>(lines.length + 1).fill(false);
  for (let k = 0; k < bodies.length; k++) {
    const b = bodies[k];
    if (/^ {0,3}(#{1,6}([ \t]|$)|\{\{[A-Za-z]|([-+*]|\d{1,9}[.)])([ \t]|$)|`{3,}|~{3,}|([-*_])[ \t]*\5[ \t]*\5[-*_ \t]*$|\[\^[^\]]+\]:)/.test(b)) starts[k] = true;
    if (/^ {0,3}(#{1,6}([ \t]|$)|=+[ \t]*$|-+[ \t]*$)/.test(b)) starts[k + 1] = true;
  }
  let output = '';
  let fence: { character: '`' | '~' | '$'; length: number; list: number; quote: number } | undefined;
  let comment = false;
  let commentBlock = false;
  let htmlEnd: RegExp | 'blank' | undefined;
  // Content column of the innermost open list item (-1: none). Lines indented
  // to it are the item's content, so a fence or code example there is measured
  // from it — "    ~~~" under "- " is a fence, not an indented code block.
  let listContent = -1;
  let prevParagraph = false;
  let inIndentedCode = false;
  // Inside the body of a multi-line block directive (`{{nyml`…`}}`): its lines
  // are the directive's data, not Markdown — a ``` or <!-- there opens nothing.
  let inDirective = false;
  // closeAhead[i]: a "-->" appears on a later line before the paragraph ends
  // (a blank line or a block start). Computed once, bottom-up — rescanning per
  // line made "a <!-- b" × n quadratic.
  const closeAhead = new Array<boolean>(lines.length + 1).fill(false);
  for (let k = lines.length - 2; k >= 0; k--) {
    const next = bodies[k + 1];
    closeAhead[k] = next.trim() === '' || starts[k + 1] ? false : next.indexOf('-->') >= 0 || closeAhead[k + 1];
  }
  for (let index = 0; index < lines.length; index++) {
    const lineWithEnding = lines[index];
    const line = lineWithEnding.replace(/(?:\r\n|\n|\r)$/, '');
    const ending = lineWithEnding.slice(line.length);
    const blank = ' '.repeat(line.length) + ending;
    const quote = line.length - bodies[index].length; // width of "> " markers
    const depth = (line.slice(0, quote).match(/>/g) ?? []).length;
    // A fence opened inside a blockquote ends when the quote does.
    if (fence && depth < fence.quote && line.trim() !== '') fence = undefined;
    const body = bodies[index];
    const lead = body.match(/^[ \t]*/)?.[0] ?? '';
    const indent = columns(lead);
    const logical = body.slice(lead.length);
    const isBlankLine = logical.trim().length === 0;
    // Comment and HTML-block continuation first.
    if (maskComments && comment) {
      const close = line.indexOf('-->');
      if (close < 0 && !(starts[index] && !commentBlock)) { output += blank; continue; }
      comment = false;
      if (close >= 0 && commentBlock) { output += blank; commentBlock = false; prevParagraph = false; continue; }
      if (close >= 0) { output += ' '.repeat(close + 3) + line.slice(close + 3) + ending; prevParagraph = true; continue; }
      // An inline comment never crosses a block start: fall through and scan it.
    }
    if (inDirective) {
      output += blank;
      if (line.indexOf('}}') >= 0) inDirective = false;
      continue;
    }
    if (htmlEnd) {
      output += blank;
      if (htmlEnd === 'blank' ? isBlankLine : htmlEnd.test(logical)) htmlEnd = undefined;
      continue;
    }
    // List context: a less-indented non-blank line that is not an item ends it
    // — and closes a fence opened inside the item.
    let eff = indent;
    if (!isBlankLine && listContent >= 0) {
      if (indent >= listContent) eff = indent - listContent;
      else {
        listContent = -1;
        if (fence && fence.list >= 0) fence = undefined;
      }
    }
    if (fence) {
      output += blank;
      const fm = !isBlankLine && eff <= 3 ? /^(`{3,}|~{3,}|\${2,})(.*)$/.exec(logical) : null;
      if (fm && fm[1][0] === fence.character && fm[1].length >= fence.length && /^\s*$/.test(fm[2] ?? '')) fence = undefined;
      else if (fence.character === '$' && /\$\$\s*$/.test(logical)) fence = undefined;
      continue;
    }
    if (isBlankLine) {
      output += line + ending;
      prevParagraph = false;
      continue;
    }
    const first = logical.charCodeAt(0);
    let fenceMatch = eff <= 3 && (first === 96 || first === 126) ? /^(`{3,}|~{3,})(.*)$/.exec(logical) : null;
    // A "$$" display-math block is opaque to directives too.
    if (eff <= 3 && /^\$\$/.test(logical) && !/^\$\$.*\$\$\s*$/.test(logical.slice(2) ? logical : '')) {
      output += blank;
      fence = { character: '$', length: 2, list: listContent, quote: depth };
      prevParagraph = false;
      continue;
    }
    // A backtick fence's info string cannot contain a backtick (CommonMark).
    if (fenceMatch && fenceMatch[1][0] === '`' && fenceMatch[2].includes('`')) fenceMatch = null;
    // Indented code: 4+ columns past the context, and not continuing a paragraph.
    if (maskIndented && eff >= 4 && (!prevParagraph || inIndentedCode)) {
      output += blank;
      inIndentedCode = true;
      continue;
    }
    inIndentedCode = false;
    if (fenceMatch) {
      output += blank;
      fence = { character: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length, list: listContent, quote: depth };
      prevParagraph = false;
      continue;
    }
    // List items and footnote definitions set a content column.
    const item = eff <= 3 ? /^(?:([-+*]|\d{1,9}[.)])|(\[\^[^\]]+\]:))([ \t]+|$)/.exec(logical) : null;
    if (item) {
      const gap = columns(item[3]);
      listContent = item[2] ? quote + indent + 4 : quote + indent + item[1].length + (gap >= 1 && gap <= 4 ? gap : 1);
      // "- ```" / "[^1]: ```" opens a fence inside the item.
      const rest = logical.slice(item[0].length);
      const itemFence = /^(`{3,}|~{3,})(.*)$/.exec(rest);
      if (itemFence && !(itemFence[1][0] === '`' && itemFence[2].includes('`'))) {
        output += blank;
        fence = { character: itemFence[1][0] as '`' | '~', length: itemFence[1].length, list: listContent, quote: depth };
        prevParagraph = false;
        continue;
      }
    }
    // A block directive opener whose "}}" is not on this line: its body follows.
    if (eff <= 3 && /^\{\{[A-Za-z]/.test(logical) && logical.indexOf('}}') < 0) {
      output += line + ending;
      inDirective = true;
      prevParagraph = false;
      continue;
    }
    const commentStart = maskComments ? commentOutsideCode(logical) : -1;
    if (commentStart === 0 && eff <= 3) {
      // A comment at the start of a line is an HTML block: whole lines.
      output += blank;
      if (logical.indexOf('-->', 4) < 0) { comment = true; commentBlock = true; }
      prevParagraph = false;
      continue;
    }
    let startsHtml = maskHtmlBlocks && eff <= 3 && first === 60 /* < */ ? htmlBlockTerminator(logical) : undefined;
    if (startsHtml === 'blank7') startsHtml = prevParagraph ? undefined : 'blank';
    if (startsHtml) {
      output += blank;
      if (!(startsHtml === 'blank' ? isBlankLine : startsHtml.test(logical))) htmlEnd = startsHtml;
      prevParagraph = false;
      continue;
    }
    const at = line.length - logical.length + commentStart;
    if (commentStart > 0 && (line.indexOf('-->', at + 4) >= 0 || closeAhead[index])) {
      // A comment inside a line is inline HTML: blank only the comment span(s),
      // collected and joined once (re-slicing per comment was quadratic).
      const parts: string[] = [];
      let copied = 0;
      let from = at;
      while (from >= 0) {
        const close = line.indexOf('-->', from + 4);
        const to = close < 0 ? line.length : close + 3;
        parts.push(line.slice(copied, from), ' '.repeat(to - from));
        copied = to;
        if (close < 0) { comment = true; commentBlock = false; break; }
        from = line.indexOf('<!--', to);
      }
      parts.push(line.slice(copied));
      output += parts.join('') + ending;
      prevParagraph = true;
      continue;
    }
    output += line + ending;
    // Paragraph text (indented code and type-7 HTML cannot interrupt it); not
    // a heading, rule, setext underline, table row or directive line.
    prevParagraph = !/^(#{1,6}([ \t]|$)|([-*_])[ \t]*\3[ \t]*\3[-*_ \t]*$|=+[ \t]*$|\||\{\{)/.test(logical);
  }
  return maskInlineCode(output, starts);
}

/** Width of leading whitespace, tabs to the next multiple of 4 (CommonMark). */
function columns(ws: string): number {
  let w = 0;
  for (const ch of ws) w = ch === '\t' ? w + 4 - (w % 4) : w + 1;
  return w;
}

/** Index of "<!--" on the line outside backtick code spans, or -1. Linear:
 *  a fast path for the common line without "<!--", and the linear code-span
 *  masker otherwise (searching the rest of the line for each backtick run's
 *  partner was quadratic on lines of distinct-length runs). */
function commentOutsideCode(line: string): number {
  if (line.indexOf('<!--') < 0) return -1;
  return maskInlineCode(line).indexOf('<!--');
}
