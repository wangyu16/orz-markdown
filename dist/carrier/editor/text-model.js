"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toEditorText = toEditorText;
exports.createTextModel = createTextModel;
exports.minimalChange = minimalChange;
/**
 * The exact text behind an editing surface (FC-19 invariant 5, FC-18 §2).
 *
 * Editors work on LF text without a BOM (CodeMirror splits on CR, CR LF and
 * LF and joins with LF; a `<textarea>` normalises line breaks to LF). The
 * model keeps the document's own form: its byte-order mark and its
 * line-ending style (that of its first line break, FC-18 §8.1), and the exact
 * strings it was given. Reading back:
 *
 * - an editor text equal to the LF form of a text the model was given
 *   (`setText`, the initial text, a header edit) gives back THAT exact text —
 *   so an unedited document, or one undone back to a known state, reads back
 *   byte for byte, mixed line endings included — and that text's BOM and
 *   line-ending style become the document's again (each remembered text keeps
 *   its own style: undoing a `setText` of an LF text back to a CR LF document
 *   with a BOM writes the next edit in CR LF with the BOM);
 * - any other editor text is written in the document's style: the BOM in
 *   front, every LF as the document's line ending.
 *
 * Offsets: for a remembered text the editor offset is mapped by walking that
 * exact string (a mixed CR LF / LF / CR text maps exactly); otherwise by the
 * document's style.
 *
 * Pure and deterministic; no browser API.
 */
const text_js_1 = require("../text.js");
const BOM = '﻿';
const EOLS = { lf: '\n', crlf: '\r\n', cr: '\r' };
/** How many exact texts are remembered for exact read-back (most recent first). */
const REMEMBERED = 16;
/** The editor (LF, no BOM) form of an exact text. */
function toEditorText(text) {
    const body = text.startsWith(BOM) ? text.slice(1) : text;
    return body.indexOf('\r') < 0 ? body : body.replace(/\r\n?/g, '\n');
}
function createTextModel(initial) {
    let bom = false;
    let eol = '\n';
    /** Remembered texts, most recent first. */
    let known = [];
    const find = (editorText) => {
        for (const k of known)
            if (k.editor === editorText)
                return k;
        return undefined;
    };
    /** Walk an exact text to the exact offset of an editor offset. */
    const walk = (exact, at) => {
        let i = exact.startsWith(BOM) ? 1 : 0;
        for (let n = 0; n < at && i < exact.length; n++)
            i += exact.charCodeAt(i) === 13 && exact.charCodeAt(i + 1) === 10 ? 2 : 1;
        return i;
    };
    const model = {
        adopt(text) {
            bom = text.startsWith(BOM);
            eol = EOLS[(0, text_js_1.eolStyle)(text)];
            const editor = toEditorText(text);
            known = [{ editor, exact: text, bom, eol }, ...known.filter((k) => k.editor !== editor)].slice(0, REMEMBERED);
            return editor;
        },
        toExact(editorText) {
            const k = find(editorText);
            if (k) {
                // back at a remembered text: its style is the document's again (A-3)
                bom = k.bom;
                eol = k.eol;
                return k.exact;
            }
            const body = eol === '\n' ? editorText : editorText.replace(/\n/g, eol);
            return bom ? BOM + body : body;
        },
        recall(editorText) {
            const k = find(editorText);
            if (k) {
                bom = k.bom;
                eol = k.eol;
            }
        },
        toExactOffset(editorText, offset) {
            const at = Math.max(0, Math.min(offset, editorText.length));
            const k = find(editorText);
            if (k)
                return walk(k.exact, at);
            let shift = bom ? 1 : 0;
            if (eol === '\r\n')
                for (let i = editorText.indexOf('\n'); i >= 0 && i < at; i = editorText.indexOf('\n', i + 1))
                    shift++;
            return at + shift;
        },
        get eol() { return eol; },
        get bom() { return bom; },
    };
    model.adopt(initial);
    return model;
}
/** The smallest single replacement turning `a` into `b` (common prefix and suffix kept). */
function minimalChange(a, b) {
    if (a === b)
        return null;
    let start = 0;
    const max = Math.min(a.length, b.length);
    while (start < max && a.charCodeAt(start) === b.charCodeAt(start))
        start++;
    // never split a surrogate pair
    if (start > 0 && start < max && isHigh(a.charCodeAt(start - 1)))
        start--;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
        endA--;
        endB--;
    }
    if (endA < a.length && endA > start && isLow(a.charCodeAt(endA))) {
        endA++;
        endB++;
    }
    return { from: start, to: endA, insert: b.slice(start, endB) };
}
const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;
//# sourceMappingURL=text-model.js.map