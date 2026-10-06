"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.undoTexts = undoTexts;
exports.undoSteps = undoSteps;
exports.syncTextarea = syncTextarea;
exports.historyChars = historyChars;
exports.textareaAdapter = textareaAdapter;
const text_model_js_1 = require("./text-model.js");
/** Group typing (and runs of deletions) into one undo step when the pauses are shorter than this. */
const GROUP_MS = 500;
const HISTORY_LIMIT = 300;
const applyPatch = (text, p) => text.slice(0, p.from) + p.insert + text.slice(p.to);
const histories = new WeakMap();
/** The texts `undo()` steps back through (oldest first; the current text not included), or `null` for another engine. */
function undoTexts(adapter) {
    return histories.get(adapter)?.texts() ?? null;
}
/**
 * The newest `limit` undo steps of a textarea adapter, for an engine that takes
 * over (MED cost-2): the text `limit` undos back (`base`) and the forward
 * changes, oldest first, that lead from it to the current text — one per undo
 * step. Built from the stored patches, one text at a time (no list of whole
 * texts). `null` for another engine.
 */
function undoSteps(adapter, limit) {
    return histories.get(adapter)?.steps(limit) ?? null;
}
/**
 * Bring a textarea adapter's kept text up to the textarea's live value (E.21): `getDoc()` returns
 * the text as of the last `input` event (reading `value` of a large textarea is not free), so an
 * engine taking over calls this first and loses no character typed just before. No-op for another engine.
 */
function syncTextarea(adapter) {
    histories.get(adapter)?.sync();
}
/** Characters a textarea adapter's history holds (a full text counts whole even when shared with the page), or `null`. */
function historyChars(adapter) {
    return histories.get(adapter)?.retained() ?? null;
}
/** The textarea engine: no dependencies, works offline, its own undo history. */
function textareaAdapter() {
    let ta = null;
    let opts = null;
    /** The text, kept in step with the textarea on every input (reading `value` of a large textarea is not free). */
    let last = '';
    let lastSel = { from: 0, to: 0 };
    let undoStack = [];
    let redoStack = [];
    let lastInputAt = -Infinity;
    let lastInputKind = '';
    const off = [];
    const now = () => Date.now();
    /** Push the text before a transition (`last`) onto a stack; the old top becomes a patch from it. */
    const record = (stack) => {
        const top = stack[stack.length - 1];
        if (top && top.doc !== undefined) {
            top.patch = (0, text_model_js_1.minimalChange)(last, top.doc) ?? { from: 0, to: 0, insert: '' };
            delete top.doc;
        }
        stack.push({ doc: last, from: lastSel.from, to: lastSel.to });
        if (stack.length > HISTORY_LIMIT)
            stack.shift();
    };
    const push = () => {
        record(undoStack);
        redoStack = [];
    };
    const textOf = (e) => (e.doc !== undefined ? e.doc : applyPatch(last, e.patch));
    const readSel = () => (ta ? { from: ta.selectionStart ?? 0, to: ta.selectionEnd ?? 0 } : { from: 0, to: 0 });
    const restore = (text, e) => {
        if (!ta)
            return;
        ta.value = text;
        last = ta.value;
        try {
            ta.setSelectionRange?.(e.from, e.to);
        }
        catch { /* detached */ }
        lastSel = readSel();
        lastInputAt = -Infinity;
        opts?.onChange();
    };
    const listen = (type, fn) => {
        ta.addEventListener(type, fn);
        off.push(() => ta?.removeEventListener(type, fn));
    };
    const grouped = (kind) => kind === 'insertText' || kind === 'deleteContentBackward' || kind === 'deleteContentForward';
    const adapter = {
        name: 'textarea',
        mount(el, options) {
            opts = options;
            const doc = el.ownerDocument;
            if (!doc)
                throw new Error('orz editor: the element has no document');
            ta = doc.createElement('textarea');
            ta.className = 'orz-editor__textarea';
            ta.setAttribute('aria-label', options.label ?? 'Document text');
            ta.setAttribute('autocapitalize', 'off');
            ta.setAttribute('autocomplete', 'off');
            ta.setAttribute('spellcheck', 'false');
            ta.setAttribute('wrap', 'soft');
            ta.readOnly = options.readOnly === true;
            ta.value = options.doc;
            last = ta.value;
            el.append(ta);
            listen('input', (e) => {
                const t = now();
                const kind = typeof e.inputType === 'string' ? e.inputType : '';
                if (t - lastInputAt > GROUP_MS || !grouped(kind) || kind !== lastInputKind)
                    push();
                lastInputAt = grouped(kind) ? t : -Infinity;
                lastInputKind = kind;
                last = ta.value;
                lastSel = readSel();
                options.onChange();
            });
            const sel = () => {
                const s = readSel();
                if (s.from === lastSel.from && s.to === lastSel.to)
                    return;
                lastSel = s;
                options.onSelection?.(s);
            };
            listen('select', sel);
            listen('keyup', sel);
            listen('pointerup', sel);
            listen('scroll', () => options.onScroll?.());
            listen('keydown', (e) => {
                if (!(e.metaKey || e.ctrlKey) || e.altKey)
                    return;
                const k = (e.key ?? '').toLowerCase();
                if (k === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    adapter.undo();
                }
                else if ((k === 'z' && e.shiftKey) || k === 'y') {
                    e.preventDefault();
                    adapter.redo();
                }
            });
        },
        getDoc() {
            return last;
        },
        setDoc(text, o) {
            if (!ta) {
                last = text;
                return;
            }
            const before = last;
            if (o?.resetHistory) {
                undoStack = [];
                redoStack = [];
            }
            else if (before !== text)
                push();
            lastInputAt = -Infinity;
            const change = (0, text_model_js_1.minimalChange)(before, text);
            const s = readSel();
            ta.value = text;
            last = ta.value;
            if (change) {
                // keep the selection where the text around it did not change
                const delta = change.insert.length - (change.to - change.from);
                const map = (p) => (p <= change.from ? p : p >= change.to ? p + delta : change.from + change.insert.length);
                try {
                    ta.setSelectionRange?.(map(s.from), map(s.to));
                }
                catch { /* detached */ }
            }
            lastSel = readSel();
            if (before !== text || o?.resetHistory)
                opts?.onChange();
        },
        focus() { ta?.focus?.({ preventScroll: true }); },
        destroy() {
            for (const f of off.splice(0))
                f();
            ta?.remove();
            ta = null;
            opts = null;
            undoStack = [];
            redoStack = [];
        },
        getSelection: () => (ta ? readSel() : lastSel),
        setReadOnly(flag) {
            if (opts)
                opts = { ...opts, readOnly: flag };
            if (ta)
                ta.readOnly = flag;
        },
        setSelection(s) {
            if (!ta)
                return;
            const clamp = (n) => Math.max(0, Math.min(last.length, n));
            try {
                ta.setSelectionRange?.(clamp(s.from), clamp(s.to));
            }
            catch { /* detached */ }
            lastSel = readSel();
            lastInputAt = -Infinity;
        },
        hasFocus() {
            const doc = ta?.ownerDocument;
            if (!ta || !doc)
                return false;
            const root = ta.getRootNode?.();
            return (root?.activeElement ?? doc.activeElement) === ta;
        },
        undo() {
            const e = undoStack.pop();
            if (!e || !ta)
                return false;
            const target = textOf(e);
            lastSel = readSel();
            record(redoStack);
            restore(target, e);
            return true;
        },
        redo() {
            const e = redoStack.pop();
            if (!e || !ta)
                return false;
            const target = textOf(e);
            lastSel = readSel();
            record(undoStack);
            restore(target, e);
            return true;
        },
        getScroll() {
            if (!ta)
                return { line: 0, fraction: 0 };
            const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
            const fraction = max > 0 ? Math.min(1, (ta.scrollTop ?? 0) / max) : 0;
            // A textarea has no line geometry: approximate the top line proportionally.
            const lines = countLines(last);
            return { line: fraction * Math.max(0, lines - 1), fraction };
        },
        scrollTo(target) {
            if (!ta)
                return;
            const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
            let f = target.fraction;
            if (typeof target.line === 'number') {
                const lines = countLines(last);
                f = lines > 1 ? target.line / (lines - 1) : 0;
            }
            if (typeof f === 'number' && Number.isFinite(f))
                ta.scrollTop = Math.max(0, Math.min(1, f)) * max;
        },
        ready: async () => ({ engine: 'textarea' }),
    };
    histories.set(adapter, {
        texts() {
            // walk down from the current text: each entry's text, newest first
            const out = [];
            let text = last;
            for (let i = undoStack.length - 1; i >= 0; i--) {
                const e = undoStack[i];
                text = e.doc !== undefined ? e.doc : applyPatch(text, e.patch);
                out.push(text);
            }
            return out.reverse();
        },
        steps(limit) {
            // walk down from the current text; each step back is undone forward by the inverse change
            const n = Math.max(0, Math.min(undoStack.length, Math.floor(limit)));
            const changes = [];
            let text = last;
            for (let i = undoStack.length - 1; i >= undoStack.length - n; i--) {
                const e = undoStack[i];
                const back = e.doc !== undefined ? e.doc : applyPatch(text, e.patch);
                // the newest entry holds its text: its change to the current text is computed once
                const p = e.doc !== undefined ? (0, text_model_js_1.minimalChange)(back, text) : { from: e.patch.from, to: e.patch.from + e.patch.insert.length, insert: (0, text_model_js_1.detachString)(text.slice(e.patch.from, e.patch.to)) };
                if (p)
                    changes.push(p);
                text = back;
            }
            return { base: text, changes: changes.reverse() };
        },
        retained: () => [...undoStack, ...redoStack].reduce((n, e) => n + (e.doc !== undefined ? e.doc.length : e.patch.insert.length), 0),
        sync() {
            if (!ta || ta.value === last)
                return;
            push();
            lastInputAt = -Infinity;
            last = ta.value;
            lastSel = readSel();
            opts?.onChange();
        },
    });
    return adapter;
}
function countLines(text) {
    let n = 1;
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1))
        n++;
    return n;
}
//# sourceMappingURL=adapter.js.map