"use strict";
/**
 * The flat nyml body reader shared by `scanNymlBlocks` (src/nyml-blocks.ts)
 * and the carrier header tools (src/carrier/header.ts).
 *
 * Not re-exported by the parser entry: it is an internal module. It lives
 * apart from nyml-blocks.ts so the carrier kit can read a block's key lines
 * (their positions, for in-place header edits, FC-18 §9) with exactly the
 * reader that produces the block's fields.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NYML_KEY_LINE = void 0;
exports.indentWidth = indentWidth;
exports.stripQuotes = stripQuotes;
exports.parseNymlBody = parseNymlBody;
/** Indentation width with tabs expanded to the next multiple of 4. */
function indentWidth(ws) {
    let w = 0;
    for (const ch of ws)
        w = ch === '\t' ? w + 4 - (w % 4) : w + 1;
    return w;
}
/** Strip a single pair of matching surrounding quotes, if present. */
function stripQuotes(s) {
    if (s.length >= 2) {
        const first = s[0];
        const last = s[s.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return s.slice(1, -1);
        }
    }
    return s;
}
/** Set an own data property: a `__proto__` key is data, not the prototype. */
function setField(obj, key, value) {
    Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}
/** The pattern of a key line; group 1 indentation, 2 key, 3 value. */
// `[^\r\n]*`, not `.*`: U+2028/U+2029 are ordinary characters in a value
// (only CR, LF and CR LF break lines), but `.` does not match them.
exports.NYML_KEY_LINE = /^([ \t]*)([A-Za-z0-9_]+)[ \t]*[:\uFF1A][ \t]?([^\r\n]*)$/;
/**
 * Parse a nyml body into a flat `key: value` map plus its `kind`. Supports
 * `key: |` multiline blocks: subsequent lines indented more than the key are
 * dedented (block style) and joined with `\n`. The `kind:` line populates
 * `kind` rather than `fields`. `entries` lists every top-level key line in
 * source order (duplicates and `kind` included).
 */
function parseNymlBody(inner) {
    const fields = {};
    const entries = [];
    let kind = '';
    // CRLF and LF sources must scan identically (Windows authors, CLAIMS M.1).
    const lines = inner.split(/\r\n|\r|\n/);
    // Keys live at the block's base indentation; deeper "key:" lines belong to
    // a nested structure (e.g. under "license:") and are not top-level fields.
    // The body arrives UNTRIMMED (the dispatcher's `rawBody`): a block that
    // starts on the line after `{{nyml` keeps its real indentation, and the base
    // is simply the first key's indentation (as in 1.6.3). Only when the first
    // key sits on the opener line (`{{nyml kind: meta` — no indentation of its
    // own) is the base taken from the later key lines, skipping the content of a
    // `|` block that opens on that line. (Round 13 inferred the base for every
    // body and so read a first `|` block's content as keys: round 14, M1.)
    let base = -1;
    let start = 0;
    while (start < lines.length && lines[start].trim() === '')
        start++;
    if (start === 0 && lines.length > 1) {
        let k = 1;
        if (/[:\uFF1A][ \t]*\|[ \t]*$/.test(lines[0]))
            while (k < lines.length && (lines[k].trim() === '' || /^[ \t]/.test(lines[k])))
                k++;
        for (; k < lines.length; k++) {
            const km = /^([ \t]*)[A-Za-z0-9_]+[ \t]*[:\uFF1A]/.exec(lines[k]);
            if (km) {
                const w = indentWidth(km[1]);
                if (base === -1 || w < base)
                    base = w;
            }
        }
    }
    const openerLine = start === 0;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // `：` (full-width colon, typed in Chinese input mode) separates like `:` (M.2).
        const m = exports.NYML_KEY_LINE.exec(line);
        if (!m) {
            i++;
            continue;
        }
        const indent = i === 0 && openerLine && base !== -1 ? base : indentWidth(m[1]); // a key on the opener line sits at the base
        if (base === -1)
            base = indent;
        if (indent > base) {
            i++;
            continue;
        }
        const key = m[2];
        const value = m[3];
        if (value.trim() === '|') {
            // Multiline block: gather following lines indented more than this key.
            const keyLine = i;
            let lastContent = i;
            const collected = [];
            let blockIndent = -1;
            i++;
            while (i < lines.length) {
                const next = lines[i];
                if (next.trim() === '') {
                    collected.push('');
                    i++;
                    continue;
                }
                const lead = next.match(/^[ \t]*/)?.[0] ?? '';
                const nextIndent = indentWidth(lead);
                if (nextIndent <= indent)
                    break;
                if (blockIndent === -1)
                    blockIndent = nextIndent;
                // Dedent by columns, so tab- and space-indented lines line up.
                collected.push(' '.repeat(Math.max(0, nextIndent - blockIndent)) + next.slice(lead.length));
                lastContent = i;
                i++;
            }
            while (collected.length && collected[collected.length - 1] === '') {
                collected.pop();
            }
            const joined = collected.join('\n');
            if (key === 'kind')
                kind = joined.trim();
            else
                setField(fields, key, joined);
            entries.push({ key, line: keyLine, endLine: lastContent, multiline: true });
            continue;
        }
        const v = stripQuotes(value.trim());
        if (key === 'kind')
            kind = v;
        else
            setField(fields, key, v);
        // The entry also owns the deeper lines after it (nested structure the flat
        // reader ignores), so removing or replacing it cannot strand them.
        let endLine = i;
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === '')
                continue;
            if (indentWidth(lines[j].match(/^[ \t]*/)?.[0] ?? '') <= indent)
                break;
            endLine = j;
        }
        entries.push({ key, line: i, endLine, multiline: false });
        i++;
    }
    return { kind, fields, entries };
}
//# sourceMappingURL=nyml-body.js.map