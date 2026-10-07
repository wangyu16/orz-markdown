/**
 * The standalone assembled file's runtime (spec/carrier-app.md): what every
 * carrier's browser bundle runs when it finds itself in an assembled file —
 * kind-independent, behind the `StandaloneKind` seam (./types.ts). Lifted from
 * orz-mdhtml 1.0's `standalone/app.ts` (REBUILD §3a, owner decision 2).
 *
 * On boot it reads the opened file (./file.ts), renders the kind's read view
 * in the page and mounts the chrome in a shadow root: the brand (the update
 * indicator's anchor), Edit, the kind's header settings and bar actions,
 * Save, and a menu with Download a copy, New document, Save as new copy and
 * the kind's menu actions.
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
 * - **Keymap**: Cmd/Ctrl+S saves the document being edited, Cmd/Ctrl+E
 *   edits, Cmd/Ctrl+Z / Shift+Z undo / redo header settings; a key another
 *   handler took (`defaultPrevented`) is never ours; other keys go to the
 *   read view (`onKey`: slides' navigation).
 *
 * Nothing runs at module load.
 */
import { editHeader, readHeader, UID_PATTERN, type HeaderChange } from '../header.js';
import { mintUid } from '../uid.js';
import type { EditorShell } from '../editor/shell.js';
import { createShadowRoot, showToast } from '../shell/chrome.js';
import { connectHost } from '../shell/file-side.js';
import { mountUpdateIndicator } from '../shell/indicator.js';
import { createPreferenceStore } from '../shell/preferences.js';
import { KIND_EXTENSIONS } from '../shell/protocol.js';
import { createSaver, type SaveResult } from '../shell/save.js';
import { checkForUpdate, performUpdate, skipVersion, type UpdateInfo } from '../shell/update.js';
import type { HostConnection } from '../shell/file-side.js';
import type { StorageLike, UiElement } from '../shell/types.js';
import { copyName, readOpenedFile } from './file.js';
import { attachAiMenu, button, installCss, menuButton, settingPicker, WIDGET_CSS, type AiMenu, type MenuButton, type MenuItem } from './widgets.js';
import type {
  AppElement, AppEvent, AppSaveOutcome, AppServices, AppShadowRoot, AppWindow, CarrierApp, CarrierAppOptions, OpenedFile, StandaloneContext, StandaloneKind,
} from './types.js';

/** The chrome's own layout (the bar, the edit overlay), next to `CHROME_CSS` and `WIDGET_CSS`. */
export const APP_CSS = `
:host { position: fixed; top: 12px; right: 12px; z-index: 2147481000; display: block; }
:host([data-mode="edit"]) { inset: 0; display: flex; flex-direction: column; background: var(--orz-chrome-bg); }
:host([data-hidden]) { display: none !important; }
.orz-app__bar {
  display: flex; align-items: center; gap: var(--orz-chrome-space-2); padding: var(--orz-chrome-space-2);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-l);
  background: var(--orz-chrome-surface); box-shadow: var(--orz-chrome-shadow);
}
/* no transform, filter or backdrop-filter here: they would trap the kit's fixed popovers and toasts */
:host([data-mode="edit"]) .orz-app__bar { border-width: 0 0 1px; border-radius: 0; box-shadow: none; padding: var(--orz-chrome-space-2) var(--orz-chrome-space-4); }
.orz-app__brand { padding: 0 var(--orz-chrome-space-2); color: var(--orz-chrome-muted); font: 700 var(--orz-chrome-text-md)/1 var(--orz-chrome-font); letter-spacing: .02em; }
.orz-app__title { display: none; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--orz-chrome-muted); }
:host([data-mode="edit"]) .orz-app__title { display: block; }
:host([data-mode="edit"]) .orz-app__read-only { display: none; }
:host(:not([data-mode="edit"])) .orz-app__edit-only { display: none; }
.orz-app__save { position: relative; }
.orz-app__save[data-dirty="true"]::after {
  content: ""; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%;
  background: var(--orz-chrome-accent); box-shadow: 0 0 0 2px var(--orz-chrome-surface);
}
.orz-app__editor { flex: 1; min-height: 0; display: flex; }
.orz-app__editor > * { flex: 1; min-width: 0; }
@media (max-width: 560px) { .orz-btn__label { display: none; } .orz-btn { padding: 0 var(--orz-chrome-space-3); } }
`;

const DEFAULT_SERVICES: AppServices = {
  createSaver,
  connectHost,
  checkForUpdate,
  performUpdate,
  mountUpdateIndicator,
  skipVersion: (kind, version) => skipVersion(kind, version),
};

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A text's header facts the app needs: its `format` (default 1, as `readDocument` reads it) and its well-formed `uid`. */
function headerFacts(text: string): { format: number; uid?: string } {
  const fields = readHeader(text)?.fields ?? {};
  const f = fields['format']?.trim();
  const uid = fields['uid']?.trim();
  return { format: f && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1, ...(uid && UID_PATTERN.test(uid) ? { uid } : {}) };
}

/**
 * Boot the standalone file in `window` (default: the global window): null
 * when the page is not an assembled file of this kind (an app page, the
 * update sandbox) — nothing is touched then.
 */
export function bootCarrierApp(k: StandaloneKind, options: CarrierAppOptions = {}): CarrierApp | null {
  const maybeWin = (options.window ?? (globalThis as { window?: AppWindow }).window) as AppWindow | undefined;
  if (!maybeWin || !maybeWin.document) return null;
  const win: AppWindow = maybeWin;
  const doc = win.document;
  const opened = readOpenedFile(doc, k.kind);
  if (!opened) return null;
  const file: OpenedFile = opened;
  const services: AppServices = { ...DEFAULT_SERVICES, ...(options.services ?? {}) };
  const ext = KIND_EXTENSIONS[k.kind];
  const maxFormat = Math.max(...k.formats);
  const isMac = /Mac|iPhone|iPad/.test(String(win.navigator?.platform ?? win.navigator?.userAgent ?? ''));
  const cleanups: Array<() => void> = [];
  const listen = (target: AppWindow | AppElement, type: string, fn: (e: AppEvent) => void, o?: boolean | { capture?: boolean }): void => {
    target.addEventListener(type, fn, o);
    cleanups.push(() => target.removeEventListener(type, fn, o));
  };

  // ── document state: the text is the document ──
  let text = file.text;
  let saved = file.text;
  let editor: EditorShell | null = null;
  let updating = false;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  /** Editors mounted on this file's context through `OrzCarrier.mountEditor` (not the Edit button's). */
  const attached: EditorShell[] = [];
  /** The document being edited: the Edit button's editor, else the last attached one, else none. */
  const active = (): EditorShell | null => editor ?? attached[attached.length - 1] ?? null;
  const currentText = (): string => { const a = active(); return a ? a.getText() : text; };
  const isDirty = (): boolean => (editor ? editor.isDirty() : text !== saved) || attached.some((ed) => ed.isDirty());

  // ── the file's own assembly: its delivery, engine and includes (FC-19 §8.5); the opened bytes (content proof) ──
  const engineSource = file.engine ?? undefined;
  const assembleWith = (t: string, includes: Record<string, string> | undefined): Promise<string> =>
    Promise.resolve().then(() => k.assemble(t, { delivery: file.delivery, ...(engineSource ? { engineSource } : {}), ...(includes ? { includes } : {}) })).then(String);
  const assembleFile = (t: string, o?: { includes?: Record<string, string> }): Promise<string> => assembleWith(t, o?.includes);
  let openedBytes: Promise<string> | null = null;
  const openedHtml = (): Promise<string> => (openedBytes ??= assembleWith(file.text, file.includes));
  {
    // computed when the page is first idle, so a save click does not wait for it (B#6)
    const warm = (): void => { void openedHtml().catch(() => undefined); };
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(warm, { timeout: 2000 }); else win.setTimeout(warm, 300);
  }

  // ── host (framed only: an unframed page never listens) ──
  let framed = true;
  try { framed = win.parent !== win; } catch { framed = true; }
  const aiMenus = new Set<AiMenu>();
  let rerender = (): void => undefined;
  const host: HostConnection | undefined = framed
    ? services.connectHost({
      kind: k.kind,
      window: win as never,
      ai: { onOperations() { for (const m of aiMenus) m.refresh(); } },
      include: { onAvailable() { rerender(); } },
    })
    : undefined;
  const hostAi: StandaloneContext['ai'] = host && {
    get operations() { return host.aiOperations(); },
    async request(op, c) {
      const passage = c.selection ? c.text.slice(c.selection.from, c.selection.to) : c.text;
      const r = await host.requestAi(op, passage, !!c.selection);
      if (r.ok !== true || typeof r.proposed !== 'string') throw new Error(r.error ?? 'The host could not run that.');
      return { proposed: r.proposed };
    },
  };
  const hostInclude = host
    ? (url: string): Promise<string | null> => (host.protocols().include ? host.requestInclude(url) : Promise.resolve(null))
    : undefined;

  const saver = services.createSaver({ ...(file.uid ? { uid: file.uid } : {}), suggestedName: file.fileName, kind: k.kind, ...(host ? { host } : {}), openedHtml });
  /** The page's storage (reader preferences, the once-a-day record); absent or throwing: the kit's fail-closed defaults. */
  let storage: StorageLike | undefined;
  try { storage = win.localStorage ?? undefined; } catch { storage = undefined; }
  const preferences = createPreferenceStore(file.uid, storage);

  const editorContext = (): StandaloneContext => ({
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
  const withAiMenu = (ed: EditorShell): (() => void) => {
    if (!hostAi) return () => undefined;
    const menu = attachAiMenu(ed, { operations: () => hostAi.operations });
    aiMenus.add(menu);
    return () => { aiMenus.delete(menu); menu.destroy(); };
  };

  // ── read view ──
  const view = k.createReadView(doc);
  const setViewVisible = (visible: boolean): void => {
    if (view.setVisible) view.setVisible(visible);
    else if (view.element) view.element.hidden = !visible;
  };
  const renderView = (): Promise<void> => Promise.resolve().then(() => view.render(currentText(), { ...(file.includes ? { includes: file.includes } : {}), ...(hostInclude ? { fetchInclude: hostInclude } : {}) }));
  rerender = () => { if (!editor) void renderView().catch(() => undefined); else void editor.refreshPreview(); };
  const ready = renderView().then(() => {
    // a fragment in the address goes to its element once the content exists
    let id = '';
    try { id = decodeURIComponent(win.location.hash.slice(1)); } catch { id = ''; }
    if (id) doc.getElementById(id)?.scrollIntoView?.();
  }, (e) => { try { console.error('orz carrier: the read view could not render', e); } catch { /* no console */ } });

  // ── chrome: one shadow root on the shell's mount point ──
  let mount = doc.getElementById('orz-chrome');
  if (!mount) {
    mount = doc.createElement('div');
    mount.id = 'orz-chrome';
    doc.body.append(mount);
  }
  const chromeHost = mount;
  chromeHost.setAttribute('data-orz-chrome', 'app');
  const root = (chromeHost as unknown as { shadowRoot?: AppShadowRoot | null }).shadowRoot ?? (createShadowRoot(chromeHost as unknown as UiElement) as unknown as AppShadowRoot);
  installCss(root, WIDGET_CSS);
  installCss(root, APP_CSS);
  const toast = (message: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info'): void => {
    showToast(root as never, message, { tone });
  };
  /** The chrome's scheme: the reader's `darkChrome` preference when set, else the document's. */
  const setScheme = (scheme: 'light' | 'dark'): void => {
    const pref = preferences.get('darkChrome');
    chromeHost.setAttribute('data-chrome', pref === true ? 'dark' : pref === false ? 'light' : scheme);
  };
  const present = (): void => {
    try { setScheme(view.present(currentText()).scheme); } catch { /* the view's own error */ }
  };
  present();

  const bar = doc.createElement('div');
  bar.className = 'orz-app__bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Document');
  const brand = doc.createElement('span');
  brand.className = 'orz-app__brand';
  brand.id = 'orz-brand';
  brand.tabIndex = -1;
  brand.textContent = k.brand ?? 'orz';
  const title = doc.createElement('span');
  title.className = 'orz-app__title';
  const editBtn = button(doc, { label: 'Edit', icon: 'edit', variant: 'primary' });
  editBtn.classList.add('orz-app__read-only');
  const doneBtn = button(doc, { label: 'Done', icon: 'preview', title: 'Back to the read view' });
  doneBtn.classList.add('orz-app__edit-only');
  const saveBtn = button(doc, { label: 'Save', icon: 'save' });
  saveBtn.classList.add('orz-app__save', 'orz-app__read-only');
  bar.append(brand, title, editBtn);

  const pickers: MenuButton[] = [];
  for (const control of k.settings ?? []) {
    const p = settingPicker(doc, control, currentText, (key, value) => setSetting({ [key]: value }));
    p.element.classList.add('orz-app__read-only');
    pickers.push(p);
    bar.append(p.element);
  }
  const actions = k.actions ?? [];
  const runAction = (id: string): void => {
    const a = actions.find((x) => x.id === id);
    if (!a) return;
    Promise.resolve().then(() => a.run(api)).catch((e) => toast(`${a.label}: ${errorText(e)}`, 'error'));
  };
  for (const a of actions.filter((x) => x.placement === 'bar')) {
    const b = button(doc, { label: a.label, ...(a.icon ? { icon: a.icon } : {}) });
    b.setAttribute('data-orz-action', a.id);
    if (!a.inEdit) b.classList.add('orz-app__read-only');
    b.addEventListener('click', () => runAction(a.id));
    bar.append(b);
  }
  const more = menuButton(doc, {
    label: 'More',
    icon: 'more',
    iconOnly: true,
    items: (): MenuItem[] => [
      { label: 'Download a copy', run: () => { void download(); } },
      { label: 'New document', separator: true, run: () => { void newDocument(); } },
      { label: 'Save as new copy', run: () => { void saveAsCopy(); } },
      ...actions.filter((a) => a.placement !== 'bar' && (a.inEdit || !editor)).map((a, i) => ({ label: a.label, ...(i === 0 ? { separator: true } : {}), run: () => runAction(a.id) })),
    ],
  });
  bar.append(saveBtn, doneBtn, more.element);
  const editorSlot = doc.createElement('div');
  editorSlot.className = 'orz-app__editor';
  editorSlot.hidden = true;
  root.append(bar, editorSlot);

  // ── dirty state outside the editor (the editor reports its own, also to the host) ──
  let lastDirty = false;
  const dirtyChanged = (): void => {
    const d = isDirty();
    saveBtn.setAttribute('data-dirty', String(d));
    saveBtn.setAttribute('aria-label', d ? 'Save (unsaved changes)' : 'Save');
    if (d !== lastDirty) {
      lastDirty = d;
      // an editor reports its own state to the host; the page reports the read view's
      if (!active()) host?.setDirty(d);
    }
  };
  dirtyChanged();

  const afterHeaderChange = (): void => {
    present();
    dirtyChanged();
    if (!editor) void renderView().catch(() => undefined);
  };

  function setSetting(changes: Record<string, HeaderChange>): void {
    if (updating) { toast('An update is running; try again when it is done.', 'warning'); return; }
    const a = active();
    try {
      if (a) {
        a.setHeader(changes); // one undoable edit in the editor; the read view follows
      } else {
        const next = editHeader(text, changes);
        if (next === text) return;
        undoStack.push(text);
        redoStack.length = 0;
        text = next;
      }
    } catch (e) {
      toast(`Could not change the header: ${errorText(e)}`, 'error');
      return;
    }
    afterHeaderChange();
  }

  function undo(): boolean {
    if (active() || updating || undoStack.length === 0) return false;
    redoStack.push(text);
    text = undoStack.pop()!;
    afterHeaderChange();
    return true;
  }
  function redo(): boolean {
    if (active() || updating || redoStack.length === 0) return false;
    undoStack.push(text);
    text = redoStack.pop()!;
    afterHeaderChange();
    return true;
  }

  // ── saving (never the live DOM: always the assembly of the current text) ──
  async function save(): Promise<AppSaveOutcome> {
    const a = active();
    if (a) return a.save();
    if (updating) return { ok: false, error: 'updating' };
    const t = text;
    if (headerFacts(t).format > maxFormat) {
      toast('This document uses a newer text format; it is shown read-only and cannot be saved here.', 'warning');
      return { ok: false, error: 'format' };
    }
    let html: string;
    try { html = await assembleWith(t, file.includes); } catch (e) {
      toast(`Could not save: ${errorText(e)}`, 'error');
      return { ok: false, error: errorText(e) };
    }
    const r = await saver.save({ text: t, html });
    if (r.via === 'served-notice') {
      toast('This page is served from the web, so it cannot be saved in place. Use “Download a copy” (⋯) to keep your changes.', 'warning');
      return { ok: false, via: 'served-notice', error: 'served page' };
    }
    if (r.ok) {
      saved = t;
      dirtyChanged();
      toast(r.via === 'download' ? 'Download started.' : 'Saved.', 'success');
      return { ok: true, via: r.via };
    }
    const cancelled = r.via === 'file' && r.error === 'cancelled';
    if (!cancelled) toast(`Could not save: ${r.error ?? 'unknown error'}`, 'error');
    return { ok: false, via: r.via, error: r.error ?? 'failed', ...(cancelled ? { cancelled: true } : {}) };
  }

  async function download(): Promise<SaveResult> {
    const t = currentText();
    let html: string;
    try { html = await assembleWith(t, file.includes); } catch (e) {
      toast(`Could not download: ${errorText(e)}`, 'error');
      return { via: 'download', ok: false, error: errorText(e), confirmed: false };
    }
    const r = await saver.download({ html });
    const ok = r.via === 'download' && r.ok;
    toast(ok ? 'Download started.' : 'The download failed.', ok ? 'success' : 'error');
    return r;
  }

  /** Save a new file (its own uid) through the picker — never over this file, never to the host. */
  async function saveNewFile(t: string, name: string, what: 'new' | 'copy'): Promise<SaveResult> {
    let html: string;
    try {
      html = await assembleWith(t, what === 'copy' ? file.includes : undefined);
    } catch (e) {
      toast(`Could not create the file: ${errorText(e)}`, 'error');
      return { via: 'download', ok: false, error: errorText(e), confirmed: false };
    }
    const uid = headerFacts(t).uid;
    const s = services.createSaver({ ...(uid ? { uid } : {}), suggestedName: name, kind: k.kind });
    let r = await s.save({ text: t, html });
    if (r.via === 'served-notice' || r.via === 'host') r = await s.download({ html });
    const label = what === 'copy' ? 'a new copy' : 'a new document';
    if (r.via === 'file' && r.ok) toast(`Saved ${label}${r.name ? `: ${r.name}` : ''}.`, 'success');
    else if (r.via === 'download' && r.ok) toast(`${label[0].toUpperCase()}${label.slice(1)} is downloading.`, 'success');
    else if (!(r.via === 'file' && r.error === 'cancelled')) toast(`Could not save the file: ${'error' in r && r.error ? r.error : 'unknown error'}`, 'error');
    return r;
  }

  async function newDocument(): Promise<SaveResult> {
    let t: string;
    try { t = String(await k.newDocument()); } catch (e) {
      toast(`Could not create the document: ${errorText(e)}`, 'error');
      return { via: 'download', ok: false, error: errorText(e), confirmed: false };
    }
    return saveNewFile(t, `Untitled${ext}`, 'new');
  }

  function saveAsCopy(): Promise<SaveResult> {
    let t: string;
    try { t = editHeader(currentText(), { uid: mintUid() }); } catch (e) {
      toast(`Could not copy: ${errorText(e)}`, 'error');
      return Promise.resolve({ via: 'download', ok: false, error: errorText(e), confirmed: false });
    }
    return saveNewFile(t, copyName(file.fileName, k.kind), 'copy');
  }

  // ── edit mode ──
  let offEditor: Array<() => void> = [];
  let headerTimer: unknown = null;
  const headerFollow = (): void => {
    if (headerTimer !== null) win.clearTimeout(headerTimer);
    headerTimer = win.setTimeout(() => { headerTimer = null; present(); }, 200);
  };
  function edit(): EditorShell {
    if (editor) return editor;
    chromeHost.setAttribute('data-mode', 'edit');
    editorSlot.hidden = false;
    setViewVisible(false);
    doc.documentElement.style.setProperty('overflow', 'hidden');
    const container = doc.createElement('div');
    editorSlot.append(container);
    // mounted with the saved text, then the current one: the editor's dirty state and undo know both
    const ed = k.mountEditor(container, { text: saved }, editorContext());
    if (text !== saved) ed.setText(text);
    if (updating) ed.setReadOnly(true);
    editor = ed;
    title.textContent = doc.title;
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

  async function leave(): Promise<void> {
    const ed = editor;
    if (!ed) return;
    text = ed.getText();
    if (!ed.isDirty()) saved = text;
    for (const off of offEditor) off();
    offEditor = [];
    editor = null;
    ed.destroy();
    editorSlot.replaceChildren();
    editorSlot.hidden = true;
    chromeHost.removeAttribute('data-mode');
    setViewVisible(true);
    doc.documentElement.style.setProperty('overflow', '');
    undoStack.length = 0;
    redoStack.length = 0;
    lastDirty = !isDirty(); // re-post the state outside the editor
    dirtyChanged();
    present();
    await renderView();
    editBtn.focus();
  }

  function attach(ed: EditorShell): () => void {
    attached.push(ed);
    if (updating) ed.setReadOnly(true);
    const offs = [ed.on('dirty', () => dirtyChanged()), withAiMenu(ed)];
    let done = false;
    return () => {
      if (done) return;
      done = true;
      for (const off of offs) off();
      const i = attached.indexOf(ed);
      if (i >= 0) attached.splice(i, 1);
      dirtyChanged();
    };
  }

  listen(editBtn, 'click', () => { edit(); });
  listen(doneBtn, 'click', () => { void leave(); });
  listen(saveBtn, 'click', () => { void save(); });

  // keyboard on the page: Cmd/Ctrl+S saves the document being edited, Cmd/Ctrl+E edits,
  // Cmd/Ctrl+Z / Shift+Z undo / redo header settings; other keys go to the read view
  listen(win, 'keydown', (e) => {
    // the Edit button's editor has its own keymap; a key another handler already took is not ours
    if (editor || e.defaultPrevented || e.isComposing) return;
    const path = e.composedPath?.() ?? [];
    const target = (path[0] ?? e.target) as AppElement | undefined;
    const typing = !!target && (target.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(String(target.tagName ?? '').toUpperCase()));
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const other = attached[attached.length - 1];
    if (mod && !e.altKey) {
      const key = String(e.key ?? '').toLowerCase();
      if (key === 's') { e.preventDefault(); void (other ? other.save() : save()); return; }
      if (other) return;
      if (key === 'e' && !typing) { e.preventDefault(); edit(); return; }
      if (key === 'z' && !typing) { if (e.shiftKey ? redo() : undo()) e.preventDefault(); return; }
      return;
    }
    // the read view's own keys (slides: navigation), outside fields and the chrome
    if (typing || other || path.includes(chromeHost)) return;
    try { if (view.onKey?.(e)) e.preventDefault(); } catch { /* the view's own error */ }
  });

  // ── data-loss protection: leaving a top-level file with unsaved changes asks first ──
  // (the browser's own "Leave site?" prompt; a framed file's host owns that decision, it is told the
  // dirty state through orz-host-save@1). The quiet update's reload never asks: the kit reloads only
  // after the update wrote the current text into the opened file.
  let leavingForUpdate = false;
  if (!framed) {
    listen(win, 'beforeunload', (e) => {
      if (leavingForUpdate || !isDirty()) return;
      e.preventDefault();
      e.returnValue = ''; // Chromium before 119 asks only when returnValue is set
    });
  }

  // ── the quiet update (FD-05): only a top-level standalone file checks (the kit's guards) ──
  const editors = (): EditorShell[] => [...(editor ? [editor] : []), ...attached];
  async function runUpdate(info: UpdateInfo): Promise<void> {
    if (updating) return;
    updating = true;
    const locked = editors().filter((ed) => !ed.isReadOnly());
    for (const ed of locked) ed.setReadOnly(true);
    for (const p of pickers) p.button.disabled = true;
    let reloading = false;
    try {
      const r = await services.performUpdate({
        info, kind: k.kind, current: k.version, getText: currentText, saver, delivery: file.delivery,
        ...(file.includes ? { includes: file.includes } : {}),
      });
      if (r.status === 'up-to-date') return;
      if (r.status === 'failed') throw new Error(r.error);
      if (r.save.via === 'served-notice') {
        const d = await saver.download({ html: r.html });
        if (!('ok' in d) || !d.ok) throw new Error('The updated file could not be downloaded.');
        toast(`The file updated to ${info.latest} is downloading; this page stays as it is.`, 'success');
        return;
      }
      if (!r.save.ok) throw new Error(r.save.error ?? 'The updated file could not be saved.');
      if (r.reload) {
        reloading = true;
        leavingForUpdate = true;
        saved = r.text;
        win.location.reload();
        return;
      }
      toast(`Updated to ${info.latest} and saved${'name' in r.save && r.save.name ? ` as ${r.save.name}` : ''}; this page keeps the version it was opened with.`, 'success');
    } finally {
      if (!reloading) {
        updating = false;
        for (const p of pickers) p.button.disabled = false;
        for (const ed of locked) if (editors().includes(ed)) ed.setReadOnly(false);
      }
    }
  }

  if (!framed) {
    void services.checkForUpdate({ kind: k.kind, current: k.version, format: file.format, page: win as never, ...(storage ? { storage } : {}) }).then((info) => {
      if (!info || disposed) return;
      const indicator = services.mountUpdateIndicator(brand as unknown as UiElement, info, {
        onUpdate: (i) => runUpdate(i),
        onSkip: (i) => { services.skipVersion(i.kind as never, i.latest); },
      });
      cleanups.push(() => indicator.dispose());
    }, () => undefined);
  }

  let disposed = false;
  const api: CarrierApp = {
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
    setChromeVisible(visible) { if (visible) chromeHost.removeAttribute('data-hidden'); else chromeHost.setAttribute('data-hidden', ''); },
    view,
    root,
    host,
    get updating() { return updating; },
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (headerTimer !== null) win.clearTimeout(headerTimer);
      for (const off of offEditor.splice(0)) off();
      for (const m of [...aiMenus]) m.destroy();
      aiMenus.clear();
      for (const f of cleanups.splice(0)) { try { f(); } catch { /* gone */ } }
      try { editor?.destroy(); } catch { /* gone */ }
      editor = null;
      for (const p of pickers) p.destroy();
      more.destroy();
      try { view.destroy?.(); } catch { /* the view's own */ }
      try { host?.dispose(); } catch { /* gone */ }
      bar.remove();
      editorSlot.remove();
    },
  };
  return api;
}
