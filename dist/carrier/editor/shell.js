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
 * - Frame messages: keys (save, view, Escape), links, input and scrolls act
 *   only when the bridge reports them through its authenticated port (the
 *   reader's own trusted events in the frame); window messages are data and
 *   never act. A document's scripts may take the keyboard focus inside the
 *   preview (accepted, FC-19 §5 invariant 3): keys typed then go to the
 *   preview, but nothing there can save, switch views, open a link or scroll
 *   the editor. Links from the frame open only through the host (`onLink`) or
 *   a click on the shell's own "Open" chip.
 * - Text formats: a header `format` newer than `formats` opens read-only and
 *   is never saved over (FC-18 §8.4).
 * - Reader preferences (FC-18 §6): split ratio, view mode, scroll sync, editor
 *   font size, dark chrome — through a `PreferenceStore` namespaced by the
 *   document `uid`, never in the text.
 * - Instances: no global state; `destroy()` removes everything it added
 *   (listeners, timers, the iframe, the engine, its element); work in flight
 *   (a save, an upload, an AI request, a uid) changes nothing afterwards.
 */
const header_js_1 = require("../header.js");
const uid_js_1 = require("../uid.js");
const chrome_js_1 = require("../shell/chrome.js");
const preferences_js_1 = require("../shell/preferences.js");
const save_js_1 = require("../shell/save.js");
const chrome_js_2 = require("../shell/chrome.js");
const conflict_js_1 = require("../shell/conflict.js");
const protocol_js_1 = require("../shell/protocol.js");
const codemirror6_js_1 = require("./codemirror6.js");
const preview_js_1 = require("./preview.js");
const styles_js_1 = require("./styles.js");
const text_model_js_1 = require("./text-model.js");
/** A text's well-formed header uid, as the editor reads its own (`readHeader`). */
const headerUid = (text) => {
    const u = (0, header_js_1.readHeader)(text)?.fields['uid']?.trim();
    return u && header_js_1.UID_PATTERN.test(u) ? u : undefined;
};
const MODES = ['split', 'editor', 'preview'];
const MODE_META = {
    editor: { label: 'Editor', icon: 'edit' },
    split: { label: 'Split', icon: 'split' },
    preview: { label: 'Preview', icon: 'preview' },
};
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;
const RATIO_STEP = 0.05;
/** How long the frame's "active" report (the reader's input in it) lets the preview lead the scroll (ms). */
const CLAIM_MS = 1500;
/** How long a touch of the editor in the host page (pointer, wheel, key) keeps the editor leading (ms). */
const TOUCH_MS = 300;
/** How long a render waits for the frame's acknowledgement: a bridge known to acknowledge, one not known yet (ms). */
const ACK_WAIT_MS = 10000;
/** How long a render waits for a bridge not known yet to acknowledge (`preview.firstAckWaitMs`, default). */
const FIRST_ACK_WAIT_MS = 1500;
/** While edits continue, a render runs at least this often: max(this, 4 × the last render and frame time) (ms). */
const MAX_WAIT_MS = 1000;
const message = (e) => typeof e === 'object' && e !== null && typeof e.message === 'string' ? e.message : String(e);
const BOM = '﻿';
const TEXT_CHANGED_SINCE = 'the text changed since the AI proposal was made';
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
    const nonce = typeof options.nonce === 'string' && options.nonce ? options.nonce : undefined;
    const previewOptions = { ...(nonce ? { nonce } : {}), ...(options.preview ?? {}) };
    const debounceMs = previewOptions.debounceMs ?? 150;
    const maxWaitMs = typeof previewOptions.maxWaitMs === 'number' && previewOptions.maxWaitMs >= 0 ? previewOptions.maxWaitMs : MAX_WAIT_MS;
    const firstAckWaitMs = typeof previewOptions.firstAckWaitMs === 'number' && previewOptions.firstAckWaitMs >= 0 ? Math.min(previewOptions.firstAckWaitMs, ACK_WAIT_MS) : FIRST_ACK_WAIT_MS;
    const navigateMode = previewOptions.mode === 'navigate';
    const uid = options.uid ?? header?.fields['uid']?.trim();
    const prefs = options.preferences ?? (0, preferences_js_1.createPreferenceStore)(uid, options.storage);
    const adapter = options.adapter ?? (0, codemirror6_js_1.codemirror6Adapter)(nonce ? { nonce } : {});
    const model = (0, text_model_js_1.createTextModel)(options.text);
    /** The text the shell was mounted with: what the page was opened with (the saver's proof of the opened file). */
    const openedText = options.text;
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
    /** The view last applied (null before the first). */
    let shownView = null;
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
        // B#4: a navigating preview shows the caret's place whenever a view change shows it (again after the render)
        if (navigateMode && v !== 'editor' && shownView !== null && v !== shownView) {
            navigateAfterRender = true;
            navigateToCaret();
        }
        shownView = v;
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
    // The saved text lives in the text model (remembered outside its window of recent texts): a
    // different editor text is a different exact text, found without converting.
    let dirty = false;
    let setting = false;
    /** The text at `destroy()`: what `getText()` returns afterwards. */
    let finalText = null;
    const getText = () => (finalText !== null ? finalText : model.toExact(adapter.getDoc()));
    const differs = () => !model.isSaved(adapter.getDoc());
    const updateDirty = () => {
        if (destroyed)
            return; // a save finishing after destroy posts nothing (to the host either)
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
    const adoptBaseline = (text) => { if (!destroyed)
        model.markSaved(text); };
    const changed = () => {
        if (destroyed)
            return;
        // back at a remembered text (undo): its BOM and line endings are the document's again
        model.recall(adapter.getDoc());
        updateDirty();
        if (has('change'))
            emit('change', { text: getText() });
        previewStale = true;
        if (staleSince === null)
            staleSince = clock();
        scheduleRender();
        if (navigateMode)
            syncFromEditor();
    };
    // ── preview ──
    let previewStale = true;
    /** When the first edit not yet rendered was made (the max wait counts from it); null when rendered. */
    let staleSince = null;
    let renderTimer = null;
    let lastRendered = null;
    /** The render in progress (renders never overlap); another is coalesced into `renderAgain`. */
    let renderRunning = null;
    let renderAgain = false;
    /** The last render's time: `render` plus the frame's own work until it acknowledged the render (B#3). */
    let lastRenderMs = 0;
    /** The frame did not acknowledge a render in time and never has: do not wait for it. */
    let ackless = false;
    /** The pause before a render: at least `debounceMs`, and twice the last render's time (a slow renderer is not run per keystroke). */
    const renderDelay = () => Math.max(debounceMs, 2 * lastRenderMs);
    /** While edits continue, a render runs at least this often (LOW6); `preview.maxWaitMs: Infinity` never forces one (E.32). */
    const maxWait = () => Math.max(maxWaitMs, 4 * lastRenderMs);
    const renderCtx = {
        ...(hooks.fetchInclude ? { fetchInclude: (t) => hooks.fetchInclude(t) } : {}),
        ...(hooks.resolveAsset ? { resolveAsset: (p) => hooks.resolveAsset(p) } : {}),
        // B#12: with the host's own link resolution, links stay as written so resolveLink gets the source href
        ...(hooks.resolveLink ? { twinLinks: false } : {}),
        cache: new Map(),
        ...(options.includes && typeof options.includes === 'object' && Object.keys(options.includes).length > 0 ? { includes: Object.freeze({ ...options.includes }) } : {}),
    };
    /**
     * Wait for the frame to acknowledge a render (B#3), at most ACK_WAIT_MS (`firstAckWaitMs` while the frame has
     * not acknowledged one yet); not at all for a frame that never does. An acknowledgement after the wait (a long
     * first layout) still records the render's time (`t0` its start; E.34): the next pause counts it.
     */
    const waitAck = (acked, t0) => {
        const cap = preview.acknowledges ? ACK_WAIT_MS : ackless ? 0 : firstAckWaitMs;
        let late = false;
        void acked.then((ok) => {
            if (!ok)
                return;
            ackless = false;
            if (late && !destroyed)
                lastRenderMs = Math.max(lastRenderMs, clock() - t0);
        });
        if (cap <= 0) {
            late = true;
            return Promise.resolve(false);
        }
        return new Promise((resolve) => {
            const timer = later(() => { late = true; if (!preview.acknowledges)
                ackless = true; resolve(false); }, cap);
            void acked.then((ok) => { cancel(timer); resolve(ok); });
        });
    };
    const runRender = async () => {
        const text = getText();
        if (text === lastRendered) {
            previewStale = false;
            staleSince = null;
            return;
        }
        staleSince = null;
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
        const renderMs = clock() - t0;
        lastRenderMs = renderMs;
        if (destroyed)
            return;
        if (hooks.resolveAsset)
            html = (0, preview_js_1.rewriteAssetUrls)(html, (p) => hooks.resolveAsset(p));
        lastRendered = text;
        previewStale = getText() !== text;
        // the render runs until the frame says it has shown it; the pause then counts both
        const acked = await waitAck(preview.render(html), t0);
        if (acked)
            lastRenderMs = clock() - t0;
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
        let delay = ms ?? renderDelay();
        // continued typing does not hold the preview back for ever (LOW6)
        if (ms === undefined && staleSince !== null && maxWait() !== Infinity)
            delay = Math.min(delay, Math.max(0, staleSince + maxWait() - clock()));
        renderTimer = later(() => { void renderNow(); }, delay);
    }
    // Frame messages (A-2): the bridge's reports through its authenticated port come from trusted
    // events (the reader's own input in the frame) and are the only ones that act; window messages are
    // data. The preview leads the scroll only while the reader is there: focus on the preview iframe,
    // or a recent "active" report (wheel, pointer, touch, keys) while the editor neither has focus nor
    // was touched in the host page (pointer, wheel, keys) just before. A document's scripts may take
    // the keyboard focus inside the frame (accepted, FC-19 §5 invariant 3): what the reader types then
    // goes to the preview, but no save, view change, link or scroll of the editor comes of it.
    let claimAt = -Infinity;
    let editorTouchAt = -Infinity;
    const frameFocused = () => root.activeElement === preview.iframe;
    const previewLeads = () => {
        if (frameFocused())
            return true;
        const t = clock();
        return t - claimAt < CLAIM_MS && t - editorTouchAt > TOUCH_MS && !(adapter.hasFocus?.() ?? false);
    };
    const syncOn = () => prefs.get('scrollSync') === true && currentView() === 'split';
    const lineOf = (text, offset) => {
        let n = 0;
        for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1))
            n++;
        return n;
    };
    /** Navigate mode: show the caret's source line (else the editor's top line) in the preview. */
    function navigateToCaret() {
        if (!navigateMode || destroyed)
            return;
        const sel = adapter.getSelection?.();
        const line = sel ? lineOf(adapter.getDoc(), sel.to) : adapter.getScroll?.().line;
        if (typeof line === 'number')
            preview.navigate(line);
    }
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
    // Links from the frame (F1b), even the reader's own clicks: they open only through the host (`onLink`) or the
    // reader's own click on the shell's chip — the frame never opens a window by itself.
    let linkChip = null;
    const dismissChip = () => { linkChip?.remove(); linkChip = null; };
    const offerLink = (target) => {
        dismissChip();
        let label = target;
        try {
            const u = new URL(target);
            label = u.protocol === 'mailto:' ? `Write to ${decodeURIComponent(u.pathname)}` : `Open ${u.host}`;
        }
        catch { /* keep the href */ }
        const chip = el('div', 'orz-editor__link-chip');
        chip.setAttribute('role', 'status');
        chip.setAttribute('data-orz-link', target);
        const text = el('span', 'orz-editor__link-chip-text');
        text.append(doc.createTextNode(`${label}?`));
        text.title = target;
        const go = button('orz-btn orz-btn--primary', 'Open');
        go.setAttribute('aria-label', `${label} in a new tab`);
        const close = button('orz-btn orz-btn--ghost', 'Dismiss');
        listen(go, 'click', () => {
            dismissChip();
            try {
                win.open?.(target, '_blank', 'noopener,noreferrer');
            }
            catch { /* blocked */ }
        });
        listen(close, 'click', dismissChip);
        chip.append(text, go, close);
        previewPane.append(chip);
        linkChip = chip;
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
        if (/^(https?:|mailto:)/i.test(target))
            offerLink(target);
    };
    let previewNote = null;
    let topLevel = true;
    try {
        topLevel = win.top === undefined || win.top === null || win.top === win;
    }
    catch {
        topLevel = false;
    }
    // F6: the file's own boot says so (`standalone`); else no save hook, an `assemble`, no host and a top-level window
    const standalone = options.standalone ?? (!hooks.save && typeof options.assemble === 'function' && !options.host && topLevel);
    let navigateAfterRender = false;
    const preview = (0, preview_js_1.createPreview)(doc, previewPane, {
        ...previewOptions,
        title: 'Document preview',
        context: { host: standalone ? 'standalone' : 'app', protocol: String(win.location?.protocol ?? ''), topLevel, connected: !!options.host },
    }, {
        onRendered: () => {
            syncFromEditor();
            if (navigateAfterRender) {
                navigateAfterRender = false;
                navigateToCaret();
            }
        },
        onScrolled: (top, max, line) => syncFromPreview(top, max, line),
        // through the authenticated port only (preview.ts): the reader's own key or click in the frame
        onKey: (key) => { onShortcut(key, null); },
        onLink: (href) => { openLink(href); },
        // counts only while the editor is untouched (previewLeads)
        onActive: () => { claimAt = clock(); },
        onReady: () => {
            previewNote?.remove();
            previewNote = null;
        },
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
        if (key === 'p') {
            // (2.3.0, E.33) a listener decides (a carrier's Print action); else the frame's key prints the host page
            // (the frame prevented its own print) and the shell's own key is the browser's
            if (has('print')) {
                e?.preventDefault();
                emit('print', { source: e ? 'editor' : 'preview' });
                return true;
            }
            if (e)
                return false;
            try {
                win?.print?.call(win);
            }
            catch { /* no print here */ }
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
        else if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (k === 'p' || k === 'P'))
            onShortcut('p', e);
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
    /** The opened file's includes (the shell's `includes` option): the opened bytes are assembled with them. */
    const openedIncludes = options.includes && typeof options.includes === 'object' && Object.keys(options.includes).length > 0 ? { ...options.includes } : null;
    /** The includes a save writes: the opened ones, until `refreshPreview({ includes })` hands newer ones (round 3, L7). */
    let saveIncludes = openedIncludes;
    /** The carrier's `assemble`, with the given includes (FC-18 D4). */
    const assembleWith = (t, inc) => Promise.resolve().then(() => (inc ? options.assemble(t, { includes: { ...inc } }) : options.assemble(t))).then(String);
    let openedMemo = null;
    /** `assemble` of the text the shell was mounted with — the default opened bytes — once it succeeds (a failure is tried again). */
    const openedAssembled = () => {
        if (openedMemo)
            return openedMemo;
        const run = assembleWith(openedText, openedIncludes);
        openedMemo = run;
        run.catch(() => { if (openedMemo === run)
            openedMemo = null; });
        return run;
    };
    let knownMemo = null;
    /**
     * The opened text with the latest includes (round 4, F5): content this editor knows — a file on
     * disk holding it (the app's server resolved the includes again) is no change. Undefined until
     * `refreshPreview({ includes })` hands includes other than the mounted ones.
     */
    const knownAssembled = () => {
        if (saveIncludes === openedIncludes)
            return undefined;
        if (knownMemo?.of !== saveIncludes) {
            const html = assembleWith(openedText, saveIncludes);
            const memo = { of: saveIncludes, html };
            knownMemo = memo;
            html.catch(() => { if (knownMemo === memo)
                knownMemo = null; });
        }
        return knownMemo.html;
    };
    /** The file for a text, with the latest includes; the unchanged text and includes reuse the opened bytes (one `assemble` per save click). */
    const assembleFor = (t) => (t === openedText && saveIncludes === openedIncludes ? openedAssembled() : assembleWith(t, saveIncludes));
    if (!hooks.save && options.standalone === true && typeof options.assemble === 'function' && options.openedHtml === undefined && !options.saver && newerFormat === null) {
        // B#6: in an assembled file the default opened bytes are ready before the first save click (at idle
        // after mount); an app's editor (not standalone) assembles them only at its first save (the
        // assemble may fetch the carrier's engine: not on every mount)
        const warm = () => { if (!destroyed)
            void openedAssembled().catch(() => undefined); };
        const idle = win.requestIdleCallback;
        if (typeof idle === 'function') {
            const id = idle.call(win, warm, { timeout: 2000 });
            cleanups.push(() => { try {
                win.cancelIdleCallback?.call(win, id);
            }
            catch { /* gone */ } });
        }
        else
            later(warm, 300);
    }
    let saver = options.saver ?? null;
    /** The editor holds an assembled file (it was opened from one): `standalone: true` or `openedHtml` given. */
    const assembledFile = options.standalone === true || options.openedHtml !== undefined;
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
        text.append(doc.createTextNode('This file was opened from a web address, so it cannot be saved over. Download a copy to keep your changes.'));
        const download = button('orz-btn orz-btn--primary', 'Download a copy', 'download');
        const close = button('orz-btn orz-btn--ghost', 'Dismiss');
        listen(download, 'click', () => {
            void (async () => {
                try {
                    const t = getText();
                    const r = await saver.download({ html: await assembleFor(t) });
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
            html = await assembleFor(text);
        }
        catch (e) {
            return fail(e);
        }
        if (destroyed)
            return { ok: false, error: 'destroyed' }; // nothing new starts after destroy
        saver ?? (saver = (0, save_js_1.createSaver)({
            ...(uid ? { uid } : {}),
            suggestedName: options.fileName ?? `document${protocol_js_1.KIND_EXTENSIONS[kind] ?? '.html'}`,
            kind,
            ...(options.host ? { host: options.host } : {}),
            openedHtml: options.openedHtml ?? openedAssembled,
            // the opened text with the includes refreshPreview handed since: known content (F5)
            knownHtml: knownAssembled,
            // the served notice is for an assembled file opened from the web, not for an app's page
            servedNotice: assembledFile,
            // the file on disk's uid, read as this editor reads its own (a quoted or block uid is one)
            readUid: headerUid,
        }));
        if ((0, conflict_js_1.saveConflictOpen)(saver)) {
            // a question of this saver is open (this editor's, the page's or another editor's of the file): no
            // second picker; the question (focused) now answers for this text
            if (!destroyed)
                resolveConflict(text, html);
            return { ok: false, via: 'file', error: 'conflict', conflict: true };
        }
        const r = await saver.save({ text, html });
        if (r.via === 'served-notice') {
            // Cmd/Ctrl+S on a served page with nothing unsaved stays quiet (B-16); the Save button and save() show the notice
            if (!destroyed && !(fromKey && text === model.savedText()))
                showServedNotice();
            return { ok: false, via: 'served-notice', error: 'served page' };
        }
        if (r.ok)
            return succeed(text, r.via);
        if (r.via === 'file' && r.error === 'cancelled')
            return { ok: false, via: 'file', error: 'cancelled', cancelled: true };
        if (r.via === 'file' && r.conflict) {
            // the file changed on disk since it was opened (another program, an agent): never written silently
            if (!destroyed)
                resolveConflict(text, html, r);
            return { ok: false, via: 'file', error: 'conflict', conflict: true };
        }
        return fail(new Error(r.error ?? 'The document could not be saved.'), r.via);
    };
    /** The focused element (through shadow roots) when a question opens: where the focus goes back. */
    const focusedNow = () => {
        let a = doc.activeElement ?? null;
        for (let i = 0; i < 16 && a; i++) {
            const inner = a.shadowRoot?.activeElement;
            if (!inner)
                break;
            a = inner;
        }
        return a;
    };
    /**
     * The reader's answer to a save that found the file changed on disk: replace it, or download a
     * copy. One question per saver (round 4, F2): a page and its editors share the saver, so a save of
     * any of them while it is open re-targets that question; only the newest text is written, and
     * only the text written is marked saved.
     */
    const resolveConflict = (text, html, r) => {
        if (!saver)
            return;
        // an app's editor (no opened file) is not told "since this page opened it" (round 3, L9)
        void (0, conflict_js_1.answerSaveConflict)({ saver, root, input: { text, html }, ...(r ? { result: r } : {}), opened: assembledFile, returnFocus: focusedNow() }).then((a) => {
            if (destroyed)
                return;
            if (a.choice === 'replace') {
                const w = a.result;
                if (w.via === 'served-notice')
                    return;
                if (w.ok)
                    succeed(text, w.via);
                else if (w.via === 'file' && w.error === 'stale-conflict')
                    toast(conflict_js_1.SAVE_CONFLICT_STALE, 'warning');
                else if (!(w.via === 'file' && w.error === 'cancelled'))
                    fail(new Error(w.error ?? 'The document could not be saved.'), w.via);
            }
            else if (a.choice === 'download') {
                const w = a.result;
                if (w.via === 'download' && w.ok)
                    toast(chrome_js_2.SAVE_CONFLICT_DOWNLOADED, 'success');
                else
                    fail('error' in w && w.error ? w.error : 'The download failed.', 'download');
            }
        });
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
    /** Proposals this shell made (`proposeAi`) → the exact text they were made on. */
    const proposals = new WeakMap();
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
            if (destroyed)
                return;
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
            if (destroyed)
                return;
            const current = getText();
            const next = (0, header_js_1.editHeader)(current, changes);
            if (next !== current)
                api.setText(next);
        },
        isDirty() { updateDirty(); return dirty; },
        markSaved() { if (!destroyed) {
            adoptBaseline(getText());
            updateDirty();
        } },
        save: () => save(false),
        async requestAi(op, o) {
            const r = await api.proposeAi(op, o);
            if (!r.ok)
                return r;
            const a = api.applyAi(r.proposal);
            // 2.1.0's wording, kept: here the text can only have changed during the request
            return !a.ok && a.error === TEXT_CHANGED_SINCE ? { ok: false, error: 'the text changed during the AI request' } : a;
        },
        async proposeAi(op, o) {
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
            // the shell may have been destroyed or made read-only (a quiet update) meanwhile (F3/#11)
            if (destroyed)
                return { ok: false, error: 'destroyed' };
            if (readOnly)
                return { ok: false, error: 'read-only' };
            const range = selection ?? { from: 0, to: before.length };
            const proposal = Object.freeze({
                op,
                proposed,
                range: Object.freeze({ ...range }),
                original: (0, text_model_js_1.detachString)(before.slice(range.from, range.to)),
                passage: !!selection,
            });
            proposals.set(proposal, before);
            return { ok: true, op, proposal };
        },
        applyAi(proposal, o) {
            const before = proposal && typeof proposal === 'object' ? proposals.get(proposal) : undefined;
            if (before === undefined)
                return { ok: false, error: 'not a proposal of this editor' };
            if (destroyed)
                return { ok: false, error: 'destroyed' };
            if (readOnly)
                return { ok: false, error: 'read-only' };
            if (getText() !== before)
                return { ok: false, error: TEXT_CHANGED_SINCE };
            const replacement = typeof o?.proposed === 'string' ? o.proposed : proposal.proposed;
            const styled = inDocumentStyle(replacement);
            const { from, to } = proposal.range;
            api.setText(proposal.passage ? before.slice(0, from) + styled + before.slice(to) : (model.bom ? BOM : '') + styled);
            proposals.delete(proposal);
            return { ok: true, op: proposal.op };
        },
        async uploadAssets(files) {
            const list = Array.from(files ?? []);
            if (!hooks.uploadAsset)
                return { ok: false, inserted: [], error: 'no upload hook (hooks.uploadAsset)' };
            if (destroyed)
                return { ok: false, inserted: [], error: 'destroyed' };
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
                // destroyed or read-only meanwhile: no further upload, nothing inserted (F3/#11)
                if (destroyed)
                    return { ok: false, inserted: [], error: 'destroyed' };
                if (readOnly)
                    return { ok: false, inserted: [], error: 'read-only' };
            }
            if (destroyed)
                return { ok: false, inserted: [], error: 'destroyed' };
            if (readOnly)
                return { ok: false, inserted: [], error: 'read-only' };
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
            if (destroyed)
                throw new Error('orz editor: destroyed');
            try {
                minted = hooks.mintUid ? String(await hooks.mintUid()) : (0, uid_js_1.mintUid)();
            }
            catch (error) {
                if (!destroyed)
                    emit('error', { source: 'hook', message: message(error), error });
                throw error;
            }
            // destroyed or read-only meanwhile: nothing is set (F3/#11)
            if (destroyed)
                throw new Error('orz editor: destroyed');
            if (readOnly)
                throw new Error('orz editor: read-only — cannot add a uid');
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
        undo: () => (destroyed ? false : adapter.undo?.() ?? false),
        redo: () => (destroyed ? false : adapter.redo?.() ?? false),
        focus() {
            if (destroyed)
                return;
            if (currentView() === 'preview')
                preview.iframe.focus?.();
            else
                adapter.focus();
        },
        on(event, fn) {
            let set = handlers.get(event);
            if (!set)
                handlers.set(event, (set = new Set()));
            set.add(fn);
            return () => { set.delete(fn); };
        },
        async refreshPreview(o) {
            if (destroyed)
                return;
            if (o && typeof o === 'object' && 'includes' in o) {
                const next = o.includes && typeof o.includes === 'object' && Object.keys(o.includes).length > 0 ? Object.freeze({ ...o.includes }) : null;
                if (next)
                    renderCtx.includes = next;
                else
                    delete renderCtx.includes;
                // saves write the latest record (round 3, L7): what the reader sees is what the file keeps
                saveIncludes = next ? { ...next } : null;
                renderCtx.cache?.clear();
            }
            if (renderRunning)
                await renderRunning;
            lastRendered = null; // render even when the text is the same (an include, a record changed)
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
        preview: {
            post: (message) => (destroyed ? false : preview.post(message)),
            on: (type, fn) => preview.on(type, fn),
            setOptions: (o) => { if (!destroyed)
                preview.setOptions(o ?? {}); },
        },
        destroy() {
            if (destroyed)
                return;
            try {
                finalText = getText();
            }
            catch {
                finalText = '';
            }
            destroyed = true;
            // its question goes with its root (the next save of the file asks again)
            if (saver)
                (0, conflict_js_1.dropSaveConflict)(saver, root);
            model.clear();
            renderCtx.cache?.clear();
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