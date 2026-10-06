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
 *   them only while the reader is in the frame (focus that entered it with the
 *   reader's pointer, a Tab or the shell's own `focus()`; for actions with
 *   effects, also transient user activation). Focus that a document script
 *   takes is given back at once and the document's scripts are paused in the
 *   preview; links from the frame open only through the host (`onLink`) or a
 *   click on the shell's own "Open" chip.
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
/** A Tab pressed in the shell this recently explains focus entering the frame (ms). */
const TAB_MS = 1000;
/** A press on the preview pane in the page this recent explains focus entering the frame (ms). */
const PANE_MS = 1000;
/** How long the shell's own `focus()` explains focus entering the frame (ms). */
const GRANT_MS = 500;
/** A reader's focus report this soon after a pause for theft undoes it (Chrome may focus the frame before the click's pointerdown); the note waits as long (ms). */
const RESUME_MS = 500;
/** After undoing such a pause, how long focus entering the (reloading) frame is the reader's (ms). */
const RESUME_GRANT_MS = 3000;
/** How long the shell waits for the bridge's answer about a pointerdown before it counts the focus as theft (ms; the focus is back meanwhile). */
const PONG_MS = 1500;
/** After the bridge said no pointerdown followed the focus, how long a late report of one may still settle it (ms). */
const CONFIRM_MS = 1200;
/** After giving the focus back from a theft, how long a blur the page sees is undone too (ms). */
const RESTORE_MS = 1000;
/** How long a render waits for the frame's acknowledgement: a bridge known to acknowledge, one not known yet (ms). */
const ACK_WAIT_MS = 10000;
const FIRST_ACK_WAIT_MS = 1500;
/** While edits continue, a render runs at least this often: max(this, 4 × the last render and frame time) (ms). */
const MAX_WAIT_MS = 1000;
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
    /** While edits continue, a render runs at least this often (LOW6). */
    const maxWait = () => Math.max(MAX_WAIT_MS, 4 * lastRenderMs);
    const renderCtx = {
        ...(hooks.fetchInclude ? { fetchInclude: (t) => hooks.fetchInclude(t) } : {}),
        ...(hooks.resolveAsset ? { resolveAsset: (p) => hooks.resolveAsset(p) } : {}),
        // B#12: with the host's own link resolution, links stay as written so resolveLink gets the source href
        ...(hooks.resolveLink ? { twinLinks: false } : {}),
        cache: new Map(),
    };
    /** Wait for the frame to acknowledge a render (B#3), at most ACK_WAIT_MS; not at all for a frame that never does. */
    const waitAck = (acked) => {
        const cap = preview.acknowledges ? ACK_WAIT_MS : ackless ? 0 : FIRST_ACK_WAIT_MS;
        if (cap <= 0)
            return Promise.resolve(false);
        return new Promise((resolve) => {
            const timer = later(() => { if (!preview.acknowledges)
                ackless = true; resolve(false); }, cap);
            void acked.then((ok) => { cancel(timer); if (ok)
                ackless = false; resolve(ok); });
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
        const acked = await waitAck(preview.render(html));
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
        if (ms === undefined && staleSince !== null)
            delay = Math.min(delay, Math.max(0, staleSince + maxWait() - clock()));
        renderTimer = later(() => { void renderNow(); }, delay);
    }
    // Frame messages are claims of the document's scripts (A-2) — except the reports the default
    // bridge sends through its private port, which it makes only for trusted events (the reader's own
    // input in the frame; `trusted` below). The preview leads the scroll only while the reader is
    // there: focus on the preview iframe, or a recent "active" report of the frame (wheel, pointer,
    // touch, keys) while the editor neither has focus nor was touched in the host page (pointer, wheel,
    // keys) just before. So a document script that floods "active" and scroll messages cannot move or
    // pin the editor while the reader types in it or scrolls it.
    let claimAt = -Infinity;
    let editorTouchAt = -Infinity;
    const frameFocused = () => root.activeElement === preview.iframe;
    // ── focus entering the frame (F1) ──
    // A document script can focus an element of its frame at any time (Chrome lets a cross-origin
    // frame take focus without user activation); the reader's keys then go to the frame. The default
    // bridge says, through its port, whether the reader's own pointer or touch in the frame brought the
    // focus there (it sees them before the focus moves). Focus that arrives otherwise — and not by a
    // Tab in the page or the shell's own focus() — is theft: it goes back at once to where the reader
    // was, and the document's scripts are paused in the preview, so it does not happen again.
    let tabAt = -Infinity;
    let grantUntil = -Infinity;
    /** The reader pressed on the preview pane in the page: Chrome sends a click there (to the iframe element) when the frame cannot be hit yet, and the click focuses the frame without a pointerdown inside it. */
    let paneDownAt = -Infinity;
    /** The element of the shell that last had the focus, and the page's own element (outside the shell) if it had it later. */
    let lastShellFocus = null;
    let pageFocus = null;
    let pausedNote = null;
    const randomNonce = () => {
        try {
            const a = new Uint32Array(4);
            win.crypto?.getRandomValues?.(a);
            if (a.some((x) => x !== 0))
                return Array.from(a, (x) => x.toString(36)).join('');
        }
        catch { /* no crypto */ }
        return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    };
    /**
     * Give the focus back to where the reader was: the page's element, else the shell's (the editor
     * through the engine, so CodeMirror restores its selection), else the editor (the toolbar when the
     * editor is hidden). The bridge's report can arrive before the page has seen its own loss of focus,
     * while the page still counts the editor as focused and focusing it again does nothing: a blur the
     * page sees in the next moment (a focusout without a new target, or the window's blur) is the
     * frame's doing too and is undone as well.
     */
    let restoreUntil = -Infinity;
    const putFocusBack = () => {
        if (destroyed)
            return;
        if (pageFocus) {
            try {
                pageFocus.focus?.({ preventScroll: true });
            }
            catch { /* gone */ }
            if (!frameFocused())
                return;
        }
        const shown = currentView() !== 'preview';
        if (lastShellFocus && container.contains?.(lastShellFocus)) {
            if (shown && editorPane.contains?.(lastShellFocus))
                adapter.focus();
            else
                lastShellFocus.focus?.({ preventScroll: true });
            return; // the page may count the frame as focused a moment longer: the blur watch of restoreFocus covers it
        }
        // the reader was not in the shell (a theft at load): the shell's region — no caret moved, nothing scrolled
        container.focus?.({ preventScroll: true });
    };
    const restoreFocus = () => {
        restoreUntil = clock() + RESTORE_MS;
        putFocusBack();
    };
    /** When the shell paused the document's scripts for a theft (a reader's report soon after undoes it). */
    let pausedAt = -Infinity;
    let theftPause = false;
    const onTheft = () => {
        if (destroyed)
            return;
        restoreFocus();
        if (preview.scriptsPaused)
            return;
        preview.pauseScripts(previewOptions.nonce || randomNonce());
        pausedAt = clock();
        theftPause = true;
        // said only once it is not the reader's click after all (Chrome may focus the frame before its pointerdown)
        later(() => {
            if (destroyed || !theftPause || !preview.scriptsPaused)
                return;
            const error = new Error('The document\'s scripts took the keyboard focus from the editor: they are paused in the preview.');
            emit('error', { source: 'render', message: error.message, error });
            pausedNote = el('div', 'orz-editor__preview-note orz-editor__preview-note--top');
            pausedNote.setAttribute('role', 'status');
            pausedNote.setAttribute('data-orz-paused', '');
            pausedNote.append(doc.createTextNode('This document\'s scripts tried to take the keyboard, so they are paused in this preview.'));
            previewPane.append(pausedNote);
        }, RESUME_MS);
    };
    /**
     * The frame gained the focus (the bridge's report): the reader's own doing, or theft. Focus the
     * reader did not bring goes back at once (no key reaches the frame meanwhile); then the bridge is
     * asked whether a pointerdown followed — Chrome may focus the frame a moment before the click's
     * pointerdown reaches it, and input queued there is handled before the question. Yes: the reader's
     * click, the frame gets the focus back. No (or no answer in time): theft, the scripts are paused.
     */
    let asking = null;
    let pingSeq = 0;
    const settleAsking = () => { if (asking) {
        cancel(asking.timer);
        asking = null;
    } };
    const letReaderIn = () => {
        settleAsking();
        restoreUntil = -Infinity; // the bounce was wrong: no more undoing of blurs
        grantUntil = clock() + GRANT_MS;
        preview.iframe.focus?.();
    };
    const theftNow = () => { settleAsking(); onTheft(); };
    const onFrameFocus = (reader) => {
        if (destroyed)
            return;
        const t = clock();
        if (reader) {
            if (asking) {
                letReaderIn();
                return;
            }
            if (theftPause && t - pausedAt < RESUME_MS && preview.scriptsPaused) {
                // the "theft" was the reader's click, reported a moment late: run the document's scripts again, let the reader in
                theftPause = false;
                restoreUntil = -Infinity;
                preview.resumeScripts();
                grantUntil = t + RESUME_GRANT_MS; // the frame reloads: its focus must not count as theft
                preview.iframe.focus?.();
            }
            return;
        }
        if (t < grantUntil || t - tabAt < TAB_MS || t - paneDownAt < PANE_MS)
            return;
        restoreFocus();
        if (preview.scriptsPaused)
            return;
        // taken again before the question was settled: a reader's click does not do that, a script does
        if (asking) {
            theftNow();
            return;
        }
        const id = ++pingSeq;
        asking = { id, said: false, timer: later(() => { if (asking?.id === id)
                theftNow(); }, PONG_MS) };
        if (!preview.post({ type: 'orz-preview-ping', id }))
            theftNow();
    };
    const onPong = (id, pointer) => {
        if (destroyed || !asking || asking.id !== id || asking.said)
            return;
        if (pointer) {
            letReaderIn();
            return;
        }
        // no pointerdown yet: under load it may still be on its way — a short wait, which a report of the
        // reader's pointer (or another theft) settles sooner
        cancel(asking.timer);
        asking.said = true;
        asking.timer = later(() => { if (asking?.id === id)
            theftNow(); }, CONFIRM_MS);
    };
    const previewLeads = () => {
        if (frameFocused())
            return true;
        const t = clock();
        return t - claimAt < CLAIM_MS && t - editorTouchAt > TOUCH_MS && !(adapter.hasFocus?.() ?? false);
    };
    // A key or link the bridge reports through its port is the reader's own (a trusted event in the
    // frame): it acts. A carrier's own bridge (no port) sends claims: they act only while focus is on
    // the preview iframe and the page has transient user activation (a real input in the frame
    // activates its ancestors); Escape (which a browser does not count as activation) needs the focus
    // only: all it does is move focus from the frame to the toolbar.
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
    // Links from the frame are claims too (F1b): they open only through the host (`onLink`) or the
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
        onKey: (key, trusted) => {
            if (trusted || (key === 'Escape' ? frameFocused() : activated()))
                onShortcut(key, null);
        },
        onLink: (href, trusted) => { if (trusted || activated())
            openLink(href); },
        // counts only while the editor is untouched (previewLeads)
        onActive: () => { claimAt = clock(); },
        onFocus: (reader) => onFrameFocus(reader),
        onPong: (id, pointer) => onPong(id, pointer),
        onReady: () => {
            previewNote?.remove();
            previewNote = null;
            // a frame reloaded for a theft may take the browser's focus with it when it commits: take it back
            if (theftPause && preview.scriptsPaused && clock() - pausedAt < 5000)
                restoreFocus(); // (and watch the next moment again)
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
    // what the page sees around the frame (F1): a Tab (keyboard navigation into the frame) and where the focus was
    const docListen = (type, fn) => {
        if (typeof doc.addEventListener !== 'function')
            return;
        doc.addEventListener(type, fn, true);
        cleanups.push(() => doc.removeEventListener?.(type, fn, true));
    };
    docListen('keydown', (e) => {
        if (e.key === 'Tab')
            tabAt = clock();
        // just after a theft, a key that finds nothing focused (the frame took the focus and let it go)
        // goes to the editor: the text of a key goes where the focus is once its keydown has run
        else if (clock() < restoreUntil && (doc.activeElement === doc.body || !doc.activeElement))
            putFocusBack();
    });
    docListen('focusin', (e) => { pageFocus = e.target === host ? null : e.target; });
    listen(container, 'focusin', (e) => {
        const target = (e.composedPath?.()[0] ?? e.target);
        if (target !== preview.iframe)
            lastShellFocus = target;
    });
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
        listen(previewPane, type, (e) => { if (e.isTrusted !== false)
            paneDownAt = clock(); }, { capture: true, passive: true });
    }
    // just after a theft: the page sees the frame take the focus a moment late — undo that as well
    listen(container, 'focusout', (e) => { if (clock() < restoreUntil && !e.relatedTarget)
        later(putFocusBack, 0); });
    listen(win, 'blur', () => { if (clock() < restoreUntil)
        later(putFocusBack, 0); });
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
        if (destroyed)
            return { ok: false, error: 'destroyed' }; // nothing new starts after destroy
        saver ?? (saver = (0, save_js_1.createSaver)({
            ...(uid ? { uid } : {}),
            suggestedName: options.fileName ?? `document${protocol_js_1.KIND_EXTENSIONS[kind] ?? '.html'}`,
            kind,
            ...(options.host ? { host: options.host } : {}),
            openedHtml: options.openedHtml ?? (async () => String(await options.assemble(openedText))),
        }));
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
            if (currentView() === 'preview') {
                grantUntil = clock() + GRANT_MS; // the shell's own focus() is a legitimate entry into the frame
                preview.iframe.focus?.();
            }
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