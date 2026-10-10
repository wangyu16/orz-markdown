"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPDATE_QUESTION_OPEN = exports.UPDATE_CONFLICT_MESSAGE = exports.APP_CSS = void 0;
exports.bootCarrierApp = bootCarrierApp;
/**
 * The standalone assembled file's runtime (spec/carrier-app.md): what every
 * carrier's browser bundle runs when it finds itself in an assembled file —
 * kind-independent, behind the `StandaloneKind` seam (./types.ts). Lifted from
 * orz-mdhtml 1.0's `standalone/app.ts` (REBUILD §3a, owner decision 2).
 *
 * On boot it reads the opened file (./file.ts), renders the kind's read view
 * in the page and mounts the chrome in a shadow root. Reading is
 * undisturbed (2.2.0): ONE control, a small pencil at the bottom-left
 * (./handle.ts) — a click edits; hovering (or a tap, or the keyboard) opens
 * the list of every operation: Edit, the kind's bar actions, Save, Download
 * a copy, New document, Save as new copy, the kind's header settings (as
 * submenus), its menu actions, its reader controls (text size) and the quiet
 * update. Edit mode has a bar: the title, Done, More (Download a copy, New
 * document, Save as new copy, the kind's in-edit actions) and, quietly at its
 * far end, the orz seal (https://markdown.orz.how) and the kind's GitHub
 * repository.
 *
 * - **The text is the document.** The page holds the current text and the
 *   last saved one; every save writes `assemble(currentText, { the file's
 *   delivery, engine and includes })` — never the live DOM
 *   (spec/shell-runtime.md §0).
 * - **Header settings** write the header: in edit mode through the editor's
 *   `setHeader` (one undoable edit), in the read view through `editHeader` on
 *   the current text (Cmd/Ctrl+Z undoes it). Both mark the document unsaved.
 * - **Edit mode** mounts the kind's editor with the file's saver, host,
 *   includes, opened bytes and reader preferences; leaving keeps its text and
 *   re-renders the read view.
 * - **Host** (framed only): `connectHost` (all three protocols): saves go to
 *   the host; its AI operations become the editors' AI menu with the review
 *   flow; its include resolution feeds the read view and the preview.
 * - **Leaving with unsaved changes** (top-level only): `beforeunload` asks
 *   (the browser's own prompt); never for the update's reload.
 * - **Quiet update** (top-level only, the kit's who-checks rules):
 *   `checkForUpdate` → `mountUpdateIndicator` → `performUpdate`; the document
 *   is read-only while it runs; the page reloads only when the kit says so.
 * - **Keymap**: Cmd/Ctrl+S saves the document being edited — also in edit
 *   mode with the focus on the chrome or the page (the browser's "Save page
 *   as" never runs while a document is open), Cmd/Ctrl+E edits and leaves
 *   edit mode, Cmd/Ctrl+Z / Shift+Z undo / redo header settings; a key
 *   another handler took (`defaultPrevented`) is never ours; other keys go to
 *   the read view (`onKey`: slides' navigation), also from a chrome button
 *   (not Enter, Space, Tab or Escape, which are the button's).
 *
 * Nothing runs at module load.
 */
const header_js_1 = require("../header.js");
const uid_js_1 = require("../uid.js");
const chrome_js_1 = require("../shell/chrome.js");
const brand_js_1 = require("../shell/brand.js");
const conflict_js_1 = require("../shell/conflict.js");
const file_side_js_1 = require("../shell/file-side.js");
const indicator_js_1 = require("../shell/indicator.js");
const preferences_js_1 = require("../shell/preferences.js");
const protocol_js_1 = require("../shell/protocol.js");
const save_js_1 = require("../shell/save.js");
const update_js_1 = require("../shell/update.js");
const file_js_1 = require("./file.js");
const widgets_js_1 = require("./widgets.js");
const handle_js_1 = require("./handle.js");
/**
 * The chrome's own layout, next to `CHROME_CSS`, `WIDGET_CSS` and the
 * handle's `HANDLE_CSS`: in the read view the host is the handle, fixed at
 * the bottom-left (safe-area aware); in edit mode it is the full-page
 * overlay with the bar on top.
 */
exports.APP_CSS = `
:host {
  position: fixed; z-index: 2147481000; display: block;
  left: max(16px, calc(env(safe-area-inset-left, 0px) + 12px)); bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px));
}
:host([data-mode="edit"]) { inset: 0; display: flex; flex-direction: column; background: var(--orz-chrome-bg); }
:host([data-mode="edit"]) .orz-handle { display: none; }
:host(:not([data-mode="edit"])) .orz-app__bar { display: none; }
.orz-app__bar {
  display: flex; align-items: center; gap: var(--orz-chrome-space-2);
  padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3) var(--orz-chrome-space-2) var(--orz-chrome-space-4);
  border-bottom: 1px solid var(--orz-chrome-border); background: var(--orz-chrome-surface);
}
/* no transform, filter or backdrop-filter on the bar or the handle: they would trap the kit's fixed popovers and toasts */
.orz-app__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--orz-chrome-muted); }
.orz-app__brand { display: inline-flex; align-items: center; }
.orz-app__brand-links { display: inline-flex; align-items: center; gap: var(--orz-chrome-space-1); margin-left: var(--orz-chrome-space-3); }
.orz-app__brand-link {
  display: inline-flex; align-items: center; justify-content: center; height: var(--orz-chrome-control); padding: 0 var(--orz-chrome-space-2);
  border-radius: var(--orz-chrome-radius-s); color: var(--orz-chrome-muted); text-decoration: none; opacity: .6;
  transition: opacity var(--orz-chrome-fast) var(--orz-chrome-ease), background var(--orz-chrome-fast) var(--orz-chrome-ease), color var(--orz-chrome-fast) var(--orz-chrome-ease);
}
.orz-app__brand-link:hover, .orz-app__brand-link:focus-visible { opacity: 1; color: var(--orz-chrome-fg); background: var(--orz-chrome-hover); }
.orz-brand-mark { display: inline-flex; }
.orz-brand-mark--seal svg { display: block; height: 19px; width: auto; }
.orz-brand-mark--github svg { display: block; width: 16px; height: 16px; }
.orz-app__editor { flex: 1; min-height: 0; display: flex; }
.orz-app__editor > * { flex: 1; min-width: 0; }
@media (max-width: 560px) {
  .orz-btn--has-icon .orz-btn__label { display: none; } .orz-btn { padding: 0 var(--orz-chrome-space-3); }
  .orz-app__brand-links { margin-left: 0; }
}
/* a presenter hides the handle, the bar and the editor, not the toasts (2.2.0): the stack is fixed bottom centre */
:host([data-hidden]) { display: block; inset: auto; top: auto; right: auto; width: 0; height: 0; background: none; }
:host([data-hidden]) .orz-handle, :host([data-hidden]) .orz-app__bar, :host([data-hidden]) .orz-app__editor, :host([data-hidden]) .orz-popover { display: none !important; }
`;
/** The page's bottom padding at narrow widths, so the last lines can scroll clear of the handle (2.2.0). */
const NARROW = '(max-width: 560px)';
const NARROW_BOTTOM = '72px';
/** The orz seal's link and the GitHub link of edit mode (2.2.0). */
const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/?$/;
const DEFAULT_SERVICES = {
    createSaver: save_js_1.createSaver,
    connectHost: file_side_js_1.connectHost,
    checkForUpdate: update_js_1.checkForUpdate,
    performUpdate: update_js_1.performUpdate,
    mountUpdateIndicator: indicator_js_1.mountUpdateIndicator,
    skipVersion: (kind, version) => (0, update_js_1.skipVersion)(kind, version),
};
const errorText = (e) => (e instanceof Error ? e.message : String(e));
/** A reader choice control's preference name (2.3.0): stored as `reader.<key>`. */
const READER_KEY = /^[a-z][A-Za-z0-9_-]{0,31}$/;
/** The kind's well-formed reader choice controls (2.3.0): a malformed one is not offered. */
function readerChoiceControls(list) {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(list))
        return out;
    for (const c of list) {
        if (!c || typeof c !== 'object' || typeof c.key !== 'string' || !READER_KEY.test(c.key) || seen.has(c.key))
            continue;
        if (typeof c.label !== 'string' || typeof c.apply !== 'function' || !Array.isArray(c.choices))
            continue;
        const ids = c.choices.map((x) => (x && typeof x === 'object' ? x.id : undefined));
        if (ids.length < 1 || ids.length > 24 || new Set(ids).size !== ids.length)
            continue;
        if (c.choices.some((x) => typeof x.id !== 'string' || x.id === '' || x.id.length > 64 || typeof x.label !== 'string'))
            continue;
        seen.add(c.key);
        out.push(c);
    }
    return out;
}
/** A suggested name for a new document (2.3.0): path and control characters removed, the kind's extension added when missing. */
function newFileName(name, ext) {
    let n = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
    n = n.replace(/^[.\s]+/, '').slice(0, 120).trim();
    if (!n)
        return `Untitled${ext}`;
    return n.toLowerCase().endsWith(ext.toLowerCase()) ? n : `${n}${ext}`;
}
/** The update found the file changed on disk (S.14): nothing was written (2.2.0, round 2 of the carrier-app loop). */
exports.UPDATE_CONFLICT_MESSAGE = 'The file changed on disk since you opened it (another program or an agent edited it), so the update wrote nothing. Reload the page to open its version, then update.';
/** Update now while the file's save-conflict question is open (S.14): refused, the question focused (round 5 of the carrier-app loop, B4). */
exports.UPDATE_QUESTION_OPEN = 'The file changed on disk and the question about it is still open, so the update wrote nothing. Answer it first (Replace it, or Download a copy instead), then update.';
/** A text's header facts the app needs: its `format` (default 1, as `readDocument` reads it) and its well-formed `uid`. */
function headerFacts(text) {
    const fields = (0, header_js_1.readHeader)(text)?.fields ?? {};
    const f = fields['format']?.trim();
    const uid = fields['uid']?.trim();
    return { format: f && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1, ...(uid && header_js_1.UID_PATTERN.test(uid) ? { uid } : {}) };
}
/**
 * Boot the standalone file in `window` (default: the global window): null
 * when the page is not an assembled file of this kind (an app page, the
 * update sandbox) — nothing is touched then.
 */
function bootCarrierApp(k, options = {}) {
    const maybeWin = (options.window ?? globalThis.window);
    if (!maybeWin || !maybeWin.document)
        return null;
    const win = maybeWin;
    const doc = win.document;
    const opened = (0, file_js_1.readOpenedFile)(doc, k.kind);
    if (!opened)
        return null;
    const file = opened;
    const services = { ...DEFAULT_SERVICES, ...(options.services ?? {}) };
    const ext = protocol_js_1.KIND_EXTENSIONS[k.kind];
    const maxFormat = Math.max(...k.formats);
    const isMac = /Mac|iPhone|iPad/.test(String(win.navigator?.platform ?? win.navigator?.userAgent ?? ''));
    const cleanups = [];
    const listen = (target, type, fn, o) => {
        target.addEventListener(type, fn, o);
        cleanups.push(() => target.removeEventListener(type, fn, o));
    };
    /** A pointer or the keyboard drove the chrome last (where the focus goes after Done or a bar action). */
    let pointerUsed = false;
    let disposed = false;
    // ── document state: the text is the document ──
    let text = file.text;
    let saved = file.text;
    let editor = null;
    let updating = false;
    const undoStack = [];
    const redoStack = [];
    /** Editors mounted on this file's context through `OrzCarrier.mountEditor` (not the Edit button's). */
    const attached = [];
    /** The document being edited: the Edit button's editor, else the last attached one, else none. */
    const active = () => editor ?? attached[attached.length - 1] ?? null;
    const currentText = () => { const a = active(); return a ? a.getText() : text; };
    const isDirty = () => (editor ? editor.isDirty() : text !== saved) || attached.some((ed) => ed.isDirty());
    // ── the file's own assembly: its delivery, engine and includes (FC-19 §8.5); the opened bytes (content proof) ──
    const engineSource = file.engine ?? undefined;
    const assembleWith = (t, includes) => Promise.resolve().then(() => k.assemble(t, { delivery: file.delivery, ...(engineSource ? { engineSource } : {}), ...(includes ? { includes } : {}) })).then(String);
    const assembleFile = (t, o) => assembleWith(t, o?.includes);
    let openedBytes = null;
    /** The opened bytes, once they are assembled (a failure is not kept: tried again at the next save, never disabling the conflict check). */
    const openedHtml = () => {
        if (openedBytes)
            return openedBytes;
        const run = assembleWith(file.text, file.includes);
        openedBytes = run;
        run.catch(() => { if (openedBytes === run)
            openedBytes = null; });
        return run;
    };
    {
        // computed when the page is first idle, so a save click does not wait for it (B#6)
        const warm = () => { void openedHtml().catch(() => undefined); };
        if (typeof win.requestIdleCallback === 'function')
            win.requestIdleCallback(warm, { timeout: 2000 });
        else
            win.setTimeout(warm, 300);
    }
    // ── host (framed only: an unframed page never listens) ──
    let framed = true;
    try {
        framed = win.parent !== win;
    }
    catch {
        framed = true;
    }
    const aiMenus = new Set();
    let rerender = () => undefined;
    const host = framed
        ? services.connectHost({
            kind: k.kind,
            window: win,
            ai: { onOperations() { for (const m of aiMenus)
                    m.refresh(); } },
            include: { onAvailable() { rerender(); } },
        })
        : undefined;
    const hostAi = host && {
        get operations() { return host.aiOperations(); },
        async request(op, c) {
            const passage = c.selection ? c.text.slice(c.selection.from, c.selection.to) : c.text;
            const r = await host.requestAi(op, passage, !!c.selection);
            if (r.ok !== true || typeof r.proposed !== 'string')
                throw new Error(r.error ?? 'The host could not run that.');
            return { proposed: r.proposed };
        },
    };
    // orz-host-include@1 resolves URL includes only: a file include's path is not sent to the host
    const hostInclude = host
        ? (url) => (host.protocols().include && /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? host.requestInclude(url) : Promise.resolve(null))
        : undefined;
    // the file on disk's uid is read as the page reads its own (a quoted or block uid is one: S.14)
    const fileSaver = services.createSaver({ ...(file.uid ? { uid: file.uid } : {}), suggestedName: file.fileName, kind: k.kind, ...(host ? { host } : {}), openedHtml, readUid: (t) => headerFacts(t).uid });
    /** What the page itself saves (its own save and its own question's input): a write of one of them is the page's text. */
    const ownInputs = new WeakSet();
    /**
     * The ONE saver of this file (round 5 of the carrier-app loop, B1–B3): the
     * page, the Edit button's editor and every attached editor save through it
     * (one question per saver object, S.14), so every write of the file — also
     * an editor's save or conflict answer that settles after the editor was
     * destroyed (Done, Cmd/Ctrl+E) — tells the page which text the file holds.
     */
    const saver = {
        save: (input, o) => fileSaver.save(input, o).then((r) => { if ('ok' in r && r.ok)
            wrote(input); return r; }),
        download: (input) => fileSaver.download(input),
        handleKey: () => fileSaver.handleKey(),
    };
    /** The page's storage (reader preferences, the once-a-day record); absent or throwing: the kit's fail-closed defaults. */
    let storage;
    try {
        storage = win.localStorage ?? undefined;
    }
    catch {
        storage = undefined;
    }
    const preferences = (0, preferences_js_1.createPreferenceStore)(file.uid, storage);
    const editorContext = () => ({
        fileName: file.fileName,
        assemble: assembleFile,
        saver,
        ...(host ? { host } : {}),
        ...(file.includes ? { includes: { ...file.includes } } : {}),
        openedHtml,
        standalone: !host,
        ...(hostAi ? { ai: hostAi } : {}),
        ...(hostInclude ? { fetchInclude: hostInclude } : {}),
        preferences,
        ...(options.adapter ? { adapter: options.adapter } : {}),
    });
    /** The host's AI operations in an editor of this file (with the review flow). */
    const withAiMenu = (ed) => {
        if (!hostAi)
            return () => undefined;
        const menu = (0, widgets_js_1.attachAiMenu)(ed, { operations: () => hostAi.operations });
        aiMenus.add(menu);
        return () => { aiMenus.delete(menu); menu.destroy(); };
    };
    // ── read view ──
    const view = k.createReadView(doc);
    const setViewVisible = (visible) => {
        if (view.setVisible)
            view.setVisible(visible);
        else if (view.element)
            view.element.hidden = !visible;
    };
    const renderView = () => Promise.resolve().then(() => view.render(currentText(), { ...(file.includes ? { includes: file.includes } : {}), ...(hostInclude ? { fetchInclude: hostInclude } : {}) }));
    rerender = () => { if (!editor)
        void renderView().catch(() => undefined);
    else
        void editor.refreshPreview(); };
    const ready = renderView().then(() => {
        // a fragment in the address goes to its element once the content exists
        let id = '';
        try {
            id = decodeURIComponent(win.location.hash.slice(1));
        }
        catch {
            id = '';
        }
        if (id)
            doc.getElementById(id)?.scrollIntoView?.();
    }, (e) => { try {
        console.error('orz carrier: the read view could not render', e);
    }
    catch { /* no console */ } });
    // ── chrome: one shadow root on the shell's mount point ──
    let mount = doc.getElementById('orz-chrome');
    if (!mount) {
        mount = doc.createElement('div');
        mount.id = 'orz-chrome';
    }
    // first in the page's order after the islands: a keyboard reaches Edit and Save before the document (it is drawn fixed, top right)
    let first = doc.body.firstElementChild;
    while (first && first !== mount && String(first.tagName).toUpperCase() === 'SCRIPT')
        first = first.nextElementSibling;
    if (first !== mount) {
        if (first?.before)
            first.before(mount);
        else
            doc.body.append(mount);
    }
    const chromeHost = mount;
    chromeHost.setAttribute('data-orz-chrome', 'app');
    const root = chromeHost.shadowRoot ?? (0, chrome_js_1.createShadowRoot)(chromeHost);
    (0, widgets_js_1.installCss)(root, widgets_js_1.WIDGET_CSS);
    (0, widgets_js_1.installCss)(root, exports.APP_CSS);
    const toast = (message, tone = 'info') => {
        (0, chrome_js_1.showToast)(root, message, { tone });
    };
    /** The chrome's scheme: the reader's `darkChrome` preference when set, else the document's. */
    const setScheme = (scheme) => {
        const pref = preferences.get('darkChrome');
        chromeHost.setAttribute('data-chrome', pref === true ? 'dark' : pref === false ? 'light' : scheme);
    };
    const present = () => {
        try {
            setScheme(view.present(currentText()).scheme);
        }
        catch { /* the view's own error */ }
    };
    present();
    const modKey = isMac ? '⌘' : 'Ctrl+';
    // ── edit mode's bar: the title, the update indicator's anchor, in-edit bar actions, Done, More, the brand links ──
    const bar = doc.createElement('div');
    bar.className = 'orz-app__bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Document');
    const title = doc.createElement('span');
    title.className = 'orz-app__title';
    /** The quiet update's indicator goes right after this anchor (edit mode; the read view offers it in the handle's list). */
    const brand = doc.createElement('span');
    brand.className = 'orz-app__brand';
    brand.id = 'orz-brand';
    brand.tabIndex = -1;
    const doneBtn = (0, widgets_js_1.button)(doc, { label: 'Done', icon: 'preview', title: 'Back to the read view' });
    bar.append(title, brand);
    // a kind's actions: run, or (2.3.0) a submenu of entries; offered unless `hidden(text)` says so
    const actions = (k.actions ?? []).filter((a) => !!a && (typeof a.run === 'function' || typeof a.items === 'function'));
    const offered = (a, t) => !(0, widgets_js_1.hiddenFor)(a, t); // asked once per text (A.29)
    const runAction = (id) => {
        const a = actions.find((x) => x.id === id);
        if (!a || typeof a.run !== 'function')
            return;
        Promise.resolve().then(() => a.run(api)).catch((e) => toast(`${a.label}: ${errorText(e)}`, 'error'));
    };
    /** A submenu's entries, as the kind gives them now (a throwing `items` offers none). */
    const actionItems = (a) => {
        try {
            const list = a.items?.(api) ?? [];
            return Array.from(list).filter((it) => !!it && typeof it.label === 'string' && typeof it.run === 'function');
        }
        catch (e) {
            toast(`${a.label}: ${errorText(e)}`, 'error');
            return [];
        }
    };
    const runItem = (a, it) => {
        Promise.resolve().then(() => it.run(api)).catch((e) => toast(`${a.label} — ${it.label}: ${errorText(e)}`, 'error'));
    };
    const menuItemsOf = (a) => actionItems(a).map((it) => ({
        label: it.label,
        ...(it.checked !== undefined ? { checked: !!it.checked } : {}),
        ...(it.disabled ? { disabled: true } : {}),
        ...(it.separator ? { separator: true } : {}),
        run: () => runItem(a, it),
    }));
    /** Edit mode's bar actions, with their element (a button, or a menu button for one with items): they follow `hidden(text)`. */
    const barActions = [];
    for (const a of actions.filter((x) => x.placement === 'bar' && x.inEdit)) {
        if (typeof a.items === 'function') {
            const mb = (0, widgets_js_1.menuButton)(doc, { label: a.label, ...(a.icon ? { icon: a.icon } : {}), heading: a.label, items: () => menuItemsOf(a) });
            mb.element.setAttribute('data-orz-action', a.id);
            bar.append(mb.element);
            barActions.push({ action: a, element: mb.element, menu: mb });
            continue;
        }
        const b = (0, widgets_js_1.button)(doc, { label: a.label, ...(a.icon ? { icon: a.icon } : {}) });
        b.setAttribute('data-orz-action', a.id);
        b.addEventListener('click', () => {
            runAction(a.id);
            // after a pointer's click the focus is the page's, so the read view's keys (Space, Enter) work at once
            if (pointerUsed && root.activeElement === b)
                b.blur?.();
        });
        bar.append(b);
        barActions.push({ action: a, element: b });
    }
    /** The bar's conditional actions follow the text (2.3.0). */
    const syncBarActions = () => {
        const t = currentText();
        for (const x of barActions) {
            if (typeof x.action.hidden !== 'function')
                continue;
            const show = offered(x.action, t);
            if (!show)
                x.menu?.close();
            x.element.hidden = !show;
        }
    };
    syncBarActions();
    const more = (0, widgets_js_1.menuButton)(doc, {
        label: 'More',
        icon: 'more',
        iconOnly: true,
        items: () => {
            const t = currentText();
            return [
                { label: 'Download a copy', run: () => { void download(); } },
                { label: 'New document', separator: true, run: () => { void newDocument(); } },
                { label: 'Save as new copy', run: () => { void saveAsCopy(); } },
                ...actions.filter((a) => a.placement !== 'bar' && a.inEdit && offered(a, t)).map((a, i) => (typeof a.items === 'function'
                    ? { label: a.label, ...(i === 0 ? { separator: true } : {}), items: () => menuItemsOf(a), run: () => undefined }
                    : { label: a.label, ...(i === 0 ? { separator: true } : {}), run: () => runAction(a.id) })),
            ];
        },
    });
    bar.append(doneBtn, more.element);
    // the family's brand, quiet at the far end: the orz seal → the orz-markdown website, the GitHub mark → the kind's repository
    const repo = typeof k.repo === 'string' && GITHUB_REPO.test(k.repo) ? k.repo : null;
    const toolName = (typeof k.brand === 'string' && k.brand.trim()) || (repo ? repo.replace(/\/$/, '').split('/').pop() : 'orz');
    const brandLinks = doc.createElement('span');
    brandLinks.className = 'orz-app__brand-links';
    const brandLink = (href, label, mark, cls) => {
        const a = doc.createElement('a');
        a.className = `orz-app__brand-link ${cls}`;
        a.setAttribute('href', href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('aria-label', label);
        a.title = label;
        a.append((0, brand_js_1.brandMark)(doc, mark));
        return a;
    };
    brandLinks.append(brandLink(brand_js_1.ORZ_MARKDOWN_SITE, 'orz-markdown website', 'seal', 'orz-app__seal'));
    if (repo)
        brandLinks.append(brandLink(repo, `${toolName} on GitHub`, 'github', 'orz-app__github'));
    bar.append(brandLinks);
    const editorSlot = doc.createElement('div');
    editorSlot.className = 'orz-app__editor';
    editorSlot.hidden = true;
    // ── the reader controls (D5: reader preferences by uid, never the document) ──
    const fontCfg = (() => {
        const c = k.readerControls?.fontScale;
        if (!c)
            return null;
        const min = Math.max(25, Math.ceil(Number(c.min)));
        const max = Math.min(400, Math.floor(Number(c.max)));
        const step = Math.round(Number(c.step));
        return Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(step) && step > 0 && min <= 100 && max >= 100 ? { min, max, step } : null;
    })();
    /** A percentage on the kind's grid (100 ± n steps), inside its range. */
    const snapFont = (p) => {
        const c = fontCfg;
        const v = 100 + Math.round((p - 100) / c.step) * c.step;
        return Math.min(c.max, Math.max(c.min, v));
    };
    let fontPct = fontCfg ? snapFont(preferences.get('fontScale')) : null;
    /** Where the read view's custom properties go: its element, else the page's root. */
    const scaleTarget = () => view.element ?? doc.documentElement;
    const applyFont = () => {
        if (fontPct !== null)
            scaleTarget().style.setProperty('--orz-font-scale', String(fontPct / 100));
    };
    applyFont();
    function setFontScale(p) {
        if (!fontCfg)
            return null;
        const v = snapFont(p === null || !Number.isFinite(p) ? 100 : p);
        fontPct = v;
        applyFont();
        if (v === 100)
            preferences.remove('fontScale');
        else
            preferences.set('fontScale', v);
        return v;
    }
    const fontButtons = () => {
        const c = fontCfg;
        const now = fontPct ?? 100;
        return [
            { text: 'A−', label: 'Smaller text', disabled: now <= c.min, run: () => { setFontScale(now - c.step); } },
            { text: `${now}%`, label: `Reset text size, now ${now}%`, run: () => { setFontScale(null); } },
            { text: 'A+', label: 'Larger text', disabled: now >= c.max, run: () => { setFontScale(now + c.step); } },
        ];
    };
    // ── reader controls with named choices (2.3.0): reader preferences `reader.<key>`, validated against the ids ──
    const choiceControls = readerChoiceControls(k.readerControls?.choices);
    const choiceDefault = (c) => (c.choices.some((x) => x.id === c.default) ? c.default : c.choices[0].id);
    const choiceStore = choiceControls.length > 0
        ? (0, preferences_js_1.createPreferenceStore)(file.uid, storage, Object.fromEntries(choiceControls.map((c) => {
            const ids = c.choices.map((x) => x.id);
            return [`reader.${c.key}`, { default: choiceDefault(c), valid: (v) => typeof v === 'string' && ids.includes(v) }];
        })))
        : null;
    const choiceNow = new Map();
    const applyChoice = (c, id) => {
        try {
            c.apply(view, id);
        }
        catch (e) {
            try {
                console.error(`orz carrier: the reader control ${c.key} could not apply ${id}`, e);
            }
            catch { /* no console */ }
        }
    };
    for (const c of choiceControls) {
        const id = String(choiceStore.get(`reader.${c.key}`));
        choiceNow.set(c.key, id);
        applyChoice(c, id);
    }
    function setReaderChoice(key, id) {
        const c = choiceControls.find((x) => x.key === key);
        if (!c)
            return null;
        const v = typeof id === 'string' && c.choices.some((x) => x.id === id) ? id : choiceDefault(c);
        choiceNow.set(key, v);
        if (v === choiceDefault(c))
            choiceStore.remove(`reader.${key}`);
        else
            choiceStore.set(`reader.${key}`, v);
        applyChoice(c, v);
        return v;
    }
    // ── the quiet update's offer (set when a check offers one) ──
    let offer = null;
    let indicator = null;
    /** A setting's radio choices in the handle (2.3.0: `choicesFor`, per-choice `checked`, separators, the setting's own `apply`). */
    const settingSubItems = (control) => {
        const t = currentText();
        let now = null;
        const current = () => (now ?? (now = control.current(t)));
        return (0, widgets_js_1.settingChoices)(control, t).map((c) => {
            const toggle = typeof c.checked === 'boolean';
            return {
                label: c.label,
                checked: toggle ? c.checked : c.value === current(),
                ...(c.swatch ? { swatch: c.swatch } : {}),
                ...(c.separator ? { separator: true } : {}),
                run: () => {
                    const text = currentText();
                    if (!toggle && c.value === control.current(text))
                        return;
                    let changes;
                    try {
                        changes = (0, widgets_js_1.settingChanges)(control, text, c.value);
                    }
                    catch (err) {
                        toast(`Could not change the header: ${errorText(err)}`, 'error');
                        return;
                    }
                    setSetting({ ...changes });
                },
            };
        });
    };
    // ── the read view's one control: the handle and its list ──
    const listEntries = () => {
        const t = currentText();
        const e = [{ type: 'item', id: 'edit', label: 'Edit', icon: 'edit', hint: `${modKey}E`, run: () => { edit(); } }];
        /** A kind's action as an entry: an item, or (2.3.0) a submenu of its entries (disabled when it has none). */
        const actionEntry = (a, separator) => {
            const base = { id: `action:${a.id}`, label: a.label, ...(a.icon ? { icon: a.icon } : {}), ...(separator ? { separator: true } : {}) };
            if (typeof a.items !== 'function')
                return { type: 'item', ...base, run: () => runAction(a.id) };
            const items = () => actionItems(a).map((it) => ({
                label: it.label,
                ...(it.checked !== undefined ? { checked: !!it.checked } : {}),
                ...(it.disabled ? { disabled: true } : {}),
                ...(it.separator ? { separator: true } : {}),
                run: () => runItem(a, it),
            }));
            return { type: 'submenu', ...base, ...(actionItems(a).length === 0 ? { disabled: true } : {}), items };
        };
        for (const a of actions.filter((x) => x.placement === 'bar' && offered(x, t)))
            e.push(actionEntry(a, false));
        e.push({ type: 'item', id: 'save', label: 'Save', icon: 'save', hint: `${modKey}S`, dot: isDirty(), run: () => { void save(); } }, { type: 'item', id: 'download', label: 'Download a copy', icon: 'download', run: () => { void download(); } }, { type: 'item', id: 'new', label: 'New document', icon: 'new', separator: true, run: () => { void newDocument(); } }, { type: 'item', id: 'copy', label: 'Save as new copy', icon: 'copy', run: () => { void saveAsCopy(); } });
        (k.settings ?? []).filter((control) => (0, widgets_js_1.settingOffered)(control, t)).forEach((control, i) => e.push({
            type: 'submenu',
            id: `setting:${control.key}`,
            label: control.label,
            ...(control.icon ? { icon: control.icon } : {}),
            ...(i === 0 ? { separator: true } : {}),
            disabled: updating,
            items: () => settingSubItems(control),
        }));
        actions.filter((a) => a.placement !== 'bar' && offered(a, t)).forEach((a, i) => e.push(actionEntry(a, i === 0)));
        choiceControls.forEach((c, i) => e.push({
            type: 'submenu',
            id: `reader:${c.key}`,
            label: c.label,
            ...(c.icon ? { icon: c.icon } : {}),
            ...(i === 0 ? { separator: true } : {}),
            items: () => {
                const now = choiceNow.get(c.key);
                return c.choices.map((x) => ({ label: x.label, checked: x.id === now, run: () => { setReaderChoice(c.key, x.id); } }));
            },
        }));
        if (fontCfg)
            e.push({ type: 'row', id: 'font-scale', label: 'Text size', separator: choiceControls.length === 0, buttons: fontButtons });
        const o = offer;
        if (o) {
            e.push({
                type: 'submenu',
                id: 'update',
                label: updating ? 'Updating…' : `Update to ${o.latest}`,
                icon: 'update',
                dot: true,
                separator: true,
                disabled: updating,
                items: () => [
                    { label: 'Update now', run: () => { void runUpdate(o).catch((err) => { if (!disposed)
                            toast(errorText(err), 'error'); }); } },
                    ...(o.notes ? [{ label: 'What’s new', href: o.notes }] : []),
                    { label: 'Not now', run: () => { dropOffer(); } },
                    { label: 'Skip this version', run: () => { services.skipVersion(o.kind, o.latest); dropOffer(); } },
                ],
            });
        }
        return e;
    };
    const handle = (0, handle_js_1.mountHandle)(doc, { label: 'Edit and more', activate: () => { edit(); }, entries: listEntries });
    (0, widgets_js_1.installCss)(root, handle_js_1.HANDLE_CSS);
    root.append(handle.element, bar, editorSlot);
    /** The pencil's marks and description: unsaved changes, an update on offer. */
    const marks = () => {
        const d = isDirty();
        handle.setMarks({
            dirty: d,
            update: !!offer,
            description: [d ? 'Unsaved changes.' : '', offer ? `An update is available (${offer.latest}).` : ''].filter(Boolean).join(' '),
        });
    };
    function dropOffer() {
        offer = null;
        const i = indicator;
        indicator = null;
        i?.dispose();
        marks();
        handle.refresh();
    }
    // ── dirty state outside the editor (the editor reports its own, also to the host) ──
    let lastDirty = false;
    let lastMarked = null;
    const dirtyChanged = () => {
        const d = isDirty();
        if (d !== lastMarked) {
            lastMarked = d;
            marks();
            handle.refresh();
        }
        if (d !== lastDirty) {
            lastDirty = d;
            // an editor reports its own state to the host; the page reports the read view's
            if (!active())
                host?.setDirty(d);
        }
    };
    dirtyChanged();
    // narrow screens: the page ends with room below its last line, so it can scroll clear of the handle (read view only)
    const narrow = typeof win.matchMedia === 'function' ? (() => { try {
        return win.matchMedia(NARROW);
    }
    catch {
        return null;
    } })() : null;
    const body = doc.body;
    const padBottom = () => {
        const on = !!narrow?.matches && chromeHost.getAttribute('data-mode') !== 'edit' && !chromeHost.hasAttribute('data-hidden');
        body.style.setProperty('padding-bottom', on ? NARROW_BOTTOM : '');
        doc.documentElement.style.setProperty('scroll-padding-bottom', on ? NARROW_BOTTOM : '');
    };
    if (narrow) {
        padBottom();
        const onChange = () => padBottom();
        narrow.addEventListener?.('change', onChange);
        cleanups.push(() => { narrow.removeEventListener?.('change', onChange); body.style.setProperty('padding-bottom', ''); doc.documentElement.style.setProperty('scroll-padding-bottom', ''); });
    }
    const afterHeaderChange = () => {
        present();
        dirtyChanged();
        if (!editor)
            void renderView().catch(() => undefined);
    };
    /**
     * A write of the file landed (round 5 of the carrier-app loop, B1–B3): the
     * file now holds `input.text`, so that is the saved text — whoever wrote it
     * (the page, the Edit button's editor, an attached editor, the update; also
     * a save or a conflict answer that settles after its editor was destroyed),
     * so a page whose text is on disk is never left dirty (no false leave
     * prompt). A read view with nothing unsaved follows another surface's write
     * (its text becomes the written one), so it never writes an older text over
     * it later; one with unsaved changes keeps them (and stays unsaved).
     */
    function wrote(input) {
        if (disposed)
            return;
        const before = saved;
        saved = input.text;
        if (!editor && !ownInputs.has(input) && text === before && text !== input.text) {
            text = input.text;
            undoStack.length = 0;
            redoStack.length = 0;
            afterHeaderChange();
            return;
        }
        dirtyChanged();
    }
    function setSetting(changes) {
        if (updating) {
            toast('An update is running; try again when it is done.', 'warning');
            return;
        }
        const a = active();
        try {
            if (a) {
                a.setHeader(changes); // one undoable edit in the editor; the read view follows
            }
            else {
                const next = (0, header_js_1.editHeader)(text, changes);
                if (next === text)
                    return;
                undoStack.push(text);
                redoStack.length = 0;
                text = next;
            }
        }
        catch (e) {
            toast(`Could not change the header: ${errorText(e)}`, 'error');
            return;
        }
        afterHeaderChange();
    }
    function undo() {
        if (active() || updating || undoStack.length === 0)
            return false;
        redoStack.push(text);
        text = undoStack.pop();
        afterHeaderChange();
        return true;
    }
    function redo() {
        if (active() || updating || redoStack.length === 0)
            return false;
        undoStack.push(text);
        text = redoStack.pop();
        afterHeaderChange();
        return true;
    }
    // ── saving (never the live DOM: always the assembly of the current text) ──
    /** The page's save in flight: one at a time (as the editor's). */
    let pageSaving = null;
    function save() {
        const a = active();
        if (a)
            return a.save();
        pageSaving ?? (pageSaving = savePage().finally(() => { pageSaving = null; }));
        return pageSaving;
    }
    /** The focused element (through shadow roots), where the focus goes back after the question. */
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
     * The file changed on disk since the page opened it: the reader replaces it or downloads a copy.
     * One question per saver (round 4, F2): the page and every editor of this file share `saver`, so
     * a save of any of them while it is open re-targets it; only the newest text is ever written.
     */
    function resolveConflict(t, html, r) {
        const input = { text: t, html };
        ownInputs.add(input);
        void (0, conflict_js_1.answerSaveConflict)({ saver, root: root, input, ...(r ? { result: r } : {}), returnFocus: focusedNow() }).then((a) => {
            if (disposed)
                return;
            if (a.choice === 'replace') {
                const w = a.result;
                if (w.via === 'served-notice')
                    return;
                if (w.ok) {
                    // the text actually written is saved — not whatever the page holds now (a setting changed
                    // while the question was open stays unsaved: K11); `wrote` marked it as the write landed
                    saved = t;
                    dirtyChanged();
                    toast(w.via === 'download' ? 'Download started.' : 'Saved.', 'success');
                }
                else if (w.via === 'file' && w.error === 'stale-conflict')
                    toast(conflict_js_1.SAVE_CONFLICT_STALE, 'warning');
                else if (!(w.via === 'file' && w.error === 'cancelled'))
                    toast(`Could not save: ${w.error ?? 'unknown error'}`, 'error');
            }
            else if (a.choice === 'download') {
                const ok = a.result.via === 'download' && a.result.ok;
                toast(ok ? chrome_js_1.SAVE_CONFLICT_DOWNLOADED : 'The download failed.', ok ? 'success' : 'error');
            }
        });
    }
    async function savePage() {
        if (updating)
            return { ok: false, error: 'updating' };
        const t = text;
        if (headerFacts(t).format > maxFormat) {
            toast('This document uses a newer text format; it is shown read-only and cannot be saved here.', 'warning');
            return { ok: false, error: 'format' };
        }
        let html;
        try {
            html = await assembleWith(t, file.includes);
        }
        catch (e) {
            toast(`Could not save: ${errorText(e)}`, 'error');
            return { ok: false, error: errorText(e) };
        }
        if ((0, conflict_js_1.saveConflictOpen)(saver)) {
            // a question of this file is open (the page's or an editor's): it (focused) now answers for this text; no second picker
            resolveConflict(t, html);
            return { ok: false, via: 'file', error: 'conflict', conflict: true };
        }
        const input = { text: t, html };
        ownInputs.add(input);
        const r = await saver.save(input);
        if (r.via === 'served-notice') {
            toast('This file was opened from a web address, so it cannot be saved over. Use “Download a copy” (⋯) to keep your changes.', 'warning');
            return { ok: false, via: 'served-notice', error: 'served page' };
        }
        if (r.via === 'file' && r.conflict) {
            resolveConflict(t, html, r);
            return { ok: false, via: 'file', error: 'conflict', conflict: true };
        }
        if (r.ok) {
            saved = t;
            dirtyChanged();
            toast(r.via === 'download' ? 'Download started.' : 'Saved.', 'success');
            return { ok: true, via: r.via };
        }
        const cancelled = r.via === 'file' && r.error === 'cancelled';
        if (!cancelled)
            toast(`Could not save: ${r.error ?? 'unknown error'}`, 'error');
        return { ok: false, via: r.via, error: r.error ?? 'failed', ...(cancelled ? { cancelled: true } : {}) };
    }
    async function download() {
        const t = currentText();
        let html;
        try {
            html = await assembleWith(t, file.includes);
        }
        catch (e) {
            toast(`Could not download: ${errorText(e)}`, 'error');
            return { via: 'download', ok: false, error: errorText(e), confirmed: false };
        }
        const r = await saver.download({ html });
        const ok = r.via === 'download' && r.ok;
        toast(ok ? 'Download started.' : 'The download failed.', ok ? 'success' : 'error');
        return r;
    }
    /** Save a new file (its own uid) through the picker — never over this file, never to the host. */
    async function saveNewFile(t, name, what) {
        let html;
        try {
            html = await assembleWith(t, what === 'copy' ? file.includes : undefined);
        }
        catch (e) {
            toast(`Could not create the file: ${errorText(e)}`, 'error');
            return { via: 'download', ok: false, error: errorText(e), confirmed: false };
        }
        const uid = headerFacts(t).uid;
        const s = services.createSaver({ ...(uid ? { uid } : {}), suggestedName: name, kind: k.kind });
        let r = await s.save({ text: t, html });
        if (r.via === 'served-notice' || r.via === 'host')
            r = await s.download({ html });
        const label = what === 'copy' ? 'a new copy' : 'a new document';
        if (r.via === 'file' && r.ok)
            toast(`Saved ${label}${r.name ? `: ${r.name}` : ''}.`, 'success');
        else if (r.via === 'download' && r.ok)
            toast(`${label[0].toUpperCase()}${label.slice(1)} is downloading.`, 'success');
        else if (!(r.via === 'file' && r.error === 'cancelled'))
            toast(`Could not save the file: ${'error' in r && r.error ? r.error : 'unknown error'}`, 'error');
        return r;
    }
    async function newDocument(o) {
        let t;
        try {
            if (o && typeof o.text === 'string') {
                // a kind's text (paged: a template's): a new document always has a uid of its own, never this file's
                t = o.text;
                const uid = headerFacts(t).uid;
                if (!uid || uid === file.uid)
                    t = (0, header_js_1.editHeader)(t, { uid: (0, uid_js_1.mintUid)() });
            }
            else
                t = String(await k.newDocument());
        }
        catch (e) {
            toast(`Could not create the document: ${errorText(e)}`, 'error');
            return { via: 'download', ok: false, error: errorText(e), confirmed: false };
        }
        return saveNewFile(t, newFileName(o?.name, ext), 'new');
    }
    function saveAsCopy() {
        let t;
        try {
            t = (0, header_js_1.editHeader)(currentText(), { uid: (0, uid_js_1.mintUid)() });
        }
        catch (e) {
            toast(`Could not copy: ${errorText(e)}`, 'error');
            return Promise.resolve({ via: 'download', ok: false, error: errorText(e), confirmed: false });
        }
        return saveNewFile(t, (0, file_js_1.copyName)(file.fileName, k.kind), 'copy');
    }
    // ── edit mode ──
    let offEditor = [];
    let headerTimer = null;
    /** Editors this app made read-only for the running update (also those opened or attached during it). */
    const lockedForUpdate = new Set();
    const lockForUpdate = (ed) => {
        if (!updating || ed.isReadOnly())
            return;
        ed.setReadOnly(true);
        lockedForUpdate.add(ed);
    };
    /** The edit-mode title: the header's `title` (it follows the text), else the page's. */
    const showTitle = () => {
        let t = '';
        try {
            t = (0, header_js_1.readHeader)(currentText())?.fields['title']?.trim() ?? '';
        }
        catch {
            t = '';
        }
        title.textContent = t || doc.title;
        if (t && doc.title !== t)
            doc.title = t;
    };
    const headerFollow = () => {
        if (headerTimer !== null)
            win.clearTimeout(headerTimer);
        headerTimer = win.setTimeout(() => { headerTimer = null; present(); if (editor) {
            showTitle();
            syncBarActions();
        } }, 200);
    };
    function edit() {
        if (editor)
            return editor;
        handle.close();
        chromeHost.setAttribute('data-mode', 'edit');
        padBottom();
        editorSlot.hidden = false;
        setViewVisible(false);
        doc.documentElement.style.setProperty('overflow', 'hidden');
        const container = doc.createElement('div');
        editorSlot.append(container);
        // mounted with the saved text, then the current one: the editor's dirty state and undo know both
        const ed = k.mountEditor(container, { text: saved }, editorContext());
        if (text !== saved)
            ed.setText(text);
        lockForUpdate(ed);
        editor = ed;
        showTitle();
        syncBarActions();
        offEditor = [
            ed.on('save', (e) => { saved = e.text; dirtyChanged(); }),
            ed.on('dirty', () => dirtyChanged()),
            ed.on('change', () => headerFollow()),
            withAiMenu(ed),
        ];
        dirtyChanged();
        ed.focus();
        return ed;
    }
    async function leave() {
        const ed = editor;
        if (!ed)
            return;
        // a dirty editor leaves its text (unsaved — also while its save or its question's answer is still
        // in flight: `wrote` marks it saved when it lands, B1/B2); a clean one the file's text, the last
        // written (its own save, or a later one of another editor of the file: the last save wins, B3)
        text = ed.isDirty() ? ed.getText() : saved;
        for (const off of offEditor)
            off();
        offEditor = [];
        editor = null;
        ed.destroy();
        editorSlot.replaceChildren();
        editorSlot.hidden = true;
        chromeHost.removeAttribute('data-mode');
        padBottom();
        setViewVisible(true);
        doc.documentElement.style.setProperty('overflow', '');
        undoStack.length = 0;
        redoStack.length = 0;
        lastDirty = !isDirty(); // re-post the state outside the editor
        dirtyChanged();
        present();
        await renderView();
        // the keyboard keeps its place (the pencil); after a pointer's Done the focus is the page's (a read view's keys work at once)
        if (pointerUsed)
            doc.activeElement?.blur?.();
        else
            handle.button.focus();
    }
    function attach(ed) {
        attached.push(ed);
        lockForUpdate(ed);
        /** The file holds `t` now (this editor's save): the page's copy follows, so it never writes an older text over it (B3). */
        const adopt = (t) => {
            saved = t;
            if (text === t)
                return;
            text = t;
            undoStack.length = 0;
            redoStack.length = 0;
        };
        const offs = [
            ed.on('dirty', () => dirtyChanged()),
            ed.on('save', (e) => { adopt(e.text); dirtyChanged(); }),
            withAiMenu(ed),
        ];
        let done = false;
        return () => {
            if (done)
                return;
            done = true;
            for (const off of offs)
                off();
            const i = attached.indexOf(ed);
            if (i >= 0)
                attached.splice(i, 1);
            dirtyChanged();
            // the read view shows the page's text again (it showed this editor's while it was the document)
            if (!editor) {
                present();
                void renderView().catch(() => undefined);
            }
        };
    }
    listen(doneBtn, 'click', () => { void leave(); });
    // keyboard on the page: Cmd/Ctrl+S saves the document being edited, Cmd/Ctrl+E edits,
    // Cmd/Ctrl+Z / Shift+Z undo / redo header settings; other keys go to the read view
    listen(chromeHost, 'pointerdown', () => { pointerUsed = true; }, true);
    listen(win, 'keydown', () => { pointerUsed = false; }, true);
    listen(win, 'keydown', (e) => {
        // a key another handler already took is not ours
        if (e.defaultPrevented || e.isComposing)
            return;
        const mod = isMac ? e.metaKey : e.ctrlKey;
        if (editor) {
            // the Edit button's editor has its own keymap (its keys never get here); with the focus on the
            // chrome (Done, More) or the page, Cmd/Ctrl+S still saves the document — never "Save page as" —
            // and Cmd/Ctrl+E leaves edit mode
            if (!mod || e.altKey)
                return;
            const key = String(e.key ?? '').toLowerCase();
            if (key === 's') {
                e.preventDefault();
                void editor.save();
            }
            else if (key === 'e') {
                e.preventDefault();
                void leave();
            }
            return;
        }
        const path = e.composedPath?.() ?? [];
        const target = (path[0] ?? e.target);
        const typing = !!target && (target.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(String(target.tagName ?? '').toUpperCase()));
        const other = attached[attached.length - 1];
        if (mod && !e.altKey) {
            const key = String(e.key ?? '').toLowerCase();
            if (key === 's') {
                e.preventDefault();
                void (other ? other.save() : save());
                return;
            }
            if (other)
                return;
            if (key === 'e' && !typing) {
                e.preventDefault();
                edit();
                return;
            }
            if (key === 'z' && !typing) {
                if (e.shiftKey ? redo() : undo())
                    e.preventDefault();
                return;
            }
            return;
        }
        // the read view's own keys (slides: navigation), outside fields; from the chrome only on a
        // button (not a menu item, the review panel or a toast's text) and never its own keys
        if (typing || other)
            return;
        if (path.includes(chromeHost)) {
            const tag = String(target?.tagName ?? '').toUpperCase();
            const role = target?.getAttribute?.('role') ?? '';
            if (tag !== 'BUTTON' || /^menuitem/.test(role) || /^(Enter| |Spacebar|Tab|Escape)$/.test(String(e.key ?? '')))
                return;
        }
        try {
            if (view.onKey?.(e))
                e.preventDefault();
        }
        catch { /* the view's own error */ }
    });
    /**
     * The bar (or the editor) is hidden while the focus is in it — a keyboard
     * user pressed Present (round 3, M5): the focus goes to the page (the read
     * view's element when it takes the focus, else the document), so Escape and
     * Space reach the read view's `onKey` at once. A toast keeps its focus (it
     * stays shown).
     */
    function hideFocus() {
        const inChrome = root.activeElement;
        if (!inChrome || inChrome.closest?.('.orz-toast'))
            return;
        try {
            view.element?.focus({ preventScroll: true });
        }
        catch { /* not focusable */ }
        if (root.activeElement)
            inChrome.blur?.();
    }
    // ── data-loss protection: leaving a top-level file with unsaved changes asks first ──
    // (the browser's own "Leave site?" prompt; a framed file's host owns that decision, it is told the
    // dirty state through orz-host-save@1). The quiet update's reload never asks: the kit reloads only
    // after the update wrote the current text into the opened file.
    let leavingForUpdate = false;
    // a framed file whose host never connected (an ordinary page framing it) asks too: no host owns that decision
    listen(win, 'beforeunload', (e) => {
        if (leavingForUpdate || !isDirty())
            return;
        if (framed && host?.connected())
            return;
        e.preventDefault();
        e.returnValue = ''; // Chromium before 119 asks only when returnValue is set
    });
    // ── the quiet update (FD-05): only a top-level standalone file checks (the kit's guards) ──
    const editors = () => [...(editor ? [editor] : []), ...attached];
    /** Update now while the file's conflict question is open: refused (no second picker), the question focused (B4). */
    const questionFirst = () => {
        toast(exports.UPDATE_QUESTION_OPEN, 'warning');
        (0, conflict_js_1.focusSaveConflict)(saver);
    };
    async function runUpdate(info) {
        if (updating)
            return;
        if ((0, conflict_js_1.saveConflictOpen)(saver)) {
            questionFirst();
            return;
        }
        updating = true;
        for (const ed of editors())
            lockForUpdate(ed);
        handle.refresh(); // the settings and the update item are disabled while it runs
        let reloading = false;
        try {
            // a question that opened while it re-assembled (an editor's save already in flight): no write (B4)
            const updateSaver = {
                save: (input, o) => ((0, conflict_js_1.saveConflictOpen)(saver) ? Promise.resolve({ via: 'file', ok: false, error: 'question', picked: false, opened: false }) : saver.save(input, o)),
                download: (input) => saver.download(input),
                handleKey: () => saver.handleKey(),
            };
            const r = await services.performUpdate({
                info, kind: k.kind, current: k.version, getText: currentText, saver: updateSaver, delivery: file.delivery,
                ...(file.includes ? { includes: file.includes } : {}),
            });
            if (r.status === 'up-to-date')
                return;
            if (r.status === 'failed')
                throw new Error(r.error);
            if (r.save.via === 'served-notice') {
                const d = await saver.download({ html: r.html });
                if (!('ok' in d) || !d.ok)
                    throw new Error('The updated file could not be downloaded.');
                toast(`The file updated to ${info.latest} is downloading; this page stays as it is.`, 'success');
                return;
            }
            if (r.save.via === 'file' && r.save.conflict)
                throw new Error(exports.UPDATE_CONFLICT_MESSAGE);
            if (r.save.via === 'file' && r.save.error === 'question') {
                questionFirst();
                return;
            }
            if (!r.save.ok)
                throw new Error(r.save.error ?? 'The updated file could not be saved.');
            if (r.reload) {
                reloading = true;
                leavingForUpdate = true;
                saved = r.text;
                win.location.reload();
                return;
            }
            toast(`Updated to ${info.latest} and saved${'name' in r.save && r.save.name ? ` as ${r.save.name}` : ''}; this page keeps the version it was opened with.`, 'success');
        }
        finally {
            if (!reloading) {
                updating = false;
                handle.refresh();
                // every editor made read-only for the update — also one opened or attached while it ran — is given back
                for (const ed of [...lockedForUpdate])
                    if (editors().includes(ed))
                        ed.setReadOnly(false);
                lockedForUpdate.clear();
            }
        }
    }
    if (!framed) {
        void services.checkForUpdate({ kind: k.kind, current: k.version, format: file.format, page: win, ...(storage ? { storage } : {}) }).then((info) => {
            if (!info || disposed)
                return;
            // the offer: a dot on the pencil and "Update to x.y.z" in the handle's list (the read view), the
            // kit's indicator after the brand anchor of edit mode's bar; Not now / Skip in either drops both
            offer = info;
            indicator = services.mountUpdateIndicator(brand, info, {
                onUpdate: (i) => runUpdate(i),
                onLater: () => { dropOffer(); },
                onSkip: (i) => { services.skipVersion(i.kind, i.latest); dropOffer(); },
            });
            marks();
            handle.refresh();
            cleanups.push(() => { indicator?.dispose(); indicator = null; });
        }, () => undefined);
    }
    const api = {
        kind: k,
        file,
        getText: currentText,
        isDirty,
        edit,
        leave,
        editor: () => editor,
        setSetting,
        undo,
        redo,
        save,
        download,
        newDocument,
        saveAsCopy,
        editorContext,
        attach,
        toast,
        menu: {
            open: () => { if (!editor && !disposed)
                handle.open(); },
            close: () => handle.close(),
            isOpen: () => handle.isOpen(),
        },
        fontScale: () => fontPct,
        setFontScale,
        readerChoice: (key) => choiceNow.get(key) ?? null,
        setReaderChoice,
        setChromeVisible(visible) {
            if (visible)
                chromeHost.removeAttribute('data-hidden');
            else {
                handle.close();
                chromeHost.setAttribute('data-hidden', '');
                hideFocus();
            }
            padBottom();
        },
        view,
        root,
        host,
        get updating() { return updating; },
        ready,
        dispose() {
            if (disposed)
                return;
            disposed = true;
            if (headerTimer !== null)
                win.clearTimeout(headerTimer);
            for (const off of offEditor.splice(0))
                off();
            for (const m of [...aiMenus])
                m.destroy();
            aiMenus.clear();
            for (const f of cleanups.splice(0)) {
                try {
                    f();
                }
                catch { /* gone */ }
            }
            try {
                editor?.destroy();
            }
            catch { /* gone */ }
            editor = null;
            (0, conflict_js_1.dropSaveConflict)(saver);
            handle.destroy();
            if (fontPct !== null)
                scaleTarget().style.setProperty('--orz-font-scale', '');
            more.destroy();
            for (const x of barActions)
                x.menu?.destroy();
            try {
                view.destroy?.();
            }
            catch { /* the view's own */ }
            try {
                host?.dispose();
            }
            catch { /* gone */ }
            bar.remove();
            editorSlot.remove();
        },
    };
    return api;
}
//# sourceMappingURL=app.js.map