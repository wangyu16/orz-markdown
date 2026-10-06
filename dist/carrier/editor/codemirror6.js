"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CODEMIRROR6_TIMEOUT_MS = exports.CODEMIRROR6_URL = void 0;
exports.isCodeMirror6Modules = isCodeMirror6Modules;
exports.loadCodeMirror6 = loadCodeMirror6;
exports.codemirror6Adapter = codemirror6Adapter;
/**
 * The default editing engine: CodeMirror 6 behind the adapter interface
 * (adapter.ts), loaded lazily.
 *
 * Loading. By default the PINNED bundle `vendor/codemirror6.js` of this
 * package (exact versions in codemirror-pin.ts, built by
 * scripts/build-codemirror.ts) is loaded from jsDelivr
 * (`https://cdn.jsdelivr.net/npm/orz-markdown@<VERSION>/vendor/codemirror6.js`)
 * by one `<script src integrity crossorigin>` per document — Subresource
 * Integrity pins the bytes, there is no eval and no inline script, and one
 * bundle means one `@codemirror/state` (per-package `+esm` URLs resolve it to
 * different versions, which CodeMirror refuses). An app that bundles
 * CodeMirror itself passes `loadModules` and nothing is fetched.
 *
 * While CodeMirror loads, the shell is already editable: the adapter starts
 * as a `<textarea>` and upgrades in place (its current text, selection, focus,
 * scroll and undo steps carried over: each textarea undo step becomes one
 * CodeMirror undo step). When CodeMirror cannot load (offline, blocked, wrong bytes), the
 * textarea stays and `ready()` reports the error.
 */
const version_js_1 = require("../../version.js");
const codemirror_pin_js_1 = require("./codemirror-pin.js");
const adapter_js_1 = require("./adapter.js");
const text_model_js_1 = require("./text-model.js");
/** Where the pinned bundle is served (the package version that ships it). */
exports.CODEMIRROR6_URL = `https://cdn.jsdelivr.net/npm/orz-markdown@${version_js_1.VERSION}/${codemirror_pin_js_1.CODEMIRROR6_PATH}`;
/** How long the bundle may take to load before the textarea is kept. */
exports.CODEMIRROR6_TIMEOUT_MS = 20000;
/** True when an object has the exports the adapter needs. */
function isCodeMirror6Modules(m) {
    const o = m;
    return !!o && typeof o === 'object'
        && typeof o.state?.EditorState === 'function'
        && typeof o.view?.EditorView === 'function' && typeof o.view.keymap === 'object'
        && typeof o.commands?.history === 'function' && Array.isArray(o.commands.defaultKeymap) && Array.isArray(o.commands.historyKeymap)
        && typeof o.commands.undo === 'function' && typeof o.commands.redo === 'function'
        && typeof o.language?.syntaxHighlighting === 'function' && !!o.language.defaultHighlightStyle
        && !!o.markdown?.markdownLanguage;
}
/** One load per document and URL (several editors on a page share it). */
const loads = new WeakMap();
/**
 * Load the pinned CodeMirror 6 bundle into a document: a `<script>` with the
 * pinned SRI integrity, appended to `<head>` once; resolves the bundle's
 * global. Rejects on a network or integrity failure, a timeout or a bundle
 * without the expected exports (a later call tries again).
 */
function loadCodeMirror6(doc, options = {}) {
    const url = options.url ?? exports.CODEMIRROR6_URL;
    const win = doc.defaultView;
    const present = win?.[codemirror_pin_js_1.CODEMIRROR6_GLOBAL];
    if (isCodeMirror6Modules(present))
        return Promise.resolve(present);
    let perDoc = loads.get(doc);
    if (!perDoc)
        loads.set(doc, (perDoc = new Map()));
    const cached = perDoc.get(url);
    if (cached)
        return cached;
    const p = new Promise((resolve, reject) => {
        if (!win || !doc.head) {
            reject(new Error('CodeMirror needs a document with a window'));
            return;
        }
        const script = doc.createElement('script');
        let timer = null;
        const done = (error) => {
            if (timer !== null)
                win.clearTimeout(timer);
            script.removeEventListener('load', onLoad);
            script.removeEventListener('error', onError);
            if (error) {
                script.remove();
                reject(error);
                return;
            }
            const g = win[codemirror_pin_js_1.CODEMIRROR6_GLOBAL];
            if (isCodeMirror6Modules(g))
                resolve(g);
            else
                reject(new Error('The CodeMirror bundle did not provide the expected exports'));
        };
        const onLoad = () => done(null);
        const onError = () => done(new Error(`CodeMirror could not be loaded from ${url}`));
        script.addEventListener('load', onLoad);
        script.addEventListener('error', onError);
        script.setAttribute('data-orz-editor', 'codemirror6');
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.integrity = codemirror_pin_js_1.CODEMIRROR6_INTEGRITY;
        script.src = url;
        timer = win.setTimeout(() => done(new Error('CodeMirror took too long to load')), options.timeoutMs ?? exports.CODEMIRROR6_TIMEOUT_MS);
        doc.head.append(script);
    });
    perDoc.set(url, p);
    p.catch(() => { if (perDoc.get(url) === p)
        perDoc.delete(url); });
    return p;
}
/** The editor's look: chrome tokens (inherited from the shell's :host). */
const THEME = {
    '&': { height: '100%', fontSize: 'var(--orz-editor-font-size, 14px)', backgroundColor: 'var(--orz-chrome-surface)', color: 'var(--orz-chrome-fg)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--orz-chrome-mono)', lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--orz-chrome-fg)' },
    '.cm-line': { padding: '0 16px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--orz-chrome-fg)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 6%, transparent)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 26%, transparent)',
    },
    '.cm-panels': { backgroundColor: 'var(--orz-chrome-surface-2)', color: 'var(--orz-chrome-fg)' },
};
/** CodeMirror 6 (markdown mode, line wrapping, history, search) behind the adapter interface. */
function codemirror6Adapter(options = {}) {
    let fallback = (0, adapter_js_1.textareaAdapter)();
    let view = null;
    let cm = null;
    let extensions = [];
    let destroyed = false;
    let readyPromise = Promise.resolve({ engine: 'textarea' });
    let scrollOff = null;
    let mountOptions = null;
    /** Read-only now (mount option, then `setReadOnly`); a Compartment switches it in CodeMirror at run time. */
    let readOnlyNow = false;
    let roCompartment = null;
    const build = (m, o) => {
        const { EditorState } = m.state;
        const { EditorView, keymap } = m.view;
        const c = m.commands;
        const l = m.language;
        const ro = readOnlyNow;
        const roExtensions = (flag) => [EditorState.readOnly.of(flag), EditorView.editable.of(!flag)];
        roCompartment = m.state.Compartment ? new m.state.Compartment() : null;
        const keys = [...(m.markdown.markdownKeymap ?? []), ...c.defaultKeymap, ...c.historyKeymap, ...(m.search?.searchKeymap ?? []), ...(c.indentWithTab ? [c.indentWithTab] : [])];
        return [
            m.view.highlightSpecialChars?.(),
            c.history(),
            m.view.drawSelection?.(),
            m.view.dropCursor?.(),
            l.indentOnInput?.(),
            l.bracketMatching?.(),
            l.syntaxHighlighting(l.defaultHighlightStyle, { fallback: true }),
            l.LanguageSupport ? new l.LanguageSupport(m.markdown.markdownLanguage) : m.markdown.markdownLanguage,
            m.view.highlightActiveLine?.(),
            m.search?.highlightSelectionMatches?.(),
            EditorView.lineWrapping,
            keymap.of(keys),
            roCompartment ? roCompartment.of(roExtensions(ro)) : roExtensions(ro),
            EditorView.contentAttributes.of({ 'aria-label': o.label ?? 'Document text', 'aria-multiline': 'true' }),
            EditorView.theme(THEME),
            EditorView.updateListener.of((u) => {
                if (u.docChanged)
                    o.onChange();
                if (u.selectionSet && o.onSelection) {
                    const r = u.state.selection.main;
                    o.onSelection({ from: r.from, to: r.to });
                }
            }),
        ].filter((x) => x !== undefined && x !== null);
    };
    const upgrade = (m, el, o) => {
        const f = fallback;
        // the textarea's CURRENT text (typed or set while CodeMirror loaded), its selection, focus, scroll and undo steps
        const doc = f.getDoc();
        const steps = (0, adapter_js_1.undoTexts)(f) ?? [];
        const sel = f.getSelection?.() ?? { from: 0, to: 0 };
        const focused = f.hasFocus?.() ?? false;
        const scroll = f.getScroll?.();
        cm = m;
        extensions = build(m, o);
        const { EditorState } = m.state;
        const iso = m.commands.isolateHistory;
        // Seed CodeMirror's history with the textarea's steps (A-6): start from the oldest text the
        // textarea could undo to and replay every later text as its own isolated, undoable change.
        // Built before the textarea goes, so a failure here leaves the textarea in place.
        const texts = [...steps, doc];
        let state = EditorState.create({ doc: texts[0], extensions });
        for (let i = 1; i < texts.length; i++) {
            const change = (0, text_model_js_1.minimalChange)(state.doc.toString(), texts[i]);
            if (!change)
                continue;
            state = state.update({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) }).state;
        }
        const len = doc.length;
        const clamp = (n) => Math.max(0, Math.min(len, n));
        state = state.update({ selection: { anchor: clamp(sel.from), head: clamp(sel.to) } }).state;
        f.destroy();
        fallback = null;
        view = new m.view.EditorView({ state, parent: el, ...(o.root ? { root: o.root } : {}) });
        const onScroll = () => o.onScroll?.();
        view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
        scrollOff = () => view?.scrollDOM.removeEventListener('scroll', onScroll);
        if (scroll)
            adapter.scrollTo({ fraction: scroll.fraction });
        if (focused)
            view.focus();
    };
    const adapter = {
        get name() { return view ? 'codemirror6' : 'textarea'; },
        mount(el, o) {
            mountOptions = o;
            readOnlyNow = o.readOnly === true;
            fallback.mount(el, o);
            const doc = el.ownerDocument;
            readyPromise = (async () => {
                let m;
                try {
                    const got = options.loadModules ? await options.loadModules() : await loadCodeMirror6(doc, { url: options.url, timeoutMs: options.timeoutMs });
                    if (!isCodeMirror6Modules(got))
                        throw new Error('loadModules did not provide the CodeMirror 6 exports the editor needs');
                    m = got;
                }
                catch (error) {
                    return { engine: 'textarea', error };
                }
                if (destroyed)
                    return { engine: 'none' };
                try {
                    upgrade(m, el, o);
                }
                catch (error) {
                    return { engine: fallback ? 'textarea' : 'none', error };
                }
                return { engine: 'codemirror6' };
            })();
        },
        getDoc() {
            return view ? view.state.doc.toString() : fallback?.getDoc() ?? '';
        },
        setDoc(text, o) {
            if (!view) {
                fallback?.setDoc(text, o);
                return;
            }
            const current = view.state.doc.toString();
            const change = (0, text_model_js_1.minimalChange)(current, text);
            if (o?.resetHistory) {
                const sel = view.state.selection.main;
                const map = (p) => {
                    if (!change)
                        return p;
                    const delta = change.insert.length - (change.to - change.from);
                    return p <= change.from ? p : p >= change.to ? p + delta : change.from + change.insert.length;
                };
                view.setState(cm.state.EditorState.create({ doc: text, extensions, selection: { anchor: map(sel.anchor), head: map(sel.head) } }));
                // setState is not an update: report it like one
                mountOptions?.onChange();
                return;
            }
            if (!change)
                return;
            const iso = cm.commands.isolateHistory;
            view.dispatch({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) });
        },
        focus() {
            if (view)
                view.focus();
            else
                fallback?.focus();
        },
        destroy() {
            destroyed = true;
            scrollOff?.();
            scrollOff = null;
            view?.destroy();
            view = null;
            fallback?.destroy();
            fallback = null;
            mountOptions = null;
        },
        getSelection() {
            if (!view)
                return fallback?.getSelection?.() ?? { from: 0, to: 0 };
            const r = view.state.selection.main;
            return { from: r.from, to: r.to };
        },
        setReadOnly(flag) {
            readOnlyNow = flag;
            if (!view) {
                fallback?.setReadOnly?.(flag);
                return;
            }
            const { EditorState } = cm.state;
            const { EditorView } = cm.view;
            const ext = [EditorState.readOnly.of(flag), EditorView.editable.of(!flag)];
            if (roCompartment) {
                view.dispatch({ effects: roCompartment.reconfigure(ext) });
                return;
            }
            // modules without Compartment: rebuild the state (text and selection kept; the history starts over)
            extensions = build(cm, mountOptions ?? { doc: '', onChange() { } });
            const sel = view.state.selection.main;
            view.setState(EditorState.create({ doc: view.state.doc.toString(), extensions, selection: { anchor: sel.anchor, head: sel.head } }));
        },
        setSelection(s) {
            if (!view) {
                fallback?.setSelection?.(s);
                return;
            }
            const len = view.state.doc.length;
            const clamp = (n) => Math.max(0, Math.min(len, n));
            view.dispatch({ selection: { anchor: clamp(s.from), head: clamp(s.to) }, scrollIntoView: true });
        },
        hasFocus() {
            return view ? view.hasFocus === true : fallback?.hasFocus?.() ?? false;
        },
        undo() {
            return view ? cm.commands.undo(view) === true : fallback?.undo?.() ?? false;
        },
        redo() {
            return view ? cm.commands.redo(view) === true : fallback?.redo?.() ?? false;
        },
        getScroll() {
            if (!view)
                return fallback?.getScroll?.() ?? { line: 0, fraction: 0 };
            const sd = view.scrollDOM;
            const top = sd.scrollTop;
            const max = Math.max(0, sd.scrollHeight - sd.clientHeight);
            const block = view.lineBlockAtHeight(top);
            const line = view.state.doc.lineAt(block.from).number - 1;
            const within = block.height > 0 ? Math.max(0, Math.min(1, (top - block.top) / block.height)) : 0;
            return { line: line + within, fraction: max > 0 ? Math.min(1, top / max) : 0 };
        },
        scrollTo(target) {
            if (!view) {
                fallback?.scrollTo?.(target);
                return;
            }
            const sd = view.scrollDOM;
            if (typeof target.line === 'number' && Number.isFinite(target.line)) {
                const d = view.state.doc;
                const n = Math.max(0, Math.min(d.lines - 1, Math.floor(target.line)));
                const block = view.lineBlockAt(d.line(n + 1).from);
                sd.scrollTop = block.top + Math.max(0, Math.min(1, target.line - n)) * block.height;
            }
            else if (typeof target.fraction === 'number' && Number.isFinite(target.fraction)) {
                sd.scrollTop = Math.max(0, Math.min(1, target.fraction)) * Math.max(0, sd.scrollHeight - sd.clientHeight);
            }
        },
        ready: () => readyPromise,
    };
    return adapter;
}
//# sourceMappingURL=codemirror6.js.map