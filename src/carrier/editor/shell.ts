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
import { editHeader, readHeader, UID_PATTERN, type HeaderChange } from '../header.js';
import { mintUid } from '../uid.js';
import { createShadowRoot, iconElement, showToast, type IconName } from '../shell/chrome.js';
import { createPreferenceStore, type PreferenceStore } from '../shell/preferences.js';
import { createSaver, type Saver, type SaverOptions } from '../shell/save.js';
import { KIND_EXTENSIONS, type AiOperation, type HostKind } from '../shell/protocol.js';
import type { HostConnection } from '../shell/file-side.js';
import type { StorageLike, UiDocument, UiElement } from '../shell/types.js';
import type { TextEditorAdapter } from './adapter.js';
import { codemirror6Adapter } from './codemirror6.js';
import { createPreview, lineToTop, rewriteAssetUrls, topToLine, type PreviewController, type PreviewFrameOptions, type PreviewMessage } from './preview.js';
import { EDITOR_CSS } from './styles.js';
import { createTextModel, toEditorText } from './text-model.js';
import type { ColorScheme } from '../../preview-frame.js';
import type { EdDataTransfer, EdDocument, EdElement, EdEvent, EdFile, EdListener, EdResizeObserver, EdView, ShadowRootLike } from './types.js';

export type EditorMode = 'split' | 'editor' | 'preview';
export type EditorEventName = 'change' | 'dirty' | 'selection' | 'save' | 'error';
export type SaveVia = 'hook' | 'host' | 'file' | 'download';

/** How the save went. `save()` never rejects. */
export type SaveOutcome =
  | { ok: true; via: SaveVia }
  | { ok: false; via?: SaveVia | 'served-notice'; error: string; cancelled?: boolean };

export interface EditorEvents {
  /** The exact text after the change (captured when the event fires). */
  change: { readonly text: string };
  dirty: { dirty: boolean };
  /** Offsets in the exact text (BOM and CR LF counted). */
  selection: { from: number; to: number };
  save: { text: string; via: SaveVia };
  /** `format`: the text's format is newer than the editor's; `hook`: an upload, AI or uid hook failed. */
  error: { source: 'save' | 'render' | 'adapter' | 'format' | 'hook'; message: string; error: unknown };
}

/** A range of the exact text (BOM and CR LF counted). */
export interface TextRange { from: number; to: number }

/** FC-19 §3 `EditorHooks`: what a host supplies. Every hook is optional. */
export interface EditorHooks {
  /** App host: persist the text. Absent → the standalone save (`assemble` + `createSaver`). */
  save?(text: string): Promise<void>;
  /** AI operations: `request` gets the exact text and, for a passage, its range; `proposed` replaces it (`requestAi`). */
  ai?: {
    operations: AiOperation[];
    request(op: string, ctx: { text: string; selection?: TextRange }): Promise<{ proposed: string }>;
  };
  /** Include fetching (URL or path → text, or null); passed to `render` in its context. The host owns the trust policy. */
  fetchInclude?(target: string): Promise<string | null>;
  /** A relative asset path → the URL the preview loads (applied to the rendered HTML; also passed to `render`). */
  resolveAsset?(path: string): string;
  /** A pasted or dropped file → the relative path to insert (as a Markdown image or link). */
  uploadAsset?(file: EdFile): Promise<string>;
  /** A link clicked in the preview → the URL to open (then `onLink`, or the default). */
  resolveLink?(href: string): string;
  /** A host-minted `uid` (FC-18 §10) for `ensureUid()`; default the kit's `mintUid()`. */
  mintUid?(): Promise<string>;
}

/** What `render` gets besides the text: the host's hooks that a renderer may use. */
export interface RenderContext {
  fetchInclude?(target: string): Promise<string | null>;
  resolveAsset?(path: string): string;
  /**
   * `false` when the host resolves links itself (`hooks.resolveLink`): render
   * links as written (no twin rewrite), so `resolveLink` gets the source href.
   * `renderMarkdownPreview` reads it.
   */
  twinLinks?: boolean;
  /** A scratch map that lives as long as the shell (e.g. fetched includes; `renderMarkdownPreviewWithIncludes`). */
  cache?: Map<string, unknown>;
}

/** The shell's channel to the preview frame's bridge (FC-19 §8.4), for a carrier's own frame protocol. */
export interface EditorPreviewChannel {
  /** Post a message to the frame (the carrier's own types). False while the frame is not ready. */
  post(message: Readonly<Record<string, unknown>>): boolean;
  /** Listen to the frame's messages of one type — claims of the document's scripts, data only. Returns the unsubscribe. */
  on(type: string, fn: (message: PreviewMessage) => void): () => void;
  /** Rebuild the frame document with another `head` and/or `scheme` (e.g. a theme change); the preview shows again. */
  setOptions(options: { head?: string; scheme?: ColorScheme }): void;
}

/** The preview's scroll mapping context (`preview.mapLine` / `mapPosition`). */
export interface PreviewMapContext {
  /** `[line, top]` anchors the frame reported, sorted by top. */
  anchors: ReadonlyArray<[number, number]>;
  /** The frame's scrollable height. */
  max: number;
}

export interface EditorPreviewOptions extends PreviewFrameOptions {
  /** The least pause after an edit before the preview renders (ms, default 150); it grows to twice the last render's time. */
  debounceMs?: number;
  /** How long the frame may take to start before the shell reports it (`error` `render`) and shows a notice. Default 8000. */
  readyTimeoutMs?: number;
  /**
   * `scroll` (default): the shell posts preview tops (`orz-preview-scroll`)
   * and reads tops back. `navigate`: the shell posts the source line
   * (`orz-preview-navigate { line }`, the caret's line while the editor has
   * focus, else the top line) and the bridge shows what holds it (a slide);
   * the bridge reports `orz-preview-scrolled { line }` back.
   */
  mode?: 'scroll' | 'navigate';
  /** Editor line (0-based, fractional) → preview top. Return `null` for the default (anchors, else proportional). */
  mapLine?(line: number, ctx: PreviewMapContext): number | null | undefined;
  /** Preview top → editor line. Return `null` for the default. */
  mapPosition?(top: number, ctx: PreviewMapContext): number | null | undefined;
}

export interface EditorShellOptions {
  /** The document (FC-18), exact. */
  text: string;
  /** The kind's preview renderer: text → HTML for the sandboxed preview (md: `renderMarkdownPreview`). */
  render(text: string, ctx: RenderContext): string | Promise<string>;
  /** The editing engine. Default `codemirror6Adapter()` (falls back to a textarea). */
  adapter?: TextEditorAdapter;
  /** Initial mode; default the stored `viewMode` preference (`split`). */
  mode?: EditorMode;
  readOnly?: boolean;
  /** How much toolbar: `full` (labels), `compact` (icons), `none` (no toolbar; the host drives the API). */
  chrome?: 'full' | 'compact' | 'none';
  /** The carrier kind, for the standalone save (`md` by default). */
  kind?: HostKind;
  /** The text formats this editor reads and writes (FC-18; the carrier's `OrzCarrier.formats`). Default `[1]`. */
  formats?: number[];
  /** Preferences namespace and save handle key; default the header `uid`. */
  uid?: string;
  /** Reader preferences (FC-19 `preferences`); default `createPreferenceStore(uid, storage)`. */
  preferences?: PreferenceStore;
  /** Storage of the default preference store (default `localStorage`). */
  storage?: StorageLike;
  /** FC-19 §3 hooks (`hooks.save` = app host). */
  hooks?: EditorHooks;
  /** Standalone host: the assembled file for a text (the carrier's `assemble`), saved through `createSaver`. */
  assemble?(text: string): string | Promise<string>;
  /** The assembled file's name for the standalone save (default `document` + the kind's extension). */
  fileName?: string;
  /** A saver to use instead of `createSaver({ uid, suggestedName: fileName, kind, host, openedHtml })`. */
  saver?: Saver;
  /**
   * The bytes of the file this page was opened from (`createSaver`'s
   * `openedHtml`: how a remembered file handle is proved to be that file).
   * Default: `assemble(text)` of the text the shell was mounted with, which
   * reproduces an assembled file (FC-18 law 3).
   */
  openedHtml?: SaverOptions['openedHtml'];
  /** A connected app host (`connectHost`): saves go to it, and the dirty state is posted to it. */
  host?: HostConnection;
  /**
   * The shell runs in the assembled file itself (the file's own boot passes
   * `true`). Default: inferred — no `hooks.save`, an `assemble`, no `host`, and
   * a top-level window. It decides the preview's sandbox, where a standalone
   * `file:` page also needs a top-level window and no host (previewSandbox).
   */
  standalone?: boolean;
  /** The preview frame (theme links, scheme, article class, libraries, nonce, the carrier's frame/bridge/mapping) and its timing. */
  preview?: EditorPreviewOptions;
  /**
   * A link clicked in the preview, after `hooks.resolveLink`. Default: an
   * `http(s):` / `mailto:` link is offered in a chip in the preview ("Open
   * <host>"), opened in a new tab when the reader clicks it.
   */
  onLink?(href: string): void;
  /** Accessible name of the editor region. Default `Document editor`. */
  label?: string;
  /** Below this width (CSS px) only one pane shows at a time. Default 640. */
  narrowWidth?: number;
}

/** How an AI request went. Never rejects. */
export type AiOutcome = { ok: true; op: string } | { ok: false; error: string };
/** How an upload went: the Markdown inserted for each uploaded file. Never rejects. */
export type UploadOutcome = { ok: true; inserted: string[] } | { ok: false; inserted: string[]; error: string };

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
  /**
   * Run `hooks.ai.request(op, { text, selection? })` and apply `proposed` as
   * ONE undoable edit: it replaces the selection (a passage operation, or
   * `{ selection: true }`) or the whole text, written in the document's line
   * endings (and BOM). Refused when the text changed during the request.
   */
  requestAi(op: string, options?: { selection?: boolean }): Promise<AiOutcome>;
  /** Upload files through `hooks.uploadAsset` and insert their Markdown at the selection (one undoable edit). */
  uploadAssets(files: ArrayLike<EdFile>): Promise<UploadOutcome>;
  /** The header `uid`; when there is none, mint one (`hooks.mintUid`, else the kit's) and set it (one undoable edit). */
  ensureUid(): Promise<string>;
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
  /** Render the preview now (normally after a pause in typing). */
  refreshPreview(): Promise<void>;
  /** Read-only now: asked for (`readOnly`, `setReadOnly`), or forced by a newer text format. */
  readonly readOnly: boolean;
  /**
   * Switch read-only at run time (e.g. while a quiet update runs,
   * spec/shell-runtime.md §7.2): the engine, Save, Cmd/Ctrl+S, uploads and AI
   * follow it. A document in a newer text format stays read-only:
   * `setReadOnly(false)` does not unlock it.
   */
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  /** The chrome's shadow root (for a carrier's own chrome and toasts). */
  readonly root: ShadowRootLike;
  /** The toolbar slot where a carrier adds its tools (null with `chrome: 'none'`). */
  readonly toolbar: EdElement | null;
  readonly adapter: TextEditorAdapter;
  /** Resolves when the engine is final (`codemirror6`, or `textarea` with the load error). */
  readonly ready: Promise<{ engine: string; error?: unknown }>;
  /** The channel to the preview frame's bridge (a carrier's own messages, theme changes). */
  readonly preview: EditorPreviewChannel;
  /**
   * Remove everything the shell added. Afterwards `getText()` returns the text
   * as it was, `isDirty()` the state then; `setText`, `setHeader`, `markSaved`
   * and `setReadOnly` do nothing, `undo`/`redo` return false, `save()` and
   * the hooks refuse, and work still in flight changes nothing.
   */
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
const ACK_WAIT_MS = 10_000;
const FIRST_ACK_WAIT_MS = 1500;
/** While edits continue, a render runs at least this often: max(this, 4 × the last render and frame time) (ms). */
const MAX_WAIT_MS = 1000;

const message = (e: unknown): string =>
  typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);

const BOM = '﻿';

/** The header `format` of a text (default 1; a malformed value reads as 1, as `readDocument` does). */
function formatOf(fields: Readonly<Record<string, string>> | undefined): number {
  const f = fields?.['format']?.trim();
  return f !== undefined && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1;
}

/** The Markdown for an uploaded file: an image for `image/*`, else a link. */
function assetMarkdown(file: EdFile, path: string): string {
  const name = String(file.name ?? 'file');
  const label = (/^image\//i.test(String(file.type ?? '')) ? name.replace(/\.[^.]*$/, '') : name).replace(/[[\]\\\r\n]/g, '');
  const target = path.replace(/[ ()<>\r\n]/g, (c) => ({ ' ': '%20', '(': '%28', ')': '%29', '<': '%3C', '>': '%3E', '\r': '', '\n': '' } as Record<string, string>)[c]);
  return /^image\//i.test(String(file.type ?? '')) ? `![${label}](${target})` : `[${label}](${target})`;
}

const filesOf = (t: EdDataTransfer | null | undefined): EdFile[] => {
  const f = t?.files;
  return f && typeof f.length === 'number' ? Array.from(f) : [];
};

/** Mount the editor shell in `element`. */
export function createEditorShell(element: EdElement, options: EditorShellOptions): EditorShell {
  if (typeof options?.text !== 'string') throw new TypeError('orz editor: options.text must be a string');
  if (typeof options.render !== 'function') throw new TypeError('orz editor: options.render must be a function');
  const doc = element.ownerDocument as EdDocument | null;
  const win = doc?.defaultView as EdView | null | undefined;
  if (!doc || !win) throw new Error('orz editor: the element must belong to a document with a window');

  const hooks: EditorHooks = options.hooks ?? {};
  const header = readHeader(options.text);
  const formats = (Array.isArray(options.formats) ? options.formats : []).filter((f) => Number.isInteger(f) && f > 0);
  const maxFormat = formats.length ? Math.max(...formats) : 1;
  const docFormat = formatOf(header?.fields);
  /** A newer text format opens read-only and is never saved over (FC-18 §8.4, D7). */
  const newerFormat = docFormat > maxFormat ? docFormat : null;
  /** Read-only now: asked for (`readOnly`, `setReadOnly`) or forced by a newer format, which nothing unlocks. */
  let readOnly = options.readOnly === true || newerFormat !== null;
  const chromeLevel = options.chrome ?? 'full';
  const kind: HostKind = options.kind ?? 'md';
  const narrowWidth = options.narrowWidth ?? 640;
  const previewOptions: EditorPreviewOptions = options.preview ?? {};
  const debounceMs = previewOptions.debounceMs ?? 150;
  const navigateMode = previewOptions.mode === 'navigate';
  const uid = options.uid ?? header?.fields['uid']?.trim();
  const prefs: PreferenceStore = options.preferences ?? createPreferenceStore(uid, options.storage);
  const adapter = options.adapter ?? codemirror6Adapter();
  const model = createTextModel(options.text);
  /** The text the shell was mounted with: what the page was opened with (the saver's proof of the opened file). */
  const openedText = options.text;

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
  const clock = (): number => { try { return win.performance?.now() ?? Date.now(); } catch { return Date.now(); } };
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
  let saveButton: EdElement | null = null;
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
  /** The view last applied (null before the first). */
  let shownView: EditorMode | null = null;
  const applyMode = (): void => {
    const v = currentView();
    container.setAttribute('data-editor-mode', mode);
    container.setAttribute('data-view', v);
    if (narrow) container.setAttribute('data-narrow', ''); else container.removeAttribute('data-narrow');
    for (const [m, b] of modeButtons) b.setAttribute('aria-pressed', String(narrow ? m === v : m === mode));
    // B#4: a navigating preview shows the caret's place whenever a view change shows it (again after the render)
    if (navigateMode && v !== 'editor' && shownView !== null && v !== shownView) { navigateAfterRender = true; navigateToCaret(); }
    shownView = v;
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
  // The saved text lives in the text model (remembered outside its window of recent texts): a
  // different editor text is a different exact text, found without converting.
  let dirty = false;
  let setting = false;
  /** The text at `destroy()`: what `getText()` returns afterwards. */
  let finalText: string | null = null;
  const getText = (): string => (finalText !== null ? finalText : model.toExact(adapter.getDoc()));
  const differs = (): boolean => !model.isSaved(adapter.getDoc());
  const updateDirty = (): void => {
    if (destroyed) return; // a save finishing after destroy posts nothing (to the host either)
    const d = differs();
    if (d === dirty) return;
    dirty = d;
    container.setAttribute('data-dirty', String(d));
    if (statusText) statusText.data = d ? 'Unsaved changes' : 'Saved';
    try { options.host?.setDirty(d); } catch { /* host gone */ }
    emit('dirty', { dirty: d });
  };
  const adoptBaseline = (text: string): void => { if (!destroyed) model.markSaved(text); };
  const changed = (): void => {
    if (destroyed) return;
    // back at a remembered text (undo): its BOM and line endings are the document's again
    model.recall(adapter.getDoc());
    updateDirty();
    if (has('change')) emit('change', { text: getText() });
    previewStale = true;
    if (staleSince === null) staleSince = clock();
    scheduleRender();
    if (navigateMode) syncFromEditor();
  };

  // ── preview ──
  let previewStale = true;
  /** When the first edit not yet rendered was made (the max wait counts from it); null when rendered. */
  let staleSince: number | null = null;
  let renderTimer: unknown = null;
  let lastRendered: string | null = null;
  /** The render in progress (renders never overlap); another is coalesced into `renderAgain`. */
  let renderRunning: Promise<void> | null = null;
  let renderAgain = false;
  /** The last render's time: `render` plus the frame's own work until it acknowledged the render (B#3). */
  let lastRenderMs = 0;
  /** The frame did not acknowledge a render in time and never has: do not wait for it. */
  let ackless = false;
  /** The pause before a render: at least `debounceMs`, and twice the last render's time (a slow renderer is not run per keystroke). */
  const renderDelay = (): number => Math.max(debounceMs, 2 * lastRenderMs);
  /** While edits continue, a render runs at least this often (LOW6). */
  const maxWait = (): number => Math.max(MAX_WAIT_MS, 4 * lastRenderMs);
  const renderCtx: RenderContext = {
    ...(hooks.fetchInclude ? { fetchInclude: (t: string) => hooks.fetchInclude!(t) } : {}),
    ...(hooks.resolveAsset ? { resolveAsset: (p: string) => hooks.resolveAsset!(p) } : {}),
    // B#12: with the host's own link resolution, links stay as written so resolveLink gets the source href
    ...(hooks.resolveLink ? { twinLinks: false } : {}),
    cache: new Map<string, unknown>(),
  };
  /** Wait for the frame to acknowledge a render (B#3), at most ACK_WAIT_MS; not at all for a frame that never does. */
  const waitAck = (acked: Promise<boolean>): Promise<boolean> => {
    const cap = preview.acknowledges ? ACK_WAIT_MS : ackless ? 0 : FIRST_ACK_WAIT_MS;
    if (cap <= 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const timer = later(() => { if (!preview.acknowledges) ackless = true; resolve(false); }, cap);
      void acked.then((ok) => { cancel(timer); if (ok) ackless = false; resolve(ok); });
    });
  };
  const runRender = async (): Promise<void> => {
    const text = getText();
    if (text === lastRendered) { previewStale = false; staleSince = null; return; }
    staleSince = null;
    const t0 = clock();
    let html: string;
    try {
      html = String(await options.render(text, renderCtx));
    } catch (error) {
      lastRenderMs = clock() - t0;
      if (!destroyed) emit('error', { source: 'render', message: message(error), error });
      return;
    }
    const renderMs = clock() - t0;
    lastRenderMs = renderMs;
    if (destroyed) return;
    if (hooks.resolveAsset) html = rewriteAssetUrls(html, (p) => hooks.resolveAsset!(p));
    lastRendered = text;
    previewStale = getText() !== text;
    // the render runs until the frame says it has shown it; the pause then counts both
    const acked = await waitAck(preview.render(html));
    if (acked) lastRenderMs = clock() - t0;
  };
  const renderNow = (): Promise<void> => {
    cancel(renderTimer);
    renderTimer = null;
    if (destroyed) return Promise.resolve();
    if (renderRunning) { renderAgain = true; return renderRunning; }
    const run = runRender().finally(() => {
      renderRunning = null;
      if (renderAgain && !destroyed) { renderAgain = false; scheduleRender(); }
    });
    renderRunning = run;
    return run;
  };
  function scheduleRender(ms?: number): void {
    if (destroyed || currentView() === 'editor') return;
    if (renderRunning) { renderAgain = true; return; }
    cancel(renderTimer);
    let delay = ms ?? renderDelay();
    // continued typing does not hold the preview back for ever (LOW6)
    if (ms === undefined && staleSince !== null) delay = Math.min(delay, Math.max(0, staleSince + maxWait() - clock()));
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
  const frameFocused = (): boolean => (root as { activeElement?: unknown }).activeElement === preview.iframe;
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
  let lastShellFocus: EdElement | null = null;
  let pageFocus: EdElement | null = null;
  let pausedNote: EdElement | null = null;
  const randomNonce = (): string => {
    try {
      const a = new Uint32Array(4);
      win.crypto?.getRandomValues?.(a);
      if (a.some((x) => x !== 0)) return Array.from(a, (x) => x.toString(36)).join('');
    } catch { /* no crypto */ }
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
  const putFocusBack = (): void => {
    if (destroyed) return;
    if (pageFocus) { try { pageFocus.focus?.({ preventScroll: true }); } catch { /* gone */ } if (!frameFocused()) return; }
    const shown = currentView() !== 'preview';
    if (lastShellFocus && container.contains?.(lastShellFocus)) {
      if (shown && editorPane.contains?.(lastShellFocus)) adapter.focus(); else lastShellFocus.focus?.({ preventScroll: true });
      return; // the page may count the frame as focused a moment longer: the blur watch of restoreFocus covers it
    }
    // the reader was not in the shell (a theft at load): the shell's region — no caret moved, nothing scrolled
    container.focus?.({ preventScroll: true });
  };
  const restoreFocus = (): void => {
    restoreUntil = clock() + RESTORE_MS;
    putFocusBack();
  };
  /** When the shell paused the document's scripts for a theft (a reader's report soon after undoes it). */
  let pausedAt = -Infinity;
  let theftPause = false;
  const onTheft = (): void => {
    if (destroyed) return;
    restoreFocus();
    if (preview.scriptsPaused) return;
    preview.pauseScripts(previewOptions.nonce || randomNonce());
    pausedAt = clock();
    theftPause = true;
    // said only once it is not the reader's click after all (Chrome may focus the frame before its pointerdown)
    later(() => {
      if (destroyed || !theftPause || !preview.scriptsPaused) return;
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
  let asking: { id: number; timer: unknown; said: boolean } | null = null;
  let pingSeq = 0;
  const settleAsking = (): void => { if (asking) { cancel(asking.timer); asking = null; } };
  const letReaderIn = (): void => {
    settleAsking();
    restoreUntil = -Infinity; // the bounce was wrong: no more undoing of blurs
    grantUntil = clock() + GRANT_MS;
    preview.iframe.focus?.();
  };
  const theftNow = (): void => { settleAsking(); onTheft(); };
  const onFrameFocus = (reader: boolean): void => {
    if (destroyed) return;
    const t = clock();
    if (reader) {
      if (asking) { letReaderIn(); return; }
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
    if (t < grantUntil || t - tabAt < TAB_MS || t - paneDownAt < PANE_MS) return;
    restoreFocus();
    if (preview.scriptsPaused) return;
    // taken again before the question was settled: a reader's click does not do that, a script does
    if (asking) { theftNow(); return; }
    const id = ++pingSeq;
    asking = { id, said: false, timer: later(() => { if (asking?.id === id) theftNow(); }, PONG_MS) };
    if (!preview.post({ type: 'orz-preview-ping', id })) theftNow();
  };
  const onPong = (id: number, pointer: boolean): void => {
    if (destroyed || !asking || asking.id !== id || asking.said) return;
    if (pointer) { letReaderIn(); return; }
    // no pointerdown yet: under load it may still be on its way — a short wait, which a report of the
    // reader's pointer (or another theft) settles sooner
    cancel(asking.timer);
    asking.said = true;
    asking.timer = later(() => { if (asking?.id === id) theftNow(); }, CONFIRM_MS);
  };
  const previewLeads = (): boolean => {
    if (frameFocused()) return true;
    const t = clock();
    return t - claimAt < CLAIM_MS && t - editorTouchAt > TOUCH_MS && !(adapter.hasFocus?.() ?? false);
  };
  // A key or link the bridge reports through its port is the reader's own (a trusted event in the
  // frame): it acts. A carrier's own bridge (no port) sends claims: they act only while focus is on
  // the preview iframe and the page has transient user activation (a real input in the frame
  // activates its ancestors); Escape (which a browser does not count as activation) needs the focus
  // only: all it does is move focus from the frame to the toolbar.
  const activated = (): boolean => {
    if (!frameFocused()) return false;
    const ua = win.navigator?.userActivation;
    return !ua || ua.isActive === true;
  };
  const syncOn = (): boolean => prefs.get('scrollSync') === true && currentView() === 'split';
  const lineOf = (text: string, offset: number): number => {
    let n = 0;
    for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) n++;
    return n;
  };
  /** Navigate mode: show the caret's source line (else the editor's top line) in the preview. */
  function navigateToCaret(): void {
    if (!navigateMode || destroyed) return;
    const sel = adapter.getSelection?.();
    const line = sel ? lineOf(adapter.getDoc(), sel.to) : adapter.getScroll?.().line;
    if (typeof line === 'number') preview.navigate(line);
  }
  let syncQueued = false;
  function syncFromEditor(): void {
    if (!syncOn() || previewLeads() || syncQueued) return;
    syncQueued = true;
    const run = (): void => {
      syncQueued = false;
      if (destroyed || !syncOn() || previewLeads()) return;
      if (navigateMode) {
        const sel = adapter.hasFocus?.() ? adapter.getSelection?.() : undefined;
        const line = sel ? lineOf(adapter.getDoc(), sel.to) : adapter.getScroll?.().line;
        if (typeof line === 'number') preview.navigate(line);
        return;
      }
      const pos = adapter.getScroll?.();
      if (!pos) return;
      const anchors = preview.anchors;
      const mapped = previewOptions.mapLine?.(pos.line, { anchors, max: preview.max });
      preview.scrollTo(typeof mapped === 'number' && Number.isFinite(mapped) ? mapped : anchors.length ? lineToTop(anchors, pos.line) : pos.fraction * preview.max);
    };
    if (win!.requestAnimationFrame) win!.requestAnimationFrame(run); else later(run, 16);
  }
  const syncFromPreview = (top: number, max: number, line?: number): void => {
    if (!syncOn() || !previewLeads() || !adapter.scrollTo) return;
    if (typeof line === 'number') { adapter.scrollTo({ line }); return; }
    const anchors = preview.anchors;
    const mapped = previewOptions.mapPosition?.(top, { anchors, max });
    if (typeof mapped === 'number' && Number.isFinite(mapped)) adapter.scrollTo({ line: mapped });
    else adapter.scrollTo(anchors.length ? { line: topToLine(anchors, top) } : { fraction: max > 0 ? top / max : 0 });
  };
  // Links from the frame are claims too (F1b): they open only through the host (`onLink`) or the
  // reader's own click on the shell's chip — the frame never opens a window by itself.
  let linkChip: EdElement | null = null;
  const dismissChip = (): void => { linkChip?.remove(); linkChip = null; };
  const offerLink = (target: string): void => {
    dismissChip();
    let label = target;
    try {
      const u = new URL(target);
      label = u.protocol === 'mailto:' ? `Write to ${decodeURIComponent(u.pathname)}` : `Open ${u.host}`;
    } catch { /* keep the href */ }
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
      try { win.open?.(target, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ }
    });
    listen(close, 'click', dismissChip);
    chip.append(text, go, close);
    previewPane.append(chip);
    linkChip = chip;
  };
  const openLink = (href: string): void => {
    let target = href;
    if (hooks.resolveLink) {
      try {
        const r = hooks.resolveLink(href);
        if (typeof r !== 'string') return;
        target = r;
      } catch { return; }
    }
    if (options.onLink) { options.onLink(target); return; }
    if (/^(https?:|mailto:)/i.test(target)) offerLink(target);
  };
  let previewNote: EdElement | null = null;
  let topLevel = true;
  try { topLevel = win.top === undefined || win.top === null || win.top === win; } catch { topLevel = false; }
  // F6: the file's own boot says so (`standalone`); else no save hook, an `assemble`, no host and a top-level window
  const standalone = options.standalone ?? (!hooks.save && typeof options.assemble === 'function' && !options.host && topLevel);
  let navigateAfterRender = false;
  const preview: PreviewController = createPreview(doc, previewPane, {
    ...previewOptions,
    title: 'Document preview',
    context: { host: standalone ? 'standalone' : 'app', protocol: String(win.location?.protocol ?? ''), topLevel, connected: !!options.host },
  }, {
    onRendered: () => {
      syncFromEditor();
      if (navigateAfterRender) { navigateAfterRender = false; navigateToCaret(); }
    },
    onScrolled: (top, max, line) => syncFromPreview(top, max, line),
    onKey: (key, trusted) => {
      if (trusted || (key === 'Escape' ? frameFocused() : activated())) onShortcut(key, null);
    },
    onLink: (href, trusted) => { if (trusted || activated()) openLink(href); },
    // counts only while the editor is untouched (previewLeads)
    onActive: () => { claimAt = clock(); },
    onFocus: (reader) => onFrameFocus(reader),
    onPong: (id, pointer) => onPong(id, pointer),
    onReady: () => {
      previewNote?.remove();
      previewNote = null;
      // a frame reloaded for a theft may take the browser's focus with it when it commits: take it back
      if (theftPause && preview.scriptsPaused && clock() - pausedAt < 5000) restoreFocus(); // (and watch the next moment again)
    },
    onStall: () => {
      if (destroyed) return;
      const error = new Error('The preview frame did not start: a Content-Security-Policy that blocks its inline scripts? Pass preview.nonce, or allow PREVIEW_BRIDGE_HASH / previewScriptHashes().');
      emit('error', { source: 'render', message: error.message, error });
      previewNote = el('div', 'orz-editor__preview-note');
      previewNote.setAttribute('role', 'status');
      previewNote.append(doc.createTextNode('The preview could not start on this page.'));
      previewPane.append(previewNote);
    },
  });
  const touchEditor = (): void => { editorTouchAt = clock(); };
  for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin', 'touchstart']) listen(editorPane, type, touchEditor, { passive: true, capture: true });
  // what the page sees around the frame (F1): a Tab (keyboard navigation into the frame) and where the focus was
  const docListen = (type: string, fn: EdListener): void => {
    if (typeof doc.addEventListener !== 'function') return;
    doc.addEventListener(type, fn, true);
    cleanups.push(() => doc.removeEventListener?.(type, fn, true));
  };
  docListen('keydown', (e) => {
    if (e.key === 'Tab') tabAt = clock();
    // just after a theft, a key that finds nothing focused (the frame took the focus and let it go)
    // goes to the editor: the text of a key goes where the focus is once its keydown has run
    else if (clock() < restoreUntil && (doc.activeElement === doc.body || !doc.activeElement)) putFocusBack();
  });
  docListen('focusin', (e) => { pageFocus = e.target === (host as unknown) ? null : (e.target as EdElement | null); });
  listen(container, 'focusin', (e) => {
    const target = (e.composedPath?.()[0] ?? e.target) as EdElement | null;
    if (target !== (preview.iframe as unknown)) lastShellFocus = target;
  });
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
    listen(previewPane, type, (e) => { if (e.isTrusted !== false) paneDownAt = clock(); }, { capture: true, passive: true });
  }
  // just after a theft: the page sees the frame take the focus a moment late — undo that as well
  listen(container, 'focusout', (e) => { if (clock() < restoreUntil && !e.relatedTarget) later(putFocusBack, 0); });
  listen(win, 'blur', () => { if (clock() < restoreUntil) later(putFocusBack, 0); });

  // ── the engine ──
  adapter.mount(engineEl, {
    doc: toEditorText(options.text),
    readOnly,
    root,
    label: 'Document text',
    onChange: () => { if (!setting) changed(); },
    onSelection: (s) => {
      if (navigateMode) syncFromEditor();
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
  const formatError = (): Error => new Error(`text format ${formatOf(readHeader(getText())?.fields)} is newer than this editor (format ${maxFormat}): read-only, not saved`);
  if (newerFormat !== null) {
    // after the caller had a chance to subscribe
    void Promise.resolve().then(() => {
      if (destroyed) return;
      const error = formatError();
      emit('error', { source: 'format', message: error.message, error });
    });
  }

  // ── keyboard, pointer, paste and drop ──
  const focusChrome = (): void => {
    const b = modeButtons.get(currentView()) ?? null;
    (b ?? container).focus?.();
  };
  function onShortcut(key: string, e: EdEvent | null): boolean {
    if (key === 's') { e?.preventDefault(); if (!readOnly) void save(true); return true; }
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
  // a file pasted or dropped into the editor goes to hooks.uploadAsset (capture: before the engine reads it as text)
  const takeFiles = (e: EdEvent, files: EdFile[]): void => {
    if (!hooks.uploadAsset || readOnly || !files.length) return;
    e.preventDefault();
    e.stopPropagation?.();
    void api.uploadAssets(files);
  };
  listen(editorPane, 'paste', (e) => takeFiles(e, filesOf(e.clipboardData)), true);
  listen(editorPane, 'drop', (e) => takeFiles(e, filesOf(e.dataTransfer)), true);
  listen(editorPane, 'dragover', (e) => {
    if (hooks.uploadAsset && !readOnly && Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
  }, true);

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
  const succeed = (text: string, via: SaveVia): SaveOutcome => {
    adoptBaseline(text);
    updateDirty();
    if (!destroyed) emit('save', { text, via });
    // a download is handed to the browser: it has started, not necessarily finished (B-3)
    toast(via === 'download' ? 'Download started.' : 'Saved.', 'success');
    return { ok: true, via };
  };
  const fail = (error: unknown, via?: SaveVia): SaveOutcome => {
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
  const doSave = async (fromKey: boolean): Promise<SaveOutcome> => {
    const text = getText();
    if (formatOf(readHeader(text)?.fields) > maxFormat) {
      // never saved over a newer format (FC-18 §8.4): no hook, no saver
      const error = formatError();
      if (!destroyed) emit('error', { source: 'format', message: error.message, error });
      return { ok: false, error: error.message };
    }
    if (readOnly) return { ok: false, error: 'read-only' };
    if (hooks.save) {
      try { await hooks.save(text); } catch (e) { return fail(e, 'hook'); }
      return succeed(text, 'hook');
    }
    if (!options.assemble) return fail(new Error('no save route (pass hooks.save or assemble)'));
    let html: string;
    try { html = String(await options.assemble(text)); } catch (e) { return fail(e); }
    if (destroyed) return { ok: false, error: 'destroyed' }; // nothing new starts after destroy
    saver ??= createSaver({
      ...(uid ? { uid } : {}),
      suggestedName: options.fileName ?? `document${KIND_EXTENSIONS[kind] ?? '.html'}`,
      kind,
      ...(options.host ? { host: options.host } : {}),
      openedHtml: options.openedHtml ?? (async () => String(await options.assemble!(openedText))),
    });
    const r = await saver.save({ text, html });
    if (r.via === 'served-notice') {
      // Cmd/Ctrl+S on a served page with nothing unsaved stays quiet (B-16); the Save button and save() show the notice
      if (!destroyed && !(fromKey && text === model.savedText())) showServedNotice();
      return { ok: false, via: 'served-notice', error: 'served page' };
    }
    if (r.ok) return succeed(text, r.via);
    if (r.via === 'file' && r.error === 'cancelled') return { ok: false, via: 'file', error: 'cancelled', cancelled: true };
    return fail(new Error(r.error ?? 'The document could not be saved.'), r.via);
  };
  const save = (fromKey: boolean): Promise<SaveOutcome> => {
    if (destroyed) return Promise.resolve({ ok: false, error: 'destroyed' });
    saving ??= doSave(fromKey).finally(() => { saving = null; });
    return saving;
  };

  /** Replace an editor-text range with editor text (LF), as one undoable edit written in the document's style; the caret goes after it. */
  const replaceEditorRange = (from: number, to: number, insert: string): void => {
    const d = adapter.getDoc();
    const next = d.slice(0, from) + insert + d.slice(to);
    api.setText(model.toExact(next));
    adapter.setSelection?.({ from: from + insert.length, to: from + insert.length });
  };
  /** Text from a host (AI proposal) in the document's line endings. */
  const inDocumentStyle = (text: string): string => {
    const body = text.startsWith(BOM) ? text.slice(1) : text;
    return model.eol === '\n' ? body.replace(/\r\n?/g, '\n') : body.replace(/\r\n|\r|\n/g, model.eol);
  };

  const api: EditorShell = {
    getText,
    setText(text, o) {
      if (typeof text !== 'string') throw new TypeError('orz editor: setText needs a string');
      if (destroyed) return;
      const editorText = model.adopt(text);
      setting = true;
      try { adapter.setDoc(editorText, { resetHistory: o?.resetHistory === true }); } finally { setting = false; }
      changed();
    },
    setHeader(changes) {
      if (destroyed) return;
      const current = getText();
      const next = editHeader(current, changes);
      if (next !== current) api.setText(next);
    },
    isDirty() { updateDirty(); return dirty; },
    markSaved() { if (!destroyed) { adoptBaseline(getText()); updateDirty(); } },
    save: () => save(false),
    async requestAi(op, o) {
      const ai = hooks.ai;
      if (!ai || typeof ai.request !== 'function') return { ok: false, error: 'no AI hook (hooks.ai)' };
      if (readOnly) return { ok: false, error: 'read-only' };
      if (destroyed) return { ok: false, error: 'destroyed' };
      const operation = Array.isArray(ai.operations) ? ai.operations.find((x) => x && x.id === op) : undefined;
      const passage = o?.selection ?? operation?.selection === true;
      const before = getText();
      let selection: TextRange | undefined;
      if (passage) {
        const d = adapter.getDoc();
        const s = adapter.getSelection?.();
        if (!s || s.from === s.to) return { ok: false, error: 'no selection' };
        selection = { from: model.toExactOffset(d, Math.min(s.from, s.to)), to: model.toExactOffset(d, Math.max(s.from, s.to)) };
      }
      let proposed: unknown;
      try {
        proposed = (await ai.request(op, { text: before, ...(selection ? { selection: { ...selection } } : {}) }))?.proposed;
        if (typeof proposed !== 'string') throw new Error('the AI hook returned no proposed text');
      } catch (error) {
        if (!destroyed) emit('error', { source: 'hook', message: message(error), error });
        return { ok: false, error: message(error) };
      }
      // the shell may have been destroyed or made read-only (a quiet update) meanwhile (F3/#11)
      if (destroyed) return { ok: false, error: 'destroyed' };
      if (readOnly) return { ok: false, error: 'read-only' };
      if (getText() !== before) return { ok: false, error: 'the text changed during the AI request' };
      const styled = inDocumentStyle(proposed);
      api.setText(selection ? before.slice(0, selection.from) + styled + before.slice(selection.to) : (model.bom ? BOM : '') + styled);
      return { ok: true, op };
    },
    async uploadAssets(files) {
      const list = Array.from(files ?? []);
      if (!hooks.uploadAsset) return { ok: false, inserted: [], error: 'no upload hook (hooks.uploadAsset)' };
      if (destroyed) return { ok: false, inserted: [], error: 'destroyed' };
      if (readOnly) return { ok: false, inserted: [], error: 'read-only' };
      const inserted: string[] = [];
      let failure: unknown = null;
      for (const file of list) {
        try {
          const path = await hooks.uploadAsset(file);
          if (typeof path !== 'string' || !path) throw new Error('the upload hook returned no path');
          inserted.push(assetMarkdown(file, path));
        } catch (error) {
          failure = error;
          break;
        }
        // destroyed or read-only meanwhile: no further upload, nothing inserted (F3/#11)
        if (destroyed) return { ok: false, inserted: [], error: 'destroyed' };
        if (readOnly) return { ok: false, inserted: [], error: 'read-only' };
      }
      if (destroyed) return { ok: false, inserted: [], error: 'destroyed' };
      if (readOnly) return { ok: false, inserted: [], error: 'read-only' };
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
      const have = readHeader(getText())?.fields['uid']?.trim();
      if (have) return have;
      if (readOnly) throw new Error('orz editor: read-only — cannot add a uid');
      let minted: string;
      if (destroyed) throw new Error('orz editor: destroyed');
      try {
        minted = hooks.mintUid ? String(await hooks.mintUid()) : mintUid();
      } catch (error) {
        if (!destroyed) emit('error', { source: 'hook', message: message(error), error });
        throw error;
      }
      // destroyed or read-only meanwhile: nothing is set (F3/#11)
      if (destroyed) throw new Error('orz editor: destroyed');
      if (readOnly) throw new Error('orz editor: read-only — cannot add a uid');
      if (!UID_PATTERN.test(minted)) throw new Error(`orz editor: a minted uid must match ${String(UID_PATTERN)} (got "${minted}")`);
      const again = readHeader(getText())?.fields['uid']?.trim(); // set meanwhile
      if (again) return again;
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
      if (destroyed) return;
      if (currentView() === 'preview') {
        grantUntil = clock() + GRANT_MS; // the shell's own focus() is a legitimate entry into the frame
        preview.iframe.focus?.();
      } else adapter.focus();
    },
    on(event, fn) {
      let set = handlers.get(event);
      if (!set) handlers.set(event, (set = new Set()));
      set.add(fn as (e: never) => void);
      return () => { set!.delete(fn as (e: never) => void); };
    },
    async refreshPreview() {
      if (renderRunning) await renderRunning;
      return renderNow();
    },
    get readOnly() { return readOnly; },
    setReadOnly(flag) {
      const next = flag === true || newerFormat !== null;
      if (next === readOnly || destroyed) return;
      readOnly = next;
      if (readOnly) container.setAttribute('data-readonly', ''); else container.removeAttribute('data-readonly');
      if (saveButton) saveButton.hidden = readOnly;
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
      setOptions: (o) => { if (!destroyed) preview.setOptions(o ?? {}); },
    },
    destroy() {
      if (destroyed) return;
      try { finalText = getText(); } catch { finalText = ''; }
      destroyed = true;
      model.clear();
      renderCtx.cache?.clear();
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
