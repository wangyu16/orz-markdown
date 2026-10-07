"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toEditorText = toEditorText;
exports.detachString = detachString;
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
 * Memory (F4, MED3): the initial text and the saved text are remembered
 * outside the window of the 16 most recent texts, so undoing any number of
 * edits back to either is exact. A remembered text keeps its editor form and
 * its style; its exact string is kept only when the editor form, BOM and
 * line ending cannot rebuild it (mixed line endings), so a CR LF document
 * costs one copy per remembered text, not two. `clear()` forgets all of it.
 *
 * One editor form, several exact texts (round 3, F4): the window is searched
 * first, newest first, so a text given later wins over a pinned one (the
 * initial or the saved text) with the same editor form; and once such a later
 * text leaves the window, the pinned text it shadowed is no longer found for
 * that form (the initial one is dropped; the saved one stays the saved text
 * but is not read back for it) — undoing back to that editor text then gives
 * the document's style, never the older exact text, and is dirty unless that
 * is the saved text.
 *
 * Pure and deterministic; no browser API.
 */
const text_js_1 = require("../text.js");
const BOM = '\ufeff';
const EOLS = { lf: '\n', crlf: '\r\n', cr: '\r' };
/** How many exact texts are remembered for exact read-back (most recent first), besides the initial and the saved one. */
const REMEMBERED = 16;
/** The editor (LF, no BOM) form of an exact text. */
function toEditorText(text) {
    const body = text.startsWith(BOM) ? text.slice(1) : text;
    return body.indexOf('\r') < 0 ? body : body.replace(/\r\n?/g, '\n');
}
/**
 * A copy of a string that shares no storage with the string it was cut
 * from. V8 keeps a slice of 13 or more characters as a view on its parent,
 * so a short patch cut from a 1 MB text would keep the whole text alive;
 * concatenating and slicing again makes V8 flatten into a fresh string.
 */
function detachString(s) {
    return s.length < 13 ? s : (' ' + s).slice(1);
}
const rebuild = (editor, bom, eol) => (bom ? BOM : '') + (eol === '\n' ? editor : editor.replace(/\n/g, eol));
const exactOf = (k) => k.exact ?? rebuild(k.editor, k.bom, k.eol);
/** What the model keeps of an exact text. */
function know(text) {
    const bom = text.startsWith(BOM);
    const eol = EOLS[(0, text_js_1.eolStyle)(text)];
    const editor = toEditorText(text);
    const k = { editor, bom, eol };
    if (rebuild(editor, bom, eol) !== text)
        k.exact = text;
    return k;
}
function createTextModel(initial) {
    let bom = false;
    let eol = '\n';
    /** Remembered texts, most recent first. */
    let known = [];
    /** The initial and the saved text: remembered whatever the window holds. */
    let first = null;
    let saved = null;
    /** False once a later text with the saved text's editor form but another exact form left the window (F4). */
    let savedFound = true;
    const find = (editorText) => {
        // the window first: a text given later wins over a pinned one with the same editor form
        for (const k of known)
            if (k.editor === editorText)
                return k;
        if (saved && savedFound && saved.editor === editorText)
            return saved;
        if (first && first.editor === editorText)
            return first;
        return undefined;
    };
    /** A remembered text leaves the window: a pinned text it shadowed (same editor form, other exact form) is not found for that form any more. */
    const forget = (gone) => {
        if (first && first !== gone && first.editor === gone.editor && exactOf(first) !== exactOf(gone))
            first = null;
        if (saved && saved !== gone && savedFound && saved.editor === gone.editor && exactOf(saved) !== exactOf(gone))
            savedFound = false;
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
            const k = know(text);
            bom = k.bom;
            eol = k.eol;
            const next = [k, ...known.filter((x) => x.editor !== k.editor)];
            for (const gone of next.slice(REMEMBERED))
                forget(gone);
            known = next.slice(0, REMEMBERED);
            return k.editor;
        },
        toExact(editorText) {
            const k = find(editorText);
            if (k) {
                // back at a remembered text: its style is the document's again (A-3)
                bom = k.bom;
                eol = k.eol;
                return exactOf(k);
            }
            return rebuild(editorText, bom, eol);
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
            if (k) {
                if (k.exact !== undefined)
                    return walk(k.exact, at);
                return at + (k.bom ? 1 : 0) + (k.eol === '\r\n' ? countLf(editorText, at) : 0);
            }
            return at + (bom ? 1 : 0) + (eol === '\r\n' ? countLf(editorText, at) : 0);
        },
        markSaved(text) {
            // the same text as one already known costs nothing more
            const k = find(toEditorText(text));
            saved = k && exactOf(k) === text ? k : know(text);
            savedFound = true;
        },
        isSaved(editorText) {
            if (!saved || editorText !== saved.editor)
                return false;
            const k = find(editorText);
            if (k === saved)
                return true;
            // what toExact would read back for this editor text
            return (k ? exactOf(k) : rebuild(editorText, bom, eol)) === exactOf(saved);
        },
        savedText: () => (saved ? exactOf(saved) : ''),
        clear() {
            known = [];
            first = null;
            saved = null;
            savedFound = true;
        },
        get eol() { return eol; },
        get bom() { return bom; },
    };
    model.adopt(initial);
    first = saved = known[0];
    return model;
}
function countLf(text, before) {
    let n = 0;
    for (let i = text.indexOf('\n'); i >= 0 && i < before; i = text.indexOf('\n', i + 1))
        n++;
    return n;
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
    return { from: start, to: endA, insert: detachString(b.slice(start, endB)) };
}
const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;
//# sourceMappingURL=text-model.js.map