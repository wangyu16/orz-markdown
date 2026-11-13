/**
 * Block splitting and the canonical form of a text (2.8.0, family module K3).
 *
 * `splitBlocks` cuts a text into the blocks the parser sees — the document
 * header, then one block per top-level construct (heading, paragraph, list,
 * table, quote, container, fenced or indented code, math, directive, paged
 * element, raw HTML, rule, reference/footnote definitions), or grouped into
 * heading-bounded sections, or (slides) one block per slide. The blocks tile
 * the text: `start`/`end` are offsets, the first starts at 0, each starts
 * where the previous ends, the last ends at `text.length`, so joining the
 * slices gives back the text exactly. Blank lines after a block belong to it.
 *
 * `canonicalize` gives a text's canonical form — line endings, blank lines,
 * trailing spaces, heading and rule markers, list markers, emphasis markers
 * and table padding normalised — that renders exactly as the text does: every
 * change is checked by rendering the block (and then the whole body) before
 * and after, and a change that alters the render is not made. The header is
 * kept byte for byte (only its line endings become LF). Idempotent.
 *
 * Kinds are FC-18's (`md`, `slides`, `paged`). Browser-safe and
 * deterministic: the kit's private parser, no clock, no randomness, no DOM.
 */
import { kitParser } from './parser.js';
import { readHeader } from './header.js';
import { kindFromFilename, type Kind, type KitToken } from './document.js';
import { parseNymlBody } from '../nyml-body.js';
import { sha256 } from './sha256.js';

/** What a block is (`TextBlock.type`). */
export type BlockType =
  /** The FC-18 document header (a legacy `kind: meta` pair included) and the blank lines after it. */
  | 'header'
  /** Section/slide unit: the blocks before the first section heading or slide marker. */
  | 'preamble'
  /** Section unit: a heading of level ≤ `depth` and everything up to the next one. */
  | 'section'
  /** Slides' section unit: a slide marker and everything up to the next one. */
  | 'slide'
  | 'heading'
  | 'paragraph'
  /** One top-level list (all its items). */
  | 'list'
  | 'table'
  | 'blockquote'
  /** A `::: name` container (columns, callouts, tabs, …) as one block; `name` is its name. */
  | 'container'
  /** Fenced or indented code; `name` is the fence's language (e.g. `js`, `mermaid`), absent for indented code. */
  | 'code'
  /** A `$$ … $$` math block. */
  | 'math'
  /** A block directive `{{name …}}` (mermaid, chart, nyml, …); `name` is the directive. */
  | 'directive'
  /** paged: an element block `{{nyml kind: <element>}}`; `name` is the element kind. */
  | 'element'
  /** Raw HTML (an HTML comment included). */
  | 'html'
  /** slides: a slide marker (`name: 'slide'`) or a region marker (`name`: the region) — in the `block` unit. */
  | 'marker'
  /** A thematic break. */
  | 'rule'
  /** Reference-link and footnote definitions (the parser keeps no block for them). */
  | 'definition'
  /** A text of blank lines only. */
  | 'blank'
  /** A top-level construct of a registered plugin this module does not know; `name` is its token type. */
  | 'other';

/** One block of a text (`splitBlocks`). */
export interface TextBlock {
  type: BlockType;
  /** Container name, directive name, element kind, code language, marker name, or the token type of `other`. */
  name?: string;
  /**
   * The block's stable block id (FC-02, `blk-` + ≥ 8 base36) when it has one,
   * else `null`: a heading's `{{attrs[#blk-…]}}`; for a section, its heading's;
   * for a slide, an `id=blk-…` slide option, else the id of the slide's first
   * heading that has one.
   */
  id: string | null;
  /** Offset of the block's first character in the text. */
  start: number;
  /** Offset just past the block (its trailing blank lines included). */
  end: number;
  /** 1-based line of the text where the block starts. */
  line: number;
  /** `blockFingerprint` of the block's text. */
  fingerprint: string;
}

/** How a text is cut (`SplitOptions.unit`). */
export type BlockUnit = 'block' | 'section';

/** Options of {@link splitBlocks} and {@link canonicalize}. */
export interface BlockOptions {
  /** The text's kind; else the file name's kind, else the header's `carrier`, else `md` (as `readDocument`). */
  kind?: Kind;
  filename?: string;
}

/** Options of {@link splitBlocks}. */
export interface SplitOptions extends BlockOptions {
  /**
   * `block`: one block per top-level construct (slides: slide and region
   * markers are `marker` blocks). `section`: md and paged are cut at every
   * top-level heading of level ≤ `depth`; slides are cut at every slide
   * marker. Default: `section` for slides, `block` for md and paged.
   */
  unit?: BlockUnit;
  /** Section unit, md and paged: the deepest heading level that starts a section (1–6, default 2). */
  depth?: number;
}

/** An FC-02 stable block id. */
const BLOCK_ID = /^blk-[a-z0-9]{8,}$/;
/** A slide marker: a top-level HTML-comment block `<!-- slide …` (as `readDocument`). */
const SLIDE_MARKER = /^[ \t]*<!--\s*slide\b/;
/** A region marker `<!-- @name …`. */
const REGION_MARKER = /^[ \t]*<!--\s*@([A-Za-z0-9_-]+)/;
/** The start of a reference-link or footnote definition line. */
const DEFINITION = /^ {0,3}\[/;
const SLIDE_ID = /(?:^|\s)id=(["']?)(blk-[a-z0-9]{8,})\1(?=\s|-->|$)/;

function isKind(v: unknown): v is Kind {
  return v === 'md' || v === 'slides' || v === 'paged';
}

function resolveKind(text: string, opts: BlockOptions): Kind {
  const named = opts.kind ?? (opts.filename ? kindFromFilename(opts.filename) : null);
  if (named) return named;
  const header = readHeader(text);
  const carrier = header && Object.prototype.hasOwnProperty.call(header.fields, 'carrier') ? header.fields['carrier'] : undefined;
  return isKind(carrier) ? carrier : 'md';
}

/** Offsets where each line starts; a line ends at LF, CR LF or CR (as the parser reads it). */
function lineStarts(s: string): number[] {
  const out = [0];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) out.push(i + 1);
    else if (c === 13) {
      if (s.charCodeAt(i + 1) === 10) i++;
      out.push(i + 1);
    }
  }
  return out;
}

function isBlankRange(s: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const c = s.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13) return false;
  }
  return true;
}

/**
 * A block's fingerprint: the first 16 hex digits of the SHA-256 of its text
 * with line endings read as LF and the blank lines before and after it (the
 * separator) left out. Two blocks that differ only in line endings or in the
 * blank lines around them have the same fingerprint; any other difference —
 * a trailing space included — gives another one. For whitespace-insensitive
 * comparison, fingerprint the blocks of `canonicalize(text)`.
 */
export function blockFingerprint(blockText: string): string {
  const s = blockText.replace(/\r\n?/g, '\n');
  // Leading blank lines: up to the line break before the first non-blank character.
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) from = i + 1;
    else if (c !== 32 && c !== 9) break;
  }
  // Trailing blank lines: from the last line break after the last non-blank character.
  let to = s.length;
  for (let i = s.length - 1; i >= from; i--) {
    const c = s.charCodeAt(i);
    if (c === 10) to = i;
    else if (c !== 32 && c !== 9) break;
  }
  return sha256(s.slice(from, Math.max(from, to))).slice(0, 16);
}

/** One top-level construct of a body, by line. */
interface Piece {
  /** 0-based body line where it starts. */
  line: number;
  type: BlockType;
  name?: string;
  id: string | null;
  /** Heading level (1–6) for a heading. */
  level?: number;
  /** Index of its opening token (−1 for a definition). */
  token: number;
}

function headingId(t: KitToken): string | null {
  for (const [k, v] of t.attrs ?? []) if (k === 'id' && BLOCK_ID.test(v)) return v;
  return null;
}

/** The top-level constructs of a parsed body, in line order. */
function pieces(tokens: readonly KitToken[], bodyLines: number, isBlankLine: (line: number) => boolean, isDefinitionLine: (line: number) => boolean, kind: Kind): Piece[] {
  const out: Piece[] = [];
  const covered: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level !== 0 || t.nesting === -1 || !t.map || !t.block) continue;
    covered.push([t.map[0], t.map[1]]);
    const p: Piece = { line: t.map[0], type: 'other', id: null, token: i };
    switch (t.type) {
      case 'heading_open':
        p.type = 'heading';
        p.level = Number(t.tag.slice(1)) || 1;
        p.id = headingId(t);
        break;
      case 'paragraph_open': p.type = 'paragraph'; break;
      case 'bullet_list_open': case 'ordered_list_open': p.type = 'list'; break;
      case 'table_open': p.type = 'table'; break;
      case 'blockquote_open': p.type = 'blockquote'; break;
      case 'hr': p.type = 'rule'; break;
      case 'math_block': p.type = 'math'; break;
      case 'code_block': p.type = 'code'; break;
      case 'fence': {
        p.type = 'code';
        const lang = t.info.trim().split(/\s+/)[0];
        if (lang) p.name = lang;
        break;
      }
      case 'html_block': {
        p.type = 'html';
        if (kind === 'slides') {
          if (SLIDE_MARKER.test(t.content)) { p.type = 'marker'; p.name = 'slide'; p.id = SLIDE_ID.exec(t.content.slice(0, t.content.indexOf('-->') >>> 0))?.[2] ?? null; }
          else {
            const r = REGION_MARKER.exec(t.content);
            if (r) { p.type = 'marker'; p.name = r[1]; }
          }
        }
        break;
      }
      case 'plugin_block': {
        p.type = 'directive';
        p.name = t.info;
        if (kind === 'paged' && t.info === 'nyml') {
          const raw = (t.meta as { rawBody?: string } | null)?.rawBody;
          const k = parseNymlBody(raw ?? t.content ?? '').kind;
          if (k && k !== 'document' && k !== 'meta') { p.type = 'element'; p.name = k; }
        }
        break;
      }
      default: {
        const m = /^container_(.+)_open$/.exec(t.type);
        if (m) { p.type = 'container'; p.name = m[1]; }
        else p.name = t.type.replace(/_open$/, '');
      }
    }
    out.push(p);
  }
  // Reference-link and footnote definitions leave no top-level token: a line
  // that no token covers, starts with `[` and follows a blank line or a
  // covered one starts a `definition` block. (Other uncovered lines — a
  // container's closing `:::` — stay with the block before them.)
  covered.sort((a, b) => a[0] - b[0]);
  let at = 0;
  let c = 0;
  let prevBlank = true;
  while (at < bodyLines) {
    while (c < covered.length && covered[c][1] <= at) c++;
    if (c < covered.length && covered[c][0] <= at) { at = covered[c][1]; prevBlank = true; continue; }
    const blank = isBlankLine(at);
    if (!blank && prevBlank && isDefinitionLine(at)) out.push({ line: at, type: 'definition', id: null, token: -1 });
    prevBlank = blank;
    at++;
  }
  out.sort((a, b) => a.line - b.line);
  return out.filter((p, i) => i === 0 || p.line !== out[i - 1].line);
}

/** The header's end and the parsed body of a text. */
function parseBody(text: string, kind: Kind) {
  const header = readHeader(text);
  const offset = header ? header.end : 0;
  const body = text.slice(offset);
  const starts = lineStarts(body);
  const lineEnd = (l: number): number => (l + 1 < starts.length ? starts[l + 1] : body.length);
  const tokens = kitParser().parse(body, {}) as unknown as KitToken[];
  const list = pieces(tokens, starts.length, (l) => isBlankRange(body, starts[l], lineEnd(l)), (l) => DEFINITION.test(body.slice(starts[l], Math.min(lineEnd(l), starts[l] + 4))), kind);
  return { header, offset, body, starts, tokens, pieces: list };
}

/**
 * Cut a text into blocks (see the module comment). `opts` is the kind, or
 * `{ kind?, filename?, unit?, depth? }`. The blocks tile the text exactly:
 * `blocks.map((b) => text.slice(b.start, b.end)).join('') === text`. An empty
 * text has no blocks; a text of blank lines is one `blank` block.
 *
 * Stability: a block starts where the parser starts a top-level construct,
 * so an edit inside one block leaves every other block's offsets-relative
 * text, `id`, `type` and `fingerprint` unchanged, unless the edit changes
 * where the parser starts constructs (joining two paragraphs by deleting the
 * blank line between them, opening a fence that is never closed, …).
 */
export function splitBlocks(text: string, opts?: Kind | SplitOptions): TextBlock[] {
  const o: SplitOptions = typeof opts === 'string' ? { kind: opts } : (opts ?? {});
  const kind = resolveKind(text, o);
  const unit: BlockUnit = o.unit ?? (kind === 'slides' ? 'section' : 'block');
  const depth = Math.min(6, Math.max(1, Math.floor(o.depth ?? 2)));
  if (text === '') return [];
  const { header, offset, starts, pieces: list } = parseBody(text, kind);
  const raw: Array<Omit<TextBlock, 'end' | 'fingerprint' | 'line'> & { level?: number }> = [];
  for (const p of list) {
    const blk: Omit<TextBlock, 'end' | 'fingerprint' | 'line'> & { level?: number } = { type: p.type, id: p.id, start: offset + starts[p.line] };
    if (p.name !== undefined) blk.name = p.name;
    if (p.level !== undefined) blk.level = p.level;
    raw.push(blk);
  }
  // The header (with the rest of its line and the blank lines after it) is the first block; without one the first block starts at 0.
  if (header) raw.unshift({ type: 'header', id: null, start: 0 });
  else if (raw.length) raw[0].start = 0;
  if (!raw.length) raw.push({ type: 'blank', id: null, start: 0 });

  let groups = raw;
  if (unit === 'section') {
    groups = [];
    const opens = (b: (typeof raw)[number]): boolean =>
      kind === 'slides' ? b.type === 'marker' && b.name === 'slide' : b.type === 'heading' && (b.level ?? 1) <= depth;
    for (const b of raw) {
      const cur = groups[groups.length - 1];
      if (b.type === 'header') groups.push(b);
      else if (opens(b)) groups.push({ type: kind === 'slides' ? 'slide' : 'section', id: b.id, start: b.start });
      else if (!cur || cur.type === 'header') groups.push({ type: 'preamble', id: null, start: b.start });
      else if (cur.type === 'slide' && cur.id === null && b.id !== null && b.type === 'heading') cur.id = b.id;
    }
  }
  const allStarts = lineStarts(text);
  const lineOf = (off: number): number => {
    let lo = 0, hi = allStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (allStarts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  return groups.map((g, i) => {
    const end = i + 1 < groups.length ? groups[i + 1].start : text.length;
    const out: TextBlock = { type: g.type, id: g.id, start: g.start, end, line: lineOf(g.start), fingerprint: blockFingerprint(text.slice(g.start, end)) };
    if (g.name !== undefined) out.name = g.name;
    return out;
  });
}

// ── canonical form ──────────────────────────────────────────────────────────

/** Above this many blocks a body whose block-by-block changes do not add up is not retried block by block. */
const RETRY_BLOCK_LIMIT = 200;

type Render = (src: string) => string;

function renderer(): Render {
  const cache = new Map<string, string>();
  return (src) => {
    let html = cache.get(src);
    if (html === undefined) {
      html = kitParser().render(src, {});
      cache.set(src, html);
    }
    return html;
  };
}

const isBlank = (s: string): boolean => /^[ \t]*$/.test(s);

/** Trailing spaces/tabs of a line: two or more spaces on a line whose inline text continues (a hard break) become two; any other run goes. */
function trimEnd(line: string, hardBreak: boolean): string {
  let i = line.length;
  while (i > 0 && (line.charCodeAt(i - 1) === 32 || line.charCodeAt(i - 1) === 9)) i--;
  if (i === line.length) return line;
  const tail = line.slice(i);
  return hardBreak && tail.length >= 2 && !tail.includes('\t') ? line.slice(0, i) + '  ' : line.slice(0, i);
}

/** Facts about the body's lines, from its tokens (every level). */
interface LineFacts {
  /** Lines whose bytes are content (code, math, raw HTML, directives): never touched. */
  verbatim: Uint8Array;
  /** Lines of a top-level paragraph (leading spaces are not content). */
  paragraph: Uint8Array;
  /** Lines whose inline text continues on the next line (where trailing spaces can be a hard break). */
  continues: Uint8Array;
}

function lineFacts(tokens: readonly KitToken[], n: number): LineFacts {
  const verbatim = new Uint8Array(n);
  const paragraph = new Uint8Array(n);
  const continues = new Uint8Array(n);
  const visit = (t: KitToken): void => {
    if (!t.map) return;
    const [a, b] = t.map;
    if (t.type === 'inline') for (let l = a; l < b - 1 && l < n; l++) continues[l] = 1;
    if (t.type === 'fence' || t.type === 'code_block' || t.type === 'html_block' || t.type === 'math_block' || t.type === 'plugin_block') {
      for (let l = a; l < b && l < n; l++) verbatim[l] = 1;
    } else if (t.type === 'paragraph_open' && t.level === 0) {
      for (let l = a; l < b && l < n; l++) paragraph[l] = 1;
    }
  };
  for (const t of tokens) visit(t);
  return { verbatim, paragraph, continues };
}

/**
 * Mask the spans of a line where `_` is never an emphasis marker (code spans,
 * `$…$`, `{{…}}`, `<…>`, `](…)`, escapes). Linear: a closer that is not found
 * once is never searched for again.
 */
function maskedLine(line: string): string {
  const m = line.split('');
  const blank = (from: number, to: number) => { for (let k = from; k < to && k < m.length; k++) m[k] = '\u0000'; };
  const missing = new Set<string>();
  const find = (what: string, from: number): number => {
    if (missing.has(what)) return -1;
    const at = line.indexOf(what, from);
    if (at < 0) missing.add(what);
    return at;
  };
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\') { blank(i, i + 2); i += 2; continue; }
    if (c === '`') {
      let n = 0;
      while (line[i + n] === '`') n++;
      // The closing run: the next run of exactly n backticks.
      let j = i + n;
      let close = -1;
      if (!missing.has('`' + n)) {
        while (j < line.length) {
          const k = line.indexOf('`', j);
          if (k < 0) break;
          let e = k;
          while (line[e] === '`') e++;
          if (e - k === n) { close = k; break; }
          j = e;
        }
        if (close < 0) missing.add('`' + n);
      }
      if (close < 0) { i += n; continue; }
      blank(i, close + n); i = close + n; continue;
    }
    const close = c === '$' ? find('$', i + 1) : c === '<' ? find('>', i + 1) : c === '{' && line[i + 1] === '{' ? find('}}', i + 2) : c === ']' && line[i + 1] === '(' ? find(')', i + 2) : -1;
    if (close >= 0) { const to = c === '{' ? close + 2 : close + 1; blank(i, to); i = to; continue; }
    i++;
  }
  return m.join('');
}

const WORD = /[\p{L}\p{N}]/u;
/** The code point before offset `i` (a surrogate pair read whole), or ''. */
function before(s: string, i: number): string {
  if (i <= 0) return '';
  const lo = s.charCodeAt(i - 1);
  return lo >= 0xdc00 && lo <= 0xdfff && i >= 2 ? s.slice(i - 2, i) : s[i - 1];
}
/** The code point at offset `i`, or ''. */
function at(s: string, i: number): string {
  if (i >= s.length) return '';
  const cp = s.codePointAt(i)!;
  return String.fromCodePoint(cp);
}

/**
 * `_a_` → `*a*`, `__a__` → `**a**` outside code, math, directives, tags and
 * link targets. Runs of one or two `_` that can open (next character not
 * blank, previous not a letter, digit, `_` or `\`) and close (the mirror)
 * are paired innermost-first, as a delimiter stack: linear in the line.
 */
function starEmphasis(line: string): string {
  if (!line.includes('_')) return line;
  const masked = maskedLine(line);
  const out = line.split('');
  const stacks: Record<number, number[]> = { 1: [], 2: [] };
  let i = 0;
  while (i < masked.length) {
    if (masked[i] !== '_') { i++; continue; }
    let e = i;
    while (masked[e] === '_') e++;
    const d = e - i;
    const prev = before(masked, i);
    const next = at(masked, e);
    const blankish = (ch: string) => ch === '' || /\s/.test(ch) || ch === '\u0000';
    const canOpen = d <= 2 && !blankish(next) && !(prev !== '' && (WORD.test(prev) || prev === '\\'));
    const canClose = d <= 2 && !blankish(prev) && prev !== '\\' && !(next !== '' && WORD.test(next));
    const stack = d <= 2 ? stacks[d] : null;
    if (stack && canClose && stack.length) {
      const open = stack.pop()!;
      // Openers inside the pair are unmatched now.
      const other = stacks[d === 1 ? 2 : 1];
      while (other.length && other[other.length - 1] > open) other.pop();
      for (let k = 0; k < d; k++) { out[open + k] = '*'; out[i + k] = '*'; }
    } else if (stack && canOpen) stack.push(i);
    i = e;
  }
  return out.join('');
}

/** Split a table row on its unescaped pipes (as the parser does), outer pipes dropped. */
function tableCells(line: string): string[] | null {
  const s = line.trim();
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '|' && s[i - 1] !== '\\') { cells.push(cur); cur = ''; } else cur += s[i];
  }
  cells.push(cur);
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.length ? cells.map((c) => c.trim()) : null;
}

function tableRow(line: string, delimiter: boolean): string {
  const cells = tableCells(line);
  if (!cells) return line;
  if (delimiter) {
    if (!cells.every((c) => /^:?-+:?$/.test(c))) return line;
    return '| ' + cells.map((c) => (c.startsWith(':') ? ':' : '') + '---' + (c.endsWith(':') && c.length > 1 ? ':' : '')).join(' | ') + ' |';
  }
  return '| ' + cells.join(' | ') + ' |';
}

/** One top-level block of a body, its lines and the tokens inside it. */
interface BodyBlock {
  from: number;
  to: number;
  piece: Piece;
  /** A list block next to another list (two lists that one marker would join). */
  besideList: boolean;
}

type Stage = (lines: string[], blk: BodyBlock) => void;

function stages(tokens: readonly KitToken[], facts: LineFacts): Stage[] {
  const tokensIn = (blk: BodyBlock): KitToken[] => {
    const out: KitToken[] = [];
    for (let i = Math.max(0, blk.piece.token); i < tokens.length; i++) {
      const t = tokens[i];
      if (t.map && t.map[0] >= blk.to) break;
      if (t.map && t.map[0] >= blk.from) out.push(t);
      if (blk.piece.token < 0) break;
    }
    return out;
  };
  // 1. whitespace: blank lines empty, trailing spaces (hard breaks kept as two), a paragraph's leading spaces.
  const whitespace: Stage = (lines, blk) => {
    for (let l = blk.from; l < blk.to; l++) {
      if (facts.verbatim[l]) continue;
      if (isBlank(lines[l])) { lines[l] = ''; continue; }
      let s = trimEnd(lines[l], facts.continues[l] === 1);
      if (facts.paragraph[l]) s = s.replace(/^[ \t]+/, '');
      lines[l] = s;
    }
  };
  // 2. markers: ATX headings `# text` (single-line setext too), rules `---`.
  const markers: Stage = (lines, blk) => {
    const p = blk.piece;
    if (p.type === 'heading') {
      const open = tokens[p.token];
      const inline = tokens[p.token + 1];
      if (!open.map || !inline || inline.type !== 'inline') return;
      const [a, b] = open.map;
      const content = inline.content;
      if (content.includes('\n')) return;
      const atx = '#'.repeat(p.level ?? 1) + (content ? ' ' + content : '');
      if (open.markup.startsWith('#') && b - a === 1) lines[a] = atx;
      else if ((open.markup === '=' || open.markup === '-') && b - a === 2) { lines[a] = atx; lines[a + 1] = '\u0000'; }
    } else if (p.type === 'rule') {
      lines[blk.from] = '---';
    }
  };
  // 3. list markers: `*` `+` → `-`, `1)` → `1.`.
  const lists: Stage = (lines, blk) => {
    if ((blk.piece.type !== 'list' && blk.piece.type !== 'blockquote' && blk.piece.type !== 'container') || blk.besideList) return;
    const items = tokensIn(blk).filter((t) => t.type === 'list_item_open' && t.map);
    const perLine = new Map<number, number>();
    for (const t of items) perLine.set(t.map![0], (perLine.get(t.map![0]) ?? 0) + 1);
    for (const t of items) {
      const l = t.map![0];
      if (perLine.get(l) !== 1 || facts.verbatim[l]) continue;
      const line = lines[l];
      const pre = /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(line)![0].length;
      if (t.markup === '*' || t.markup === '+') {
        if (line[pre] === t.markup) lines[l] = line.slice(0, pre) + '-' + line.slice(pre + 1);
      } else if (t.markup === ')') {
        const m = /^[0-9]{1,9}\)/.exec(line.slice(pre));
        if (m) lines[l] = line.slice(0, pre + m[0].length - 1) + '.' + line.slice(pre + m[0].length);
      }
    }
  };
  // 4. emphasis markers: `_` → `*`.
  const emphasis: Stage = (lines, blk) => {
    const t = blk.piece.type;
    if (t !== 'paragraph' && t !== 'heading' && t !== 'list' && t !== 'blockquote' && t !== 'table' && t !== 'container') return;
    for (let l = blk.from; l < blk.to; l++) if (!facts.verbatim[l]) lines[l] = starEmphasis(lines[l]);
  };
  // 5. table padding: `| a | b |`, delimiter cells `---` / `:---` / `---:` / `:---:`.
  const tables: Stage = (lines, blk) => {
    if (blk.piece.type !== 'table') return;
    const open = tokens[blk.piece.token];
    if (!open.map) return;
    const [a, b] = open.map;
    for (let l = a; l < b && l < blk.to; l++) if (!isBlank(lines[l])) lines[l] = tableRow(lines[l], l === a + 1);
  };
  return [whitespace, markers, lists, emphasis, tables];
}

/** A block's lines as text: its blank edges (outside code) left out, `\u0000` (a removed line) dropped. */
function blockText(lines: readonly string[], blk: BodyBlock, facts: LineFacts): string {
  let a = blk.from;
  let b = blk.to;
  while (a < b && !facts.verbatim[a] && isBlank(lines[a])) a++;
  while (b > a && !facts.verbatim[b - 1] && isBlank(lines[b - 1])) b--;
  const out: string[] = [];
  for (let l = a; l < b; l++) {
    const s = lines[l];
    if (s === '\u0000') continue;
    // Runs of blank lines inside a block (outside code) become one.
    if (!facts.verbatim[l] && s === '' && out.length && out[out.length - 1] === '' && !facts.verbatim[l - 1]) continue;
    out.push(s);
  }
  return out.join('\n');
}

function canonicalOnce(text: string, kind: Kind, render: Render): string {
  const t = text.replace(/\r\n?/g, '\n');
  const header = readHeader(t);
  const headerText = header ? t.slice(0, header.end) : '';
  const body = t.slice(header ? header.end : 0);
  const lines = body.split('\n');
  // Text after the header's `}}` on its line: keep the text as it is (lint `closer-in-value` / `closer-not-alone`).
  if (header && !isBlank(lines[0])) return t;
  const tokens = kitParser().parse(body, {}) as unknown as KitToken[];
  const list = pieces(tokens, lines.length, (l) => isBlank(lines[l]), (l) => DEFINITION.test(lines[l]), kind);
  if (!list.length) return header ? headerText + '\n' : '';
  const facts = lineFacts(tokens, lines.length);
  const blocks: BodyBlock[] = list.map((p, i) => ({
    from: p.line,
    to: i + 1 < list.length ? list[i + 1].line : lines.length,
    piece: p,
    besideList: p.type === 'list' && (list[i - 1]?.type === 'list' || list[i + 1]?.type === 'list'),
  }));
  const all = stages(tokens, facts);
  const original: string[] = [];
  const chosen: string[] = [];
  for (const blk of blocks) {
    const before = blockText(lines, blk, facts);
    original.push(before);
    const target = render(before + '\n');
    // All stages at once; when that changes the render, stage by stage, keeping each that does not.
    const work = lines.slice();
    for (const stage of all) stage(work, blk);
    let best = blockText(work, blk, facts);
    if (best !== before && render(best + '\n') !== target) {
      const acc = lines.slice();
      best = before;
      for (const stage of all) {
        const trial = acc.slice();
        stage(trial, blk);
        const s = blockText(trial, blk, facts);
        if (s !== best && render(s + '\n') === target) {
          for (let l = blk.from; l < blk.to; l++) acc[l] = trial[l];
          best = s;
        }
      }
    }
    chosen.push(best);
  }
  // Blocks keep their adjacency: written one after the other when no blank line
  // separated them (slides' `<!-- slide -->` above its content, a heading
  // above its paragraph), otherwise with exactly one blank line between them.
  const gap = blocks.map((blk) => {
    let b = blk.to;
    while (b > blk.from && !facts.verbatim[b - 1] && isBlank(lines[b - 1])) b--;
    return b < blk.to;
  });
  const headGap = list[0].line > 1;
  const join = (parts: readonly string[]): string => {
    let out = header ? headerText + (headGap ? '\n\n' : '\n') : '';
    for (let i = 0; i < parts.length; i++) out += parts[i] + (i + 1 === parts.length ? '\n' : gap[i] ? '\n\n' : '\n');
    return out;
  };
  const target = render(body);
  const out = join(chosen);
  if (render(out.slice(headerText.length)) === target) return out;
  // Changes that are neutral one by one but not together (two lists that would join): take them block by block.
  const base = join(original);
  if (render(base.slice(headerText.length)) !== target) return t;
  if (blocks.length > RETRY_BLOCK_LIMIT) return base;
  const parts = original.slice();
  for (let i = 0; i < parts.length; i++) {
    if (chosen[i] === parts[i]) continue;
    const keep = parts[i];
    parts[i] = chosen[i];
    if (render(join(parts).slice(headerText.length)) !== target) parts[i] = keep;
  }
  return join(parts);
}

/**
 * The canonical form of a text (see the module comment): the text with LF
 * line endings; the header byte for byte, then one blank line; top-level
 * blocks separated by exactly one blank line, without blank-line runs inside
 * them; no trailing spaces except a two-space hard break; paragraph lines
 * without leading spaces; ATX headings `## Title` (a one-line setext heading
 * too); rules `---`; bullets `-`; ordered markers `1.`; emphasis `*a*` and
 * `**a**`; tables `| a | b |` with `---` / `:---` / `---:` / `:---:`
 * delimiters; one final line break. Code, math, raw HTML and directive
 * blocks keep their bytes. A change that would alter the rendered HTML is not
 * made, so `render(body(canonicalize(x))) === render(body(x))`, and
 * `canonicalize(canonicalize(x)) === canonicalize(x)`.
 */
export function canonicalize(text: string, opts?: Kind | BlockOptions): string {
  const o: BlockOptions = typeof opts === 'string' ? { kind: opts } : (opts ?? {});
  const kind = resolveKind(text, o);
  const render = renderer();
  let cur = text;
  // Each pass keeps the render; repeat until nothing changes, so the result is a fixed point (idempotence).
  for (let i = 0; i < 8; i++) {
    const next = canonicalOnce(cur, kind, render);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}
