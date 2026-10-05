"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UID_PATTERN = exports.WRITER_KEY = exports.KIND_HEADER_KEYS = exports.COMMON_HEADER_KEYS = void 0;
exports.readHeader = readHeader;
exports.setHeaderValue = setHeaderValue;
exports.removeHeaderKey = removeHeaderKey;
exports.lintHeader = lintHeader;
exports.readHeaderAndLint = readHeaderAndLint;
/**
 * The format-1 document header (FC-18 §5): reading, in-place editing (§9) and
 * lint.
 *
 * The header is located with the token-based scanner (`scanNymlBlocks`), so a
 * header-looking block inside code or a directive is never taken for it, and
 * its values are read with the same flat nyml reader that gives every block
 * its fields. Edits touch exactly one line: the header is never re-serialized,
 * so unknown keys, host keys, comments-by-convention and formatting survive.
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
const KEY_HEAD = /^([ \t]*)([A-Za-z0-9_]+)([ \t]*[:\uFF1A])/;
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
function layoutOf(text, block) {
    const close = block.end - 2;
    // Opener indentation: the columns before `{{nyml` on its line.
    let lineStart = block.start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n' && text[lineStart - 1] !== '\r')
        lineStart--;
    const openerIndent = (0, nyml_body_js_1.indentWidth)(text.slice(lineStart, block.start).replace(/^\uFEFF/, ''));
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
        return {
            ...e,
            keyStart,
            sepEnd,
            valueEnd: regions[e.endLine][1],
            full: e.line > 0 && e.endLine < last,
        };
    });
    const eol = firstLineBreak(text.slice(block.start, block.end)) ?? firstLineBreak(text) ?? '\n';
    const indented = entries.find((e) => e.line > 0);
    const keyIndent = indented ? text.slice(lines[indented.line].start, indented.keyStart) : '';
    return { block, lines, regions, skipped, entries, fields: parsed.fields, eol, keyIndent, keyIndentWidth: (0, nyml_body_js_1.indentWidth)(keyIndent) };
}
const LEADING = /^\uFEFF?[ \t\r\n]*$/;
const BETWEEN = /^[ \t\r\n]*$/;
function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
function locate(text) {
    if (text.indexOf('{{nyml') < 0)
        return null;
    const blocks = (0, nyml_blocks_js_1.scanNymlBlocks)(text);
    const first = blocks[0];
    if (!first || !LEADING.test(text.slice(0, first.start)))
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
        const doc = layouts.find((l) => l.block.kind === 'document');
        const meta = layouts.find((l) => l.block.kind === 'meta');
        add(doc, true);
        add(meta, false);
    }
    else {
        add(layouts[0], true);
    }
    const header = {
        start: first.start,
        end: used[used.length - 1].end,
        fields,
        keys,
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
 */
function readHeader(text) {
    return locate(text)?.header ?? null;
}
// ── editing (FC-18 §9) ──────────────────────────────────────────────────────
function checkWriterKey(key) {
    if (typeof key !== 'string' || !exports.WRITER_KEY.test(key)) {
        throw new Error(`orz header: "${key}" is not a writable key (keys are [a-z][a-z0-9_]*)`);
    }
    if (key === 'kind')
        throw new Error('orz header: the "kind" line cannot be edited');
}
/** The value text to write so the flat reader reads back exactly `value`. */
function encodeValue(value) {
    if (value === '')
        return '';
    const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0];
    return value !== value.trim() || quoted || value === '|' ? `"${value}"` : value;
}
function checkValue(value) {
    if (typeof value !== 'string')
        throw new Error('orz header: a value must be a string');
    if (/[\r\n]/.test(value))
        throw new Error('orz header: a header value edited by a tool must be a single line');
    if (value.includes('}}'))
        throw new Error('orz header: a value must not contain "}}" (it would end the header)');
    if (value.includes('\u0000'))
        throw new Error('orz header: a value must not contain U+0000');
}
/**
 * Merge a legacy meta+document pair into one `kind: document` block: the
 * document block's lines first (its `kind` line dropped), then the lines of the
 * meta keys the document block does not set. Whitespace between the blocks
 * goes; everything outside the header is untouched.
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
    const kindLines = new Set();
    for (const e of doc.entries)
        if (e.key === 'kind')
            for (let k = e.line; k <= e.endLine; k++)
                kindLines.add(k);
    const last = doc.lines.length - 1;
    for (let k = 0; k <= last; k++) {
        if (kindLines.has(k))
            continue;
        const t = lineText(doc, k);
        if ((k === 0 || k === last) && t.trim() === '')
            continue;
        out.push(t);
    }
    const docKeys = new Set(doc.entries.map((e) => e.key));
    for (const e of meta.entries) {
        if (e.key === 'kind' || docKeys.has(e.key))
            continue;
        for (let k = e.line; k <= e.endLine; k++)
            out.push(lineText(meta, k));
    }
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
 * Set one header value (FC-18 §9). An existing key has its value replaced on
 * its own line (indentation, key spelling and separator kept; a `key: |`
 * value's continuation lines are replaced with it; with duplicate keys, the
 * last — the one that wins — is edited). A new key is inserted as
 * `key: value` just before the closing `}}` line, with the header's
 * indentation and line ending. A text without a header gets one at its start
 * (after a BOM): `{{nyml`, `kind: document`, `key: value`, `}}`, a blank line.
 * A legacy header is upgraded first: a meta+document pair is merged into one
 * `kind: document` block (the document block's lines, then the meta-only keys'
 * lines); a lone `kind: meta` block's kind line becomes `kind: document`.
 * Every other byte of the text is unchanged.
 *
 * Throws for a key outside `[a-z][a-z0-9_]*`, for `kind`, and for a value with
 * a line break (CR or LF), `}}` or U+0000. Values that the reader would trim or unquote
 * (leading/trailing spaces, surrounding quotes, a lone `|`) are written quoted
 * so they read back exactly.
 */
function setHeaderValue(text, key, value) {
    checkWriterKey(key);
    checkValue(value);
    const encoded = encodeValue(value);
    const lineBody = encoded === '' ? `${key}:` : `${key}: ${encoded}`;
    const { text: src, loc } = locateForEdit(text);
    if (!loc) {
        const eol = firstLineBreak(text) ?? '\n';
        const at = text.startsWith('\uFEFF') ? 1 : 0;
        return text.slice(0, at) + `{{nyml${eol}kind: document${eol}${lineBody}${eol}}}${eol}${eol}` + text.slice(at);
    }
    const layout = loc.layouts[0];
    const hits = layout.entries.filter((e) => e.key === key);
    const hit = hits[hits.length - 1];
    if (hit) {
        return src.slice(0, hit.sepEnd) + (encoded === '' ? '' : ` ${encoded}`) + src.slice(hit.valueEnd);
    }
    const last = layout.lines.length - 1;
    if (last > 0) {
        const at = layout.lines[last].start;
        return src.slice(0, at) + layout.keyIndent + lineBody + layout.eol + src.slice(at);
    }
    // A one-line header (`{{nyml kind: document}}`): open a line before `}}`.
    const close = layout.block.end - 2;
    return src.slice(0, close) + layout.eol + lineBody + layout.eol + src.slice(close);
}
/**
 * Remove a header key (FC-18 §9): its line goes (with a `key: |` value's
 * continuation lines, and every duplicate of the key, so the key is really
 * unset). Every other byte is unchanged. A text without the key is returned
 * as is; a legacy header holding it is upgraded first (as for
 * {@link setHeaderValue}). Throws for `kind`.
 */
function removeHeaderKey(text, key) {
    if (key === 'kind')
        throw new Error('orz header: the "kind" line cannot be removed');
    const first = locate(text);
    if (!first || !own(first.header.fields, key))
        return text;
    const { text: src, loc } = locateForEdit(text);
    if (!loc)
        return text;
    const hits = loc.layouts[0].entries.filter((e) => e.key === key).sort((a, b) => b.keyStart - a.keyStart);
    let out = src;
    for (const e of hits) {
        const lines = loc.layouts[0].lines;
        out = e.full
            ? out.slice(0, lines[e.line].start) + out.slice(lines[e.endLine].next)
            : out.slice(0, e.keyStart) + out.slice(e.valueEnd);
    }
    return out;
}
// ── lint ────────────────────────────────────────────────────────────────────
function isKindName(v) {
    return v === 'md' || v === 'slides' || v === 'paged';
}
/**
 * Lint the header of a text. `kind` selects the key registry; without it the
 * header's `carrier` key does, and without that every kind's keys are known.
 *
 * Codes: `legacy-header` (warning), `kind-not-first` (warning: the `kind`
 * line is not the first key, so renderers do not treat the block as the
 * header), `duplicate-key` (warning: the last one wins), `key-grammar`
 * (warning: not `[a-z][a-z0-9_]*` with an ASCII `:`), `unknown-key` (warning:
 * not `x_…` and not in the FC-18 §5.1 registry for the kind), `host-key`
 * (warning: an `x_` key not shaped `x_<name>_<key>`), `closer-in-value`
 * (error: `}}` in a value, or text after the closing `}}` on its line),
 * `bad-uid` (error), `bad-format` (error: not a positive integer),
 * `newer-format` (error: format above 1 — the file opens read-only),
 * `bad-carrier` (error), `carrier-mismatch` (warning). Text-level, with or
 * without a header: `nul` (error), `lone-surrogate` (error), `mixed-eol`
 * (warning: assembling normalizes to the first line break's style).
 */
function lintHeader(text, kind) {
    return lintLocated(text, locate(text), kind);
}
/**
 * The header and its lint in one scan (for `readDocument`).
 * @internal Not part of the `orz-markdown/carrier` API.
 */
function readHeaderAndLint(text, kind) {
    const loc = locate(text);
    return { header: loc ? loc.header : null, lint: lintLocated(text, loc, kind) };
}
function lintLocated(text, loc, kind) {
    const out = [];
    if (text.includes('\u0000'))
        out.push({ level: 'error', code: 'nul', message: 'the text holds U+0000 (NUL), which format 1 cannot store' });
    if ((0, text_js_1.hasLoneSurrogate)(text))
        out.push({ level: 'error', code: 'lone-surrogate', message: 'the text holds a lone surrogate, which a UTF-8 file cannot represent' });
    if ((0, text_js_1.hasMixedEol)(text))
        out.push({ level: 'warning', code: 'mixed-eol', message: 'the text mixes line-ending styles; assembling stores them all in the style of the first line break' });
    if (!loc)
        return out;
    const { header } = loc;
    const fields = header.fields;
    if (header.legacy) {
        out.push({ level: 'warning', code: 'legacy-header', message: header.legacy === 'meta' ? 'legacy kind: meta block read as the header; editing tools keep it, a format-1 header is a kind: document block' : 'legacy kind: meta + kind: document pair read as one header; the next header edit merges them' });
    }
    for (const layout of loc.layouts) {
        const keyed = layout.entries;
        if (layout.block.kind === 'document' && keyed.length && keyed[0].key !== 'kind') {
            out.push({ level: 'warning', code: 'kind-not-first', message: 'the header block should start with its kind: document line' });
        }
        const seen = new Set();
        const reported = new Set();
        for (const e of keyed) {
            if (seen.has(e.key) && !reported.has(e.key)) {
                reported.add(e.key);
                out.push({ level: 'warning', code: 'duplicate-key', key: e.key, message: `duplicate key "${e.key}": the last one wins` });
            }
            seen.add(e.key);
            const sep = text.slice(e.sepEnd - 1, e.sepEnd);
            if (!exports.WRITER_KEY.test(e.key) || sep !== ':') {
                out.push({ level: 'warning', code: 'key-grammar', key: e.key, message: `key "${e.key}" should be [a-z][a-z0-9_]* followed by an ASCII ":"` });
            }
        }
    }
    const effective = kind ?? (isKindName(fields['carrier']) ? fields['carrier'] : undefined);
    const known = new Set(exports.COMMON_HEADER_KEYS);
    for (const k of effective ? [effective] : ['md', 'slides', 'paged'])
        for (const key of exports.KIND_HEADER_KEYS[k])
            known.add(key);
    for (const key of header.keys) {
        if (key.startsWith('x_')) {
            if (!/^x_[a-z0-9]+_[a-z0-9_]+$/.test(key))
                out.push({ level: 'warning', code: 'host-key', key, message: `host key "${key}" should be shaped x_<name>_<key>` });
        }
        else if (!known.has(key)) {
            out.push({ level: 'warning', code: 'unknown-key', key, message: `"${key}" is not a format-1 header key${effective ? ` for kind ${effective}` : ''} (kept untouched)` });
        }
        if (fields[key].includes('}}'))
            out.push({ level: 'error', code: 'closer-in-value', key, message: `the value of "${key}" contains "}}"` });
    }
    for (const b of header.blocks) {
        let e = b.end;
        while (e < text.length && (text[e] === ' ' || text[e] === '\t'))
            e++;
        if (e < text.length && text[e] !== '\n' && text[e] !== '\r') {
            out.push({ level: 'error', code: 'closer-in-value', message: 'text follows the closing "}}" on its line: a value probably contains "}}" (write "} }")' });
        }
    }
    if (own(fields, 'uid') && !exports.UID_PATTERN.test(fields['uid'])) {
        out.push({ level: 'error', code: 'bad-uid', key: 'uid', message: 'uid must match doc-[0-9a-z]{10,32}' });
    }
    if (own(fields, 'format')) {
        const f = fields['format'];
        if (!/^[1-9][0-9]*$/.test(f))
            out.push({ level: 'error', code: 'bad-format', key: 'format', message: `format "${f}" is not a positive integer` });
        else if (Number(f) > 1)
            out.push({ level: 'error', code: 'newer-format', key: 'format', message: `format ${f} is newer than this reader (format 1): open read-only` });
    }
    if (own(fields, 'carrier')) {
        const c = fields['carrier'];
        if (!isKindName(c))
            out.push({ level: 'error', code: 'bad-carrier', key: 'carrier', message: `carrier "${c}" is not md, slides or paged` });
        else if (kind && c !== kind)
            out.push({ level: 'warning', code: 'carrier-mismatch', key: 'carrier', message: `carrier "${c}" differs from the kind "${kind}"` });
    }
    return out;
}
//# sourceMappingURL=header.js.map