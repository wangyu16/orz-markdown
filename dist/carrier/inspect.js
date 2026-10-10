"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.looksHtml = looksHtml;
exports.shellWord = shellWord;
exports.scriptElement = scriptElement;
exports.assembledStructure = assembledStructure;
exports.storedText = storedText;
exports.heldText = heldText;
exports.twinCheck = twinCheck;
/**
 * The kind-independent core of a carrier's `inspect` (2.3.0): the pieces
 * orz-mdhtml's and orz-paged's `src/inspect.ts` share word for word (REBUILD
 * §3b KIT GAP) — telling HTML from a text, quoting a file name for advice,
 * the structure checks of an assembled file (`#orz-src` and `</html>`
 * closed, the engine the release's own), the text a file holds, the text as
 * a file stores it, and the twin check (FC-18 §3: does the sibling hold the
 * same text). Each carrier keeps its report's shape, its legacy reader and
 * its advice wording.
 *
 * Isomorphic and deterministic: no Node built-ins, no clock, no randomness.
 */
const envelope_js_1 = require("./envelope.js");
const sha256_js_1 = require("./sha256.js");
/** HTML is recognised by its start: an optional BOM and whitespace, then `<!doctype html` or `<html` (in the first 1024 characters). */
function looksHtml(s) {
    return /^﻿?\s*(?:<!doctype\s+html|<html[\s>])/i.test(s.slice(0, 1024));
}
/** A file name as a POSIX shell word for advice: as is when it holds only safe characters, else single-quoted. */
function shellWord(name) {
    return /^[\w./@%+=:,-]+$/.test(name) ? name : `'${name.replace(/'/g, `'\\''`)}'`;
}
/** The first `<script …>` start tag with this id, with its content's bounds (raw text: up to the first `</script`). */
function scriptElement(html, id) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))
        throw new Error(`orz carrier: ${JSON.stringify(id)} is not an element id this reader looks for`);
    const open = new RegExp(`<script\\b([^>]*\\bid\\s*=\\s*["']?${id}["']?[^>]*)>`, 'i').exec(html);
    if (!open)
        return null;
    const start = open.index + open[0].length;
    const close = html.slice(start).search(/<\/script/i);
    return { attrs: open[1] ?? '', start, end: close < 0 ? null : start + close };
}
/** The structural checks of an assembled file (see {@link AssembledStructure}). */
function assembledStructure(html, o) {
    const island = scriptElement(html, 'orz-src');
    const end = /<\/html\s*>\s*$/i.test(html) ? 'closed' : 'unclosed';
    const engineEl = scriptElement(html, 'orz-engine');
    let engine;
    if (!engineEl)
        engine = 'missing';
    else if (o.delivery === 'cdn' || /\bsrc\s*=/i.test(engineEl.attrs)) {
        const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(engineEl.attrs)?.[1];
        engine = src === o.bundleUrl(o.shell) && engineEl.end !== null ? 'cdn' : 'different';
    }
    else if (engineEl.end === null)
        engine = 'different';
    else if (o.engineSource === undefined || o.shell !== o.version)
        engine = 'unverified';
    else
        engine = html.slice(engineEl.start, engineEl.end) === o.engineSource ? 'same' : 'different';
    return { island: island && island.end !== null ? 'closed' : 'unclosed', end, engine };
}
/**
 * A text as an assembled file stores it (FC-18 §8.1): mixed line endings in
 * the style of the first line break (lint `mixed-eol`); anything else
 * exactly. A text the envelope refuses (NUL, a lone surrogate, a newer
 * format) is returned as is. Compare a text twin with the text a file holds
 * through this.
 */
function storedText(text, kind = 'md') {
    try {
        return (0, envelope_js_1.extract)((0, envelope_js_1.assembleEnvelope)(text, { kind, shellVersion: '0.0.0', delivery: 'cdn', headHtml: '', bodyHtml: '' }))?.text ?? text;
    }
    catch {
        return text;
    }
}
/** The orz text an HTML file holds — a carrier's 0.x file's source (`readLegacy`), else a format-1 file's text — or null (not an orz file, or not HTML). */
function heldText(html, readLegacy) {
    if (!looksHtml(html))
        return null;
    const legacy = readLegacy ? readLegacy(html) : null;
    if (legacy)
        return legacy.text;
    const ex = (0, envelope_js_1.extract)(html);
    return ex && ex.shell !== '' ? ex.text : null;
}
/**
 * Compare an input with its sibling twin (FC-18 §3): for a text input the twin
 * is its assembled file (`holds: none` when it holds no orz text), for an
 * assembled (or legacy) input the twin is its text (`none` when it is an orz
 * file itself). Texts are compared as a file stores them ({@link storedText}).
 */
function twinCheck(input, text, twin, o = {}) {
    const newer = twin.newer ?? 'unknown';
    if (input === 'text') {
        const held = heldText(twin.content, o.readLegacy);
        if (held === null)
            return { name: twin.name, holds: 'none', newer, sha256: null };
        return { name: twin.name, holds: held === storedText(text, o.kind) ? 'same' : 'different', newer, sha256: (0, sha256_js_1.sha256)(held) };
    }
    // the input is a file: the twin is a text
    if (looksHtml(twin.content) && heldText(twin.content, o.readLegacy) !== null)
        return { name: twin.name, holds: 'none', newer, sha256: null };
    return { name: twin.name, holds: storedText(twin.content, o.kind) === text ? 'same' : 'different', newer, sha256: (0, sha256_js_1.sha256)(twin.content) };
}
//# sourceMappingURL=inspect.js.map