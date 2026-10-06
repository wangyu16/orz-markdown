"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEditorShell = createEditorShell;
/**
 * The editor shell (FC-19 §8): the kind-independent base that each carrier's
 * `mountEditor` wraps — chrome toolbar, editor pane and sandboxed preview in
 * one shadow root; view modes, a draggable split, the keyboard map; the exact
 * text, dirty tracking, header edits, save.
 *
 * - Text: the shell owns it. The engine (adapter.ts) edits LF text; the text
 *   model (text-model.ts) gives back the document's exact form — byte for byte
 *   when nothing was edited, its own line endings and BOM after edits.
 * - Preview: the caller's `render(text)` (the md kind: `renderMarkdownPreview`)
 *   into the sandboxed frame of preview.ts, debounced; scroll sync on
 *   `data-src-line` anchors, proportional without them.
 * - Reader preferences (FC-18 §6): split ratio, view mode, scroll sync, editor
 *   font size, dark chrome — through a `PreferenceStore` namespaced by the
 *   document `uid`, never in the text.
 * - Instances: no global state; `destroy()` removes everything it added
 *   (listeners, timers, the iframe, the engine, its element).
 */
const header_js_1 = require("../header.js");
const chrome_js_1 = require("../shell/chrome.js");
const preferences_js_1 = require("../shell/preferences.js");
const save_js_1 = require("../shell/save.js");
const protocol_js_1 = require("../shell/protocol.js");
const codemirror6_js_1 = require("./codemirror6.js");
const preview_js_1 = require("./preview.js");
const styles_js_1 = require("./styles.js");
const text_model_js_1 = require("./text-model.js");
const MODES = ['split', 'editor', 'preview'];
const MODE_META = {
    editor: { label: 'Editor', icon: 'edit' },
    split: { label: 'Split', icon: 'split' },
    preview: { label: 'Preview', icon: 'preview' },
};
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;
const RATIO_STEP = 0.05;
const message = (e) => typeof e === 'object' && e !== null && typeof e.message === 'string' ? e.message : String(e);
/** Mount the editor shell in `element`. */
function createEditorShell(element, options) {
    if (typeof options?.text !== 'string')
        throw new TypeError('orz editor: options.text must be a string');
    if (typeof options.render !== 'function')
        throw new TypeError('orz editor: options.render must be a function');
    const doc = element.ownerDocument;
    const win = doc?.defaultView;
    if (!doc || !win)
        throw new Error('orz editor: the element must belong to a document with a window');
    const readOnly = options.readOnly === true;
    const chromeLevel = options.chrome ?? 'full';
    const kind = options.kind ?? 'md';
    const narrowWidth = options.narrowWidth ?? 640;
    const debounceMs = options.preview?.debounceMs ?? 150;
    const uid = options.uid ?? (0, header_js_1.readHeader)(options.text)?.fields['uid']?.trim();
    const prefs = options.preferences ?? (0, preferences_js_1.createPreferenceStore)(uid, options.storage);
    const adapter = options.adapter ?? (0, codemirror6_js_1.codemirror6Adapter)();
    const model = (0, text_model_js_1.createTextModel)(options.text);
    const cleanups = [];
    const listen = (target, type, fn, opts) => {
        target.addEventListener(type, fn, opts);
        cleanups.push(() => target.removeEventListener(type, fn, opts));
    };
    const timers = new Set();
    const later = (fn, ms) => {
        const id = win.setTimeout(() => { timers.delete(id); fn(); }, ms);
        timers.add(id);
        return id;
    };
    const cancel = (id) => { if (id !== null && id !== undefined) {
        win.clearTimeout(id);
        timers.delete(id);
    } };
    let destroyed = false;
    // ── events ──
    const handlers = new Map();
    const emit = (event, payload) => {
        const set = handlers.get(event);
        if (!set)
            return;
        for (const fn of [...set]) {
            try {
                fn(payload);
            }
            catch { /* a listener's error is its own */ }
        }
    };
    const has = (event) => (handlers.get(event)?.size ?? 0) > 0;
    // ── DOM ──
    const el = (tag, className) => {
        const e = doc.createElement(tag);
        if (className)
            e.className = className;
        return e;
    };
    const host = el('div', 'orz-editor-host');
    host.setAttribute('data-orz-chrome', 'editor');
    const root = (0, chrome_js_1.createShadowRoot)(host);
    // the editor's own sheet, after CHROME_CSS
    {
        const Sheet = win.CSSStyleSheet;
        let adopted = false;
        if (Sheet && Array.isArray(root.adoptedStyleSheets)) {
            try {
                const sheet = new Sheet();
                sheet.replaceSync(styles_js_1.EDITOR_CSS);
                root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
                adopted = true;
            }
            catch {
                adopted = false;
            }
        }
        if (!adopted) {
            const style = el('style');
            style.append(doc.createTextNode(styles_js_1.EDITOR_CSS));
            root.append(style);
        }
    }
    const container = el('div', 'orz-editor');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', options.label ?? 'Document editor');
    container.setAttribute('tabindex', '-1');
    container.setAttribute('data-chrome-level', chromeLevel);
    if (readOnly)
        container.setAttribute('data-readonly', '');
    root.append(container);
    const isMac = /Mac|iPhone|iPad/.test(String(win.navigator?.platform ?? win.navigator?.userAgent ?? ''));
    const mod = isMac ? '⌘' : 'Ctrl+';
    const button = (className, label, icon) => {
        const b = el('button', className);
        b.setAttribute('type', 'button');
        if (icon)
            b.append((0, chrome_js_1.iconElement)(doc, icon));
        const span = el('span', 'orz-editor__label');
        span.append(doc.createTextNode(label));
        b.append(span);
        b.setAttribute('aria-label', label);
        return b;
    };
    let toolbar = null;
    const modeButtons = new Map();
    let statusText = null;
    let syncButton = null;
    if (chromeLevel !== 'none') {
        const bar = el('div', 'orz-editor__bar');
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Editor toolbar');
        const modes = el('div', 'orz-editor__modes');
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', 'View');
        for (const m of ['editor', 'split', 'preview']) {
            const b = button('orz-editor__mode', MODE_META[m].label, MODE_META[m].icon);
            b.setAttribute('data-mode', m);
            b.title = `${MODE_META[m].label} (${mod}\\ switches views)`;
            listen(b, 'click', () => setMode(m));
            modeButtons.set(m, b);
            modes.append(b);
        }
        toolbar = el('div', 'orz-editor__tools');
        const status = el('span', 'orz-editor__status');
        statusText = doc.createTextNode('');
        status.append(statusText);
        syncButton = button('orz-btn orz-btn--ghost orz-editor__sync', 'Sync scroll');
        syncButton.title = 'Scroll the preview with the editor';
        listen(syncButton, 'click', () => setScrollSync(!prefs.get('scrollSync')));
        bar.append(modes, toolbar, status, syncButton);
        if (!readOnly) {
            const save = button('orz-btn orz-btn--primary orz-editor__save', 'Save', 'save');
            save.title = `Save (${mod}S)`;
            listen(save, 'click', () => { void api.save(); });
            bar.append(save);
        }
        container.append(bar);
    }
    const noticeSlot = el('div');
    noticeSlot.hidden = true;
    container.append(noticeSlot);
    const panes = el('div', 'orz-editor__panes');
    const editorPane = el('div', 'orz-editor__pane orz-editor__pane--editor');
    const engineEl = el('div', 'orz-editor__engine');
    editorPane.append(engineEl);
    const divider = el('div', 'orz-editor__divider');
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    divider.setAttribute('aria-label', 'Resize the editor and the preview');
    divider.setAttribute('aria-valuemin', String(RATIO_MIN * 100));
    divider.setAttribute('aria-valuemax', String(RATIO_MAX * 100));
    divider.setAttribute('tabindex', '0');
    const previewPane = el('div', 'orz-editor__pane orz-editor__pane--preview');
    panes.append(editorPane, divider, previewPane);
    container.append(panes);
    element.append(host);
    // ── reader preferences ──
    const fontSize = prefs.get('editorFontSize');
    container.style.setProperty('--orz-editor-font-size', `${fontSize}px`);
    const dark = prefs.get('darkChrome');
    if (dark === true || dark === false)
        host.setAttribute('data-chrome', dark ? 'dark' : 'light');
    let ratio = prefs.get('splitRatio');
    const applyRatio = () => {
        panes.style.setProperty('--orz-split', String(ratio));
        divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
        divider.setAttribute('aria-valuetext', `Editor ${Math.round(ratio * 100)}%`);
    };
    const setRatio = (r, store) => {
        if (typeof r !== 'number' || !Number.isFinite(r))
            return;
        ratio = Math.round(Math.max(RATIO_MIN, Math.min(RATIO_MAX, r)) * 1000) / 1000;
        applyRatio();
        if (store)
            prefs.set('splitRatio', ratio);
    };
    applyRatio();
    const setScrollSync = (on) => {
        prefs.set('scrollSync', on);
        syncButton?.setAttribute('aria-pressed', String(on));
        if (on)
            syncFromEditor();
    };
    syncButton?.setAttribute('aria-pressed', String(prefs.get('scrollSync')));
    // ── modes ──
    const requested = options.mode ?? prefs.get('viewMode');
    let mode = MODES.includes(requested) ? requested : 'split';
    let narrow = false;
    let narrowView = mode === 'preview' ? 'preview' : 'editor';
    const currentView = () => (narrow && mode === 'split' ? narrowView : mode);
    const applyMode = () => {
        const v = currentView();
        container.setAttribute('data-editor-mode', mode);
        container.setAttribute('data-view', v);
        if (narrow)
            container.setAttribute('data-narrow', '');
        else
            container.removeAttribute('data-narrow');
        for (const [m, b] of modeButtons)
            b.setAttribute('aria-pressed', String(narrow ? m === v : m === mode));
        if (v !== 'editor' && previewStale)
            scheduleRender(0);
    };
    function setMode(m) {
        if (!MODES.includes(m))
            throw new TypeError(`orz editor: unknown mode ${String(m)}`);
        mode = m;
        if (m !== 'split')
            narrowView = m;
        prefs.set('viewMode', m);
        applyMode();
    }
    const toggleMode = () => {
        if (narrow) {
            const next = currentView() === 'editor' ? 'preview' : 'editor';
            if (mode === 'split') {
                narrowView = next;
                applyMode();
            }
            else
                setMode(next);
            return;
        }
        setMode(mode === 'split' ? 'editor' : mode === 'editor' ? 'preview' : 'split');
    };
    const measure = () => {
        const w = host.getBoundingClientRect?.().width ?? 0;
        const n = w > 0 && w < narrowWidth;
        if (n !== narrow) {
            narrow = n;
            applyMode();
        }
    };
    // ── text, dirty ──
    let baseline = options.text;
    let dirty = false;
    let setting = false;
    const getText = () => model.toExact(adapter.getDoc());
    const updateDirty = () => {
        const d = getText() !== baseline;
        if (d === dirty)
            return;
        dirty = d;
        container.setAttribute('data-dirty', String(d));
        if (statusText)
            statusText.data = d ? 'Unsaved changes' : 'Saved';
        try {
            options.host?.setDirty(d);
        }
        catch { /* host gone */ }
        emit('dirty', { dirty: d });
    };
    const changed = () => {
        if (destroyed)
            return;
        updateDirty();
        if (has('change'))
            emit('change', { get text() { return getText(); } });
        previewStale = true;
        scheduleRender(debounceMs);
    };
    // ── preview ──
    let previewStale = true;
    let renderTimer = null;
    let renderSeq = 0;
    let lastRendered = null;
    let active = null;
    const renderNow = async () => {
        cancel(renderTimer);
        renderTimer = null;
        if (destroyed)
            return;
        const text = getText();
        if (text === lastRendered) {
            previewStale = false;
            return;
        }
        const seq = ++renderSeq;
        let html;
        try {
            html = String(await options.render(text));
        }
        catch (error) {
            if (!destroyed && seq === renderSeq)
                emit('error', { source: 'render', message: message(error), error });
            return;
        }
        if (destroyed || seq !== renderSeq)
            return;
        lastRendered = text;
        previewStale = getText() !== text;
        preview.render(html);
    };
    function scheduleRender(ms) {
        if (destroyed || currentView() === 'editor')
            return;
        cancel(renderTimer);
        renderTimer = later(() => { void renderNow(); }, ms);
    }
    const syncOn = () => prefs.get('scrollSync') === true && currentView() === 'split';
    let syncQueued = false;
    function syncFromEditor() {
        if (!syncOn() || active === 'preview' || syncQueued)
            return;
        syncQueued = true;
        const run = () => {
            syncQueued = false;
            if (destroyed || !syncOn() || active === 'preview')
                return;
            const pos = adapter.getScroll?.();
            if (!pos)
                return;
            const anchors = preview.anchors;
            preview.scrollTo(anchors.length ? (0, preview_js_1.lineToTop)(anchors, pos.line) : pos.fraction * preview.max);
        };
        if (win.requestAnimationFrame)
            win.requestAnimationFrame(run);
        else
            later(run, 16);
    }
    const syncFromPreview = (top, max) => {
        if (!syncOn() || active !== 'preview' || !adapter.scrollTo)
            return;
        const anchors = preview.anchors;
        adapter.scrollTo(anchors.length ? { line: (0, preview_js_1.topToLine)(anchors, top) } : { fraction: max > 0 ? top / max : 0 });
    };
    const openLink = (href) => {
        if (options.onLink) {
            options.onLink(href);
            return;
        }
        if (/^(https?:|mailto:)/i.test(href)) {
            try {
                win.open?.(href, '_blank', 'noopener,noreferrer');
            }
            catch { /* blocked */ }
        }
    };
    // A key or link reported by the frame acts only when the reader is in the frame: focus is on the
    // preview iframe (a real key press or click there needs it) and the page has transient user
    // activation (a real input in the frame activates its ancestors). A document script that posts
    // these messages while the reader works in the editor does nothing.
    const activated = () => {
        if (root.activeElement !== preview.iframe)
            return false;
        const ua = win.navigator?.userActivation;
        return !ua || ua.isActive === true;
    };
    const preview = (0, preview_js_1.createPreview)(doc, previewPane, { ...(options.preview ?? {}), title: 'Document preview' }, {
        onRendered: () => { if (active !== 'preview')
            syncFromEditor(); },
        onScrolled: syncFromPreview,
        onKey: (key) => { if (key === 'Escape' || activated())
            onShortcut(key, null); },
        onLink: (href) => { if (activated())
            openLink(href); },
        onActive: () => { active = 'preview'; },
    });
    // ── the engine ──
    adapter.mount(engineEl, {
        doc: (0, text_model_js_1.toEditorText)(options.text),
        readOnly,
        root,
        label: 'Document text',
        onChange: () => { if (!setting)
            changed(); },
        onSelection: (s) => {
            if (!has('selection'))
                return;
            const d = adapter.getDoc();
            emit('selection', { from: model.toExactOffset(d, s.from), to: model.toExactOffset(d, s.to) });
        },
        onScroll: () => syncFromEditor(),
    });
    const ready = (adapter.ready?.() ?? Promise.resolve({ engine: adapter.name })).then((r) => {
        if (r.error !== undefined && !destroyed) {
            emit('error', { source: 'adapter', message: message(r.error), error: r.error });
            (0, chrome_js_1.showToast)(root, 'The code editor could not be loaded — basic editing is available.', { tone: 'warning' });
        }
        return r;
    });
    container.setAttribute('data-dirty', 'false');
    if (statusText)
        statusText.data = 'Saved';
    // ── keyboard, pointer ──
    const focusChrome = () => {
        const b = modeButtons.get(currentView()) ?? null;
        (b ?? container).focus?.();
    };
    function onShortcut(key, e) {
        if (key === 's') {
            e?.preventDefault();
            if (!readOnly)
                void api.save();
            return true;
        }
        if (key === '\\') {
            e?.preventDefault();
            toggleMode();
            return true;
        }
        if (key === 'Escape') {
            focusChrome();
            return true;
        }
        return false;
    }
    listen(container, 'keydown', (e) => {
        if (e.isComposing || e.defaultPrevented)
            return;
        const k = e.key ?? '';
        if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === 's' || k === 'S'))
            onShortcut('s', e);
        else if ((e.metaKey || e.ctrlKey) && !e.altKey && k === '\\')
            onShortcut('\\', e);
        else if (k === 'Escape' && editorPane.contains?.(e.target))
            onShortcut('Escape', e);
    });
    listen(editorPane, 'pointerenter', () => { active = 'editor'; });
    listen(editorPane, 'focusin', () => { active = 'editor'; });
    listen(previewPane, 'pointerenter', () => { active = 'preview'; });
    let drag = null;
    listen(divider, 'pointerdown', (e) => {
        if ((e.button ?? 0) !== 0 || typeof e.pointerId !== 'number')
            return;
        e.preventDefault();
        drag = e.pointerId;
        try {
            divider.setPointerCapture?.(e.pointerId);
        }
        catch { /* not capturable */ }
        container.setAttribute('data-dragging', '');
    });
    listen(divider, 'pointermove', (e) => {
        if (drag === null || e.pointerId !== drag)
            return;
        const r = panes.getBoundingClientRect?.();
        if (!r || r.width <= 0 || typeof e.clientX !== 'number')
            return;
        setRatio((e.clientX - r.left) / r.width, false);
    });
    const endDrag = (e) => {
        if (drag === null || e.pointerId !== drag)
            return;
        try {
            divider.releasePointerCapture?.(drag);
        }
        catch { /* released */ }
        drag = null;
        container.removeAttribute('data-dragging');
        prefs.set('splitRatio', ratio);
    };
    listen(divider, 'pointerup', endDrag);
    listen(divider, 'pointercancel', endDrag);
    listen(divider, 'keydown', (e) => {
        const k = e.key;
        let next = null;
        if (k === 'ArrowLeft' || k === 'ArrowDown')
            next = ratio - RATIO_STEP;
        else if (k === 'ArrowRight' || k === 'ArrowUp')
            next = ratio + RATIO_STEP;
        else if (k === 'Home')
            next = RATIO_MIN;
        else if (k === 'End')
            next = RATIO_MAX;
        if (next === null)
            return;
        e.preventDefault();
        setRatio(next, true);
    });
    // responsive: the shell's own width (an app may give it a narrow column)
    let observer = null;
    if (win.ResizeObserver) {
        try {
            observer = new win.ResizeObserver(() => measure());
            observer.observe(host);
        }
        catch {
            observer = null;
        }
    }
    listen(win, 'resize', () => measure());
    measure();
    applyMode();
    // ── save ──
    let saver = options.saver ?? null;
    let saving = null;
    const toast = (text, tone) => { if (!destroyed)
        (0, chrome_js_1.showToast)(root, text, { tone }); };
    const succeed = (text, via) => {
        baseline = text;
        updateDirty();
        if (!destroyed)
            emit('save', { text, via });
        toast(via === 'download' ? 'Downloaded a copy of the document.' : 'Saved.', 'success');
        return { ok: true, via };
    };
    const fail = (error, via) => {
        const msg = message(error);
        if (!destroyed)
            emit('error', { source: 'save', message: msg, error });
        toast(`Could not save: ${msg}`, 'error');
        return { ok: false, ...(via ? { via } : {}), error: msg };
    };
    let notice = null;
    const dismissNotice = () => { notice?.remove(); notice = null; noticeSlot.hidden = true; };
    const showServedNotice = () => {
        dismissNotice();
        notice = el('div', 'orz-editor__notice');
        notice.setAttribute('id', 'orz-served-note');
        notice.setAttribute('role', 'status');
        const text = el('span', 'orz-editor__notice-text');
        text.append(doc.createTextNode('This page is served from the web, so it cannot be saved in place. Download a copy to keep your changes.'));
        const download = button('orz-btn orz-btn--primary', 'Download a copy', 'download');
        const close = button('orz-btn orz-btn--ghost', 'Dismiss');
        listen(download, 'click', () => {
            void (async () => {
                try {
                    const t = getText();
                    const r = await saver.download({ html: await options.assemble(t) });
                    if (r.via === 'download' && r.ok) {
                        dismissNotice();
                        succeed(t, 'download');
                    }
                    else
                        fail('error' in r && r.error ? r.error : 'The download failed.', 'download');
                }
                catch (e) {
                    fail(e, 'download');
                }
            })();
        });
        listen(close, 'click', dismissNotice);
        notice.append(text, download, close);
        noticeSlot.append(notice);
        noticeSlot.hidden = false;
    };
    const doSave = async () => {
        if (readOnly)
            return { ok: false, error: 'read-only' };
        const text = getText();
        if (options.hooks?.save) {
            try {
                await options.hooks.save(text);
            }
            catch (e) {
                return fail(e, 'hook');
            }
            return succeed(text, 'hook');
        }
        if (!options.assemble)
            return fail(new Error('no save route (pass hooks.save or assemble)'));
        let html;
        try {
            html = String(await options.assemble(text));
        }
        catch (e) {
            return fail(e);
        }
        saver ?? (saver = (0, save_js_1.createSaver)({ ...(uid ? { uid } : {}), suggestedName: options.fileName ?? `document${protocol_js_1.KIND_EXTENSIONS[kind] ?? '.html'}`, kind, ...(options.host ? { host: options.host } : {}) }));
        const r = await saver.save({ text, html });
        if (r.via === 'served-notice') {
            if (!destroyed)
                showServedNotice();
            return { ok: false, via: 'served-notice', error: 'served page' };
        }
        if (r.ok)
            return succeed(text, r.via);
        if (r.via === 'file' && r.error === 'cancelled')
            return { ok: false, via: 'file', error: 'cancelled', cancelled: true };
        return fail(new Error(r.error ?? 'The document could not be saved.'), r.via);
    };
    const api = {
        getText,
        setText(text, o) {
            if (typeof text !== 'string')
                throw new TypeError('orz editor: setText needs a string');
            const editorText = model.adopt(text);
            setting = true;
            try {
                adapter.setDoc(editorText, { resetHistory: o?.resetHistory === true });
            }
            finally {
                setting = false;
            }
            changed();
        },
        setHeader(changes) {
            const current = getText();
            const next = (0, header_js_1.editHeader)(current, changes);
            if (next !== current)
                api.setText(next);
        },
        isDirty() { updateDirty(); return dirty; },
        markSaved() { baseline = getText(); updateDirty(); },
        save() {
            if (destroyed)
                return Promise.resolve({ ok: false, error: 'destroyed' });
            saving ?? (saving = doSave().finally(() => { saving = null; }));
            return saving;
        },
        setMode,
        getMode: () => mode,
        getView: currentView,
        setSplitRatio: (r) => setRatio(r, true),
        getSplitRatio: () => ratio,
        undo: () => adapter.undo?.() ?? false,
        redo: () => adapter.redo?.() ?? false,
        focus() { if (currentView() === 'preview')
            preview.iframe.focus?.();
        else
            adapter.focus(); },
        on(event, fn) {
            let set = handlers.get(event);
            if (!set)
                handlers.set(event, (set = new Set()));
            set.add(fn);
            return () => { set.delete(fn); };
        },
        refreshPreview: () => renderNow(),
        root,
        toolbar,
        adapter,
        ready,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            for (const id of [...timers])
                cancel(id);
            for (const f of cleanups.splice(0)) {
                try {
                    f();
                }
                catch { /* gone */ }
            }
            try {
                observer?.disconnect();
            }
            catch { /* gone */ }
            observer = null;
            try {
                adapter.destroy();
            }
            catch { /* engine's problem */ }
            preview.destroy();
            host.remove();
            handlers.clear();
        },
    };
    return api;
}
//# sourceMappingURL=shell.js.map