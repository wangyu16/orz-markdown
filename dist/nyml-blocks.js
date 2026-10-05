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
const nyml_body_js_1 = require("./nyml-body.js");
const OPEN = '{{nyml';
/** Find the index of the `}}` that closes a `{{nyml` opened at/after `from`. */
function findClosing(source, from) {
    for (let i = from; i < source.length - 1; i++) {
        if (source[i] === '}' && source[i + 1] === '}')
            return i;
    }
    return -1;
}
/** The body reader lives in nyml-body.ts (shared with the carrier header tools). */
function parseBody(inner) {
    const { kind, fields } = (0, nyml_body_js_1.parseNymlBody)(inner);
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
 *
 * `tokens`, when given, must be `md.parse(source, {})` of this very source (a
 * caller that already parsed it saves a second parse).
 */
function scanNymlBlocks(source, tokens) {
    const out = [];
    if (source.indexOf(OPEN) < 0)
        return out; // fast path: no candidate at all
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
        const c = source.charCodeAt(i);
        if (c === 10 || (c === 13 && source.charCodeAt(i + 1) !== 10))
            lineStarts.push(i + 1);
    }
    for (const token of tokens ?? renderer().parse(source, {})) {
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