"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UID_PATTERN = exports.WRITER_KEY = exports.KIND_HEADER_KEYS = exports.COMMON_HEADER_KEYS = void 0;
exports.readHeader = readHeader;
exports.editHeader = editHeader;
exports.setHeaderValue = setHeaderValue;
exports.removeHeaderKey = removeHeaderKey;
exports.lintHeader = lintHeader;
exports.readHeaderAndLint = readHeaderAndLint;
/**
 * The format-1 document header (FC-18 §5): reading, in-place editing (§9) and
 * lint.
 *
 * The header is located with the token-based scanner (`scanNymlBlocks`), run
 * on the leading header candidates only (cost O(header), not O(document)), so
 * a header-looking block inside code or a directive is never taken for it, and
 * its values are read with the same flat nyml reader that gives every block its
 * fields. Edits touch exactly the edited lines: the header is never
 * re-serialized, so unknown keys, host keys, comments-by-convention and
 * formatting survive.
 *
 * Browser-clean: no Node built-ins, no clock, no randomness.
 */
const nyml_blocks_js_1 = require("../nyml-blocks.js");
const nyml_body_js_1 = require("../nyml-body.js");
const text_js_1 = require("./text.js");
/** Keys every kind accepts (FC-18 §5.1). */
exports.COMMON_HEADER_KEYS = [
    'format', 'carrier', 'title', 'author', 'description', 'date', 'keywords', 'source',
    'license', 'license_name', 'license_url', 'uid', 'lang', 'theme',
];
/** Kind-specific keys (FC-18 §5.1), listed explicitly so lint catches misspellings. */
exports.KIND_HEADER_KEYS = {
    md: ['measure'],
    slides: ['ratio', 'footer', 'transition'],
    paged: [
        'template', 'page_size', 'margin_top', 'margin_bottom', 'margin_left', 'margin_right',
        'page_background', 'font_preset', 'font_family', 'font_heading_preset', 'font_margin_box_preset',
        'font_size', 'line_height', 'decoration_color', 'page_number_position', 'page_number_style',
        'page_number_start_page', 'first_page_skip_number', 'header_left', 'header_center', 'header_right',
        'header_rule', 'header_rule_color', 'header_font_size', 'footer_left', 'footer_center',
        'footer_right', 'footer_rule', 'footer_rule_color', 'footer_font_size', 'first_page_hide_header',
        'first_page_hide_footer', 'front_matter', 'front_matter_clean', 'limit_image_to_page',
        'keep_image_together', 'repeat_table_header', 'avoid_table_row_breaks', 'custom_css',
        'dynamic_choices',
    ],
};
/** The key grammar writers use (FC-18 §5). */
exports.WRITER_KEY = /^[a-z][a-z0-9_]*$/;
/** A valid `uid` (FC-18 §5.1, §10). */
exports.UID_PATTERN = /^doc-[0-9a-z]{10,32}$/;
const LINE_BREAK = /\r\n|\r|\n/;
const KEY_HEAD = /^([ \t]*)([A-Za-z0-9_]+)([ \t]*[:：])/;
function firstLineBreak(s) {
    const m = LINE_BREAK.exec(s);
    return m ? m[0] : null;
}
/** Remove up to `width` columns of leading whitespace (tabs to multiples of 4). */
function dropColumns(line, width) {
    let col = 0;
    let i = 0;
    while (i < line.length && col < width && (line[i] === ' ' || line[i] === '\t')) {
        col = line[i] === '\t' ? col + 4 - (col % 4) : col + 1;
        i++;
    }
    return line.slice(i);
}
/** 1-based line number of an offset (CR LF, CR and LF each end a line). */
function lineAt(text, offset) {
    let n = 1;
    for (let i = 0; i < offset && i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10))
            n++;
    }
    return n;
}
function layoutOf(text, block) {
    const close = block.end - 2;
    // Opener indentation: the columns before `{{nyml` on its line.
    let lineStart = block.start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n' && text[lineStart - 1] !== '\r')
        lineStart--;
    const openerIndent = (0, nyml_body_js_1.indentWidth)(text.slice(lineStart, block.start).replace(/^﻿/, ''));
    let bodyFrom = block.start + '{{nyml'.length;
    if (text[bodyFrom] === '[') {
        const br = text.indexOf(']', bodyFrom);
        if (br >= 0 && br < close)
            bodyFrom = br + 1;
    }
    const lines = [];
    let at = block.start;
    for (;;) {
        const rest = text.slice(at, block.end);
        const m = LINE_BREAK.exec(rest);
        if (!m) {
            lines.push({ start: at, end: block.end, next: block.end });
            break;
        }
        lines.push({ start: at, end: at + m.index, next: at + m.index + m[0].length });
        at = at + m.index + m[0].length;
    }
    const last = lines.length - 1;
    const regions = lines.map((l, k) => [k === 0 ? bodyFrom : l.start, k === last ? close : l.end]);
    const skipped = [];
    const bodyLines = regions.map(([from, to], k) => {
        const raw = text.slice(from, to);
        // The dispatcher skips the whitespace after `{{nyml` and reads later lines
        // relative to the opener's indentation; mirror it so positions map 1:1.
        const seen = k === 0 ? raw.replace(/^[ \t]+/, '') : dropColumns(raw, openerIndent);
        skipped.push(raw.length - seen.length);
        return seen;
    });
    const parsed = (0, nyml_body_js_1.parseNymlBody)(bodyLines.join('\n'));
    const entries = parsed.entries.map((e) => {
        const lineText = bodyLines[e.line];
        const head = KEY_HEAD.exec(lineText);
        const regionFrom = regions[e.line][0] + skipped[e.line];
        const keyStart = regionFrom + (head ? head[1].length : 0);
        const sepEnd = head ? regionFrom + head[0].length : keyStart;
        return { ...e, keyStart, sepEnd, valueEnd: regions[e.endLine][1], full: e.line > 0 && e.endLine < last };
    });
    const eol = firstLineBreak(text.slice(block.start, block.end)) ?? firstLineBreak(text.slice(0, Math.min(text.length, block.end + 4096))) ?? '\n';
    const indented = entries.find((e) => e.line > 0);
    const keyIndent = indented ? text.slice(lines[indented.line].start, indented.keyStart) : '';
    return { block, lines, regions, skipped, entries, fields: parsed.fields, eol, keyIndent, keyIndentWidth: (0, nyml_body_js_1.indentWidth)(keyIndent) };
}
/** A text can have a header only if it starts (after a BOM and whitespace) with `{{nyml`. */
const HEADER_START = /^﻿?[ \t\r\n]*\{\{nyml/;
const BETWEEN = /^[ \t\r\n]*$/;
function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
/** End (past `}}`) of the `{{nyml` candidate at `at`, as the dispatcher closes it; -1 if unclosed. */
function candidateEnd(text, at) {
    let from = at + 6;
    if (text[from] === '[') {
        let br = from + 1;
        while (br < text.length && text[br] !== ']' && text[br] !== '\n' && text[br] !== '\r')
            br++;
        if (text[br] === ']')
            from = br + 1;
    }
    const close = text.indexOf('}}', from);
    return close < 0 ? -1 : close + 2;
}
function locate(text) {
    const m = HEADER_START.exec(text);
    if (!m)
        return null;
    // Scan only the leading candidates (the header, or a legacy pair): the
    // scanner's verdict on a block at the start does not depend on what follows.
    const end1 = candidateEnd(text, m[0].length - 6);
    if (end1 < 0)
        return null;
    let prefixEnd = end1;
    let p = end1;
    while (p < text.length && (text[p] === ' ' || text[p] === '\t' || text[p] === '\r' || text[p] === '\n'))
        p++;
    if (text.startsWith('{{nyml', p)) {
        const end2 = candidateEnd(text, p);
        if (end2 >= 0)
            prefixEnd = end2;
    }
    const blocks = (0, nyml_blocks_js_1.scanNymlBlocks)(text.slice(0, prefixEnd));
    const first = blocks[0];
    if (!first || !/^﻿?[ \t\r\n]*$/.test(text.slice(0, first.start)))
        return null;
    if (first.kind !== 'document' && first.kind !== 'meta')
        return null;
    const second = blocks[1];
    const paired = second !== undefined &&
        ((first.kind === 'document' && second.kind === 'meta') || (first.kind === 'meta' && second.kind === 'document')) &&
        BETWEEN.test(text.slice(first.end, second.start));
    const used = paired ? [first, second] : [first];
    const layouts = used.map((b) => layoutOf(text, b));
    const fields = {};
    const keys = [];
    const add = (layout, overwrite) => {
        for (const e of layout.entries) {
            if (e.key === 'kind' || !own(layout.fields, e.key))
                continue;
            if (!own(fields, e.key)) {
                keys.push(e.key);
                fields[e.key] = layout.fields[e.key];
            }
            else if (overwrite)
                fields[e.key] = layout.fields[e.key];
        }
    };
    if (paired) {
        add(layouts.find((l) => l.block.kind === 'document'), true);
        add(layouts.find((l) => l.block.kind === 'meta'), false);
    }
    else {
        add(layouts[0], true);
    }
    const entries = [];
    let lineNo = 1;
    let counted = 0;
    for (const layout of layouts) {
        for (const e of layout.entries) {
            if (e.key === 'kind')
                continue;
            lineNo += lineAt(text.slice(counted, e.keyStart), e.keyStart - counted) - 1;
            counted = e.keyStart;
            let valueFrom = e.sepEnd;
            while (valueFrom < e.valueEnd && (text[valueFrom] === ' ' || text[valueFrom] === '\t'))
                valueFrom++;
            entries.push({ key: e.key, keyFrom: e.keyStart, valueFrom, to: e.valueEnd, line: lineNo });
        }
    }
    const header = {
        start: first.start,
        end: used[used.length - 1].end,
        fields,
        keys,
        entries,
        legacy: paired ? 'meta+document' : first.kind === 'meta' ? 'meta' : null,
        lineEnding: layouts[0].eol === '\r\n' ? '\r\n' : layouts[0].eol === '\r' ? '\r' : '\n',
        blocks: used.map((b) => ({ start: b.start, end: b.end, kind: b.kind })),
    };
    return { header, layouts };
}
/**
 * Read the document header of a text (FC-18 §5).
 *
 * The header is the first nyml block (found by the token-based
 * `scanNymlBlocks`) when only an optional BOM and whitespace precede it and its
 * kind is `document`. Legacy files: a leading `kind: meta` block is the header,
 * and a `kind: meta` and a `kind: document` block that lead the text together
 * (either order, only whitespace between) are ONE header whose document keys
 * win. Returns `null` for a text without a header (any plain Markdown file).
 * Cost: O(header) — the body is not parsed.
 */
function readHeader(text) {
    return locate(text)?.header ?? null;
}
// ── editing (FC-18 §9) ──────────────────────────────────────────────────────
/** The value text to write so the flat reader reads back exactly `value`. */
function encodeValue(value) {
    if (value === '')
        return '';
    const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0];
    return value !== value.trim() || quoted || value === '|' ? `"${value}"` : value;
}
function checkChange(key, change) {
    if (key === 'kind')
        throw new Error('orz header: the "kind" line cannot be edited');
    if (change === null) {
        if (!/^[A-Za-z0-9_]+$/.test(key))
            throw new Error(`orz header: "${key}" is not a nyml key`);
        return;
    }
    if (!exports.WRITER_KEY.test(key))
        throw new Error(`orz header: "${key}" is not a writable key (keys are [a-z][a-z0-9_]*)`);
    if (typeof change === 'string') {
        if (/[\r\n]/.test(change))
            throw new Error('orz header: a single-line value must not contain a line break (use { multiline })');
        if (change.includes('}}'))
            throw new Error('orz header: a value must not contain "}}" (it would end the header)');
        if (change.includes('\u0000'))
            throw new Error('orz header: a value must not contain U+0000');
        return;
    }
    if (!change || typeof change.multiline !== 'string')
        throw new Error('orz header: a change is a string, null or { multiline: string }');
    const v = change.multiline;
    if (v.includes('}}'))
        throw new Error('orz header: a value must not contain "}}" (it would end the header)');
    if (/[\r\u0000]/.test(v))
        throw new Error('orz header: a multi-line value uses LF line breaks and no U+0000');
    const lines = v.split('\n');
    if (lines.some((l) => l !== '' && l.trim() === ''))
        throw new Error('orz header: a multi-line value must not hold whitespace-only lines (they read back empty)');
    if (lines.length > 1 && lines[lines.length - 1] === '')
        throw new Error('orz header: a multi-line value must not end with an empty line (it would be dropped)');
    const firstContent = lines.find((l) => l !== '');
    if (firstContent !== undefined && /^[ \t]/.test(firstContent))
        throw new Error('orz header: the first line of a multi-line value must not be indented (the reader dedents by it)');
    if (lines.some((l) => /^[ \t]*\t/.test(l)))
        throw new Error('orz header: a multi-line value must not indent with tabs (the reader turns them into spaces)');
}
/** The text after the separator for a change (`' value'`, `''`, or `' |' + lines`). */
function valuePart(change, indent, eol) {
    if (typeof change === 'string') {
        const enc = encodeValue(change);
        return enc === '' ? '' : ` ${enc}`;
    }
    const lines = change.multiline.split('\n');
    if (change.multiline === '')
        return ' |';
    return ` |${lines.map((l) => eol + (l === '' ? '' : `${indent}  ${l}`)).join('')}`;
}
/**
 * Merge a legacy meta+document pair into one `kind: document` block: the
 * document block's lines first (its `kind` line dropped), then the meta
 * block's lines that the document block does not override — its other keys
 * with their nested lines, and its non-key lines (comments). Whitespace
 * between the blocks goes; everything outside the header is untouched.
 */
function mergePair(text, loc) {
    const doc = loc.layouts.find((l) => l.block.kind === 'document');
    const meta = loc.layouts.find((l) => l.block.kind === 'meta');
    const eol = doc.eol;
    const out = [];
    const lineText = (layout, k) => {
        const [from, to] = layout.regions[k];
        const raw = text.slice(from, to);
        return k === 0 ? raw.replace(/^[ \t]+/, '') : dropColumns(raw, layout.keyIndentWidth);
    };
    const owners = (layout) => {
        const m = new Map();
        for (const e of layout.entries)
            for (let k = e.line; k <= e.endLine; k++)
                m.set(k, e.key);
        return m;
    };
    const docKeys = new Set(doc.entries.map((e) => e.key));
    const copy = (layout, skip) => {
        const own = owners(layout);
        const last = layout.lines.length - 1;
        for (let k = 0; k <= last; k++) {
            if (skip(own.get(k)))
                continue;
            const t = lineText(layout, k);
            if ((k === 0 || k === last) && t.trim() === '')
                continue;
            out.push(t);
        }
    };
    copy(doc, (o) => o === 'kind');
    copy(meta, (o) => o === 'kind' || (o !== undefined && docKeys.has(o)));
    const merged = `{{nyml${eol}kind: document${eol}${out.map((l) => l + eol).join('')}}}`;
    return text.slice(0, loc.header.start) + merged + text.slice(loc.header.end);
}
/**
 * Locate the header for an edit, upgrading a legacy header first (the rule for
 * every editing tool, FC-18 §5/§9): a meta+document pair is merged into one
 * block; a lone `kind: meta` block has its kind line's value changed to
 * `document` (a one-line change).
 */
function locateForEdit(text) {
    const loc = locate(text);
    if (loc && loc.header.legacy === 'meta+document') {
        const merged = mergePair(text, loc);
        return { text: merged, loc: locate(merged) };
    }
    if (loc && loc.header.legacy === 'meta') {
        const kinds = loc.layouts[0].entries.filter((e) => e.key === 'kind');
        const kindEntry = kinds[kinds.length - 1];
        if (kindEntry) {
            const upgraded = text.slice(0, kindEntry.sepEnd) + ' document' + text.slice(kindEntry.valueEnd);
            const again = locate(upgraded);
            if (again && again.header.legacy === null)
                return { text: upgraded, loc: again };
        }
    }
    return { text, loc };
}
/**
 * Apply several header changes in one pass (FC-18 §9): `string` sets a
 * single-line value, `{ multiline }` writes a `key: |` value, `null` removes
 * the key. Changes apply in the object's key order (insertions too).
 *
 * - An existing key has only its value part replaced (indentation, key
 *   spelling and separator kept); with duplicates the last one (the one that
 *   wins) is edited; the replaced part includes the entry's nested and `|`
 *   lines. If the entry ends on the closing `}}` line, the header's line
 *   ending is written before `}}`.
 * - A new key is inserted just before the closing `}}` line with the
 *   indentation of the header's keys and the header's line ending.
 * - A removed key loses its line, its nested lines and every duplicate.
 * - A multi-line value is written as `key: |` and its lines, each indented by
 *   the key's indentation plus two spaces, in the header's line ending.
 * - A text without a header gets one at its start (after a BOM) for the sets.
 * - A legacy header is upgraded first (pair merged; lone meta → document).
 *
 * Throws (and changes nothing) for `kind`, a set key outside
 * `[a-z][a-z0-9_]*`, a value with `}}` or U+0000, a single-line value with a
 * line break, and a multi-line value that would not read back exactly (CR,
 * whitespace-only lines, a trailing empty line, an indented first line, tab
 * indentation). Every byte outside the edited entries is unchanged; removing
 * absent keys returns the text as is.
 */
function editHeader(text, changes) {
    const list = Object.keys(changes).map((k) => [k, changes[k]]);
    for (const [k, c] of list)
        checkChange(k, c);
    const before = locate(text);
    const effective = list.filter(([k, c]) => c !== null || (before !== null && own(before.header.fields, k)));
    if (effective.length === 0)
        return text;
    const { text: src, loc } = locateForEdit(text);
    const sets = effective.filter(([, c]) => c !== null);
    if (!loc) {
        if (!sets.length)
            return text;
        const eol = firstLineBreak(text) ?? '\n';
        const at = text.startsWith('﻿') ? 1 : 0;
        const body = sets.map(([k, c]) => `${k}:${valuePart(c, '', eol)}${eol}`).join('');
        return text.slice(0, at) + `{{nyml${eol}kind: document${eol}${body}}}${eol}${eol}` + text.slice(at);
    }
    const layout = loc.layouts[0];
    const last = layout.lines.length - 1;
    const ops = [];
    let inserts = '';
    for (const [key, change] of effective) {
        const hits = layout.entries.filter((e) => e.key === key);
        if (change === null) {
            for (const e of hits) {
                ops.push(e.full ? { from: layout.lines[e.line].start, to: layout.lines[e.endLine].next, insert: '' } : { from: e.keyStart, to: e.valueEnd, insert: '' });
            }
            continue;
        }
        const hit = hits[hits.length - 1];
        if (hit) {
            const indent = hit.line > 0 ? src.slice(layout.lines[hit.line].start, hit.keyStart) : layout.keyIndent;
            const onCloser = hit.endLine === last;
            ops.push({ from: hit.sepEnd, to: hit.valueEnd, insert: valuePart(change, indent, layout.eol) + (onCloser ? layout.eol : '') });
        }
        else {
            inserts += `${layout.keyIndent}${key}:${valuePart(change, layout.keyIndent, layout.eol)}${layout.eol}`;
        }
    }
    if (inserts) {
        if (last > 0)
            ops.push({ from: layout.lines[last].start, to: layout.lines[last].start, insert: inserts });
        else
            ops.push({ from: layout.block.end - 2, to: layout.block.end - 2, insert: layout.eol + inserts });
    }
    ops.sort((a, b) => b.from - a.from || b.to - a.to);
    let out = src;
    for (const op of ops)
        out = out.slice(0, op.from) + op.insert + out.slice(op.to);
    return out;
}
/**
 * Set one header value (FC-18 §9): `editHeader(text, { [key]: value })` — the
 * value's line is edited in place, or `key: value` is inserted before the
 * closing `}}` line, or a header is created; a legacy header is upgraded
 * first. Throws for a key outside `[a-z][a-z0-9_]*`, `kind`, and a value with
 * a line break (CR or LF), `}}` or U+0000. Values the reader would trim or
 * unquote are written quoted so they read back exactly.
 */
function setHeaderValue(text, key, value) {
    if (typeof value !== 'string')
        throw new Error('orz header: a value must be a string');
    return editHeader(text, { [key]: value });
}
/**
 * Remove a header key (FC-18 §9): `editHeader(text, { [key]: null })` — its
 * line goes with its nested and `|` lines and every duplicate. A text without
 * the key is returned as is. Throws for `kind`.
 */
function removeHeaderKey(text, key) {
    return editHeader(text, { [key]: null });
}
// ── lint ────────────────────────────────────────────────────────────────────
function isKindName(v) {
    return v === 'md' || v === 'slides' || v === 'paged';
}
const STRAY_HINT = /kind[ \t]*[:：][ \t]*["']?document/;
const FRONT_MATTER = /^﻿?(---|\+\+\+)[ \t]*(\r\n|\r|\n)/;
/**
 * Lint the header of a text. `kind` selects the key registry; without it the
 * header's `carrier` key does, and without that every kind's keys are known.
 * Findings that concern a line carry `line` (1-based), `from` and `to`.
 *
 * Header codes: `legacy-header` (warning), `kind-not-first` (warning),
 * `opener-not-alone` (warning: keys on the `{{nyml` line), `closer-not-alone`
 * (warning: a compact `key: value}}` closing line), `closer-in-value` (error:
 * the closing `}}` line holds other text that is not a key line — the
 * header ended inside a value — or text follows `}}`), `duplicate-key`
 * (warning), `key-grammar` (warning), `unknown-key` (warning), `host-key`
 * (warning), `bad-uid` (error), `bad-format` (error), `newer-format` (error),
 * `bad-carrier` (error), `carrier-mismatch` (warning), `bad-lang`, `bad-measure`,
 * `bad-ratio` (warnings: value shapes). Text codes, with or without a header:
 * `nul` (error), `lone-surrogate` (error), `mixed-eol` (warning),
 * `front-matter` (warning: a leading `---`/`+++` front matter, which a header
 * inserted by a tool would precede), `stray-document-block` (warning: a
 * `kind: document` block that is not the header; it renders nothing).
 */
function lintHeader(text, kind) {
    return lintLocated(text, locate(text), kind);
}
/**
 * The header and its lint in one scan (for `readDocument`). `blocks`, when
 * given, returns `scanNymlBlocks(text)` (so a caller that parses the text
 * anyway shares the parse).
 * @internal Not part of the `orz-markdown/carrier` API.
 */
function readHeaderAndLint(text, kind, blocks) {
    const loc = locate(text);
    return { header: loc ? loc.header : null, lint: lintLocated(text, loc, kind, blocks) };
}
function lintLocated(text, loc, kind, blocks) {
    const out = [];
    const at = (from, to) => ({ line: lineAt(text, from), from, to });
    if (text.includes('\u0000'))
        out.push({ level: 'error', code: 'nul', message: 'the text holds U+0000 (NUL), which format 1 cannot store' });
    if ((0, text_js_1.hasLoneSurrogate)(text))
        out.push({ level: 'error', code: 'lone-surrogate', message: 'the text holds a lone surrogate, which a UTF-8 file cannot represent' });
    if ((0, text_js_1.hasMixedEol)(text))
        out.push({ level: 'warning', code: 'mixed-eol', message: 'the text mixes line-ending styles; assembling stores them all in the style of the first line break' });
    const fm = FRONT_MATTER.exec(text);
    if (fm) {
        out.push({ level: 'warning', code: 'front-matter', message: `the text starts with ${fm[1]} front matter (Jekyll/Hugo); a header inserted by a tool goes before it, where those tools no longer see it`, ...at(fm.index, fm.index + fm[0].length) });
    }
    const headerEnd = loc ? loc.header.end : 0;
    if (STRAY_HINT.test(headerEnd ? text.slice(headerEnd) : text)) {
        const inHeader = new Set(loc ? loc.header.blocks.map((b) => b.start) : []);
        for (const b of blocks ? blocks() : (0, nyml_blocks_js_1.scanNymlBlocks)(text)) {
            if (b.kind === 'document' && !inHeader.has(b.start)) {
                out.push({ level: 'warning', code: 'stray-document-block', message: 'a kind: document block that is not the header (it does not lead the text); it renders nothing and is not read', ...at(b.start, b.end) });
            }
        }
    }
    if (!loc)
        return out;
    const { header } = loc;
    const fields = header.fields;
    if (header.legacy) {
        out.push({ level: 'warning', code: 'legacy-header', message: header.legacy === 'meta' ? 'legacy kind: meta block read as the header; the next header edit turns it into kind: document' : 'legacy kind: meta + kind: document pair read as one header; the next header edit merges them', ...at(header.start, header.end) });
    }
    for (const layout of loc.layouts) {
        const keyed = layout.entries;
        const last = layout.lines.length - 1;
        const bStart = layout.block.start;
        if (layout.block.kind === 'document' && keyed.length && keyed[0].key !== 'kind') {
            out.push({ level: 'warning', code: 'kind-not-first', message: 'the kind: document line should be the first key (renderers hide the block either way; other Markdown tools show the first lines)', ...at(bStart, bStart + 6) });
        }
        const [f0, t0] = layout.regions[0];
        if (text.slice(f0, t0).trim() !== '') {
            out.push({ level: 'warning', code: 'opener-not-alone', message: '{{nyml should stand alone on its line (keys start on the next line)', ...at(bStart, layout.lines[0].end) });
        }
        if (last > 0) {
            const [fl, tl] = layout.regions[last];
            if (text.slice(fl, tl).trim() !== '') {
                const keyOnCloser = keyed.some((e) => e.line === last);
                if (keyOnCloser) {
                    out.push({ level: 'warning', code: 'closer-not-alone', message: '}} should stand alone on its line', ...at(layout.lines[last].start, layout.block.end) });
                }
                else {
                    out.push({ level: 'error', code: 'closer-in-value', message: 'the header ends at a "}}" inside a value (the closing line holds other text): the rest of the header becomes body text; write "} }"', ...at(layout.lines[last].start, layout.block.end) });
                }
            }
        }
        let e = layout.block.end;
        while (e < text.length && (text[e] === ' ' || text[e] === '\t'))
            e++;
        if (e < text.length && text[e] !== '\n' && text[e] !== '\r') {
            out.push({ level: 'error', code: 'closer-in-value', message: 'text follows the closing "}}" on its line: a value probably contains "}}" (write "} }")', ...at(layout.block.end - 2, e) });
        }
        const seen = new Set();
        const reported = new Set();
        for (const en of keyed) {
            const pos = at(en.keyStart, en.valueEnd);
            if (seen.has(en.key) && !reported.has(en.key)) {
                reported.add(en.key);
                out.push({ level: 'warning', code: 'duplicate-key', key: en.key, message: `duplicate key "${en.key}": the last one wins`, ...pos });
            }
            seen.add(en.key);
            const sep = text.slice(en.sepEnd - 1, en.sepEnd);
            if (!exports.WRITER_KEY.test(en.key) || sep !== ':') {
                out.push({ level: 'warning', code: 'key-grammar', key: en.key, message: `key "${en.key}" should be [a-z][a-z0-9_]* followed by an ASCII ":"`, ...pos });
            }
        }
    }
    const effective = kind ?? (isKindName(fields['carrier']) ? fields['carrier'] : undefined);
    const known = new Set(exports.COMMON_HEADER_KEYS);
    for (const k of effective ? [effective] : ['md', 'slides', 'paged'])
        for (const key of exports.KIND_HEADER_KEYS[k])
            known.add(key);
    const posOf = (key) => {
        const hits = header.entries.filter((x) => x.key === key);
        const en = hits[hits.length - 1];
        return en ? { line: en.line, from: en.keyFrom, to: en.to } : {};
    };
    for (const key of header.keys) {
        if (key.startsWith('x_')) {
            if (!/^x_[a-z0-9]+_[a-z0-9_]+$/.test(key))
                out.push({ level: 'warning', code: 'host-key', key, message: `host key "${key}" should be shaped x_<name>_<key>`, ...posOf(key) });
        }
        else if (!known.has(key)) {
            out.push({ level: 'warning', code: 'unknown-key', key, message: `"${key}" is not a format-1 header key${effective ? ` for kind ${effective}` : ''} (kept untouched)`, ...posOf(key) });
        }
        if (fields[key].includes('}}'))
            out.push({ level: 'error', code: 'closer-in-value', key, message: `the value of "${key}" contains "}}"`, ...posOf(key) });
    }
    const check = (key, ok, level, code, message) => {
        if (own(fields, key) && !ok(fields[key]))
            out.push({ level, code, key, message, ...posOf(key) });
    };
    check('uid', (v) => exports.UID_PATTERN.test(v), 'error', 'bad-uid', 'uid must match doc-[0-9a-z]{10,32}');
    if (own(fields, 'format')) {
        const f = fields['format'];
        if (!/^[1-9][0-9]*$/.test(f))
            out.push({ level: 'error', code: 'bad-format', key: 'format', message: `format "${f}" is not a positive integer`, ...posOf('format') });
        else if (Number(f) > 1)
            out.push({ level: 'error', code: 'newer-format', key: 'format', message: `format ${f} is newer than this reader (format 1): open read-only`, ...posOf('format') });
    }
    if (own(fields, 'carrier')) {
        const c = fields['carrier'];
        if (!isKindName(c))
            out.push({ level: 'error', code: 'bad-carrier', key: 'carrier', message: `carrier "${c}" is not md, slides or paged`, ...posOf('carrier') });
        else if (kind && c !== kind)
            out.push({ level: 'warning', code: 'carrier-mismatch', key: 'carrier', message: `carrier "${c}" differs from the kind "${kind}"`, ...posOf('carrier') });
    }
    check('lang', (v) => /^(?:[A-Za-z]{2,8}|[xXiI])(?:-[A-Za-z0-9]{1,8})*$/.test(v), 'warning', 'bad-lang', 'lang should be a BCP 47 language tag (e.g. en, zh-Hans, pt-BR)');
    check('measure', (v) => v === 'normal' || v === 'wide' || v === 'full', 'warning', 'bad-measure', 'measure is normal, wide or full');
    check('ratio', (v) => /^[1-9][0-9]*(?:\.[0-9]+)?:[1-9][0-9]*(?:\.[0-9]+)?$/.test(v), 'warning', 'bad-ratio', 'ratio is W:H (e.g. 16:9, 4:3)');
    return out;
}
//# sourceMappingURL=header.js.map