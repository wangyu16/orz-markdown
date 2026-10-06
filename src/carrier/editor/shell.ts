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
import { editHeader, readHeader, type HeaderChange } from '../header.js';
import { createShadowRoot, iconElement, showToast, type IconName } from '../shell/chrome.js';
import { createPreferenceStore, type PreferenceStore } from '../shell/preferences.js';
import { createSaver, type Saver } from '../shell/save.js';
import { KIND_EXTENSIONS, type HostKind } from '../shell/protocol.js';
import type { HostConnection } from '../shell/file-side.js';
import type { StorageLike, UiDocument, UiElement } from '../shell/types.js';
import type { TextEditorAdapter } from './adapter.js';
import { codemirror6Adapter } from './codemirror6.js';
import { createPreview, lineToTop, topToLine, type PreviewController, type PreviewFrameOptions } from './preview.js';
import { EDITOR_CSS } from './styles.js';
import { createTextModel, toEditorText } from './text-model.js';
import type { EdDocument, EdElement, EdEvent, EdListener, EdResizeObserver, EdView, ShadowRootLike } from './types.js';

export type EditorMode = 'split' | 'editor' | 'preview';
export type EditorEventName = 'change' | 'dirty' | 'selection' | 'save' | 'error';

/** How the save went. `save()` never rejects. */
export type SaveOutcome =
  | { ok: true; via: 'hook' | 'host' | 'file' | 'download' }
  | { ok: false; via?: 'hook' | 'host' | 'file' | 'download' | 'served-notice'; error: string; cancelled?: boolean };

export interface EditorEvents {
  change: { readonly text: string };
  dirty: { dirty: boolean };
  /** Offsets in the exact text (BOM and CR LF counted). */
  selection: { from: number; to: number };
  save: { text: string; via: 'hook' | 'host' | 'file' | 'download' };
  error: { source: 'save' | 'render' | 'adapter'; message: string; error: unknown };
}

export interface EditorShellOptions {
  /** The document (FC-18), exact. */
  text: string;
  /** The kind's preview renderer: text → HTML for the sandboxed preview (md: `renderMarkdownPreview`). */
  render(text: string): string | Promise<string>;
  /** The editing engine. Default `codemirror6Adapter()` (falls back to a textarea). */
  adapter?: TextEditorAdapter;
  /** Initial mode; default the stored `viewMode` preference (`split`). */
  mode?: EditorMode;
  readOnly?: boolean;
  /** How much toolbar: `full` (labels), `compact` (icons), `none` (no toolbar; the host drives the API). */
  chrome?: 'full' | 'compact' | 'none';
  /** The carrier kind, for the standalone save (`md` by default). */
  kind?: HostKind;
  /** Preferences namespace and save handle key; default the header `uid`. */
  uid?: string;
  /** Reader preferences (FC-19 `preferences`); default `createPreferenceStore(uid, storage)`. */
  preferences?: PreferenceStore;
  /** Storage of the default preference store (default `localStorage`). */
  storage?: StorageLike;
  /** App host: `hooks.save(text)` persists the text (FC-19 `EditorHooks.save`). */
  hooks?: { save?(text: string): Promise<void> };
  /** Standalone host: the assembled file for a text (the carrier's `assemble`), saved through `createSaver`. */
  assemble?(text: string): string | Promise<string>;
  /** The assembled file's name for the standalone save (default `document` + the kind's extension). */
  fileName?: string;
  /** A saver to use instead of `createSaver({ uid, suggestedName: fileName, kind, host })`. */
  saver?: Saver;
  /** A connected app host (`connectHost`): saves go to it, and the dirty state is posted to it. */
  host?: HostConnection;
  /** The preview frame (theme stylesheet links, scheme, article class, libraries) and the update delay. */
  preview?: PreviewFrameOptions & { debounceMs?: number };
  /** A link clicked in the preview (default: open `http(s):`/`mailto:` links in a new tab). */
  onLink?(href: string): void;
  /** Accessible name of the editor region. Default `Document editor`. */
  label?: string;
  /** Below this width (CSS px) only one pane shows at a time. Default 640. */
  narrowWidth?: number;
}

export interface EditorShell {
  getText(): string;
  /** Replace the text; one undoable edit unless `resetHistory`. Does not mark it saved. */
  setText(text: string, options?: { resetHistory?: boolean }): void;
  /** Apply `editHeader(text, changes)` (FC-18 §9) as one undoable edit. Throws what `editHeader` throws. */
  setHeader(changes: Readonly<Record<string, HeaderChange>>): void;
  isDirty(): boolean;
  /** The current text is the saved one. */
  markSaved(): void;
  /** `hooks.save` (app host) or `assemble` + the standalone save. Never rejects. */
  save(): Promise<SaveOutcome>;
  setMode(mode: EditorMode): void;
  getMode(): EditorMode;
  /** The pane(s) actually shown: in a narrow shell, `split` shows one pane. */
  getView(): EditorMode;
  setSplitRatio(ratio: number): void;
  getSplitRatio(): number;
  undo(): boolean;
  redo(): boolean;
  focus(): void;
  on<E extends EditorEventName>(event: E, fn: (e: EditorEvents[E]) => void): () => void;
  /** Render the preview now (normally debounced after edits). */
  refreshPreview(): Promise<void>;
  /** The chrome's shadow root (for a carrier's own chrome and toasts). */
  readonly root: ShadowRootLike;
  /** The toolbar slot where a carrier adds its tools (null with `chrome: 'none'`). */
  readonly toolbar: EdElement | null;
  readonly adapter: TextEditorAdapter;
  /** Resolves when the engine is final (`codemirror6`, or `textarea` with the load error). */
  readonly ready: Promise<{ engine: string; error?: unknown }>;
  destroy(): void;
}

const MODES: readonly EditorMode[] = ['split', 'editor', 'preview'];
const MODE_META: Record<EditorMode, { label: string; icon: IconName }> = {
  editor: { label: 'Editor', icon: 'edit' },
  split: { label: 'Split', icon: 'split' },
  preview: { label: 'Preview', icon: 'preview' },
};
const RATIO_MIN = 0.1;
const RATIO_MAX = 0.9;
const RATIO_STEP = 0.05;

const message = (e: unknown): string =>
  typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);

/** Mount the editor shell in `element`. */
export function createEditorShell(element: EdElement, options: EditorShellOptions): EditorShell {
  if (typeof options?.text !== 'string') throw new TypeError('orz editor: options.text must be a string');
  if (typeof options.render !== 'function') throw new TypeError('orz editor: options.render must be a function');
  const doc = element.ownerDocument as EdDocument | null;
  const win = doc?.defaultView as EdView | null | undefined;
  if (!doc || !win) throw new Error('orz editor: the element must belong to a document with a window');

  const readOnly = options.readOnly === true;
  const chromeLevel = options.chrome ?? 'full';
  const kind: HostKind = options.kind ?? 'md';
  const narrowWidth = options.narrowWidth ?? 640;
  const debounceMs = options.preview?.debounceMs ?? 150;
  const uid = options.uid ?? readHeader(options.text)?.fields['uid']?.trim();
  const prefs: PreferenceStore = options.preferences ?? createPreferenceStore(uid, options.storage);
  const adapter = options.adapter ?? codemirror6Adapter();
  const model = createTextModel(options.text);

  const cleanups: Array<() => void> = [];
  const listen = (target: { addEventListener(t: string, l: EdListener, o?: unknown): void; removeEventListener(t: string, l: EdListener, o?: unknown): void }, type: string, fn: EdListener, opts?: unknown): void => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const timers = new Set<unknown>();
  const later = (fn: () => void, ms: number): unknown => {
    const id = win.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const cancel = (id: unknown): void => { if (id !== null && id !== undefined) { win.clearTimeout(id); timers.delete(id); } };
  let destroyed = false;

  // ── events ──
  const handlers = new Map<EditorEventName, Set<(e: never) => void>>();
  const emit = <E extends EditorEventName>(event: E, payload: EditorEvents[E]): void => {
    const set = handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { (fn as (e: EditorEvents[E]) => void)(payload); } catch { /* a listener's error is its own */ }
    }
  };
  const has = (event: EditorEventName): boolean => (handlers.get(event)?.size ?? 0) > 0;

  // ── DOM ──
  const el = <T extends EdElement = EdElement>(tag: string, className?: string): T => {
    const e = doc.createElement(tag) as T;
    if (className) e.className = className;
    return e;
  };
  const host = el('div', 'orz-editor-host');
  host.setAttribute('data-orz-chrome', 'editor');
  const root = createShadowRoot(host as unknown as UiElement);
  // the editor's own sheet, after CHROME_CSS
  {
    const Sheet = win.CSSStyleSheet;
    let adopted = false;
    if (Sheet && Array.isArray(root.adoptedStyleSheets)) {
      try {
        const sheet = new Sheet();
        sheet.replaceSync(EDITOR_CSS);
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        adopted = true;
      } catch { adopted = false; }
    }
    if (!adopted) {
      const style = el('style');
      style.append(doc.createTextNode(EDITOR_CSS));
      root.append(style);
    }
  }
  const container = el('div', 'orz-editor');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', options.label ?? 'Document editor');
  container.setAttribute('tabindex', '-1');
  container.setAttribute('data-chrome-level', chromeLevel);
  if (readOnly) container.setAttribute('data-readonly', '');
  root.append(container);

  const isMac = /Mac|iPhone|iPad/.test(String(win.navigator?.platform ?? win.navigator?.userAgent ?? ''));
  const mod = isMac ? '⌘' : 'Ctrl+';
  const button = (className: string, label: string, icon?: IconName): EdElement => {
    const b = el('button', className);
    b.setAttribute('type', 'button');
    if (icon) b.append(iconElement(doc as unknown as UiDocument, icon));
    const span = el('span', 'orz-editor__label');
    span.append(doc.createTextNode(label));
    b.append(span);
    b.setAttribute('aria-label', label);
    return b;
  };

  let toolbar: EdElement | null = null;
  const modeButtons = new Map<EditorMode, EdElement>();
  let statusText: { data: string } | null = null;
  let syncButton: EdElement | null = null;
  if (chromeLevel !== 'none') {
    const bar = el('div', 'orz-editor__bar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Editor toolbar');
    const modes = el('div', 'orz-editor__modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'View');
    for (const m of ['editor', 'split', 'preview'] as EditorMode[]) {
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
  if (dark === true || dark === false) host.setAttribute('data-chrome', dark ? 'dark' : 'light');

  let ratio = prefs.get('splitRatio');
  const applyRatio = (): void => {
    panes.style.setProperty('--orz-split', String(ratio));
    divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    divider.setAttribute('aria-valuetext', `Editor ${Math.round(ratio * 100)}%`);
  };
  const setRatio = (r: number, store: boolean): void => {
    if (typeof r !== 'number' || !Number.isFinite(r)) return;
    ratio = Math.round(Math.max(RATIO_MIN, Math.min(RATIO_MAX, r)) * 1000) / 1000;
    applyRatio();
    if (store) prefs.set('splitRatio', ratio);
  };
  applyRatio();

  const setScrollSync = (on: boolean): void => {
    prefs.set('scrollSync', on);
    syncButton?.setAttribute('aria-pressed', String(on));
    if (on) syncFromEditor();
  };
  syncButton?.setAttribute('aria-pressed', String(prefs.get('scrollSync')));

  // ── modes ──
  const requested = options.mode ?? prefs.get('viewMode');
  let mode: EditorMode = MODES.includes(requested) ? requested : 'split';
  let narrow = false;
  let narrowView: 'editor' | 'preview' = mode === 'preview' ? 'preview' : 'editor';
  const currentView = (): EditorMode => (narrow && mode === 'split' ? narrowView : mode);
  const applyMode = (): void => {
    const v = currentView();
    container.setAttribute('data-editor-mode', mode);
    container.setAttribute('data-view', v);
    if (narrow) container.setAttribute('data-narrow', ''); else container.removeAttribute('data-narrow');
    for (const [m, b] of modeButtons) b.setAttribute('aria-pressed', String(narrow ? m === v : m === mode));
    if (v !== 'editor' && previewStale) scheduleRender(0);
  };
  function setMode(m: EditorMode): void {
    if (!MODES.includes(m)) throw new TypeError(`orz editor: unknown mode ${String(m)}`);
    mode = m;
    if (m !== 'split') narrowView = m;
    prefs.set('viewMode', m);
    applyMode();
  }
  const toggleMode = (): void => {
    if (narrow) {
      const next = currentView() === 'editor' ? 'preview' : 'editor';
      if (mode === 'split') { narrowView = next; applyMode(); } else setMode(next);
      return;
    }
    setMode(mode === 'split' ? 'editor' : mode === 'editor' ? 'preview' : 'split');
  };
  const measure = (): void => {
    const w = host.getBoundingClientRect?.().width ?? 0;
    const n = w > 0 && w < narrowWidth;
    if (n !== narrow) { narrow = n; applyMode(); }
  };

  // ── text, dirty ──
  let baseline = options.text;
  let dirty = false;
  let setting = false;
  const getText = (): string => model.toExact(adapter.getDoc());
  const updateDirty = (): void => {
    const d = getText() !== baseline;
    if (d === dirty) return;
    dirty = d;
    container.setAttribute('data-dirty', String(d));
    if (statusText) statusText.data = d ? 'Unsaved changes' : 'Saved';
    try { options.host?.setDirty(d); } catch { /* host gone */ }
    emit('dirty', { dirty: d });
  };
  const changed = (): void => {
    if (destroyed) return;
    updateDirty();
    if (has('change')) emit('change', { get text() { return getText(); } });
    previewStale = true;
    scheduleRender(debounceMs);
  };

  // ── preview ──
  let previewStale = true;
  let renderTimer: unknown = null;
  let renderSeq = 0;
  let lastRendered: string | null = null;
  let active: 'editor' | 'preview' | null = null;
  const renderNow = async (): Promise<void> => {
    cancel(renderTimer);
    renderTimer = null;
    if (destroyed) return;
    const text = getText();
    if (text === lastRendered) { previewStale = false; return; }
    const seq = ++renderSeq;
    let html: string;
    try {
      html = String(await options.render(text));
    } catch (error) {
      if (!destroyed && seq === renderSeq) emit('error', { source: 'render', message: message(error), error });
      return;
    }
    if (destroyed || seq !== renderSeq) return;
    lastRendered = text;
    previewStale = getText() !== text;
    preview.render(html);
  };
  function scheduleRender(ms: number): void {
    if (destroyed || currentView() === 'editor') return;
    cancel(renderTimer);
    renderTimer = later(() => { void renderNow(); }, ms);
  }
  const syncOn = (): boolean => prefs.get('scrollSync') === true && currentView() === 'split';
  let syncQueued = false;
  function syncFromEditor(): void {
    if (!syncOn() || active === 'preview' || syncQueued) return;
    syncQueued = true;
    const run = (): void => {
      syncQueued = false;
      if (destroyed || !syncOn() || active === 'preview') return;
      const pos = adapter.getScroll?.();
      if (!pos) return;
      const anchors = preview.anchors;
      preview.scrollTo(anchors.length ? lineToTop(anchors, pos.line) : pos.fraction * preview.max);
    };
    if (win!.requestAnimationFrame) win!.requestAnimationFrame(run); else later(run, 16);
  }
  const syncFromPreview = (top: number, max: number): void => {
    if (!syncOn() || active !== 'preview' || !adapter.scrollTo) return;
    const anchors = preview.anchors;
    adapter.scrollTo(anchors.length ? { line: topToLine(anchors, top) } : { fraction: max > 0 ? top / max : 0 });
  };
  const openLink = (href: string): void => {
    if (options.onLink) { options.onLink(href); return; }
    if (/^(https?:|mailto:)/i.test(href)) { try { win!.open?.(href, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ } }
  };
  // A key or link reported by the frame acts only when the reader is in the frame: focus is on the
  // preview iframe (a real key press or click there needs it) and the page has transient user
  // activation (a real input in the frame activates its ancestors). A document script that posts
  // these messages while the reader works in the editor does nothing.
  const activated = (): boolean => {
    if ((root as { activeElement?: unknown }).activeElement !== preview.iframe) return false;
    const ua = (win.navigator as { userActivation?: { isActive?: boolean } } | undefined)?.userActivation;
    return !ua || ua.isActive === true;
  };
  const preview: PreviewController = createPreview(doc, previewPane, { ...(options.preview ?? {}), title: 'Document preview' }, {
    onRendered: () => { if (active !== 'preview') syncFromEditor(); },
    onScrolled: syncFromPreview,
    onKey: (key) => { if (key === 'Escape' || activated()) onShortcut(key, null); },
    onLink: (href) => { if (activated()) openLink(href); },
    onActive: () => { active = 'preview'; },
  });

  // ── the engine ──
  adapter.mount(engineEl, {
    doc: toEditorText(options.text),
    readOnly,
    root,
    label: 'Document text',
    onChange: () => { if (!setting) changed(); },
    onSelection: (s) => {
      if (!has('selection')) return;
      const d = adapter.getDoc();
      emit('selection', { from: model.toExactOffset(d, s.from), to: model.toExactOffset(d, s.to) });
    },
    onScroll: () => syncFromEditor(),
  });
  const ready = (adapter.ready?.() ?? Promise.resolve<{ engine: string; error?: unknown }>({ engine: adapter.name })).then((r) => {
    if (r.error !== undefined && !destroyed) {
      emit('error', { source: 'adapter', message: message(r.error), error: r.error });
      showToast(root, 'The code editor could not be loaded — basic editing is available.', { tone: 'warning' });
    }
    return r;
  });
  container.setAttribute('data-dirty', 'false');
  if (statusText) statusText.data = 'Saved';

  // ── keyboard, pointer ──
  const focusChrome = (): void => {
    const b = modeButtons.get(currentView()) ?? null;
    (b ?? container).focus?.();
  };
  function onShortcut(key: string, e: EdEvent | null): boolean {
    if (key === 's') { e?.preventDefault(); if (!readOnly) void api.save(); return true; }
    if (key === '\\') { e?.preventDefault(); toggleMode(); return true; }
    if (key === 'Escape') { focusChrome(); return true; }
    return false;
  }
  listen(container, 'keydown', (e) => {
    if (e.isComposing || e.defaultPrevented) return;
    const k = e.key ?? '';
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === 's' || k === 'S')) onShortcut('s', e);
    else if ((e.metaKey || e.ctrlKey) && !e.altKey && k === '\\') onShortcut('\\', e);
    else if (k === 'Escape' && editorPane.contains?.(e.target)) onShortcut('Escape', e);
  });
  listen(editorPane, 'pointerenter', () => { active = 'editor'; });
  listen(editorPane, 'focusin', () => { active = 'editor'; });
  listen(previewPane, 'pointerenter', () => { active = 'preview'; });

  let drag: number | null = null;
  listen(divider, 'pointerdown', (e) => {
    if ((e.button ?? 0) !== 0 || typeof e.pointerId !== 'number') return;
    e.preventDefault();
    drag = e.pointerId;
    try { divider.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    container.setAttribute('data-dragging', '');
  });
  listen(divider, 'pointermove', (e) => {
    if (drag === null || e.pointerId !== drag) return;
    const r = panes.getBoundingClientRect?.();
    if (!r || r.width <= 0 || typeof e.clientX !== 'number') return;
    setRatio((e.clientX - r.left) / r.width, false);
  });
  const endDrag = (e: EdEvent): void => {
    if (drag === null || e.pointerId !== drag) return;
    try { divider.releasePointerCapture?.(drag); } catch { /* released */ }
    drag = null;
    container.removeAttribute('data-dragging');
    prefs.set('splitRatio', ratio);
  };
  listen(divider, 'pointerup', endDrag);
  listen(divider, 'pointercancel', endDrag);
  listen(divider, 'keydown', (e) => {
    const k = e.key;
    let next: number | null = null;
    if (k === 'ArrowLeft' || k === 'ArrowDown') next = ratio - RATIO_STEP;
    else if (k === 'ArrowRight' || k === 'ArrowUp') next = ratio + RATIO_STEP;
    else if (k === 'Home') next = RATIO_MIN;
    else if (k === 'End') next = RATIO_MAX;
    if (next === null) return;
    e.preventDefault();
    setRatio(next, true);
  });

  // responsive: the shell's own width (an app may give it a narrow column)
  let observer: EdResizeObserver | null = null;
  if (win.ResizeObserver) {
    try { observer = new win.ResizeObserver(() => measure()); observer.observe(host); } catch { observer = null; }
  }
  listen(win, 'resize', () => measure());
  measure();
  applyMode();

  // ── save ──
  let saver: Saver | null = options.saver ?? null;
  let saving: Promise<SaveOutcome> | null = null;
  const toast = (text: string, tone: 'success' | 'error' | 'warning' | 'info'): void => { if (!destroyed) showToast(root, text, { tone }); };
  const succeed = (text: string, via: 'hook' | 'host' | 'file' | 'download'): SaveOutcome => {
    baseline = text;
    updateDirty();
    if (!destroyed) emit('save', { text, via });
    toast(via === 'download' ? 'Downloaded a copy of the document.' : 'Saved.', 'success');
    return { ok: true, via };
  };
  const fail = (error: unknown, via?: 'hook' | 'host' | 'file' | 'download'): SaveOutcome => {
    const msg = message(error);
    if (!destroyed) emit('error', { source: 'save', message: msg, error });
    toast(`Could not save: ${msg}`, 'error');
    return { ok: false, ...(via ? { via } : {}), error: msg };
  };
  let notice: EdElement | null = null;
  const dismissNotice = (): void => { notice?.remove(); notice = null; noticeSlot.hidden = true; };
  const showServedNotice = (): void => {
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
          const r = await saver!.download({ html: await options.assemble!(t) });
          if (r.via === 'download' && r.ok) { dismissNotice(); succeed(t, 'download'); } else fail('error' in r && r.error ? r.error : 'The download failed.', 'download');
        } catch (e) { fail(e, 'download'); }
      })();
    });
    listen(close, 'click', dismissNotice);
    notice.append(text, download, close);
    noticeSlot.append(notice);
    noticeSlot.hidden = false;
  };
  const doSave = async (): Promise<SaveOutcome> => {
    if (readOnly) return { ok: false, error: 'read-only' };
    const text = getText();
    if (options.hooks?.save) {
      try { await options.hooks.save(text); } catch (e) { return fail(e, 'hook'); }
      return succeed(text, 'hook');
    }
    if (!options.assemble) return fail(new Error('no save route (pass hooks.save or assemble)'));
    let html: string;
    try { html = String(await options.assemble(text)); } catch (e) { return fail(e); }
    saver ??= createSaver({ ...(uid ? { uid } : {}), suggestedName: options.fileName ?? `document${KIND_EXTENSIONS[kind] ?? '.html'}`, kind, ...(options.host ? { host: options.host } : {}) });
    const r = await saver.save({ text, html });
    if (r.via === 'served-notice') {
      if (!destroyed) showServedNotice();
      return { ok: false, via: 'served-notice', error: 'served page' };
    }
    if (r.ok) return succeed(text, r.via);
    if (r.via === 'file' && r.error === 'cancelled') return { ok: false, via: 'file', error: 'cancelled', cancelled: true };
    return fail(new Error(r.error ?? 'The document could not be saved.'), r.via);
  };

  const api: EditorShell = {
    getText,
    setText(text, o) {
      if (typeof text !== 'string') throw new TypeError('orz editor: setText needs a string');
      const editorText = model.adopt(text);
      setting = true;
      try { adapter.setDoc(editorText, { resetHistory: o?.resetHistory === true }); } finally { setting = false; }
      changed();
    },
    setHeader(changes) {
      const current = getText();
      const next = editHeader(current, changes);
      if (next !== current) api.setText(next);
    },
    isDirty() { updateDirty(); return dirty; },
    markSaved() { baseline = getText(); updateDirty(); },
    save() {
      if (destroyed) return Promise.resolve({ ok: false, error: 'destroyed' });
      saving ??= doSave().finally(() => { saving = null; });
      return saving;
    },
    setMode,
    getMode: () => mode,
    getView: currentView,
    setSplitRatio: (r) => setRatio(r, true),
    getSplitRatio: () => ratio,
    undo: () => adapter.undo?.() ?? false,
    redo: () => adapter.redo?.() ?? false,
    focus() { if (currentView() === 'preview') preview.iframe.focus?.(); else adapter.focus(); },
    on(event, fn) {
      let set = handlers.get(event);
      if (!set) handlers.set(event, (set = new Set()));
      set.add(fn as (e: never) => void);
      return () => { set!.delete(fn as (e: never) => void); };
    },
    refreshPreview: () => renderNow(),
    root,
    toolbar,
    adapter,
    ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const id of [...timers]) cancel(id);
      for (const f of cleanups.splice(0)) { try { f(); } catch { /* gone */ } }
      try { observer?.disconnect(); } catch { /* gone */ }
      observer = null;
      try { adapter.destroy(); } catch { /* engine's problem */ }
      preview.destroy();
      host.remove();
      handlers.clear();
    },
  };
  return api;
}
