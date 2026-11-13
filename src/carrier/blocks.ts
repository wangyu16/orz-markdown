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
 * change is checked by rendering the block (with the body's reference
 * definitions) and then the whole body before and after, and a change that
 * alters the render is not made. The header is
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
import { parseAttrs } from '../plugins/attrs.js';

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
   * else `null`: a top-level heading's explicit `{{attrs[#blk-…]}}` (or
   * `{{attrs[id="blk-…"]}}`) — never a slug, never a heading nested in a
   * list, quote or container; for a section, its heading's; for a slide, an
   * `id=blk-…` slide option, else the id of the slide's first top-level
   * heading that has one.
   */
  id: string | null;
  /**
   * `true` when the block's `id` is carried more than once in the text (by
   * another heading at any depth, or another slide marker): FC-02 ids are
   * unique per file, so the host must resolve it. Absent otherwise.
   */
  duplicate?: true;
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
/** A slide marker: a top-level HTML-comment block `<!-- slide … -->`, closed (as orz-slides' `parseDeck`). */
const SLIDE_MARKER = /^[ \t]*<!--\s*slide\b[\s\S]*?-->/;
/** A region marker `<!-- @name … -->`, closed. */
const REGION_MARKER = /^[ \t]*<!--\s*@([A-Za-z0-9_-]+)[\s\S]*?-->/;
/** A container's closing line `:::`. */
const CONTAINER_CLOSER = /^ {0,3}:{3,}[ \t]*$/;
/** An explicit attrs marker in a heading's source; its arguments. */
const ATTRS_MARKER = /\{\{attrs\[([^\]]*)\]/g;
/** The start of a reference-link or footnote definition line. */
const DEFINITION = /^ {0,3}\[/;
/** A slide marker's `id=…` option (orz-slides' `readMarkerArgs`: the last valid one counts). */
const SLIDE_ID = /(?:^|\s)id=(["']?)([^\s"']*)\1(?=\s|-->|$)/g;
/** An id orz-slides accepts (`readMarkerArgs`); an invalid one is dropped, so the one before it counts. */
const SLIDE_ID_VALUE = /^[A-Za-z][\w:.-]*$/;

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

/** Token types whose lines are content, blank lines included (an unclosed fence, `$$` or HTML comment runs to the end). */
const VERBATIM_TOKENS = new Set(['fence', 'code_block', 'html_block', 'math_block', 'plugin_block']);
/** Text that can open a construct whose trailing blank lines are content. */
const MAY_SWALLOW = /`{3}|~{3}|\$\$|</;

/**
 * A block's fingerprint: the first 16 hex digits of the SHA-256 of its text
 * with line endings read as LF and the blank lines before and after it (the
 * separator) left out. Two blocks that differ only in line endings or in the
 * blank lines around them have the same fingerprint; any other difference —
 * a trailing space included — gives another one. Blank lines that are
 * content (inside an unclosed fence, `$$` or HTML comment at the end of the
 * text) are not a separator: they count. For whitespace-insensitive
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
  // Trailing blank lines inside a verbatim token (it swallowed them: unclosed) are content.
  if (s.length - to > 1 && MAY_SWALLOW.test(s)) {
    let end = 0;
    for (const t of kitParser().parse(s, {}) as unknown as KitToken[]) if (t.map && VERBATIM_TOKENS.has(t.type) && t.map[1] > end) end = t.map[1];
    if (end > 0) {
      let line = 0;
      let keep = s.length;
      for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10 && ++line === end) { keep = i; break; }
      to = Math.max(to, keep);
    }
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

/**
 * A heading's FC-02 id: its final `id` attribute when that is a well-formed
 * block id AND an explicit `{{attrs[…]}}` marker in its source sets it (a
 * slug such as `# blk-abcdefgh1` is not a block id).
 */
function headingId(open: KitToken, inline: KitToken | undefined): string | null {
  let id: string | null = null;
  for (const [k, v] of open.attrs ?? []) if (k === 'id') id = v;
  if (id === null || !BLOCK_ID.test(id) || !inline || inline.type !== 'inline' || !inline.content.includes('{{attrs[')) return null;
  for (const m of inline.content.matchAll(ATTRS_MARKER)) for (const [k, v] of parseAttrs(m[1])) if (k === 'id' && v === id) return id;
  return null;
}

/**
 * A slide marker's `id=blk-…` option (closed markers only), else null. Given
 * twice, the last valid `id=` counts (as orz-slides' `readMarkerArgs`); when
 * that is not a block id, the slide has none.
 */
function slideId(content: string): string | null {
  let id: string | null = null;
  for (const m of content.slice(0, content.indexOf('-->') >>> 0).matchAll(SLIDE_ID)) if (SLIDE_ID_VALUE.test(m[2])) id = m[2];
  return id !== null && BLOCK_ID.test(id) ? id : null;
}

/** The top-level constructs of a parsed body, in line order. */
function pieces(tokens: readonly KitToken[], bodyLines: number, isBlankLine: (line: number) => boolean, isDefinitionLine: (line: number) => boolean, isCloserLine: (line: number) => boolean, kind: Kind): Piece[] {
  const out: Piece[] = [];
  const covered: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level !== 0 || t.nesting === -1 || !t.map || !t.block) continue;
    // A container's map stops before its closing `:::`: the closer goes with it.
    const closed = t.type.startsWith('container_') && t.map[1] < bodyLines && isCloserLine(t.map[1]);
    covered.push([t.map[0], t.map[1] + (closed ? 1 : 0)]);
    const p: Piece = { line: t.map[0], type: 'other', id: null, token: i };
    switch (t.type) {
      case 'heading_open':
        p.type = 'heading';
        p.level = Number(t.tag.slice(1)) || 1;
        p.id = headingId(t, tokens[i + 1]);
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
          if (SLIDE_MARKER.test(t.content)) { p.type = 'marker'; p.name = 'slide'; p.id = slideId(t.content); }
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
  // covered one (a container's closing `:::` included) starts a `definition`
  // block. (Other uncovered lines stay with the block before them.)
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
  const lineText = (l: number): string => body.slice(starts[l], lineEnd(l)).replace(/\r?\n$|\r$/, '');
  const list = pieces(tokens, starts.length, (l) => isBlankRange(body, starts[l], lineEnd(l)), (l) => DEFINITION.test(body.slice(starts[l], Math.min(lineEnd(l), starts[l] + 4))), (l) => CONTAINER_CLOSER.test(lineText(l)), kind);
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
 * where the parser starts constructs: joining two blocks (deleting the blank
 * line between them, breaking a heading, slide marker or the header), or
 * opening a fence, `$$`, `:::` or HTML comment that is never closed — it
 * swallows every block after it, so the blocks after the edit change (a
 * block merge sees them all as edited). Ids come from top-level headings
 * only; an id carried twice is flagged `duplicate`.
 */
export function splitBlocks(text: string, opts?: Kind | SplitOptions): TextBlock[] {
  const o: SplitOptions = typeof opts === 'string' ? { kind: opts } : (opts ?? {});
  const kind = resolveKind(text, o);
  const unit: BlockUnit = o.unit ?? (kind === 'slides' ? 'section' : 'block');
  const depth = Math.min(6, Math.max(1, Math.floor(o.depth ?? 2)));
  if (text === '') return [];
  const { header, offset, starts, tokens, pieces: list } = parseBody(text, kind);
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
  // Every FC-02 id the text carries (headings at any depth, top-level slide markers): a block whose id is carried twice is `duplicate`.
  const carried = new Map<string, number>();
  const count = (id: string | null): void => { if (id !== null) carried.set(id, (carried.get(id) ?? 0) + 1); };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') count(headingId(t, tokens[i + 1]));
    else if (kind === 'slides' && t.type === 'html_block' && t.level === 0 && SLIDE_MARKER.test(t.content)) count(slideId(t.content));
  }
  return groups.map((g, i) => {
    const end = i + 1 < groups.length ? groups[i + 1].start : text.length;
    const out: TextBlock = { type: g.type, id: g.id, start: g.start, end, line: lineOf(g.start), fingerprint: blockFingerprint(text.slice(g.start, end)) };
    if (g.name !== undefined) out.name = g.name;
    if (g.id !== null && (carried.get(g.id) ?? 0) > 1) out.duplicate = true;
    return out;
  });
}

// ── canonical form ──────────────────────────────────────────────────────────

/**
 * When a body's block-by-block changes do not add up, at most this many
 * whole-body renders per `canonicalize` call (shared by its passes) look for
 * the changes that do (groups halved until the ones that alter the render are
 * found); a change still unchecked then is not made.
 */
const RETRY_RENDER_LIMIT = 64;
/** Passes of `canonicalize` at most (each keeps the render; the last that changes nothing ends it). */
const MAX_PASSES = 8;

type Render = (src: string) => string;
type References = Record<string, unknown>;

/** What one `canonicalize` call carries across its passes. */
interface CallState {
  /** Whole-body renders the group search may still make (shared by every pass). */
  budget: number;
  /** Block changes (`original \u0001 chosen`) found to alter the body's render: not tried again. */
  failed: Set<string>;
  /** The body's render (every pass keeps it); computed by the first pass. */
  target: string | null;
  /** Renders of single blocks with the body's reference definitions, keyed by those definitions. */
  cache: Map<string, string>;
  cacheKey: string;
}

/**
 * Render a single block as it renders inside the body as far as references
 * go: with the body's reference definitions (a label resolves alike). The
 * block's own definitions go into an object inheriting the body's, so this
 * costs nothing per definition.
 */
function blockRender(state: CallState, refs: References | undefined, refsKey: string): Render {
  if (state.cacheKey !== refsKey) { state.cache = new Map(); state.cacheKey = refsKey; }
  const cache = state.cache;
  return (src) => {
    let html = cache.get(src);
    if (html === undefined) {
      html = kitParser().render(src, refs ? { references: Object.create(refs) as References } : {});
      cache.set(src, html);
    }
    return html;
  };
}
const renderWhole: Render = (src) => kitParser().render(src, {});

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
  /**
   * Lines the renderer shows: inside an inline token's map, a table, a rule
   * or a heading. Only these are rewritten (a reference or footnote
   * definition's lines — shown only where it is used — keep their bytes).
   */
  shown: Uint8Array;
  /** Lines whose inline text continues on the next line (where trailing spaces can be a hard break). */
  continues: Uint8Array;
}

function lineFacts(tokens: readonly KitToken[], n: number): LineFacts {
  const verbatim = new Uint8Array(n);
  const paragraph = new Uint8Array(n);
  const continues = new Uint8Array(n);
  const shown = new Uint8Array(n);
  const visit = (t: KitToken): void => {
    if (!t.map) return;
    const [a, b] = t.map;
    if (t.type === 'inline') for (let l = a; l < b - 1 && l < n; l++) continues[l] = 1;
    if (t.type === 'inline' || t.type === 'table_open' || t.type === 'hr' || t.type === 'heading_open') for (let l = a; l < b && l < n; l++) shown[l] = 1;
    if (t.type === 'fence' || t.type === 'code_block' || t.type === 'html_block' || t.type === 'math_block' || t.type === 'plugin_block') {
      for (let l = a; l < b && l < n; l++) verbatim[l] = 1;
    } else if (t.type === 'paragraph_open' && t.level === 0) {
      for (let l = a; l < b && l < n; l++) paragraph[l] = 1;
    }
  };
  for (const t of tokens) visit(t);
  return { verbatim, paragraph, continues, shown };
}

/**
 * Mask the spans of a line where `_` is never rewritten (code spans, `$…$`,
 * `{{…}}`, `<…>`, `](…)`, escapes, and labels: `[…]` not followed by `(`,
 * the label of `][…]`, `[^…]`). Linear: a closer that is not found once is
 * never searched for again.
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
  // The line's maximal backtick runs, their starts by length (ascending), and a cursor per length: each run is passed once.
  const runs = new Map<number, number[]>();
  for (let k = line.indexOf('`'); k >= 0; ) {
    let e = k;
    while (line[e] === '`') e++;
    const list = runs.get(e - k);
    if (list) list.push(k); else runs.set(e - k, [k]);
    k = line.indexOf('`', e);
  }
  const cursor = new Map<number, number>();
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\') { blank(i, i + 2); i += 2; continue; }
    if (c === '`') {
      let n = 0;
      while (line[i + n] === '`') n++;
      // The closing run: the next maximal run of exactly n backticks.
      const list = runs.get(n) ?? [];
      let k = cursor.get(n) ?? 0;
      while (k < list.length && list[k] < i + n) k++;
      cursor.set(n, k);
      const close = k < list.length ? list[k] : -1;
      if (close < 0) { i += n; continue; }
      blank(i, close + n); i = close + n; continue;
    }
    const close = c === '$' ? find('$', i + 1) : c === '<' ? find('>', i + 1) : c === '{' && line[i + 1] === '{' ? find('}}', i + 2) : c === ']' && line[i + 1] === '(' ? find(')', i + 2) : -1;
    // A link target `](…)`: its `]` stays (it closes the link text's bracket below).
    if (close >= 0) { const to = c === '{' ? close + 2 : close + 1; blank(c === ']' ? i + 1 : i, to); i = to; continue; }
    i++;
  }
  // Labels: whether `[…]` is a link depends on the definitions (in this text
  // or another version of it), and a label matches by its bytes — so the
  // inside of a bracket pair not followed by `(` (a reference or shortcut
  // label, the label part of `][…]`, a footnote reference `[^…]`) is masked.
  // Brackets pair innermost-first over what is not masked yet (one stack: linear).
  const open: number[] = [];
  const pairs: Array<[number, number]> = [];
  for (let k = 0; k < m.length; k++) {
    if (m[k] === '[') open.push(k);
    else if (m[k] === ']' && open.length) pairs.push([open.pop()!, k]);
  }
  // Nested pairs overlap: mark each label's inside in a difference array, blank once.
  const diff = new Int32Array(m.length + 1);
  for (const [a, b] of pairs) {
    if (m[a - 1] === ']' || m[a + 1] === '^' || line[b + 1] !== '(') { diff[a + 1]++; diff[b]--; }
  }
  for (let k = 0, depth = 0; k < m.length; k++) {
    depth += diff[k];
    if (depth > 0) m[k] = '\u0000';
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

/**
 * A stage rewrites a block's lines in place. `w` is the block's window: body
 * line `l` is `w[l - blk.from]` (a block is worked on in its own lines only,
 * so the cost is linear in the body).
 */
type Stage = (w: string[], blk: BodyBlock) => void;

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
  // 1. whitespace: blank lines empty, trailing spaces of shown lines (hard breaks kept as two), a paragraph's leading spaces.
  const whitespace: Stage = (w, blk) => {
    for (let l = blk.from; l < blk.to; l++) {
      const k = l - blk.from;
      if (facts.verbatim[l]) continue;
      if (isBlank(w[k])) { w[k] = ''; continue; }
      if (!facts.shown[l]) continue;
      let s = trimEnd(w[k], facts.continues[l] === 1);
      if (facts.paragraph[l]) s = s.replace(/^[ \t]+/, '');
      w[k] = s;
    }
  };
  // 2. markers: ATX headings `# text` (single-line setext too), rules `---`.
  const markers: Stage = (w, blk) => {
    const p = blk.piece;
    if (p.type === 'heading') {
      const open = tokens[p.token];
      const inline = tokens[p.token + 1];
      if (!open.map || !inline || inline.type !== 'inline') return;
      const [a, b] = open.map;
      const content = inline.content;
      if (content.includes('\n')) return;
      const atx = '#'.repeat(p.level ?? 1) + (content ? ' ' + content : '');
      if (open.markup.startsWith('#') && b - a === 1) w[a - blk.from] = atx;
      else if ((open.markup === '=' || open.markup === '-') && b - a === 2) { w[a - blk.from] = atx; w[a + 1 - blk.from] = '\u0000'; }
    } else if (p.type === 'rule') {
      // Right under a line of text `---` would underline it (a setext heading): `***` there.
      w[0] = blk.from > 0 && facts.shown[blk.from - 1] && !facts.verbatim[blk.from - 1] ? '***' : '---';
    }
  };
  // 3. list markers: `*` `+` → `-`, `1)` → `1.`.
  const lists: Stage = (w, blk) => {
    if ((blk.piece.type !== 'list' && blk.piece.type !== 'blockquote' && blk.piece.type !== 'container') || blk.besideList) return;
    const items = tokensIn(blk).filter((t) => t.type === 'list_item_open' && t.map);
    const perLine = new Map<number, number>();
    for (const t of items) perLine.set(t.map![0], (perLine.get(t.map![0]) ?? 0) + 1);
    for (const t of items) {
      const l = t.map![0];
      if (perLine.get(l) !== 1 || facts.verbatim[l] || l >= blk.to) continue;
      const k = l - blk.from;
      const line = w[k];
      const pre = /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(line)![0].length;
      if (t.markup === '*' || t.markup === '+') {
        if (line[pre] === t.markup) w[k] = line.slice(0, pre) + '-' + line.slice(pre + 1);
      } else if (t.markup === ')') {
        const m = /^[0-9]{1,9}\)/.exec(line.slice(pre));
        if (m) w[k] = line.slice(0, pre + m[0].length - 1) + '.' + line.slice(pre + m[0].length);
      }
    }
  };
  // 4. emphasis markers: `_` → `*`, on shown lines only.
  const emphasis: Stage = (w, blk) => {
    const t = blk.piece.type;
    if (t !== 'paragraph' && t !== 'heading' && t !== 'list' && t !== 'blockquote' && t !== 'table' && t !== 'container') return;
    for (let l = blk.from; l < blk.to; l++) if (!facts.verbatim[l] && facts.shown[l]) w[l - blk.from] = starEmphasis(w[l - blk.from]);
  };
  // 5. table padding: `| a | b |`, delimiter cells `---` / `:---` / `---:` / `:---:`.
  const tables: Stage = (w, blk) => {
    if (blk.piece.type !== 'table') return;
    const open = tokens[blk.piece.token];
    if (!open.map) return;
    const [a, b] = open.map;
    for (let l = a; l < b && l < blk.to; l++) if (!isBlank(w[l - blk.from])) w[l - blk.from] = tableRow(w[l - blk.from], l === a + 1);
  };
  return [whitespace, markers, lists, emphasis, tables];
}

/** A block's lines (its window `w`) as text: its blank edges (outside code) left out, `\u0000` (a removed line) dropped. */
function blockText(w: readonly string[], blk: BodyBlock, facts: LineFacts): string {
  const o = blk.from;
  let a = blk.from;
  let b = blk.to;
  while (a < b && !facts.verbatim[a] && isBlank(w[a - o])) a++;
  while (b > a && !facts.verbatim[b - 1] && isBlank(w[b - 1 - o])) b--;
  const out: string[] = [];
  for (let l = a; l < b; l++) {
    const s = w[l - o];
    if (s === '\u0000') continue;
    // Runs of blank lines inside a block (outside code) become one.
    if (!facts.verbatim[l] && s === '' && out.length && out[out.length - 1] === '' && !facts.verbatim[l - 1]) continue;
    out.push(s);
  }
  return out.join('\n');
}

function canonicalOnce(text: string, kind: Kind, state: CallState): string {
  const t = text.replace(/\r\n?/g, '\n');
  // A BOM goes back in front: the parser drops a leading BOM, so it never changes the render.
  const bom = t.charCodeAt(0) === 0xfeff ? '\uFEFF' : '';
  const u = t.slice(bom.length);
  const header = readHeader(u);
  const headerText = header ? u.slice(0, header.end) : '';
  const body = u.slice(header ? header.end : 0);
  const lines = body.split('\n');
  // Text after the header's `}}` on its line: keep the text as it is (lint `closer-in-value` / `closer-not-alone`).
  if (header && !isBlank(lines[0])) return t;
  const env: { references?: References } = {};
  const tokens = kitParser().parse(body, env) as unknown as KitToken[];
  // Blocks render with the body's reference definitions, so a change whose render depends on a label is judged where it stands.
  const refs = env.references && Object.keys(env.references).length ? env.references : undefined;
  const render = blockRender(state, refs, refs ? JSON.stringify(refs) : '');
  const list = pieces(tokens, lines.length, (l) => isBlank(lines[l]), (l) => DEFINITION.test(lines[l]), (l) => CONTAINER_CLOSER.test(lines[l]), kind);
  if (!list.length) return header ? bom + headerText + '\n' : bom;
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
  /** Each block's render alone with the body's definitions (the original text). */
  const alone: string[] = [];
  for (const blk of blocks) {
    const own = lines.slice(blk.from, blk.to);
    const before = blockText(own, blk, facts);
    original.push(before);
    const target = render(before + '\n');
    alone.push(target);
    // All stages at once; when that changes the render, stage by stage, keeping each that does not.
    const work = own.slice();
    for (const stage of all) stage(work, blk);
    let best = blockText(work, blk, facts);
    if (best !== before && render(best + '\n') !== target) {
      let acc = own;
      best = before;
      for (const stage of all) {
        const trial = acc.slice();
        stage(trial, blk);
        const s = blockText(trial, blk, facts);
        if (s !== best && render(s + '\n') === target) {
          acc = trial;
          best = s;
        }
      }
    }
    // A change already found to alter the body's render (an earlier pass) is not tried again.
    chosen.push(state.failed.has(before + '\u0001' + best) ? before : best);
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
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) out.push(parts[i], i + 1 === parts.length ? '\n' : gap[i] ? '\n\n' : '\n');
    return out.join('');
  };
  const head = bom + (header ? headerText + (headGap ? '\n\n' : '\n') : '');
  const target = (state.target ??= renderWhole(body));
  const out = join(chosen);
  if (renderWhole(out) === target) return head + out;
  const parts = original.slice();
  if (renderWhole(join(parts)) !== target) return t;
  // Changes that keep each block's render (with the body's definitions) but
  // not the body's (a block whose render depends on others — a footnote, two
  // constructs written next to each other): find them by rendering groups of
  // changes. The suspects — changed blocks that render differently in the
  // body than alone, and definitions — are tried last, so one of them costs a
  // few renders, not one per block. The budget is the call's, shared by its
  // passes; a change found to alter the render is remembered.
  const inBody = tokens;
  // Where block i's tokens end: the next block's first token.
  const tokenEnd: number[] = new Array(blocks.length);
  for (let i = blocks.length - 1, next = inBody.length; i >= 0; i--) {
    tokenEnd[i] = next;
    if (blocks[i].piece.token >= 0) next = blocks[i].piece.token;
  }
  const suspects: number[] = [];
  const others: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (chosen[i] === original[i]) continue;
    const tk = blocks[i].piece.token;
    const here = tk < 0 ? null : kitParser().renderer.render(inBody.slice(tk, tokenEnd[i]) as never, kitParser().options, env);
    (here === alone[i] ? others : suspects).push(i);
  }
  const tryGroup = (g: readonly number[]): void => {
    if (!g.length || state.budget <= 0) return;
    for (const i of g) parts[i] = chosen[i];
    state.budget--;
    if (renderWhole(join(parts)) === target) return;
    for (const i of g) parts[i] = original[i];
    if (g.length === 1) { state.failed.add(original[g[0]] + '\u0001' + chosen[g[0]]); return; }
    const half = g.length >> 1;
    tryGroup(g.slice(0, half));
    tryGroup(g.slice(half));
  };
  tryGroup(others);
  tryGroup(suspects);
  return head + join(parts);
}

/**
 * The canonical form of a text (see the module comment): the text with LF
 * line endings; a leading BOM kept; the header byte for byte, then one blank
 * line; top-level blocks separated by exactly one blank line, without
 * blank-line runs inside them; no trailing spaces except a two-space hard
 * break; paragraph lines without leading spaces; ATX headings `## Title` (a
 * one-line setext heading too); rules `---` (`***` right under a line of
 * text, where `---` would make a heading); bullets `-`; ordered markers
 * `1.`; emphasis `*a*` and `**a**` (never inside a reference label or a
 * footnote reference); tables `| a | b |` with `---` / `:---` /
 * `---:` / `:---:` delimiters; one final line break. Code, math, raw HTML and
 * directive blocks keep their bytes, and so do the lines the renderer does
 * not show (reference and footnote definitions). A change that would alter
 * the rendered HTML is not made, so
 * `render(body(canonicalize(x))) === render(body(x))`, and
 * `canonicalize(canonicalize(x)) === canonicalize(x)`. Time and memory are
 * linear in the text: at most 1 + 2 × MAX_PASSES + RETRY_RENDER_LIMIT = 81
 * whole-body renders per call.
 */
export function canonicalize(text: string, opts?: Kind | BlockOptions): string {
  const o: BlockOptions = typeof opts === 'string' ? { kind: opts } : (opts ?? {});
  const kind = resolveKind(text, o);
  const state: CallState = { budget: RETRY_RENDER_LIMIT, failed: new Set(), target: null, cache: new Map(), cacheKey: '' };
  let cur = text;
  // Each pass keeps the render; repeat until nothing changes, so the result is a fixed point (idempotence).
  for (let i = 0; i < MAX_PASSES; i++) {
    const next = canonicalOnce(cur, kind, state);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}
