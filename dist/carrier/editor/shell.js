"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEditorShell = createEditorShell;
/**
 * The editor shell (FC-19 §8): the kind-independent base that each carrier's
 * `mountEditor` wraps — chrome toolbar, editor pane and sandboxed preview in
 * one shadow root; view modes, a draggable split, the keyboard map; the exact
 * text, dirty tracking, header edits, save; the FC-19 §3 hooks that do not
 * depend on the kind (save, ai, fetchInclude, resolveAsset, uploadAsset,
 * resolveLink, mintUid).
 *
 * - Text: the shell owns it. The engine (adapter.ts) edits LF text; the text
 *   model (text-model.ts) gives back the document's exact form — byte for byte
 *   when nothing was edited, its own line endings and BOM after edits.
 * - Preview: the caller's `render(text, ctx)` (the md kind:
 *   `renderMarkdownPreview`) into the sandboxed frame of preview.ts, after a
 *   pause that grows with the render time, never two at once; scroll sync on
 *   `data-src-line` anchors (or the carrier's mapping / navigation).
 * - Frame messages are claims of the document's scripts: the shell acts on
 *   them only while the reader is in the frame (focus on it; for actions with
 *   effects, also transient user activation).
 * - Text formats: a header `format` newer than `formats` opens read-only and
 *   is never saved over (FC-18 §8.4).
 * - Reader preferences (FC-18 §6): split ratio, view mode, scroll sync, editor
 *   font size, dark chrome — through a `PreferenceStore` namespaced by the
 *   document `uid`, never in the text.
 * - Instances: no global state; `destroy()` removes everything it added
 *   (listeners, timers, the iframe, the engine, its element).
 */
const header_js_1 = require("../header.js");
const uid_js_1 = require("../uid.js");
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
/** How long a frame's "active" claim lets the preview lead the scroll (ms). */
const CLAIM_MS = 1500;
/** How long a touch of the editor in the host page (pointer, wheel, key) keeps the editor leading (ms). */
const TOUCH_MS = 300;
const message = (e) => typeof e === 'object' && e !== null && typeof e.message === 'string' ? e.message : String(e);
const BOM = '﻿';
/** The header `format` of a text (default 1; a malformed value reads as 1, as `readDocument` does). */
function formatOf(fields) {
    const f = fields?.['format']?.trim();
    return f !== undefined && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1;
}
/** The Markdown for an uploaded file: an image for `image/*`, else a link. */
function assetMarkdown(file, path) {
    const name = String(file.name ?? 'file');
    const label = (/^image\//i.test(String(file.type ?? '')) ? name.replace(/\.[^.]*$/, '') : name).replace(/[[\]\\\r\n]/g, '');
    const target = path.replace(/[ ()<>\r\n]/g, (c) => ({ ' ': '%20', '(': '%28', ')': '%29', '<': '%3C', '>': '%3E', '\r': '', '\n': '' }[c]));
    return /^image\//i.test(String(file.type ?? '')) ? `![${label}](${target})` : `[${label}](${target})`;
}
const filesOf = (t) => {
    const f = t?.files;
    return f && typeof f.length === 'number' ? Array.from(f) : [];
};
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
    const hooks = options.hooks ?? {};
    const header = (0, header_js_1.readHeader)(options.text);
    const formats = (Array.isArray(options.formats) ? options.formats : []).filter((f) => Number.isInteger(f) && f > 0);
    const maxFormat = formats.length ? Math.max(...formats) : 1;
    const docFormat = formatOf(header?.fields);
    /** A newer text format opens read-only and is never saved over (FC-18 §8.4, D7). */
    const newerFormat = docFormat > maxFormat ? docFormat : null;
    /** Read-only now: asked for (`readOnly`, `setReadOnly`) or forced by a newer format, which nothing unlocks. */
    let readOnly = options.readOnly === true || newerFormat !== null;
    const chromeLevel = options.chrome ?? 'full';
    const kind = options.kind ?? 'md';
    const narrowWidth = options.narrowWidth ?? 640;
    const previewOptions = options.preview ?? {};
    const debounceMs = previewOptions.debounceMs ?? 150;
    const navigateMode = previewOptions.mode === 'navigate';
    const uid = options.uid ?? header?.fields['uid']?.trim();
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
    const clock = () => { try {
        return win.performance?.now() ?? Date.now();
    }
    catch {
        return Date.now();
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
    let saveButton = null;
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
        // hidden while read-only (setReadOnly shows it again)
        saveButton = button('orz-btn orz-btn--primary orz-editor__save', 'Save', 'save');
        saveButton.title = `Save (${mod}S)`;
        saveButton.hidden = readOnly;
        listen(saveButton, 'click', () => { void api.save(); });
        bar.append(saveButton);
        container.append(bar);
    }
    if (newerFormat !== null) {
        // a quiet notice (no action: the quiet update of the standalone file, or the app, offers the newer editor)
        const note = el('div', 'orz-editor__notice orz-editor__notice--quiet');
        note.setAttribute('id', 'orz-format-note');
        note.setAttribute('role', 'status');
        note.append(doc.createTextNode(`This document uses text format ${newerFormat}, newer than this editor (format ${maxFormat}). It is shown read-only and will not be saved here.`));
        container.append(note);
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
    /** The editor form of the saved text: a different editor text is a different exact text, found without converting. */
    let baselineEditor = (0, text_model_js_1.toEditorText)(baseline);
    let dirty = false;
    let setting = false;
    const getText = () => model.toExact(adapter.getDoc());
    const differs = () => {
        const d = adapter.getDoc();
        return d !== baselineEditor || model.toExact(d) !== baseline;
    };
    const updateDirty = () => {
        const d = differs();
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
    const adoptBaseline = (text) => {
        baseline = text;
        baselineEditor = (0, text_model_js_1.toEditorText)(text);
    };
    const changed = () => {
        if (destroyed)
            return;
        // back at a remembered text (undo): its BOM and line endings are the document's again
        model.recall(adapter.getDoc());
        updateDirty();
        if (has('change'))
            emit('change', { text: getText() });
        previewStale = true;
        scheduleRender();
        if (navigateMode)
            syncFromEditor();
    };
    // ── preview ──
    let previewStale = true;
    let renderTimer = null;
    let lastRendered = null;
    /** The render in progress (renders never overlap); another is coalesced into `renderAgain`. */
    let renderRunning = null;
    let renderAgain = false;
    let lastRenderMs = 0;
    /** The pause before a render: at least `debounceMs`, and twice the last render's time (a slow renderer is not run per keystroke). */
    const renderDelay = () => Math.max(debounceMs, 2 * lastRenderMs);
    const renderCtx = {
        ...(hooks.fetchInclude ? { fetchInclude: (t) => hooks.fetchInclude(t) } : {}),
        ...(hooks.resolveAsset ? { resolveAsset: (p) => hooks.resolveAsset(p) } : {}),
    };
    const runRender = async () => {
        const text = getText();
        if (text === lastRendered) {
            previewStale = false;
            return;
        }
        const t0 = clock();
        let html;
        try {
            html = String(await options.render(text, renderCtx));
        }
        catch (error) {
            lastRenderMs = clock() - t0;
            if (!destroyed)
                emit('error', { source: 'render', message: message(error), error });
            return;
        }
        lastRenderMs = clock() - t0;
        if (destroyed)
            return;
        if (hooks.resolveAsset)
            html = (0, preview_js_1.rewriteAssetUrls)(html, (p) => hooks.resolveAsset(p));
        lastRendered = text;
        previewStale = getText() !== text;
        preview.render(html);
    };
    const renderNow = () => {
        cancel(renderTimer);
        renderTimer = null;
        if (destroyed)
            return Promise.resolve();
        if (renderRunning) {
            renderAgain = true;
            return renderRunning;
        }
        const run = runRender().finally(() => {
            renderRunning = null;
            if (renderAgain && !destroyed) {
                renderAgain = false;
                scheduleRender();
            }
        });
        renderRunning = run;
        return run;
    };
    function scheduleRender(ms) {
        if (destroyed || currentView() === 'editor')
            return;
        if (renderRunning) {
            renderAgain = true;
            return;
        }
        cancel(renderTimer);
        renderTimer = later(() => { void renderNow(); }, ms ?? renderDelay());
    }
    // Frame messages are claims of the document's scripts (A-2). The preview leads the scroll only
    // while the reader is there: focus on the preview iframe, or a recent claim of the frame (it posts
    // one on wheel, pointer and touch input) while the editor neither has focus nor was touched in the
    // host page (pointer, wheel, keys — events the frame cannot forge) just before. So a
    // document script that floods "active" and scroll messages cannot move or pin the editor while the
    // reader types in it or scrolls it. (The parent page sees no pointer events over the iframe, so
    // "the pointer is over the preview" is not observable from here.)
    let claimAt = -Infinity;
    let editorTouchAt = -Infinity;
    const frameFocused = () => root.activeElement === preview.iframe;
    const previewLeads = () => {
        if (frameFocused())
            return true;
        const t = clock();
        return t - claimAt < CLAIM_MS && t - editorTouchAt > TOUCH_MS && !(adapter.hasFocus?.() ?? false);
    };
    // A key or link reported by the frame acts only when the reader is in the frame: focus is on the
    // preview iframe (a real key press or click there needs it) and the page has transient user
    // activation (a real input in the frame activates its ancestors). Escape (which a browser does not
    // count as activation) needs the focus only: all it does is move focus from the frame to the toolbar.
    const activated = () => {
        if (!frameFocused())
            return false;
        const ua = win.navigator?.userActivation;
        return !ua || ua.isActive === true;
    };
    const syncOn = () => prefs.get('scrollSync') === true && currentView() === 'split';
    const lineOf = (text, offset) => {
        let n = 0;
        for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1))
            n++;
        return n;
    };
    let syncQueued = false;
    function syncFromEditor() {
        if (!syncOn() || previewLeads() || syncQueued)
            return;
        syncQueued = true;
        const run = () => {
            syncQueued = false;
            if (destroyed || !syncOn() || previewLeads())
                return;
            if (navigateMode) {
                const sel = adapter.hasFocus?.() ? adapter.getSelection?.() : undefined;
                const line = sel ? lineOf(adapter.getDoc(), sel.to) : adapter.getScroll?.().line;
                if (typeof line === 'number')
                    preview.navigate(line);
                return;
            }
            const pos = adapter.getScroll?.();
            if (!pos)
                return;
            const anchors = preview.anchors;
            const mapped = previewOptions.mapLine?.(pos.line, { anchors, max: preview.max });
            preview.scrollTo(typeof mapped === 'number' && Number.isFinite(mapped) ? mapped : anchors.length ? (0, preview_js_1.lineToTop)(anchors, pos.line) : pos.fraction * preview.max);
        };
        if (win.requestAnimationFrame)
            win.requestAnimationFrame(run);
        else
            later(run, 16);
    }
    const syncFromPreview = (top, max, line) => {
        if (!syncOn() || !previewLeads() || !adapter.scrollTo)
            return;
        if (typeof line === 'number') {
            adapter.scrollTo({ line });
            return;
        }
        const anchors = preview.anchors;
        const mapped = previewOptions.mapPosition?.(top, { anchors, max });
        if (typeof mapped === 'number' && Number.isFinite(mapped))
            adapter.scrollTo({ line: mapped });
        else
            adapter.scrollTo(anchors.length ? { line: (0, preview_js_1.topToLine)(anchors, top) } : { fraction: max > 0 ? top / max : 0 });
    };
    const openLink = (href) => {
        let target = href;
        if (hooks.resolveLink) {
            try {
                const r = hooks.resolveLink(href);
                if (typeof r !== 'string')
                    return;
                target = r;
            }
            catch {
                return;
            }
        }
        if (options.onLink) {
            options.onLink(target);
            return;
        }
        if (/^(https?:|mailto:)/i.test(target)) {
            try {
                win.open?.(target, '_blank', 'noopener,noreferrer');
            }
            catch { /* blocked */ }
        }
    };
    let previewNote = null;
    const standalone = !hooks.save && typeof options.assemble === 'function';
    const preview = (0, preview_js_1.createPreview)(doc, previewPane, {
        ...previewOptions,
        title: 'Document preview',
        context: { host: standalone ? 'standalone' : 'app', protocol: String(win.location?.protocol ?? '') },
    }, {
        onRendered: () => syncFromEditor(),
        onScrolled: (top, max, line) => syncFromPreview(top, max, line),
        onKey: (key) => {
            if (key === 'Escape' ? frameFocused() : activated())
                onShortcut(key, null);
        },
        onLink: (href) => { if (activated())
            openLink(href); },
        // a claim of the frame: it counts only while the editor is untouched (previewLeads)
        onActive: () => { claimAt = clock(); },
        onReady: () => { previewNote?.remove(); previewNote = null; },
        onStall: () => {
            if (destroyed)
                return;
            const error = new Error('The preview frame did not start: a Content-Security-Policy that blocks its inline scripts? Pass preview.nonce, or allow PREVIEW_BRIDGE_HASH / previewScriptHashes().');
            emit('error', { source: 'render', message: error.message, error });
            previewNote = el('div', 'orz-editor__preview-note');
            previewNote.setAttribute('role', 'status');
            previewNote.append(doc.createTextNode('The preview could not start on this page.'));
            previewPane.append(previewNote);
        },
    });
    const touchEditor = () => { editorTouchAt = clock(); };
    for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin', 'touchstart'])
        listen(editorPane, type, touchEditor, { passive: true, capture: true });
    // ── the engine ──
    adapter.mount(engineEl, {
        doc: (0, text_model_js_1.toEditorText)(options.text),
        readOnly,
        root,
        label: 'Document text',
        onChange: () => { if (!setting)
            changed(); },
        onSelection: (s) => {
            if (navigateMode)
                syncFromEditor();
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
    const formatError = () => new Error(`text format ${formatOf((0, header_js_1.readHeader)(getText())?.fields)} is newer than this editor (format ${maxFormat}): read-only, not saved`);
    if (newerFormat !== null) {
        // after the caller had a chance to subscribe
        void Promise.resolve().then(() => {
            if (destroyed)
                return;
            const error = formatError();
            emit('error', { source: 'format', message: error.message, error });
        });
    }
    // ── keyboard, pointer, paste and drop ──
    const focusChrome = () => {
        const b = modeButtons.get(currentView()) ?? null;
        (b ?? container).focus?.();
    };
    function onShortcut(key, e) {
        if (key === 's') {
            e?.preventDefault();
            if (!readOnly)
                void save(true);
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
    // a file pasted or dropped into the editor goes to hooks.uploadAsset (capture: before the engine reads it as text)
    const takeFiles = (e, files) => {
        if (!hooks.uploadAsset || readOnly || !files.length)
            return;
        e.preventDefault();
        e.stopPropagation?.();
        void api.uploadAssets(files);
    };
    listen(editorPane, 'paste', (e) => takeFiles(e, filesOf(e.clipboardData)), true);
    listen(editorPane, 'drop', (e) => takeFiles(e, filesOf(e.dataTransfer)), true);
    listen(editorPane, 'dragover', (e) => {
        if (hooks.uploadAsset && !readOnly && Array.from(e.dataTransfer?.types ?? []).includes('Files'))
            e.preventDefault();
    }, true);
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
        adoptBaseline(text);
        updateDirty();
        if (!destroyed)
            emit('save', { text, via });
        // a download is handed to the browser: it has started, not necessarily finished (B-3)
        toast(via === 'download' ? 'Download started.' : 'Saved.', 'success');
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
    const doSave = async (fromKey) => {
        const text = getText();
        if (formatOf((0, header_js_1.readHeader)(text)?.fields) > maxFormat) {
            // never saved over a newer format (FC-18 §8.4): no hook, no saver
            const error = formatError();
            if (!destroyed)
                emit('error', { source: 'format', message: error.message, error });
            return { ok: false, error: error.message };
        }
        if (readOnly)
            return { ok: false, error: 'read-only' };
        if (hooks.save) {
            try {
                await hooks.save(text);
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
            // Cmd/Ctrl+S on a served page with nothing unsaved stays quiet (B-16); the Save button and save() show the notice
            if (!destroyed && !(fromKey && text === baseline))
                showServedNotice();
            return { ok: false, via: 'served-notice', error: 'served page' };
        }
        if (r.ok)
            return succeed(text, r.via);
        if (r.via === 'file' && r.error === 'cancelled')
            return { ok: false, via: 'file', error: 'cancelled', cancelled: true };
        return fail(new Error(r.error ?? 'The document could not be saved.'), r.via);
    };
    const save = (fromKey) => {
        if (destroyed)
            return Promise.resolve({ ok: false, error: 'destroyed' });
        saving ?? (saving = doSave(fromKey).finally(() => { saving = null; }));
        return saving;
    };
    /** Replace an editor-text range with editor text (LF), as one undoable edit written in the document's style; the caret goes after it. */
    const replaceEditorRange = (from, to, insert) => {
        const d = adapter.getDoc();
        const next = d.slice(0, from) + insert + d.slice(to);
        api.setText(model.toExact(next));
        adapter.setSelection?.({ from: from + insert.length, to: from + insert.length });
    };
    /** Text from a host (AI proposal) in the document's line endings. */
    const inDocumentStyle = (text) => {
        const body = text.startsWith(BOM) ? text.slice(1) : text;
        return model.eol === '\n' ? body.replace(/\r\n?/g, '\n') : body.replace(/\r\n|\r|\n/g, model.eol);
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
        markSaved() { adoptBaseline(getText()); updateDirty(); },
        save: () => save(false),
        async requestAi(op, o) {
            const ai = hooks.ai;
            if (!ai || typeof ai.request !== 'function')
                return { ok: false, error: 'no AI hook (hooks.ai)' };
            if (readOnly)
                return { ok: false, error: 'read-only' };
            if (destroyed)
                return { ok: false, error: 'destroyed' };
            const operation = Array.isArray(ai.operations) ? ai.operations.find((x) => x && x.id === op) : undefined;
            const passage = o?.selection ?? operation?.selection === true;
            const before = getText();
            let selection;
            if (passage) {
                const d = adapter.getDoc();
                const s = adapter.getSelection?.();
                if (!s || s.from === s.to)
                    return { ok: false, error: 'no selection' };
                selection = { from: model.toExactOffset(d, Math.min(s.from, s.to)), to: model.toExactOffset(d, Math.max(s.from, s.to)) };
            }
            let proposed;
            try {
                proposed = (await ai.request(op, { text: before, ...(selection ? { selection: { ...selection } } : {}) }))?.proposed;
                if (typeof proposed !== 'string')
                    throw new Error('the AI hook returned no proposed text');
            }
            catch (error) {
                if (!destroyed)
                    emit('error', { source: 'hook', message: message(error), error });
                return { ok: false, error: message(error) };
            }
            if (destroyed)
                return { ok: false, error: 'destroyed' };
            if (getText() !== before)
                return { ok: false, error: 'the text changed during the AI request' };
            const styled = inDocumentStyle(proposed);
            api.setText(selection ? before.slice(0, selection.from) + styled + before.slice(selection.to) : (model.bom ? BOM : '') + styled);
            return { ok: true, op };
        },
        async uploadAssets(files) {
            const list = Array.from(files ?? []);
            if (!hooks.uploadAsset)
                return { ok: false, inserted: [], error: 'no upload hook (hooks.uploadAsset)' };
            if (readOnly)
                return { ok: false, inserted: [], error: 'read-only' };
            const inserted = [];
            let failure = null;
            for (const file of list) {
                try {
                    const path = await hooks.uploadAsset(file);
                    if (typeof path !== 'string' || !path)
                        throw new Error('the upload hook returned no path');
                    inserted.push(assetMarkdown(file, path));
                }
                catch (error) {
                    failure = error;
                    break;
                }
            }
            if (destroyed)
                return { ok: false, inserted: [], error: 'destroyed' };
            if (inserted.length) {
                const s = adapter.getSelection?.() ?? { from: adapter.getDoc().length, to: adapter.getDoc().length };
                replaceEditorRange(Math.min(s.from, s.to), Math.max(s.from, s.to), inserted.join('\n'));
            }
            if (failure !== null) {
                emit('error', { source: 'hook', message: message(failure), error: failure });
                toast(`Could not upload: ${message(failure)}`, 'error');
                return { ok: false, inserted, error: message(failure) };
            }
            return { ok: true, inserted };
        },
        async ensureUid() {
            const have = (0, header_js_1.readHeader)(getText())?.fields['uid']?.trim();
            if (have)
                return have;
            if (readOnly)
                throw new Error('orz editor: read-only — cannot add a uid');
            let minted;
            try {
                minted = hooks.mintUid ? String(await hooks.mintUid()) : (0, uid_js_1.mintUid)();
            }
            catch (error) {
                if (!destroyed)
                    emit('error', { source: 'hook', message: message(error), error });
                throw error;
            }
            if (!header_js_1.UID_PATTERN.test(minted))
                throw new Error(`orz editor: a minted uid must match ${String(header_js_1.UID_PATTERN)} (got "${minted}")`);
            const again = (0, header_js_1.readHeader)(getText())?.fields['uid']?.trim(); // set meanwhile
            if (again)
                return again;
            api.setHeader({ uid: minted });
            return minted;
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
        async refreshPreview() {
            if (renderRunning)
                await renderRunning;
            return renderNow();
        },
        get readOnly() { return readOnly; },
        setReadOnly(flag) {
            const next = flag === true || newerFormat !== null;
            if (next === readOnly || destroyed)
                return;
            readOnly = next;
            if (readOnly)
                container.setAttribute('data-readonly', '');
            else
                container.removeAttribute('data-readonly');
            if (saveButton)
                saveButton.hidden = readOnly;
            adapter.setReadOnly?.(readOnly);
        },
        isReadOnly: () => readOnly,
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