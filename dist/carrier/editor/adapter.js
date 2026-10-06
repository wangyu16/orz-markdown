"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textareaAdapter = textareaAdapter;
const text_model_js_1 = require("./text-model.js");
/** Group typing into one undo step when the pauses are shorter than this. */
const GROUP_MS = 500;
const HISTORY_LIMIT = 300;
/** The textarea engine: no dependencies, works offline, its own undo history. */
function textareaAdapter() {
    let ta = null;
    let opts = null;
    let last = '';
    let lastSel = { from: 0, to: 0 };
    let undoStack = [];
    let redoStack = [];
    let lastInputAt = -Infinity;
    const off = [];
    const now = () => Date.now();
    const snapshot = () => ({ doc: last, from: lastSel.from, to: lastSel.to });
    const push = (s) => {
        undoStack.push(s);
        if (undoStack.length > HISTORY_LIMIT)
            undoStack.shift();
        redoStack = [];
    };
    const readSel = () => (ta ? { from: ta.selectionStart ?? 0, to: ta.selectionEnd ?? 0 } : { from: 0, to: 0 });
    const restore = (s) => {
        if (!ta)
            return;
        ta.value = s.doc;
        last = ta.value;
        try {
            ta.setSelectionRange?.(s.from, s.to);
        }
        catch { /* detached */ }
        lastSel = readSel();
        opts?.onChange();
    };
    const listen = (type, fn) => {
        ta.addEventListener(type, fn);
        off.push(() => ta?.removeEventListener(type, fn));
    };
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
                if (t - lastInputAt > GROUP_MS || !kind.startsWith('insertText'))
                    push(snapshot());
                lastInputAt = kind.startsWith('insertText') ? t : -Infinity;
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
            return ta ? ta.value : last;
        },
        setDoc(text, o) {
            if (!ta) {
                last = text;
                return;
            }
            const before = ta.value;
            if (o?.resetHistory) {
                undoStack = [];
                redoStack = [];
            }
            else if (before !== text)
                push(snapshot());
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
        },
        getSelection: () => (ta ? readSel() : lastSel),
        hasFocus() {
            const doc = ta?.ownerDocument;
            if (!ta || !doc)
                return false;
            const root = ta.getRootNode?.();
            return (root?.activeElement ?? doc.activeElement) === ta;
        },
        undo() {
            const s = undoStack.pop();
            if (!s || !ta)
                return false;
            redoStack.push(snapshot());
            restore(s);
            return true;
        },
        redo() {
            const s = redoStack.pop();
            if (!s || !ta)
                return false;
            undoStack.push(snapshot());
            restore(s);
            return true;
        },
        getScroll() {
            if (!ta)
                return { line: 0, fraction: 0 };
            const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
            const fraction = max > 0 ? Math.min(1, (ta.scrollTop ?? 0) / max) : 0;
            // A textarea has no line geometry: approximate the top line proportionally.
            const lines = countLines(ta.value);
            return { line: fraction * Math.max(0, lines - 1), fraction };
        },
        scrollTo(target) {
            if (!ta)
                return;
            const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
            let f = target.fraction;
            if (typeof target.line === 'number') {
                const lines = countLines(ta.value);
                f = lines > 1 ? target.line / (lines - 1) : 0;
            }
            if (typeof f === 'number' && Number.isFinite(f))
                ta.scrollTop = Math.max(0, Math.min(1, f)) * max;
        },
        ready: async () => ({ engine: 'textarea' }),
    };
    return adapter;
}
function countLines(text) {
    let n = 1;
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1))
        n++;
    return n;
}
//# sourceMappingURL=adapter.js.map