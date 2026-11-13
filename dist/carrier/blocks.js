"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockFingerprint = blockFingerprint;
exports.splitBlocks = splitBlocks;
exports.canonicalize = canonicalize;
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
const parser_js_1 = require("./parser.js");
const header_js_1 = require("./header.js");
const document_js_1 = require("./document.js");
const nyml_body_js_1 = require("../nyml-body.js");
const sha256_js_1 = require("./sha256.js");
const attrs_js_1 = require("../plugins/attrs.js");
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
const SLIDE_ID = /(?:^|\s)id=(["']?)(blk-[a-z0-9]{8,})\1(?=\s|-->|$)/;
function isKind(v) {
    return v === 'md' || v === 'slides' || v === 'paged';
}
function resolveKind(text, opts) {
    const named = opts.kind ?? (opts.filename ? (0, document_js_1.kindFromFilename)(opts.filename) : null);
    if (named)
        return named;
    const header = (0, header_js_1.readHeader)(text);
    const carrier = header && Object.prototype.hasOwnProperty.call(header.fields, 'carrier') ? header.fields['carrier'] : undefined;
    return isKind(carrier) ? carrier : 'md';
}
/** Offsets where each line starts; a line ends at LF, CR LF or CR (as the parser reads it). */
function lineStarts(s) {
    const out = [0];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 10)
            out.push(i + 1);
        else if (c === 13) {
            if (s.charCodeAt(i + 1) === 10)
                i++;
            out.push(i + 1);
        }
    }
    return out;
}
function isBlankRange(s, from, to) {
    for (let i = from; i < to; i++) {
        const c = s.charCodeAt(i);
        if (c !== 32 && c !== 9 && c !== 10 && c !== 13)
            return false;
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
function blockFingerprint(blockText) {
    const s = blockText.replace(/\r\n?/g, '\n');
    // Leading blank lines: up to the line break before the first non-blank character.
    let from = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 10)
            from = i + 1;
        else if (c !== 32 && c !== 9)
            break;
    }
    // Trailing blank lines: from the last line break after the last non-blank character.
    let to = s.length;
    for (let i = s.length - 1; i >= from; i--) {
        const c = s.charCodeAt(i);
        if (c === 10)
            to = i;
        else if (c !== 32 && c !== 9)
            break;
    }
    // Trailing blank lines inside a verbatim token (it swallowed them: unclosed) are content.
    if (s.length - to > 1 && MAY_SWALLOW.test(s)) {
        let end = 0;
        for (const t of (0, parser_js_1.kitParser)().parse(s, {}))
            if (t.map && VERBATIM_TOKENS.has(t.type) && t.map[1] > end)
                end = t.map[1];
        if (end > 0) {
            let line = 0;
            let keep = s.length;
            for (let i = 0; i < s.length; i++)
                if (s.charCodeAt(i) === 10 && ++line === end) {
                    keep = i;
                    break;
                }
            to = Math.max(to, keep);
        }
    }
    return (0, sha256_js_1.sha256)(s.slice(from, Math.max(from, to))).slice(0, 16);
}
/**
 * A heading's FC-02 id: its final `id` attribute when that is a well-formed
 * block id AND an explicit `{{attrs[…]}}` marker in its source sets it (a
 * slug such as `# blk-abcdefgh1` is not a block id).
 */
function headingId(open, inline) {
    let id = null;
    for (const [k, v] of open.attrs ?? [])
        if (k === 'id')
            id = v;
    if (id === null || !BLOCK_ID.test(id) || !inline || inline.type !== 'inline' || !inline.content.includes('{{attrs['))
        return null;
    for (const m of inline.content.matchAll(ATTRS_MARKER))
        for (const [k, v] of (0, attrs_js_1.parseAttrs)(m[1]))
            if (k === 'id' && v === id)
                return id;
    return null;
}
/** A slide marker's `id=blk-…` option (closed markers only), else null. */
function slideId(content) {
    return SLIDE_ID.exec(content.slice(0, content.indexOf('-->') >>> 0))?.[2] ?? null;
}
/** The top-level constructs of a parsed body, in line order. */
function pieces(tokens, bodyLines, isBlankLine, isDefinitionLine, isCloserLine, kind) {
    const out = [];
    const covered = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.level !== 0 || t.nesting === -1 || !t.map || !t.block)
            continue;
        // A container's map stops before its closing `:::`: the closer goes with it.
        const closed = t.type.startsWith('container_') && t.map[1] < bodyLines && isCloserLine(t.map[1]);
        covered.push([t.map[0], t.map[1] + (closed ? 1 : 0)]);
        const p = { line: t.map[0], type: 'other', id: null, token: i };
        switch (t.type) {
            case 'heading_open':
                p.type = 'heading';
                p.level = Number(t.tag.slice(1)) || 1;
                p.id = headingId(t, tokens[i + 1]);
                break;
            case 'paragraph_open':
                p.type = 'paragraph';
                break;
            case 'bullet_list_open':
            case 'ordered_list_open':
                p.type = 'list';
                break;
            case 'table_open':
                p.type = 'table';
                break;
            case 'blockquote_open':
                p.type = 'blockquote';
                break;
            case 'hr':
                p.type = 'rule';
                break;
            case 'math_block':
                p.type = 'math';
                break;
            case 'code_block':
                p.type = 'code';
                break;
            case 'fence': {
                p.type = 'code';
                const lang = t.info.trim().split(/\s+/)[0];
                if (lang)
                    p.name = lang;
                break;
            }
            case 'html_block': {
                p.type = 'html';
                if (kind === 'slides') {
                    if (SLIDE_MARKER.test(t.content)) {
                        p.type = 'marker';
                        p.name = 'slide';
                        p.id = slideId(t.content);
                    }
                    else {
                        const r = REGION_MARKER.exec(t.content);
                        if (r) {
                            p.type = 'marker';
                            p.name = r[1];
                        }
                    }
                }
                break;
            }
            case 'plugin_block': {
                p.type = 'directive';
                p.name = t.info;
                if (kind === 'paged' && t.info === 'nyml') {
                    const raw = t.meta?.rawBody;
                    const k = (0, nyml_body_js_1.parseNymlBody)(raw ?? t.content ?? '').kind;
                    if (k && k !== 'document' && k !== 'meta') {
                        p.type = 'element';
                        p.name = k;
                    }
                }
                break;
            }
            default: {
                const m = /^container_(.+)_open$/.exec(t.type);
                if (m) {
                    p.type = 'container';
                    p.name = m[1];
                }
                else
                    p.name = t.type.replace(/_open$/, '');
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
        while (c < covered.length && covered[c][1] <= at)
            c++;
        if (c < covered.length && covered[c][0] <= at) {
            at = covered[c][1];
            prevBlank = true;
            continue;
        }
        const blank = isBlankLine(at);
        if (!blank && prevBlank && isDefinitionLine(at))
            out.push({ line: at, type: 'definition', id: null, token: -1 });
        prevBlank = blank;
        at++;
    }
    out.sort((a, b) => a.line - b.line);
    return out.filter((p, i) => i === 0 || p.line !== out[i - 1].line);
}
/** The header's end and the parsed body of a text. */
function parseBody(text, kind) {
    const header = (0, header_js_1.readHeader)(text);
    const offset = header ? header.end : 0;
    const body = text.slice(offset);
    const starts = lineStarts(body);
    const lineEnd = (l) => (l + 1 < starts.length ? starts[l + 1] : body.length);
    const tokens = (0, parser_js_1.kitParser)().parse(body, {});
    const lineText = (l) => body.slice(starts[l], lineEnd(l)).replace(/\r?\n$|\r$/, '');
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
function splitBlocks(text, opts) {
    const o = typeof opts === 'string' ? { kind: opts } : (opts ?? {});
    const kind = resolveKind(text, o);
    const unit = o.unit ?? (kind === 'slides' ? 'section' : 'block');
    const depth = Math.min(6, Math.max(1, Math.floor(o.depth ?? 2)));
    if (text === '')
        return [];
    const { header, offset, starts, tokens, pieces: list } = parseBody(text, kind);
    const raw = [];
    for (const p of list) {
        const blk = { type: p.type, id: p.id, start: offset + starts[p.line] };
        if (p.name !== undefined)
            blk.name = p.name;
        if (p.level !== undefined)
            blk.level = p.level;
        raw.push(blk);
    }
    // The header (with the rest of its line and the blank lines after it) is the first block; without one the first block starts at 0.
    if (header)
        raw.unshift({ type: 'header', id: null, start: 0 });
    else if (raw.length)
        raw[0].start = 0;
    if (!raw.length)
        raw.push({ type: 'blank', id: null, start: 0 });
    let groups = raw;
    if (unit === 'section') {
        groups = [];
        const opens = (b) => kind === 'slides' ? b.type === 'marker' && b.name === 'slide' : b.type === 'heading' && (b.level ?? 1) <= depth;
        for (const b of raw) {
            const cur = groups[groups.length - 1];
            if (b.type === 'header')
                groups.push(b);
            else if (opens(b))
                groups.push({ type: kind === 'slides' ? 'slide' : 'section', id: b.id, start: b.start });
            else if (!cur || cur.type === 'header')
                groups.push({ type: 'preamble', id: null, start: b.start });
            else if (cur.type === 'slide' && cur.id === null && b.id !== null && b.type === 'heading')
                cur.id = b.id;
        }
    }
    const allStarts = lineStarts(text);
    const lineOf = (off) => {
        let lo = 0, hi = allStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (allStarts[mid] <= off)
                lo = mid;
            else
                hi = mid - 1;
        }
        return lo + 1;
    };
    // Every FC-02 id the text carries (headings at any depth, top-level slide markers): a block whose id is carried twice is `duplicate`.
    const carried = new Map();
    const count = (id) => { if (id !== null)
        carried.set(id, (carried.get(id) ?? 0) + 1); };
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'heading_open')
            count(headingId(t, tokens[i + 1]));
        else if (kind === 'slides' && t.type === 'html_block' && t.level === 0 && SLIDE_MARKER.test(t.content))
            count(slideId(t.content));
    }
    return groups.map((g, i) => {
        const end = i + 1 < groups.length ? groups[i + 1].start : text.length;
        const out = { type: g.type, id: g.id, start: g.start, end, line: lineOf(g.start), fingerprint: blockFingerprint(text.slice(g.start, end)) };
        if (g.name !== undefined)
            out.name = g.name;
        if (g.id !== null && (carried.get(g.id) ?? 0) > 1)
            out.duplicate = true;
        return out;
    });
}
// ── canonical form ──────────────────────────────────────────────────────────
/**
 * When a body's block-by-block changes do not add up, at most this many
 * whole-body renders look for the changes that do (groups halved until the
 * ones that alter the render are found); a change still unchecked then is
 * not made.
 */
const RETRY_RENDER_LIMIT = 64;
/** Renders of single blocks, cached for the call (block-sized keys; whole bodies are never cached). */
function blockRenderer() {
    const cache = new Map();
    return (src) => {
        let html = cache.get(src);
        if (html === undefined) {
            html = (0, parser_js_1.kitParser)().render(src, {});
            cache.set(src, html);
        }
        return html;
    };
}
const renderWhole = (src) => (0, parser_js_1.kitParser)().render(src, {});
const isBlank = (s) => /^[ \t]*$/.test(s);
/** Trailing spaces/tabs of a line: two or more spaces on a line whose inline text continues (a hard break) become two; any other run goes. */
function trimEnd(line, hardBreak) {
    let i = line.length;
    while (i > 0 && (line.charCodeAt(i - 1) === 32 || line.charCodeAt(i - 1) === 9))
        i--;
    if (i === line.length)
        return line;
    const tail = line.slice(i);
    return hardBreak && tail.length >= 2 && !tail.includes('\t') ? line.slice(0, i) + '  ' : line.slice(0, i);
}
function lineFacts(tokens, n) {
    const verbatim = new Uint8Array(n);
    const paragraph = new Uint8Array(n);
    const continues = new Uint8Array(n);
    const shown = new Uint8Array(n);
    const visit = (t) => {
        if (!t.map)
            return;
        const [a, b] = t.map;
        if (t.type === 'inline')
            for (let l = a; l < b - 1 && l < n; l++)
                continues[l] = 1;
        if (t.type === 'inline' || t.type === 'table_open' || t.type === 'hr' || t.type === 'heading_open')
            for (let l = a; l < b && l < n; l++)
                shown[l] = 1;
        if (t.type === 'fence' || t.type === 'code_block' || t.type === 'html_block' || t.type === 'math_block' || t.type === 'plugin_block') {
            for (let l = a; l < b && l < n; l++)
                verbatim[l] = 1;
        }
        else if (t.type === 'paragraph_open' && t.level === 0) {
            for (let l = a; l < b && l < n; l++)
                paragraph[l] = 1;
        }
    };
    for (const t of tokens)
        visit(t);
    return { verbatim, paragraph, continues, shown };
}
/**
 * Mask the spans of a line where `_` is never an emphasis marker (code spans,
 * `$…$`, `{{…}}`, `<…>`, `](…)`, escapes). Linear: a closer that is not found
 * once is never searched for again.
 */
function maskedLine(line) {
    const m = line.split('');
    const blank = (from, to) => { for (let k = from; k < to && k < m.length; k++)
        m[k] = '\u0000'; };
    const missing = new Set();
    const find = (what, from) => {
        if (missing.has(what))
            return -1;
        const at = line.indexOf(what, from);
        if (at < 0)
            missing.add(what);
        return at;
    };
    // The line's maximal backtick runs, their starts by length (ascending), and a cursor per length: each run is passed once.
    const runs = new Map();
    for (let k = line.indexOf('`'); k >= 0;) {
        let e = k;
        while (line[e] === '`')
            e++;
        const list = runs.get(e - k);
        if (list)
            list.push(k);
        else
            runs.set(e - k, [k]);
        k = line.indexOf('`', e);
    }
    const cursor = new Map();
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        if (c === '\\') {
            blank(i, i + 2);
            i += 2;
            continue;
        }
        if (c === '`') {
            let n = 0;
            while (line[i + n] === '`')
                n++;
            // The closing run: the next maximal run of exactly n backticks.
            const list = runs.get(n) ?? [];
            let k = cursor.get(n) ?? 0;
            while (k < list.length && list[k] < i + n)
                k++;
            cursor.set(n, k);
            const close = k < list.length ? list[k] : -1;
            if (close < 0) {
                i += n;
                continue;
            }
            blank(i, close + n);
            i = close + n;
            continue;
        }
        const close = c === '$' ? find('$', i + 1) : c === '<' ? find('>', i + 1) : c === '{' && line[i + 1] === '{' ? find('}}', i + 2) : c === ']' && line[i + 1] === '(' ? find(')', i + 2) : -1;
        if (close >= 0) {
            const to = c === '{' ? close + 2 : close + 1;
            blank(i, to);
            i = to;
            continue;
        }
        i++;
    }
    return m.join('');
}
const WORD = /[\p{L}\p{N}]/u;
/** The code point before offset `i` (a surrogate pair read whole), or ''. */
function before(s, i) {
    if (i <= 0)
        return '';
    const lo = s.charCodeAt(i - 1);
    return lo >= 0xdc00 && lo <= 0xdfff && i >= 2 ? s.slice(i - 2, i) : s[i - 1];
}
/** The code point at offset `i`, or ''. */
function at(s, i) {
    if (i >= s.length)
        return '';
    const cp = s.codePointAt(i);
    return String.fromCodePoint(cp);
}
/**
 * `_a_` → `*a*`, `__a__` → `**a**` outside code, math, directives, tags and
 * link targets. Runs of one or two `_` that can open (next character not
 * blank, previous not a letter, digit, `_` or `\`) and close (the mirror)
 * are paired innermost-first, as a delimiter stack: linear in the line.
 */
function starEmphasis(line) {
    if (!line.includes('_'))
        return line;
    const masked = maskedLine(line);
    const out = line.split('');
    const stacks = { 1: [], 2: [] };
    let i = 0;
    while (i < masked.length) {
        if (masked[i] !== '_') {
            i++;
            continue;
        }
        let e = i;
        while (masked[e] === '_')
            e++;
        const d = e - i;
        const prev = before(masked, i);
        const next = at(masked, e);
        const blankish = (ch) => ch === '' || /\s/.test(ch) || ch === '\u0000';
        const canOpen = d <= 2 && !blankish(next) && !(prev !== '' && (WORD.test(prev) || prev === '\\'));
        const canClose = d <= 2 && !blankish(prev) && prev !== '\\' && !(next !== '' && WORD.test(next));
        const stack = d <= 2 ? stacks[d] : null;
        if (stack && canClose && stack.length) {
            const open = stack.pop();
            // Openers inside the pair are unmatched now.
            const other = stacks[d === 1 ? 2 : 1];
            while (other.length && other[other.length - 1] > open)
                other.pop();
            for (let k = 0; k < d; k++) {
                out[open + k] = '*';
                out[i + k] = '*';
            }
        }
        else if (stack && canOpen)
            stack.push(i);
        i = e;
    }
    return out.join('');
}
/** Split a table row on its unescaped pipes (as the parser does), outer pipes dropped. */
function tableCells(line) {
    const s = line.trim();
    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '|' && s[i - 1] !== '\\') {
            cells.push(cur);
            cur = '';
        }
        else
            cur += s[i];
    }
    cells.push(cur);
    if (cells.length && cells[0].trim() === '')
        cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === '')
        cells.pop();
    return cells.length ? cells.map((c) => c.trim()) : null;
}
function tableRow(line, delimiter) {
    const cells = tableCells(line);
    if (!cells)
        return line;
    if (delimiter) {
        if (!cells.every((c) => /^:?-+:?$/.test(c)))
            return line;
        return '| ' + cells.map((c) => (c.startsWith(':') ? ':' : '') + '---' + (c.endsWith(':') && c.length > 1 ? ':' : '')).join(' | ') + ' |';
    }
    return '| ' + cells.join(' | ') + ' |';
}
function stages(tokens, facts) {
    const tokensIn = (blk) => {
        const out = [];
        for (let i = Math.max(0, blk.piece.token); i < tokens.length; i++) {
            const t = tokens[i];
            if (t.map && t.map[0] >= blk.to)
                break;
            if (t.map && t.map[0] >= blk.from)
                out.push(t);
            if (blk.piece.token < 0)
                break;
        }
        return out;
    };
    // 1. whitespace: blank lines empty, trailing spaces of shown lines (hard breaks kept as two), a paragraph's leading spaces.
    const whitespace = (w, blk) => {
        for (let l = blk.from; l < blk.to; l++) {
            const k = l - blk.from;
            if (facts.verbatim[l])
                continue;
            if (isBlank(w[k])) {
                w[k] = '';
                continue;
            }
            if (!facts.shown[l])
                continue;
            let s = trimEnd(w[k], facts.continues[l] === 1);
            if (facts.paragraph[l])
                s = s.replace(/^[ \t]+/, '');
            w[k] = s;
        }
    };
    // 2. markers: ATX headings `# text` (single-line setext too), rules `---`.
    const markers = (w, blk) => {
        const p = blk.piece;
        if (p.type === 'heading') {
            const open = tokens[p.token];
            const inline = tokens[p.token + 1];
            if (!open.map || !inline || inline.type !== 'inline')
                return;
            const [a, b] = open.map;
            const content = inline.content;
            if (content.includes('\n'))
                return;
            const atx = '#'.repeat(p.level ?? 1) + (content ? ' ' + content : '');
            if (open.markup.startsWith('#') && b - a === 1)
                w[a - blk.from] = atx;
            else if ((open.markup === '=' || open.markup === '-') && b - a === 2) {
                w[a - blk.from] = atx;
                w[a + 1 - blk.from] = '\u0000';
            }
        }
        else if (p.type === 'rule') {
            w[0] = '---';
        }
    };
    // 3. list markers: `*` `+` → `-`, `1)` → `1.`.
    const lists = (w, blk) => {
        if ((blk.piece.type !== 'list' && blk.piece.type !== 'blockquote' && blk.piece.type !== 'container') || blk.besideList)
            return;
        const items = tokensIn(blk).filter((t) => t.type === 'list_item_open' && t.map);
        const perLine = new Map();
        for (const t of items)
            perLine.set(t.map[0], (perLine.get(t.map[0]) ?? 0) + 1);
        for (const t of items) {
            const l = t.map[0];
            if (perLine.get(l) !== 1 || facts.verbatim[l] || l >= blk.to)
                continue;
            const k = l - blk.from;
            const line = w[k];
            const pre = /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(line)[0].length;
            if (t.markup === '*' || t.markup === '+') {
                if (line[pre] === t.markup)
                    w[k] = line.slice(0, pre) + '-' + line.slice(pre + 1);
            }
            else if (t.markup === ')') {
                const m = /^[0-9]{1,9}\)/.exec(line.slice(pre));
                if (m)
                    w[k] = line.slice(0, pre + m[0].length - 1) + '.' + line.slice(pre + m[0].length);
            }
        }
    };
    // 4. emphasis markers: `_` → `*`, on shown lines only.
    const emphasis = (w, blk) => {
        const t = blk.piece.type;
        if (t !== 'paragraph' && t !== 'heading' && t !== 'list' && t !== 'blockquote' && t !== 'table' && t !== 'container')
            return;
        for (let l = blk.from; l < blk.to; l++)
            if (!facts.verbatim[l] && facts.shown[l])
                w[l - blk.from] = starEmphasis(w[l - blk.from]);
    };
    // 5. table padding: `| a | b |`, delimiter cells `---` / `:---` / `---:` / `:---:`.
    const tables = (w, blk) => {
        if (blk.piece.type !== 'table')
            return;
        const open = tokens[blk.piece.token];
        if (!open.map)
            return;
        const [a, b] = open.map;
        for (let l = a; l < b && l < blk.to; l++)
            if (!isBlank(w[l - blk.from]))
                w[l - blk.from] = tableRow(w[l - blk.from], l === a + 1);
    };
    return [whitespace, markers, lists, emphasis, tables];
}
/** A block's lines (its window `w`) as text: its blank edges (outside code) left out, `\u0000` (a removed line) dropped. */
function blockText(w, blk, facts) {
    const o = blk.from;
    let a = blk.from;
    let b = blk.to;
    while (a < b && !facts.verbatim[a] && isBlank(w[a - o]))
        a++;
    while (b > a && !facts.verbatim[b - 1] && isBlank(w[b - 1 - o]))
        b--;
    const out = [];
    for (let l = a; l < b; l++) {
        const s = w[l - o];
        if (s === '\u0000')
            continue;
        // Runs of blank lines inside a block (outside code) become one.
        if (!facts.verbatim[l] && s === '' && out.length && out[out.length - 1] === '' && !facts.verbatim[l - 1])
            continue;
        out.push(s);
    }
    return out.join('\n');
}
function canonicalOnce(text, kind, render) {
    const t = text.replace(/\r\n?/g, '\n');
    // A BOM goes back in front: the parser drops a leading BOM, so it never changes the render.
    const bom = t.charCodeAt(0) === 0xfeff ? '\uFEFF' : '';
    const u = t.slice(bom.length);
    const header = (0, header_js_1.readHeader)(u);
    const headerText = header ? u.slice(0, header.end) : '';
    const body = u.slice(header ? header.end : 0);
    const lines = body.split('\n');
    // Text after the header's `}}` on its line: keep the text as it is (lint `closer-in-value` / `closer-not-alone`).
    if (header && !isBlank(lines[0]))
        return t;
    const tokens = (0, parser_js_1.kitParser)().parse(body, {});
    const list = pieces(tokens, lines.length, (l) => isBlank(lines[l]), (l) => DEFINITION.test(lines[l]), (l) => CONTAINER_CLOSER.test(lines[l]), kind);
    if (!list.length)
        return header ? bom + headerText + '\n' : bom;
    const facts = lineFacts(tokens, lines.length);
    const blocks = list.map((p, i) => ({
        from: p.line,
        to: i + 1 < list.length ? list[i + 1].line : lines.length,
        piece: p,
        besideList: p.type === 'list' && (list[i - 1]?.type === 'list' || list[i + 1]?.type === 'list'),
    }));
    const all = stages(tokens, facts);
    const original = [];
    const chosen = [];
    /** Each block's render alone (the original text). */
    const alone = [];
    for (const blk of blocks) {
        const own = lines.slice(blk.from, blk.to);
        const before = blockText(own, blk, facts);
        original.push(before);
        const target = render(before + '\n');
        alone.push(target);
        // All stages at once; when that changes the render, stage by stage, keeping each that does not.
        const work = own.slice();
        for (const stage of all)
            stage(work, blk);
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
        chosen.push(best);
    }
    // Blocks keep their adjacency: written one after the other when no blank line
    // separated them (slides' `<!-- slide -->` above its content, a heading
    // above its paragraph), otherwise with exactly one blank line between them.
    const gap = blocks.map((blk) => {
        let b = blk.to;
        while (b > blk.from && !facts.verbatim[b - 1] && isBlank(lines[b - 1]))
            b--;
        return b < blk.to;
    });
    const headGap = list[0].line > 1;
    const join = (parts) => {
        const out = [];
        for (let i = 0; i < parts.length; i++)
            out.push(parts[i], i + 1 === parts.length ? '\n' : gap[i] ? '\n\n' : '\n');
        return out.join('');
    };
    const head = bom + (header ? headerText + (headGap ? '\n\n' : '\n') : '');
    const target = renderWhole(body);
    const out = join(chosen);
    if (renderWhole(out) === target)
        return head + out;
    const parts = original.slice();
    if (renderWhole(join(parts)) !== target)
        return t;
    // Changes that keep each block's render but not the body's (a block whose
    // render depends on others — a reference, a footnote, a heading slug, two
    // lists that would join): find them by rendering groups of changes. The
    // suspects — changed blocks that render differently in the body than
    // alone, and definitions — are tried last, so one of them costs a few
    // renders, not one per block.
    const env = {};
    const inBody = (0, parser_js_1.kitParser)().parse(body, env);
    // Where block i's tokens end: the next block's first token.
    const tokenEnd = new Array(blocks.length);
    for (let i = blocks.length - 1, next = inBody.length; i >= 0; i--) {
        tokenEnd[i] = next;
        if (blocks[i].piece.token >= 0)
            next = blocks[i].piece.token;
    }
    const suspects = [];
    const others = [];
    for (let i = 0; i < blocks.length; i++) {
        if (chosen[i] === original[i])
            continue;
        const tk = blocks[i].piece.token;
        const here = tk < 0 ? null : (0, parser_js_1.kitParser)().renderer.render(inBody.slice(tk, tokenEnd[i]), (0, parser_js_1.kitParser)().options, env);
        (here === alone[i] ? others : suspects).push(i);
    }
    let budget = RETRY_RENDER_LIMIT;
    const tryGroup = (g) => {
        if (!g.length || budget <= 0)
            return;
        for (const i of g)
            parts[i] = chosen[i];
        budget--;
        if (renderWhole(join(parts)) === target)
            return;
        for (const i of g)
            parts[i] = original[i];
        if (g.length === 1)
            return;
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
 * one-line setext heading too); rules `---`; bullets `-`; ordered markers
 * `1.`; emphasis `*a*` and `**a**`; tables `| a | b |` with `---` / `:---` /
 * `---:` / `:---:` delimiters; one final line break. Code, math, raw HTML and
 * directive blocks keep their bytes, and so do the lines the renderer does
 * not show (reference and footnote definitions). A change that would alter
 * the rendered HTML is not made, so
 * `render(body(canonicalize(x))) === render(body(x))`, and
 * `canonicalize(canonicalize(x)) === canonicalize(x)`. Time and memory are
 * linear in the text.
 */
function canonicalize(text, opts) {
    const o = typeof opts === 'string' ? { kind: opts } : (opts ?? {});
    const kind = resolveKind(text, o);
    const render = blockRenderer();
    let cur = text;
    // Each pass keeps the render; repeat until nothing changes, so the result is a fixed point (idempotence).
    for (let i = 0; i < 8; i++) {
        const next = canonicalOnce(cur, kind, render);
        if (next === cur)
            return cur;
        cur = next;
    }
    return cur;
}
//# sourceMappingURL=blocks.js.map