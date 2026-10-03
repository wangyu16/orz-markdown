"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanNymlBlocks = scanNymlBlocks;
const indexModule = __importStar(require("./index.js"));
/** Indentation width with tabs expanded to the next multiple of 4. */
function indentWidth(ws) {
    let w = 0;
    for (const ch of ws)
        w = ch === '\t' ? w + 4 - (w % 4) : w + 1;
    return w;
}
const OPEN = '{{nyml';
/** Find the index of the `}}` that closes a `{{nyml` opened at/after `from`. */
function findClosing(source, from) {
    for (let i = from; i < source.length - 1; i++) {
        if (source[i] === '}' && source[i + 1] === '}')
            return i;
    }
    return -1;
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
/**
 * Parse a nyml body into a flat `key: value` map plus its `kind`. Supports
 * `key: |` multiline blocks: subsequent lines indented more than the key are
 * dedented (block style) and joined with `\n`. The `kind:` line populates
 * `kind` rather than `fields`.
 */
function parseBody(inner) {
    const fields = {};
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
        const m = /^([ \t]*)([A-Za-z0-9_]+)[ \t]*[:\uFF1A][ \t]?(.*)$/.exec(line);
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
                i++;
            }
            while (collected.length && collected[collected.length - 1] === '') {
                collected.pop();
            }
            const joined = collected.join('\n');
            if (key === 'kind')
                kind = joined.trim();
            else
                fields[key] = joined;
            continue;
        }
        const v = stripQuotes(value.trim());
        if (key === 'kind')
            kind = v;
        else
            fields[key] = v;
        i++;
    }
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
 */
function scanNymlBlocks(source) {
    const out = [];
    if (source.indexOf(OPEN) < 0)
        return out; // fast path: no candidate at all
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
        const c = source.charCodeAt(i);
        if (c === 10 || (c === 13 && source.charCodeAt(i + 1) !== 10))
            lineStarts.push(i + 1);
    }
    for (const token of renderer().parse(source, {})) {
        if (token.type !== 'plugin_block' || token.info !== 'nyml' || !token.map)
            continue;
        const lineStart = lineStarts[token.map[0]] ?? 0;
        const open = source.indexOf(OPEN, lineStart);
        if (open < 0)
            continue;
        // The closer is searched after `[args]`, as the dispatcher does, so a `}}`
        // inside the args (`{{nyml[}}] …`) is not taken for the end.
        let bodyFrom = open + OPEN.length;
        if (source[bodyFrom] === '[') {
            const bracket = source.indexOf(']', bodyFrom);
            if (bracket >= 0)
                bodyFrom = bracket + 1;
        }
        const close = findClosing(source, bodyFrom);
        if (close < 0)
            continue;
        const raw = token.meta?.rawBody;
        const { kind, fields } = parseBody(raw ?? token.content ?? '');
        out.push({ kind, fields, start: open, end: close + 2 });
    }
    return out;
}
/** The configured renderer, imported lazily (index.ts re-exports this module). */
function renderer() {
    return indexModule.md;
}
//# sourceMappingURL=nyml-blocks.js.map