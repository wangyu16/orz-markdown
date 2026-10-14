"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORZ_HIGHLIGHTER = exports.CODEMIRROR6_HISTORY_STEPS = exports.CODEMIRROR6_TIMEOUT_MS = exports.CODEMIRROR6_URL = void 0;
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
 * scroll and its newest undo steps carried over: each of the last
 * `CODEMIRROR6_HISTORY_STEPS` textarea undo steps becomes one CodeMirror undo
 * step — CodeMirror's own history keeps at least that many). When CodeMirror cannot load (offline, blocked, wrong bytes), the
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
/**
 * How many of the textarea's undo steps the upgrade replays into CodeMirror
 * (CodeMirror's history keeps at least 100 by default). Replaying all 300 of a
 * 1.25 MB document took 20 s and 590 MB (MED cost-2).
 */
exports.CODEMIRROR6_HISTORY_STEPS = 100;
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
        if (options.nonce)
            script.setAttribute('nonce', options.nonce);
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
    // setFocusRange (2.4.0): the text outside the focus range, dimmed
    '.orz-focus-outside': { opacity: '0.38' },
    // flash (2.4.0): the lines a tool just changed, lit briefly
    '.cm-line.orz-flash': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-flash, oklch(85% 0.16 90)) 42%, transparent)', animation: 'orz-flash-fade var(--orz-flash-ms, 1600ms) ease-in forwards' },
    '@keyframes orz-flash-fade': { '0%, 55%': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-flash, oklch(85% 0.16 90)) 42%, transparent)' }, '100%': { backgroundColor: 'transparent' } },
    // syntax (2.2.0): the chrome's syntax tokens, light and dark with the chrome's scheme (E.27)
    '.orz-tok-heading': { color: 'var(--orz-chrome-syntax-heading)', fontWeight: '700' },
    '.orz-tok-strong': { fontWeight: '700' },
    '.orz-tok-em': { fontStyle: 'italic' },
    '.orz-tok-strike': { textDecoration: 'line-through' },
    '.orz-tok-link': { color: 'var(--orz-chrome-syntax-link)' },
    '.orz-tok-url': { color: 'var(--orz-chrome-syntax-url)', textDecoration: 'underline' },
    '.orz-tok-code': { color: 'var(--orz-chrome-syntax-code)' },
    '.orz-tok-quote': { color: 'var(--orz-chrome-syntax-quote)' },
    '.orz-tok-comment': { color: 'var(--orz-chrome-syntax-comment)', fontStyle: 'italic' },
    '.orz-tok-label': { color: 'var(--orz-chrome-syntax-label)' },
    '.orz-tok-mark': { color: 'var(--orz-chrome-syntax-mark)' },
};
/** Lezer highlight tag names → the classes of {@link THEME} (a tag's own name first, then its parents'). */
const TAG_CLASSES = {
    heading: 'orz-tok-heading', heading1: 'orz-tok-heading', heading2: 'orz-tok-heading', heading3: 'orz-tok-heading',
    heading4: 'orz-tok-heading', heading5: 'orz-tok-heading', heading6: 'orz-tok-heading',
    strong: 'orz-tok-strong', emphasis: 'orz-tok-em', strikethrough: 'orz-tok-strike',
    link: 'orz-tok-link', url: 'orz-tok-url', monospace: 'orz-tok-code', quote: 'orz-tok-quote', comment: 'orz-tok-comment',
    labelName: 'orz-tok-label', string: 'orz-tok-label', meta: 'orz-tok-label', atom: 'orz-tok-label', keyword: 'orz-tok-label',
    processingInstruction: 'orz-tok-mark', contentSeparator: 'orz-tok-mark', character: 'orz-tok-mark', escape: 'orz-tok-mark',
};
/**
 * The editor's syntax highlighter (2.2.0): a CodeMirror `Highlighter` that
 * gives each Markdown token a class of {@link THEME}, whose colours are the
 * chrome's `--orz-chrome-syntax-*` tokens — so the editor's syntax follows the
 * chrome's light or dark scheme (`data-chrome`, `prefers-color-scheme`) with
 * no reconfiguration, at ≥ 4.5:1 on the editor background (E.27). It reads
 * the tag names `@lezer/highlight` sets on its `tags`; a tag without a known
 * name is not styled.
 */
exports.ORZ_HIGHLIGHTER = {
    style(tags) {
        const out = new Set();
        for (const t of tags) {
            for (const p of (Array.isArray(t?.set) ? t.set : [t])) {
                const c = typeof p?.name === 'string' ? TAG_CLASSES[p.name] : undefined;
                if (c) {
                    out.add(c);
                    break;
                }
            }
        }
        return out.size ? [...out].join(' ') : null;
    },
};
/** CodeMirror 6 (markdown mode, line wrapping, history, search) behind the adapter interface. */
/**
 * Read-only in CodeMirror (claim E.22, FC-19 §5 invariant 7): the state is
 * read-only (no command or input edits it) and the content is not editable,
 * but it stays focusable (`tabindex="0"`) and selectable, so the reader can
 * select, copy and press Cmd/Ctrl+S in a read-only editor (2.2.0; before,
 * `editable: false` alone left nothing to focus).
 */
function readOnlyExtensions(m, flag) {
    const { EditorState } = m.state;
    const { EditorView } = m.view;
    return [
        EditorState.readOnly.of(flag),
        EditorView.editable.of(!flag),
        ...(flag && EditorView.contentAttributes ? [EditorView.contentAttributes.of({ tabindex: '0', 'aria-readonly': 'true' })] : []),
    ];
}
/**
 * The focus range of `setFocusRange` (2.4.0): a state field mapped through
 * every change (an insertion at its end grows it, one at its start stays
 * outside), drawing the text outside it dimmed (two mark decorations) or
 * folded away (whole lines replaced by nothing). Null when the modules lack
 * `StateField`, `StateEffect` or `Decoration` (an app's own CodeMirror build):
 * then everything stays shown.
 */
function focusExtension(m) {
    const { StateField, StateEffect } = m.state;
    const { Decoration, EditorView } = m.view;
    if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.mark !== 'function' || !EditorView?.decorations)
        return null;
    const effect = StateEffect.define();
    const dim = Decoration.mark({ class: 'orz-focus-outside' });
    const fold = Decoration.replace({ block: true });
    const decorate = (v, doc) => {
        if (!v)
            return Decoration.none;
        const len = doc.length;
        const ranges = [];
        if (v.mode === 'fold') {
            const first = doc.lineAt(v.from);
            const last = doc.lineAt(Math.max(v.from, v.to - (v.to > v.from ? 1 : 0)));
            if (first.number > 1)
                ranges.push(fold.range(0, doc.line(first.number - 1).to));
            if (last.number < doc.lines)
                ranges.push(fold.range(doc.line(last.number + 1).from, len));
        }
        else {
            if (v.from > 0)
                ranges.push(dim.range(0, v.from));
            if (v.to < len)
                ranges.push(dim.range(v.to, len));
        }
        return Decoration.set(ranges, true);
    };
    const field = StateField.define({
        create: () => ({ value: null, deco: Decoration.none }),
        update(f, tr) {
            let value = f.value;
            let touched = false;
            if (value && tr.docChanged) {
                const from = tr.changes.mapPos(value.from, 1);
                value = { from, to: Math.max(from, tr.changes.mapPos(value.to, 1)), mode: value.mode };
                touched = true;
            }
            for (const e of tr.effects)
                if (e.is(effect)) {
                    value = e.value;
                    touched = true;
                }
            if (!touched)
                return f;
            if (value) {
                const len = tr.newDoc.length;
                const from = Math.max(0, Math.min(len, value.from));
                value = { from, to: Math.max(from, Math.min(len, value.to)), mode: value.mode };
            }
            return { value, deco: decorate(value, tr.newDoc) };
        },
        provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
    });
    return { effect, field, extension: [field] };
}
/**
 * The flash of `flash` (2.4.0): a state field of line decorations (`orz-flash`) over the lines the
 * ranges touch, mapped through later changes, cleared by an effect. Null without the decoration API.
 */
function flashExtension(m) {
    const { StateField, StateEffect } = m.state;
    const { Decoration, EditorView } = m.view;
    if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.line !== 'function' || !EditorView?.decorations)
        return null;
    const effect = StateEffect.define();
    const line = Decoration.line({ class: 'orz-flash' });
    const field = StateField.define({
        create: () => Decoration.none,
        update(deco, tr) {
            let d = tr.docChanged ? deco.map(tr.changes) : deco;
            for (const e of tr.effects) {
                if (!e.is(effect))
                    continue;
                const ranges = e.value;
                if (!ranges) {
                    d = Decoration.none;
                    continue;
                }
                const doc = tr.state.doc;
                const starts = new Set();
                for (const r of ranges) {
                    const len = doc.length;
                    const a = Math.max(0, Math.min(len, Math.min(r.from, r.to)));
                    const b = Math.max(a, Math.min(len, Math.max(r.from, r.to)));
                    const first = doc.lineAt(a).number;
                    // a range that ends at a line start does not touch that line (a whole-line edit)
                    const last = b > a && doc.lineAt(b).from === b ? doc.lineAt(b).number - 1 : doc.lineAt(b).number;
                    for (let n = first; n <= Math.max(first, last) && starts.size < 2000; n++)
                        starts.add(doc.line(n).from);
                }
                d = Decoration.set([...starts].sort((x, y) => x - y).map((p) => line.range(p)));
            }
            return d;
        },
        provide: (f) => EditorView.decorations.from(f),
    });
    return { effect, field, extension: [field] };
}
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
    /** The focus range (2.4.0): its CodeMirror field, and the range asked for before CodeMirror arrived. */
    let focus = null;
    let pendingFocus = null;
    /** The flash (2.4.0): its CodeMirror field and the timer that clears it. */
    let flashExt = null;
    let flashTimer = null;
    const build = (m, o) => {
        const { EditorState } = m.state;
        const { EditorView, keymap } = m.view;
        const c = m.commands;
        const l = m.language;
        const ro = readOnlyNow;
        const roExtensions = (flag) => readOnlyExtensions(m, flag);
        roCompartment = m.state.Compartment ? new m.state.Compartment() : null;
        focus = focusExtension(m);
        flashExt = flashExtension(m);
        const keys = [...(m.markdown.markdownKeymap ?? []), ...c.defaultKeymap, ...c.historyKeymap, ...(m.search?.searchKeymap ?? []), ...(c.indentWithTab ? [c.indentWithTab] : [])];
        return [
            m.view.highlightSpecialChars?.(),
            c.history(),
            m.view.drawSelection?.(),
            m.view.dropCursor?.(),
            l.indentOnInput?.(),
            l.bracketMatching?.(),
            l.syntaxHighlighting(exports.ORZ_HIGHLIGHTER),
            l.LanguageSupport ? new l.LanguageSupport(m.markdown.markdownLanguage) : m.markdown.markdownLanguage,
            m.view.highlightActiveLine?.(),
            m.search?.highlightSelectionMatches?.(),
            EditorView.lineWrapping,
            keymap.of(keys),
            roCompartment ? roCompartment.of(roExtensions(ro)) : roExtensions(ro),
            EditorView.contentAttributes.of({ 'aria-label': o.label ?? 'Document text', 'aria-multiline': 'true' }),
            EditorView.theme(THEME),
            ...(focus ? focus.extension : []),
            ...(flashExt ? flashExt.extension : []),
            options.nonce && EditorView.cspNonce ? EditorView.cspNonce.of(options.nonce) : undefined,
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
        // the textarea's CURRENT text (typed or set while CodeMirror loaded), its selection, focus, scroll and undo steps:
        // its live value first (a change whose input event has not run yet is one more step, reported to the shell; E.21)
        (0, adapter_js_1.syncTextarea)(f);
        const doc = f.getDoc();
        const history = (0, adapter_js_1.undoSteps)(f, exports.CODEMIRROR6_HISTORY_STEPS) ?? { base: doc, changes: [] };
        const sel = f.getSelection?.() ?? { from: 0, to: 0 };
        const focused = f.hasFocus?.() ?? false;
        const scroll = f.getScroll?.();
        cm = m;
        extensions = build(m, o);
        const { EditorState } = m.state;
        const iso = m.commands.isolateHistory;
        // Seed CodeMirror's history with the textarea's newest steps (A-6, MED cost-2): start from the
        // text that many undos back and apply each step's change as its own isolated, undoable change
        // (CodeMirror's text is a rope: no whole-text copy per step). Built before the textarea goes,
        // so a failure here leaves the textarea in place.
        let state = EditorState.create({ doc: history.base, extensions });
        for (const change of history.changes)
            state = state.update({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) }).state;
        // the replay must end at the textarea's text; if it does not, start from that text without history
        if (state.doc.length !== doc.length || state.doc.toString() !== doc)
            state = EditorState.create({ doc, extensions });
        const len = doc.length;
        const clamp = (n) => Math.max(0, Math.min(len, n));
        state = state.update({ selection: { anchor: clamp(sel.from), head: clamp(sel.to) } }).state;
        f.destroy();
        fallback = null;
        // E.23: CodeMirror reads a pending DOM change on every scroll of the editor or a scroll parent
        // WITHOUT re-reading the DOM selection (DOMObserver.onScroll → flush(false)). Chrome can
        // dispatch the scroll that reveals the caret after a keystroke's text is in the DOM but before
        // CodeMirror's mutation observer has run (seen under load): the change is then applied with the
        // caret from before the key, the caret stays behind the character and every later key is typed
        // in front of it ("Second line" → "Seond linec"). So a scroll with a DOM change pending first
        // flushes it with the live selection; CodeMirror's own flush then finds nothing. Registered
        // before the view exists, so it runs before CodeMirror's listeners: capture on the shadow root
        // for the editor's own scrollers, and on the window (first listener there) for the page's.
        // `observer.flush` / `pendingRecords` are internals of the pinned bundle (E.11, E.23).
        const flushFirst = () => {
            const obs = view?.observer;
            if (!obs || typeof obs.flush !== 'function' || typeof obs.pendingRecords !== 'function')
                return;
            try {
                if (obs.pendingRecords().length > 0)
                    obs.flush(true);
            }
            catch { /* CodeMirror's own handler runs next */ }
        };
        const captureRoots = [];
        const shadow = o.root;
        if (shadow && typeof shadow.addEventListener === 'function')
            captureRoots.push(shadow);
        const win = el.ownerDocument?.defaultView;
        if (win && typeof win.addEventListener === 'function')
            captureRoots.push(win);
        for (const t of captureRoots)
            t.addEventListener('scroll', flushFirst, { capture: true, passive: true });
        const flushOff = () => { for (const t of captureRoots)
            t.removeEventListener('scroll', flushFirst, { capture: true }); };
        try {
            view = new m.view.EditorView({ state, parent: el, ...(o.root ? { root: o.root } : {}) });
        }
        catch (error) {
            flushOff();
            throw error;
        }
        const onScroll = () => o.onScroll?.();
        view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
        scrollOff = () => {
            view?.scrollDOM.removeEventListener('scroll', onScroll);
            flushOff();
        };
        if (scroll)
            adapter.scrollTo({ fraction: scroll.fraction });
        if (focused)
            view.focus();
        // a focus range asked for while the textarea showed (clamped to the text)
        if (pendingFocus && focus) {
            const len = view.state.doc.length;
            const from = Math.max(0, Math.min(len, pendingFocus.from));
            view.dispatch({ effects: focus.effect.of({ from, to: Math.max(from, Math.min(len, pendingFocus.to)), mode: pendingFocus.mode }) });
        }
        pendingFocus = null;
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
                    const got = options.loadModules ? await options.loadModules() : await loadCodeMirror6(doc, { url: options.url, timeoutMs: options.timeoutMs, nonce: options.nonce });
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
            const ext = readOnlyExtensions(cm, flag);
            if (roCompartment) {
                view.dispatch({ effects: roCompartment.reconfigure(ext) });
                return;
            }
            // modules without Compartment: rebuild the state (text and selection kept; the history starts over)
            extensions = build(cm, mountOptions ?? { doc: '', onChange() { } });
            const sel = view.state.selection.main;
            view.setState(EditorState.create({ doc: view.state.doc.toString(), extensions, selection: { anchor: sel.anchor, head: sel.head } }));
        },
        setSelection(s, o) {
            if (!view) {
                fallback?.setSelection?.(s, o);
                return;
            }
            const len = view.state.doc.length;
            const clamp = (n) => Math.max(0, Math.min(len, n));
            view.dispatch({ selection: { anchor: clamp(s.from), head: clamp(s.to) }, scrollIntoView: o?.scroll !== false });
        },
        applyChanges(changes) {
            if (!view) {
                fallback?.applyChanges?.(changes);
                return;
            }
            const list = changes.filter((c) => c.from !== c.to || c.insert !== '');
            if (list.length === 0)
                return;
            const iso = cm.commands.isolateHistory;
            // one transaction = one undoable step; the selection maps through every change
            view.dispatch({ changes: list.map((c) => ({ from: c.from, to: c.to, insert: c.insert })), ...(iso ? { annotations: iso.of('full') } : {}) });
        },
        setFocusRange(range, o) {
            const value = range ? { from: Math.min(range.from, range.to), to: Math.max(range.from, range.to), mode: o?.mode === 'fold' ? 'fold' : 'dim' } : null;
            if (!view) {
                pendingFocus = value;
                return;
            }
            if (!focus)
                return; // modules without the decoration API: everything stays shown
            view.dispatch({ effects: focus.effect.of(value) });
        },
        flash(ranges, o) {
            if (!view || !flashExt)
                return; // the textarea (and a build without the decoration API): nothing lights up
            if (flashTimer !== null)
                clearTimeout(flashTimer);
            const ms = typeof o?.ms === 'number' && o.ms > 0 ? Math.min(10000, o.ms) : 1600;
            view.dom?.style?.setProperty?.('--orz-flash-ms', `${ms}ms`);
            view.dispatch({ effects: flashExt.effect.of(ranges.map((r) => ({ from: r.from, to: r.to }))) });
            const ext = flashExt;
            flashTimer = setTimeout(() => { flashTimer = null; if (view && ext)
                view.dispatch({ effects: ext.effect.of(null) }); }, ms);
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